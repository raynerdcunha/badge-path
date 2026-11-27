'use strict';
// Everything that talks to GitHub: reads the public profile page for earned
// achievements and gathers counts from the GitHub API for the progress bars.

const { Cache } = require('./cache');

const UA = 'github-badge-tracker (local project)';
// Every outbound request gets a deadline so one stuck GitHub call cannot hang all callers sharing it.
const blocked = new Map();

function limitKey(url) {
  const u = new URL(url);
  return u.host + (u.pathname.startsWith('/search') ? ':search' : ':core');
}

function waitSeconds(r) {
  const after = Number(r.headers.get('retry-after'));
  if (after > 0) return Math.min(Math.ceil(after), 3600);
  const reset = Number(r.headers.get('x-ratelimit-reset'));
  if (reset > 0) return Math.min(Math.max(reset - Math.floor(Date.now() / 1000), 1), 3600);
  return 60;
}

function isLimited(r) {
  if (r.status === 429) return true;
  return r.status === 403 && (r.headers.get('x-ratelimit-remaining') === '0' || r.headers.has('retry-after'));
}

function limitError(seconds) {
  const wait = seconds < 60 ? seconds + ' seconds' : Math.ceil(seconds / 60) + ' minutes';
  return new HttpError(429, 'GitHub is rate limiting. Try again in ' + wait + '.', seconds);
}

async function gfetch(url, opts) {
  const key = limitKey(url);
  const until = blocked.get(key) || 0;
  if (Date.now() < until) throw limitError(Math.ceil((until - Date.now()) / 1000));
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(10000) }, opts));
  if (isLimited(r)) {
    const seconds = waitSeconds(r);
    blocked.set(key, Date.now() + seconds * 1000);
    throw limitError(seconds);
  }
  return r;
}

function resetLimits() {
  blocked.clear();
}
// Reject paths with "." / ".." segments, which URL cleanup would turn into a different address.
const NO_DOTS = (p) => !p.split('/').some((s) => /^\.+$/.test(s));

// /assets/<slug>-<tier>[--<tone>]-<12 hex>.png
const SRC = /^https:\/\/github\.githubassets\.com\/assets\/([a-z0-9-]+?)-(default|bronze|silver|gold)(?:--([a-z-]+?))?-([0-9a-f]{12})\.png/;

class HttpError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status;
    if (retryAfter) this.retryAfter = retryAfter;
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return m ? m[1] : null;
}

// Returns [{ slug, name, tier, tone, img }] for every "Achievement: ..." image on the page.
function parseAchievements(html) {
  const found = new Map();
  for (const tag of html.match(/<img\b[^>]*>/g) || []) {
    const alt = attr(tag, 'alt');
    if (!alt || !alt.startsWith('Achievement:')) continue;
    const src = attr(tag, 'src');
    const m = src && src.match(SRC);
    if (!m || found.has(m[1])) continue;
    found.set(m[1], {
      slug: m[1],
      name: alt.replace('Achievement:', '').trim(),
      tier: m[2],
      tone: m[3] || null,
      img: src,
    });
  }
  return [...found.values()];
}

// The "Highlights" list in the profile sidebar (Pro, Developer Program Member, ...). Returns [text].
function parseHighlights(html) {
  const m = html.match(/<h2[^>]*>\s*Highlights\s*<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (!m) return [];
  const out = [];
  for (const li of m[1].match(/<li\b[\s\S]*?<\/li>/g) || []) {
    const text = li.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

// GitHub's per-badge detail fragment: when it was first unlocked, and which event unlocked each tier.
// Returns { firstUnlocked: ISO string | null, events: [{ text, label, url }] } (events are in tier order).
function parseAchievementDetail(html) {
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const t = html.match(/<relative-time\b[^>]*\bdatetime="([^"]+)"/);
  const first = t && !Number.isNaN(Date.parse(t[1])) ? new Date(t[1]).toISOString() : null;
  const i = html.search(/>\s*History\s*</);
  const events = [];
  const re = /<div[^>]*>\s*(?:<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>|<span[^>]*>\s*(inaccessible)\s*<\/span>)\s*&?#?\w*;?\s*·\s*<span[^>]*>([\s\S]*?)<\/span>/g;
  if (i >= 0) {
    let m;
    const rest = html.slice(i);
    while ((m = re.exec(rest))) {
      const safe = m[1] && NO_DOTS(m[1]) && /^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._\/-]*)?$/.test(m[1]);
      events.push({
        // The text can hold links (co-author names): keep the words, drop the markup, keep it short.
        text: (() => {
          const t = decode(m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+,/g, ','));
          return t.length > 110 ? t.slice(0, 107).trimEnd() + '...' : t;
        })(),
        label: m[3] ? 'private repository' : decode(m[2] || ''),
        url: safe ? 'https://github.com' + m[1] : null,
      });
    }
  }
  return { firstUnlocked: first, events };
}

// days: [{ date, contributionCount }] oldest -> newest
function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i -= 1; // today may not have commits yet
  let current = 0;
  while (i >= 0 && days[i].contributionCount > 0) {
    current += 1;
    i -= 1;
  }
  return { current, longest };
}

// Parses the public fragment github.com/users/<name>/contributions (no login or token needed).
// Returns { total, days:[{date, contributionCount}] oldest -> newest } or null if the shape is unknown.
function parseContributions(html) {
  const idToDate = new Map();
  for (const tag of html.match(/<td\b[^>]*>/g) || []) {
    const id = attr(tag, 'id');
    const date = attr(tag, 'data-date');
    if (id && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) idToDate.set(id, date);
  }
  const days = [];
  const re = /<tool-tip\b([^>]*)>([^<]*)<\/tool-tip>/g;
  let m;
  while ((m = re.exec(html))) {
    const date = idToDate.get(attr('<x' + m[1] + '>', 'for'));
    if (!date) continue;
    const c = m[2].trim().match(/^(\d+)\s+contribution/);
    days.push({ date, contributionCount: c ? Number(c[1]) : 0 });
  }
  if (!days.length) return null;
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const h2 = html.match(/([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i);
  const total = h2 ? Number(h2[1].replace(/,/g, '')) : days.reduce((n, d) => n + d.contributionCount, 0);
  return { total, days };
}

// Optional: set GITHUB_TOKEN (a token with no scopes) on a public host, because many visitors share one
// IP and would otherwise exhaust GitHub's 60 requests an hour. Locally it is not needed.
function apiHeaders() {
  const h = { 'User-Agent': UA, Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  return h;
}

async function getJson(url) {
  const r = await gfetch(url, { headers: apiHeaders() });
  if (!r.ok) throw new Error('GitHub API ' + r.status);
  return r.json();
}

const countSearch = (q) =>
  getJson('https://api.github.com/search/issues?per_page=1&q=' + q).then((j) => j.total_count);

const cache = new Cache();
const TTL = { page: 5e3, contributions: 15e3, light: 60e3, search: 300e3, detail: 864e5, pr: 2592e6 };

async function fetchContributions(user) {
  const r = await gfetch(`https://github.com/users/${user}/contributions`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  if (!r.ok) throw new Error('contributions ' + r.status);
  const parsed = parseContributions(await r.text());
  if (!parsed) throw new Error('contributions: unknown page shape');
  return parsed;
}

async function gather(user) {
  const key = (k) => k + ':' + user.toLowerCase();
  const [profile, repos, merged, yolo, contrib] = await Promise.allSettled([
    cache.get(key('profile'), TTL.light, () => getJson(`https://api.github.com/users/${user}`)),
    cache.get(key('repos'), TTL.light, () => getJson(`https://api.github.com/search/repositories?q=user:${user}+fork:false&sort=stars&order=desc&per_page=100`)),
    cache.get(key('merged'), TTL.search, () => countSearch(`author:${user}+type:pr+is:merged`)),
    cache.get(key('yolo'), TTL.search, () => countSearch(`author:${user}+type:pr+is:merged+review:none`)),
    cache.get(key('contrib'), TTL.contributions, () => fetchContributions(user)),
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);

  const out = { profile: null, stats: {}, languages: [], topRepos: [] };

  const p = val(profile);
  if (p) {
    out.profile = {
      login: p.login, name: p.name, bio: p.bio, location: p.location, avatar: p.avatar_url,
      followers: p.followers, following: p.following, createdAt: p.created_at,
    };
    out.stats.publicRepos = p.public_repos;
    out.stats.followers = p.followers;
  }

  const rs = val(repos);
  const own = rs && Array.isArray(rs.items) ? rs.items : null;
  out.stats.mergedPRs = val(merged);
  out.stats.yoloPRs = val(yolo);
  out.stats.maxRepoStars = own ? own.reduce((m, r) => Math.max(m, r.stargazers_count || 0), 0) : null;
  out.stats.totalStars = own ? own.reduce((s, r) => s + (r.stargazers_count || 0), 0) : null;
  out.stats.totalStarsPartial = own ? (rs.total_count || 0) > own.length : false;

  if (own) {
    const langs = new Map();
    own.forEach((r) => r.language && langs.set(r.language, (langs.get(r.language) || 0) + 1));
    out.languages = [...langs]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    out.topRepos = own
      .slice()
      .sort((a, b) =>
        (b.stargazers_count - a.stargazers_count) ||
        (!!b.description - !!a.description) ||
        (new Date(b.pushed_at) - new Date(a.pushed_at)))
      .slice(0, 3)
      .map((r) => ({
        name: r.name, stars: r.stargazers_count, language: r.language,
        description: r.description, url: r.html_url,
      }));
  }

  const c = val(contrib);
  if (c) {
    const st = streaks(c.days);
    out.stats.yearContributions = c.total;
    out.stats.currentStreak = st.current;
    out.stats.longestStreak = st.longest;
  }
  return out;
}

async function fetchProfilePage(user) {
  let page;
  try {
    page = await gfetch(`https://github.com/${user}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  } catch (e) {
    if (e && e.status) throw e;
    throw new HttpError(502, 'Could not reach GitHub.');
  }
  if (page.status === 404) throw new HttpError(404, 'User not found.');
  if (!page.ok) throw new HttpError(502, 'GitHub returned ' + page.status + '.');
  const html = await page.text();
  return { earned: parseAchievements(html), highlights: parseHighlights(html) };
}

async function fetchAchievementDetail(user, slug) {
  const r = await gfetch(`https://github.com/users/${user}/achievements/${slug}/detail`, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!r.ok) throw new Error('detail ' + r.status);
  return parseAchievementDetail(await r.text());
}

// Full lookup for one username: badges from the profile page + counts. Results are cached briefly,
// so frequent refreshes from the page cost GitHub very few requests.
async function lookup(user) {
  const lu = user.toLowerCase();
  const page = await cache.get('page:' + lu, TTL.page, () => fetchProfilePage(user));
  const [data, details] = await Promise.all([
    gather(user),
    // A badge's history only changes when a new tier is earned, so cache it per tier for a day.
    Promise.allSettled(page.earned.map((e) =>
      cache.get(`detail:${lu}:${e.slug}:${e.tier}`, TTL.detail, () => fetchAchievementDetail(user, e.slug)))),
  ]);
  const earned = page.earned.map((e, i) => {
    const d = details[i].status === 'fulfilled' ? details[i].value : null;
    return d ? Object.assign({}, e, { firstUnlocked: d.firstUnlocked, events: d.events }) : e;
  });
  // For events that are public pull requests, add the date that PR was merged (a PR's merge date never
  // changes, so it is cached for a month). Capped so a badge-heavy profile cannot burn the API limit.
  let budget = 8;
  await Promise.allSettled(earned.flatMap((e) => (e.events || []).map(async (ev) => {
    const m = ev.url && ev.url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/);
    if (!m || !NO_DOTS(ev.url) || budget <= 0) return;
    if (!cache.has('pr:' + ev.url)) budget -= 1;
    const j = await cache.get('pr:' + ev.url, TTL.pr, () => getJson(`https://api.github.com/repos/${m[1]}/${m[2]}/pulls/${m[3]}`));
    if (j && j.merged_at && !Number.isNaN(Date.parse(j.merged_at))) ev.date = new Date(j.merged_at).toISOString();
  })));
  return Object.assign({ user, earned, highlights: page.highlights }, data);
}

module.exports = { HttpError, resetLimits, parseAchievements, parseAchievementDetail, parseHighlights, parseContributions, streaks, lookup, gather };
