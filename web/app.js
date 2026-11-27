const TIER_LABEL = { default: 'Default', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
const TIER_COLOR = { default: '#a99aff', bronze: '#c88b65', silver: '#c5d0df', gold: '#e8c16f' };
const LANG_COLORS = ['#7cc4ff', '#3ddc84', '#ffcf3f', '#ff8a65', '#c792ea', '#4dd0e1', '#f48fb1', '#8fa1b8'];
const USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

// Theme: apply before anything renders so there is no flash.
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const f = document.getElementById('favicon');
  if (f) f.href = t === 'light' ? 'favicon-64-light.png' : 'favicon-64-dark.png';
}
(function initTheme() {
  let t = null;
  try { t = localStorage.getItem('theme'); } catch (e) { t = null; }
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(t);
})();

const $ = (id) => document.getElementById(id);
$('themeBtn').addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(t);
  try { localStorage.setItem('theme', t); } catch (e) { /* storage blocked: theme just won't persist */ }
});
const homeForm = $('homeForm'), homeUser = $('homeUser'), homeGo = $('homeGo'), homeStatus = $('homeStatus');
const topForm = $('topForm'), topUser = $('topUser'), topGo = $('topGo'), topStatus = $('topStatus');
const homeEl = $('home'), resultsEl = $('results');
const moreWrap = $('moreWrap');
const profileEl = $('profile'), statsEl = $('stats'), grid = $('grid'), extrasEl = $('extras'), copyWrap = $('copyWrap');
const hlWrap = $('hlWrap'), hlEl = $('highlights');

let catalog = null;
let lastUser = '';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function setStatus(msg, isError) {
  [homeStatus, topStatus].forEach((n) => { n.textContent = msg; n.className = 'status-line' + (isError ? ' error' : ''); });
}
function parseUser(raw) {
  // Accepts "name", "@name", "github.com/name", a full profile URL, or "name/anything" (first part wins).
  let t = raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/^github\.com\//i, '');
  t = t.split(/[\/?#\s]/)[0] || '';
  return t.replace(/^@/, '').trim();
}
// Only ever use image URLs that point at GitHub's asset host.
function safeImg(url) { return typeof url === 'string' && url.startsWith('https://github.githubassets.com/assets/'); }
function safeAvatar(url) { return typeof url === 'string' && /^https:\/\/avatars\.githubusercontent\.com\//.test(url); }
const num = (n) => (typeof n === 'number' ? n.toLocaleString() : '?');

// Badge art from GitHub's CDN; if it cannot load, show a plain hexagon in the tier colour.
function hexSvg(color) {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon points="32,3 58,17.5 58,46.5 32,61 6,46.5 6,17.5" fill="#171d27" stroke="' +
    color + '" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="' + color + '"/></svg>');
}
function art(src, tier, alt) {
  const i = document.createElement('img');
  i.alt = alt || '';
  i.referrerPolicy = 'no-referrer';
  i.onerror = () => { i.onerror = null; i.src = hexSvg(TIER_COLOR[tier] || TIER_COLOR.default); };
  i.src = src;
  return i;
}

// ---- views: landing (no user) and results (/<username>) ----
function showView(name) {
  const home = name === 'home';
  document.body.classList.toggle('home', home);
  homeEl.hidden = !home;
  resultsEl.hidden = home;
}

// Work out earned tier, what the counts say, and the next target for one badge.
function analyse(badge, entry, stats) {
  const tiers = badge.tiers;
  const earnedIdx = entry ? tiers.findIndex((t) => t.tier === entry.tier) : -1;
  const value = badge.track && stats ? stats[badge.track] : null;
  let countIdx = -1;
  if (typeof value === 'number') tiers.forEach((t, i) => { if (value >= t.threshold) countIdx = i; });
  const nextIdx = Math.max(earnedIdx, countIdx, -1) + 1;
  const next = tiers[nextIdx] || null;
  const prevThr = nextIdx > 0 && tiers[nextIdx - 1] ? tiers[nextIdx - 1].threshold : 0;
  const pct = next && typeof value === 'number'
    ? Math.max(0, Math.min(100, Math.round(((value - prevThr) / (next.threshold - prevThr)) * 100))) : null;
  return { tiers, earnedIdx, value, countIdx, next, pct, entry };
}

// What the window between tier v-1 and tier v should say.
function windowState(badge, a, v) {
  const { tiers, earnedIdx, countIdx, value } = a;
  const t = tiers[v];
  const prevThr = v === 0 ? 0 : tiers[v - 1].threshold;
  const activeIdx = Math.max(earnedIdx, countIdx, -1) + 1;
  if (v <= earnedIdx) return { status: 'done', label: 'Completed', frac: 1, caption: 'Completed' };
  if (v <= countIdx) {
    return { status: 'waiting', label: 'Counts met', frac: 1,
      caption: 'The counts reach this tier, but GitHub has not shown it on the profile yet.' };
  }
  if (v === activeIdx) {
    if (typeof value === 'number') {
      const frac = Math.max(0, Math.min(1, (value - prevThr) / (t.threshold - prevThr)));
      return { status: 'active', label: 'In progress', frac,
        caption: (t.threshold - value).toLocaleString() + ' more to reach ' + TIER_LABEL[t.tier] + ' (' + t.threshold.toLocaleString() + ' ' + badge.unit + ')' };
    }
    return { status: 'active', label: 'In progress', frac: 0, unknown: true,
      caption: "GitHub doesn't publish this count, so progress can't be shown." };
  }
  return { status: 'locked', label: 'Locked', frac: 0,
    caption: 'Reach ' + TIER_LABEL[tiers[v - 1].tier] + ' first, then ' +
      t.threshold.toLocaleString() + (badge.unit ? ' ' + badge.unit : '') + '.' };
}

// One card per badge: previous tier on the left, target tier on the right,
// a single timeline between them with a marker for where you are now.
function side(badge, tiers, idx, reachedIdx, earnedIdx, alignRight) {
  const box = el('div', 'side' + (alignRight ? ' right' : ''));
  const big = el('div', 'big');
  if (idx < 0) {
    big.classList.add('start');
    big.appendChild(art(hexSvg('#4a5568'), 'default', ''));
  } else {
    const t = tiers[idx];
    big.appendChild(art(catalog.assets + t.file, t.tier, badge.name + ' ' + t.tier));
  }
  box.appendChild(big);
  if (idx < 0) {
    box.appendChild(el('div', 'slabel', 'Start'));
    box.appendChild(el('div', 'ssub'));
    return box;
  }
  const t = tiers[idx];
  box.appendChild(el('div', 'slabel', tiers.length > 1 ? TIER_LABEL[t.tier] : badge.name));
  box.appendChild(el('div', 'ssub', tiers.length > 1 ? t.threshold.toLocaleString() + (badge.unit ? ' ' + badge.unit : '') : ''));
  return box;
}

// Right-hand panel: what GitHub itself shows on the profile. Never replaced by an estimate.
// Right-hand panel: what GitHub has awarded. It follows the arrows: on an older tier you already passed it
// shows that tier marked "(previous)"; from your latest tier onwards it always shows the latest.
function buildOfficial(badge, entry, a, v) {
  const { tiers, earnedIdx, countIdx } = a;
  const got = earnedIdx >= 0;
  const ahead = countIdx > earnedIdx; // numbers say a higher tier than GitHub is showing
  const idx = got ? (typeof v === 'number' ? Math.min(earnedIdx, Math.max(0, v)) : earnedIdx) : -1;
  const isPrev = got && idx < earnedIdx;
  const box = el('aside', 'official' + (got ? ' got' : ''));
  box.appendChild(el('div', 'olabel', 'On the GitHub profile'));

  const art_ = el('div', 'oart' + (got ? '' : ' none'));
  if (got) {
    const t = tiers[idx];
    const src = !isPrev && entry && safeImg(entry.img) ? entry.img : catalog.assets + t.file;
    art_.appendChild(art(src, t.tier, badge.name));
  }
  box.appendChild(art_);

  if (got) {
    const title = el('div', 'otitle', tiers.length > 1 ? TIER_LABEL[tiers[idx].tier] : badge.name);
    box.appendChild(title);
    if (isPrev) box.appendChild(el('div', 'opill', 'Previous tier'));
    box.appendChild(el('div', 'ostate ok', 'Awarded by GitHub'));
    // GitHub gives one date per badge: when it was first unlocked, i.e. the Default tier.
    // Repeating it on every later tier would look like they were all earned that day, so show it only there.
    if (idx === 0 && entry && entry.firstUnlocked) {
      const when = new Date(entry.firstUnlocked);
      if (!Number.isNaN(when.getTime())) {
        box.appendChild(el('div', 'owhen', 'Unlocked ' + when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })));
      }
    }
    const ev = entry && Array.isArray(entry.events) ? entry.events[idx] : null;
    if (ev && ev.text) {
      const line = el('div', 'oevent');
      const lead = el('span', 'oleadtext', 'Unlocked by ' + ev.text.charAt(0).toLowerCase() + ev.text.slice(1));
      lead.title = ev.text;
      line.appendChild(lead);
      if (ev.label) {
        if (typeof ev.url === 'string' && ev.url.startsWith('https://github.com/')) {
          const l = el('a', 'olink', ev.label);
          l.href = ev.url; l.target = '_blank'; l.rel = 'noopener';
          line.appendChild(l);
        } else {
          line.appendChild(el('span', 'omuted olink', ev.label));
        }
      }
      if (ev.date) {
        const dt = new Date(ev.date);
        if (!Number.isNaN(dt.getTime())) {
          line.appendChild(el('span', 'omuted olink', 'PR merged ' + dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })));
        }
      }
      box.appendChild(line);
    }
    if (lastUser && /^[a-z0-9-]+$/.test(badge.slug)) {
      // GitHub's own page for this badge on the user's profile.
      const g = el('a', 'ogh', 'See it on GitHub \u2197');
      g.href = 'https://github.com/' + encodeURIComponent(lastUser) + '?achievement=' + badge.slug + '&tab=achievements';
      g.target = '_blank'; g.rel = 'noopener';
      box.appendChild(g);
    }
  } else {
    box.appendChild(el('div', 'otitle', 'Not awarded yet'));
    box.appendChild(el('div', 'ostate', 'Not shown on the public GitHub profile (hidden, private or not earned yet)'));
  }
  if (ahead) {
    box.appendChild(el('div', 'oahead', 'The numbers already reach ' + TIER_LABEL[tiers[countIdx].tier] +
      (got ? ', but GitHub still shows ' + TIER_LABEL[tiers[earnedIdx].tier] : ', but GitHub has not awarded it') +
      '. It can take a while to update.'));
  }
  return box;
}

function paintProgress(card, badge, a, v, stats) {
  card.textContent = '';
  const { tiers, earnedIdx, countIdx } = a;
  const n = tiers.length;
  const st = windowState(badge, a, v);
  const reached = Math.max(earnedIdx, countIdx);

  const head = el('div', 'chead');
  const title = el('div');
  title.appendChild(el('div', 'bname', badge.name));
  title.appendChild(el('div', 'bdesc', badge.how));
  head.appendChild(title);
  if (n > 1) {
    const ar = el('div', 'arrows');
    const prev = el('button', null, '‹');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous tier');
    prev.disabled = v === 0;
    prev.addEventListener('click', () => paintProgress(card, badge, a, v - 1, stats));
    const next = el('button', null, '›');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next tier');
    next.disabled = v === n - 1;
    next.addEventListener('click', () => paintProgress(card, badge, a, v + 1, stats));
    ar.appendChild(prev);
    ar.appendChild(next);
    head.appendChild(ar);
  }
  card.appendChild(head);

  const body = el('div', 'cbody');
  const main = el('div', 'cmain');
  const stage = el('div', 'stage');
  stage.appendChild(side(badge, tiers, v - 1, reached, earnedIdx, false));

  const track = el('div', 'tl' + (st.status === 'done' ? ' done' : '') + (st.unknown ? ' unk' : ''));
  const fill = el('span', 'tfill');
  fill.style.width = st.frac * 100 + '%';
  track.appendChild(fill);
  const pct = Math.round(st.frac * 100);
  if (st.status === 'active' && !st.unknown && st.frac > 0) {
    // The marker sits exactly where the fill ends (same number as the fill width), so they always touch.
    const m = el('div', 'marker');
    m.style.left = st.frac * 100 + '%';
    m.appendChild(el('b', null, pct === 0 ? '<1%' : pct + '%'));
    m.appendChild(el('span', 'mcount', a.value.toLocaleString()));
    track.appendChild(m);
  } else if (st.status === 'done' || st.status === 'waiting') {
    track.appendChild(el('div', 'marker end', '✓'));
  }
  stage.appendChild(track);
  stage.appendChild(side(badge, tiers, v, reached, earnedIdx, true));
  main.appendChild(stage);

  const line = st.caption;
  main.appendChild(el('div', 'ccap ' + st.status, line));
  main.appendChild(el('div', 'ctip', badge.tip && st.status !== 'done' ? badge.tip : ''));
  if (badge.note) main.appendChild(el('div', 'cnote', badge.note));
  body.appendChild(main);
  body.appendChild(buildOfficial(badge, a.entry, a, v));
  card.appendChild(body);
  const vr = buildVariants(badge, a);
  if (vr) card.appendChild(vr);
}

const TONE_LABEL = { default: 'Default', light: 'Light', 'light-medium': 'Light-medium', medium: 'Medium', 'medium-dark': 'Medium-dark', dark: 'Dark' };

// Bottom strip: every tier (and skin tone) this badge comes in. Yours has a border.
function buildVariants(badge, a) {
  const { tiers, earnedIdx, entry } = a;
  const hasTiers = tiers.length > 1;
  if (!hasTiers && !badge.tones) return null;
  const wrap = el('div', 'variants');
  const item = (src, tier, label, sub, mine) => {
    const it = el('div', 'vitem' + (mine ? ' mine' : ''));
    const im = el('div', 'vimg');
    im.appendChild(art(src, tier, label));
    it.appendChild(im);
    it.appendChild(el('div', 'vlabel', label));
    if (sub) it.appendChild(el('div', 'vsub', sub));
    if (mine) it.appendChild(el('div', 'vmine', 'Yours'));
    return it;
  };
  const group = (title, children) => {
    const g = el('div', 'vgroup');
    g.appendChild(el('div', 'vtitle', title));
    const row = el('div', 'vrow');
    children.forEach((c) => row.appendChild(c));
    g.appendChild(row);
    wrap.appendChild(g);
  };
  if (hasTiers) {
    group('All tiers', tiers.map((t, i) =>
      item(catalog.assets + t.file, t.tier, TIER_LABEL[t.tier], t.threshold.toLocaleString() + (badge.unit ? ' ' + badge.unit : ''), i === earnedIdx)));
  }
  if (badge.tones) {
    const mineTone = entry ? (entry.tone || 'default') : null;
    group('Skin tones', badge.tones.map((t) =>
      item(catalog.assets + t.file, 'default', TONE_LABEL[t.tone] || t.tone, '', t.tone === mineTone)));
  }
  return wrap;
}

// Retired / limited-edition badges: nothing to count, just show it and whether GitHub gave it to you.
function buildRetired(badge, entry) {
  const a = analyse(badge, entry, null);
  const card = el('article', 'card');
  const head = el('div', 'chead');
  const t = el('div');
  t.appendChild(el('div', 'bname', badge.name));
  t.appendChild(el('div', 'bdesc', badge.how));
  head.appendChild(t);
  card.appendChild(head);
  const body = el('div', 'cbody retiredbody' + (entry ? '' : ' nothave'));
  const main = el('div', 'cmain retired');
  const big = el('div', 'big');
  big.appendChild(art(catalog.assets + badge.tiers[0].file, 'default', badge.name));
  main.appendChild(big);
  main.appendChild(el('div', 'ccap', 'GitHub no longer awards this one.'));
  body.appendChild(main);
  body.appendChild(buildOfficial(badge, entry, a));
  card.appendChild(body);
  return card;
}


// Small original line icons for the profile highlights (drawn here; not GitHub's artwork).
// GitHub's own Octicons (MIT licence, the icon set github.com uses). Pro = star, GitHub Star = star-fill, Developer
// Program = cpu, as seen on real profiles; the other three are the closest matching Octicons.
const HL_ICONS = {
  "pro": "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z",
  "github star": "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z",
  "developer program": "M6.5.75V2h3V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75V5h1.25a.75.75 0 0 1 0 1.5H14v3h1.25a.75.75 0 0 1 0 1.5H14v1.25A1.75 1.75 0 0 1 12.25 14H11v1.25a.75.75 0 0 1-1.5 0V14h-3v1.25a.75.75 0 0 1-1.5 0V14H3.75A1.75 1.75 0 0 1 2 12.25V11H.75a.75.75 0 0 1 0-1.5H2v-3H.75a.75.75 0 0 1 0-1.5H2V3.75C2 2.784 2.784 2 3.75 2H5V.75a.75.75 0 0 1 1.5 0Zm5.75 11.75a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25ZM5.75 5h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5A.75.75 0 0 1 5.75 5Zm.75 4.5h3v-3h-3Z",
  "bug bounty": "M4.72.22a.75.75 0 0 1 1.06 0l1 .999a3.488 3.488 0 0 1 2.441 0l.999-1a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.775.776c.616.63.995 1.493.995 2.444v.327c0 .1-.009.197-.025.292.408.14.764.392 1.029.722l1.968-.787a.75.75 0 0 1 .556 1.392L13 7.258V9h2.25a.75.75 0 0 1 0 1.5H13v.5c0 .409-.049.806-.141 1.186l2.17.868a.75.75 0 0 1-.557 1.392l-2.184-.873A4.997 4.997 0 0 1 8 16a4.997 4.997 0 0 1-4.288-2.427l-2.183.873a.75.75 0 0 1-.558-1.392l2.17-.868A5.036 5.036 0 0 1 3 11v-.5H.75a.75.75 0 0 1 0-1.5H3V7.258L.971 6.446a.75.75 0 0 1 .558-1.392l1.967.787c.265-.33.62-.583 1.03-.722a1.677 1.677 0 0 1-.026-.292V4.5c0-.951.38-1.814.995-2.444L4.72 1.28a.75.75 0 0 1 0-1.06Zm.53 6.28a.75.75 0 0 0-.75.75V11a3.5 3.5 0 1 0 7 0V7.25a.75.75 0 0 0-.75-.75ZM6.173 5h3.654A.172.172 0 0 0 10 4.827V4.5a2 2 0 1 0-4 0v.327c0 .096.077.173.173.173Z",
  "campus expert": "M7.693 1.066a.747.747 0 0 1 .614 0l7.25 3.25a.75.75 0 0 1 0 1.368L13 6.831v2.794c0 1.024-.81 1.749-1.66 2.173-.893.447-2.075.702-3.34.702-.278 0-.55-.012-.816-.036a.75.75 0 0 1 .133-1.494c.22.02.45.03.683.03 1.082 0 2.025-.221 2.67-.543.69-.345.83-.682.83-.832V7.503L8.307 8.934a.747.747 0 0 1-.614 0L4 7.28v1.663c.296.105.575.275.812.512.438.438.688 1.059.688 1.796v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3c0-.737.25-1.358.688-1.796.237-.237.516-.407.812-.512V6.606L.443 5.684a.75.75 0 0 1 0-1.368ZM2.583 5 8 7.428 13.416 5 8 2.572ZM2.5 11.25v2.25H4v-2.25c0-.388-.125-.611-.25-.735a.697.697 0 0 0-.5-.203.707.707 0 0 0-.5.203c-.125.124-.25.347-.25.735Z",
  "security advisory": "m8.533.133 5.25 1.68A1.75 1.75 0 0 1 15 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.697 1.697 0 0 1-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 0 1 1.217-1.667l5.25-1.68a1.748 1.748 0 0 1 1.066 0Zm-.61 1.429.001.001-5.25 1.68a.251.251 0 0 0-.174.237V7c0 1.36.275 2.666 1.057 3.859.784 1.194 2.121 2.342 4.366 3.298a.196.196 0 0 0 .154 0c2.245-.957 3.582-2.103 4.366-3.297C13.225 9.666 13.5 8.358 13.5 7V3.48a.25.25 0 0 0-.174-.238l-5.25-1.68a.25.25 0 0 0-.153 0ZM11.28 6.28l-3.5 3.5a.75.75 0 0 1-1.06 0l-1.5-1.5a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l.97.97 2.97-2.97a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"
};
function hlIcon(key, on) {
  const NS = 'http://www.w3.org/2000/svg';
  const box = el('div', 'hlicon' + (on ? ' on' : ''));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', HL_ICONS[key] || HL_ICONS['github star']);
  svg.appendChild(p);
  box.appendChild(svg);
  return box;
}

function renderHighlights(data) {
  hlEl.textContent = '';
  // No highlights data from the server (older server, or GitHub's page could not be read): show nothing
  // rather than claiming the user has none.
  if (!Array.isArray(data.highlights)) { hlWrap.hidden = true; return; }
  const found = (data.highlights || []).map((h) => h.trim()).filter(Boolean);
  const list = catalog.highlights || [];
  const used = new Set();
  list.forEach((h) => {
    // Short keys such as "pro" must match exactly ("Developer Program Member" also contains "pro").
    const hit = found.find((f) => {
      const x = f.toLowerCase();
      return x === h.match || (h.match.length > 4 && x.includes(h.match));
    });
    if (hit) used.add(hit);
    const chip = el('div', 'hl' + (hit ? ' mine' : ''));
    chip.appendChild(hlIcon(h.match, !!hit));
    const body = el('div', 'hlbody');
    const top = el('div', 'hltop');
    top.appendChild(el('b', null, h.name));
    top.appendChild(el('span', hit ? 'hlyes' : 'hlno', hit ? 'On this profile' : 'Not on this profile'));
    body.appendChild(top);
    body.appendChild(el('div', 'hlhow', h.how));
    chip.appendChild(body);
    hlEl.appendChild(chip);
  });
  // Anything else GitHub listed there that we have not catalogued.
  found.filter((f) => !used.has(f)).forEach((f) => {
    const chip = el('div', 'hl mine');
    chip.appendChild(hlIcon('github star', true));
    const body = el('div', 'hlbody');
    const top = el('div', 'hltop');
    top.appendChild(el('b', null, f));
    top.appendChild(el('span', 'hlyes', 'On this profile'));
    body.appendChild(top);
    chip.appendChild(body);
    hlEl.appendChild(chip);
  });
  hlWrap.hidden = hlEl.children.length === 0;
}

function buildRow(badge, entry, stats) {
  const a = analyse(badge, entry, stats);
  const card = el('article', 'card');
  const startV = Math.min(a.tiers.length - 1, Math.max(a.earnedIdx, a.countIdx, -1) + 1);
  paintProgress(card, badge, a, startV, stats);
  return card;
}

function renderProfile(data, earnedCount, total, tiersGot, tiersAll) {
  profileEl.textContent = '';
  const p = data.profile;
  if (!p) return;
  const box = el('div', 'profile');

  const av = el('div', 'avatar', (p.name || p.login || '?')[0].toUpperCase());
  if (safeAvatar(p.avatar)) {
    const im = document.createElement('img');
    im.src = p.avatar; im.alt = '';
    im.onerror = () => im.remove();
    av.appendChild(im);
  }
  box.appendChild(av);

  const info = el('div', 'pinfo');
  const nm = el('div', 'pname', p.name || p.login);
  nm.appendChild(el('span', 'plogin', '@' + p.login));
  const gh = el('a', 'ghlink', 'View on GitHub \u2197');
  gh.href = 'https://github.com/' + encodeURIComponent(p.login);
  gh.target = '_blank'; gh.rel = 'noopener';
  nm.appendChild(gh);
  info.appendChild(nm);
  if (p.bio) info.appendChild(el('div', 'pbio', p.bio));
  const meta = el('div', 'pmeta');
  if (p.location) meta.appendChild(el('span', null, p.location));
  if (p.createdAt) meta.appendChild(el('span', null, 'Joined ' + new Date(p.createdAt).getFullYear()));
  meta.appendChild(el('span', null, num(p.followers) + (p.followers === 1 ? ' follower' : ' followers')));
  meta.appendChild(el('span', null, num(p.following) + ' following'));
  info.appendChild(meta);
  box.appendChild(info);

  const cnt = el('div', 'count');
  const big = el('b', null, String(earnedCount));
  big.appendChild(el('i', null, ' of ' + total));
  cnt.appendChild(big);
  cnt.appendChild(el('span', null, earnedCount === 1 ? 'badge earned' : 'badges earned'));
  const bar = el('div', 'cbar');
  const fill = el('div', 'cfill');
  fill.style.width = (total ? Math.round((earnedCount / total) * 100) : 0) + '%';
  bar.appendChild(fill);
  cnt.appendChild(bar);
  box.appendChild(cnt);
  profileEl.appendChild(box);
}

function renderStats(data) {
  statsEl.textContent = '';
  const s = data.stats || {};
  const streak = typeof s.currentStreak === 'number' ? s.currentStreak + ' d' : null;
  const streakLabel = 'Current streak' + (typeof s.longestStreak === 'number' ? ' (best ' + s.longestStreak + ' d)' : '');
  [
    [s.mergedPRs, 'Merged pull requests'],
    [s.publicRepos, 'Public repositories'],
    [s.totalStarsPartial && typeof s.totalStars === 'number' ? s.totalStars.toLocaleString() + '+' : s.totalStars, 'Public stars received'],
    [s.yearContributions, 'Contributions, last year'],
    [streak, streakLabel],
  ].forEach(([v, label]) => {
    if (v === undefined || v === null) return;
    const box = el('div', 'stat');
    box.appendChild(el('b', null, typeof v === 'number' ? v.toLocaleString() : String(v)));
    box.appendChild(el('span', null, label));
    statsEl.appendChild(box);
  });
}

function renderExtras(data) {
  extrasEl.textContent = '';
  if (data.languages && data.languages.length) {
    const panel = el('div', 'panel');
    panel.appendChild(el('h3', null, 'Languages (by repo)'));
    const total = data.languages.reduce((s, l) => s + l.count, 0);
    // Top 6 languages, the rest grouped as "Other", drawn as a donut with a legend on the right.
    const sorted = data.languages.slice().sort((x, y) => y.count - x.count);
    const shown = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((n, l) => n + l.count, 0);
    if (rest) shown.push({ name: 'Other', count: rest });
    const wrap = el('div', 'langwrap');
    const donut = el('div', 'donut');
    const stops = [];
    let acc = 0;
    const legend = el('div', 'lang-legend');
    shown.forEach((l, i) => {
      const color = l.name === 'Other' ? '#5b6479' : LANG_COLORS[i % LANG_COLORS.length];
      const from = (acc / total) * 100;
      acc += l.count;
      const to = (acc / total) * 100;
      stops.push(color + ' ' + from.toFixed(2) + '% ' + to.toFixed(2) + '%');
      const item = el('div', 'lang-item');
      item.style.setProperty('--c', color);
      item.appendChild(el('span', 'lang-name', l.name));
      item.appendChild(el('span', 'lang-pct', Math.round((l.count / total) * 100) + '%'));
      legend.appendChild(item);
    });
    donut.style.background = 'conic-gradient(' + stops.join(', ') + ')';
    const hole = el('div', 'donut-hole');
    hole.appendChild(el('b', null, String(data.languages.length)));
    hole.appendChild(el('span', null, data.languages.length === 1 ? 'language' : 'languages'));
    donut.appendChild(hole);
    wrap.appendChild(donut);
    wrap.appendChild(legend);
    panel.appendChild(wrap);
    extrasEl.appendChild(panel);
  }
  if (data.topRepos && data.topRepos.length) {
    const panel = el('div', 'panel');
    panel.appendChild(el('h3', null, 'Top repos'));
    data.topRepos.forEach((r) => {
      const row = el('div', 'repo');
      const left = el('div');
      const a = el('a', null, r.name);
      if (typeof r.url === 'string' && r.url.startsWith('https://github.com/')) { a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; }
      left.appendChild(a);
      if (r.description) left.appendChild(el('div', 'rd', r.description));
      row.appendChild(left);
      row.appendChild(el('div', 'rd', (r.language || '') + (r.language ? ' · ' : '') + r.stars + ' stars'));
      panel.appendChild(row);
    });
    extrasEl.appendChild(panel);
  }
}

function render(data) {
  grid.textContent = '';
  const earnedBySlug = new Map(data.earned.map((e) => [e.slug, e]));
  let earnedCount = 0, total = 0, tiersGot = 0, tiersAll = 0;

  const retired = [];
  catalog.badges.forEach((badge) => {
    const entry = earnedBySlug.get(badge.slug) || null;
    if (badge.retired) {
      retired.push([badge, entry]);
      total += 1; // always counted: 9 badges exist in total, whether or not this profile has the retired ones
      if (entry) { earnedCount += 1; tiersAll += 1; tiersGot += 1; }
      return;
    }
    total += 1;
    tiersAll += badge.tiers.length;
    if (entry) {
      earnedCount += 1;
      tiersGot += Math.max(0, badge.tiers.findIndex((t) => t.tier === entry.tier)) + 1;
    }
    grid.appendChild(buildRow(badge, entry, data.stats));
  });
  if (retired.length) {
    grid.appendChild(el('h3', 'subhead', 'Limited edition and retired'));
    retired.forEach(([badge, entry]) => grid.appendChild(buildRetired(badge, entry)));
  }

  // Anything on the profile that is not in our catalog.
  data.earned.forEach((e) => {
    if (catalog.badges.some((b) => b.slug === e.slug) || !safeImg(e.img)) return;
    const card = el('article', 'card');
    const head = el('div', 'chead');
    const t = el('div');
    t.appendChild(el('div', 'bname', e.name));
    t.appendChild(el('div', 'bdesc', 'A newer achievement this tracker does not know yet.'));
    head.appendChild(t);
    card.appendChild(head);
    const stage = el('div', 'stage single');
    const sd = el('div', 'side');
    const big = el('div', 'big');
    big.appendChild(art(e.img, e.tier, e.name));
    sd.appendChild(big);
    sd.appendChild(el('div', 'onprofile', 'On this profile'));
    stage.appendChild(sd);
    card.appendChild(stage);
    grid.appendChild(card);
  });

  renderProfile(data, earnedCount, total, tiersGot, tiersAll);
  renderStats(data);
  renderExtras(data);
  renderHighlights(data);
  moreWrap.hidden = extrasEl.children.length === 0;

  copyWrap.textContent = '';
  const btn = el('button', 'copy', 'Share this result');
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    const link = location.origin + BASE + encodeURIComponent(data.user);
    try {
      await navigator.clipboard.writeText(link);
      btn.textContent = 'Link copied to clipboard';
    } catch (e) {
      // Clipboard can be blocked on some pages; fall back to a temporary text box.
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      btn.textContent = ok ? 'Link copied to clipboard' : 'Copy this: ' + link;
    }
    setTimeout(() => { btn.textContent = 'Share this result'; }, 2500);
  });
  copyWrap.appendChild(btn);
  if (data.earned.length === 0) setStatus('No achievements found. The profile may have none, or may hide them.');
}

async function loadCatalog() {
  if (catalog) return catalog;
  const r = await fetch(BASE + 'badges.json');
  if (!r.ok) throw new Error('Could not load badges.json');
  catalog = await r.json();
  return catalog;
}

function clearAll() {
  [profileEl, statsEl, grid, extrasEl, hlEl, copyWrap].forEach((n) => { n.textContent = ''; });
  moreWrap.hidden = true;
  hlWrap.hidden = true;
}

// ---- live refresh: ask the API again every POLL_MS and redraw only if something changed ----
const POLL_MS = Number(window.POLL_MS) || 5000;
const liveEl = $('live'), liveText = $('liveText'), liveBtn = $('liveBtn');
let seq = 0, liveTimer = null, lastFetchAt = 0, lastJson = '', lastData = null;
let paused = false, failures = 0, refreshing = false;

async function fetchData(user) {
  await loadCatalog();
  const r = await fetch((window.API_BASE || '') + '/api/badges?user=' + encodeURIComponent(user));
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data.error || 'Request failed (' + r.status + ')');
    err.status = r.status;
    throw err;
  }
  return data;
}

// If GitHub's API hiccups, keep showing the last known numbers instead of blanking them.
function keepKnown(prev, next) {
  if (!prev) return next;
  next.stats = next.stats || {};
  Object.keys(prev.stats || {}).forEach((k) => {
    if ((next.stats[k] === null || next.stats[k] === undefined) && prev.stats[k] !== null && prev.stats[k] !== undefined) {
      next.stats[k] = prev.stats[k];
    }
  });
  if (!next.profile && prev.profile) next.profile = prev.profile;
  if (!(next.languages || []).length && (prev.languages || []).length) next.languages = prev.languages;
  if (!(next.topRepos || []).length && (prev.topRepos || []).length) next.topRepos = prev.topRepos;
  return next;
}

function drawLive() {
  if (!liveTimer) return;
  const secs = Math.max(0, Math.round((Date.now() - lastFetchAt) / 1000));
  liveEl.classList.toggle('off', paused || document.hidden);
  if (paused) liveText.textContent = 'Paused';
  else if (document.hidden) liveText.textContent = 'Paused while this tab is hidden';
  else liveText.textContent = 'Live \u00b7 updated ' + secs + 's ago \u00b7 refreshes every ' + Math.round(POLL_MS / 1000) + 's';
  liveBtn.textContent = paused ? 'Resume' : 'Pause';
}

function tickLive() {
  const age = Date.now() - lastFetchAt;
  if (!paused && !document.hidden && !refreshing && age >= POLL_MS) refresh();
  drawLive();
}

function startLive() {
  stopLive();
  lastFetchAt = Date.now();
  paused = false;
  failures = 0;
  liveEl.hidden = false;
  liveTimer = setInterval(tickLive, 1000);
  drawLive();
}

function stopLive() {
  clearInterval(liveTimer);
  liveTimer = null;
  liveEl.hidden = true;
}

async function refresh() {
  if (refreshing || !lastUser) return;
  refreshing = true;
  const mine = seq;
  try {
    const data = keepKnown(lastData, await fetchData(lastUser));
    if (mine !== seq) return;
    failures = 0;
    setStatus('');
    const json = JSON.stringify(data);
    if (json !== lastJson) {
      lastJson = json;
      lastData = data;
      render(data);
    }
    lastFetchAt = Date.now();
  } catch (e) {
    if (mine !== seq) return;
    failures += 1;
    lastFetchAt = Date.now();
    const msg = e instanceof TypeError ? 'cannot reach the API server' : e.message;
    if (e.status === 429 || failures >= 3) {
      stopLive();
      setStatus('Live updates stopped (' + msg.replace(/\.$/, '') + '). Press Check to try again.', true);
    } else {
      setStatus('Live update failed (' + msg + '). Retrying...', true);
    }
  } finally {
    refreshing = false;
    drawLive();
  }
}

liveBtn.addEventListener('click', () => {
  paused = !paused;
  if (!paused) lastFetchAt = 0; // refresh right away on resume
  drawLive();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickLive(); else drawLive(); });

const busy = (on) => { [homeGo, topGo].forEach((b) => { b.disabled = on; }); };

async function run(user, push) {
  const mine = ++seq;
  busy(true);
  setStatus('Checking ' + user + '...');
  stopLive();
  try {
    const data = await fetchData(user);
    if (mine !== seq) return;
    lastUser = user;
    lastData = data;
    lastJson = JSON.stringify(data);
    setStatus('');
    clearAll();
    render(data);
    showView('results');
    homeUser.value = user;
    topUser.value = '';
    const target = BASE + encodeURIComponent(user);
    if (location.pathname + location.search !== target) {
      if (push) history.pushState({ user }, '', target); else history.replaceState({ user }, '', target);
    }
    document.title = user + ' · Badgepath';
    window.scrollTo(0, 0);
    startLive();
  } catch (e) {
    if (mine !== seq) return;
    const msg = e instanceof TypeError
      ? 'Cannot reach the API server. Is it running on ' + (window.API_BASE || 'this site') + '?' : e.message;
    setStatus(msg, true);
    // A bad address like /nosuchuser goes back to the start screen with the message.
    if (resultsEl.hidden && location.pathname !== BASE) history.replaceState({}, '', BASE);
  } finally {
    if (mine === seq) busy(false);
  }
}

function submitFrom(input, ev) {
  ev.preventDefault();
  const user = parseUser(input.value);
  if (!USER_RE.test(user)) {
    setStatus('Usernames use letters, numbers and single hyphens only.', true);
    return;
  }
  input.value = user;
  run(user, true);
}
homeForm.addEventListener('submit', (ev) => submitFrom(homeUser, ev));
topForm.addEventListener('submit', (ev) => submitFrom(topUser, ev));
document.querySelectorAll('.example').forEach((b) => b.addEventListener('click', () => {
  homeUser.value = b.dataset.user;
  run(b.dataset.user, true);
}));
// Logo goes back to the start screen without reloading.
$('brand').addEventListener('click', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
  ev.preventDefault();
  if (location.pathname !== BASE) history.pushState({}, '', BASE);
  route();
});

// The address is the source of truth. Accepts /<user>, /@user, /github.com/<user>
// and the older ?user=<user>. Returns { user } when valid, { bad } when something was typed but is not a username.
function userFromAddress() {
  const params = new URLSearchParams(location.search);
  // GitHub Pages sends unknown paths to 404.html, which forwards them here as ?p=/<username>.
  const forwarded = params.get('p');
  if (forwarded !== null) {
    // A backslash can make the browser read the address as another site and throw; strip it and never crash.
    try { history.replaceState({}, '', BASE + forwarded.replace(/\\/g, '').replace(/^\/+/, '')); } catch (e) { /* ignore a bad address */ }
  }
  const q = params.get('user');
  let segs = [];
  try {
    const rest = decodeURIComponent(location.pathname);
    segs = (rest.startsWith(BASE) ? rest.slice(BASE.length) : rest).split('/').filter(Boolean);
  } catch (e) { segs = []; }
  if (segs[0] && /^(www\.)?github\.com$/i.test(segs[0])) segs.shift();
  if (segs.length > 1) return {};
  const raw = (q || segs[0] || '').replace(/^@/, '').trim();
  if (!raw) return {};
  return USER_RE.test(raw) ? { user: raw } : { bad: raw };
}

function route() {
  const { user, bad } = userFromAddress();
  if (user) {
    homeUser.value = user;
    run(user, false);
    return;
  }
  seq += 1;
  stopLive();
  lastUser = '';
  clearAll();
  busy(false);
  showView('home');
  homeUser.value = '';
  document.title = 'Badgepath: your next GitHub achievement';
  if (bad) {
    setStatus('"' + bad.slice(0, 40) + '" is not a valid GitHub username.', true);
    history.replaceState({}, '', BASE);
  } else {
    setStatus('');
    if (location.pathname !== BASE) history.replaceState({}, '', BASE);
  }
  homeUser.focus();
}
window.addEventListener('popstate', route);
route();
