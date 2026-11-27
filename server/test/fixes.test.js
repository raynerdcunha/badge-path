'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Cache } = require('../src/cache');
const { parseAchievements, parseAchievementDetail } = require('../src/github');

test('failed keys are forgotten after the failure window', async () => {
  let t = 0;
  const c = new Cache(() => t);
  await assert.rejects(c.get('nouser', 1000, async () => { throw new Error('x'); }));
  assert.strictEqual(c.fails.size, 1);
  t = 61e3;
  await c.get('other', 1000, async () => 1); // any success triggers trim()
  assert.strictEqual(c.fails.size, 0);
});

test('badge image must come from GitHub\'s asset host', () => {
  const bad = '<img alt="Achievement: X" src="https://evil.example/?x=/assets/pull-shark-silver-0643f87ac9fd.png">';
  assert.deepStrictEqual(parseAchievements(bad), []);
});

test('event links with dot segments are dropped', () => {
  const html = '> History <div><a href="/../../x/pull/1">t</a> · <span>did it</span>';
  const { events } = parseAchievementDetail(html);
  assert.ok(events.every((e) => e.url === null));
});

test('stale data is not served after the maximum stale age', async () => {
  let t = 0;
  const c = new Cache(() => t, 1000);
  await c.get('k', 100, async () => 'old');
  t = 500;
  assert.strictEqual(await c.get('k', 100, async () => { throw new Error('down'); }), 'old');
  t = 70e3;
  await assert.rejects(c.get('k', 100, async () => { throw new Error('down'); }));
});

test('every file the web server allows exists, and vercel.json is valid', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', '..');
  const src = fs.readFileSync(path.join(root, 'web', 'serve.js'), 'utf8');
  const list = /const PUBLIC = new Set\(\[(.*?)\]\);/s.exec(src)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.ok(list.length > 10);
  for (const f of list) assert.ok(fs.existsSync(path.join(root, 'web', f)), f);
  const v = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const csp = v.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.ok(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"));
});

test('unknown query parameters are rejected, and an unknown path is a JSON 404', async () => {
  const { createServer } = require('../server');
  const s = createServer({
    allowedOrigins: 'http://localhost:5173',
    lookup: async (user) => ({ user }),
  });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${s.address().port}`;
    assert.strictEqual((await fetch(base + '/api/badges?user=octocat&x=1')).status, 400);
    assert.strictEqual((await fetch(base + '/api/badges?user=octocat')).status, 200);
    assert.strictEqual((await fetch(base + '/api/badges?user=octocat&api=skip')).status, 200);
    assert.strictEqual((await fetch(base + '/api/badges?user=octocat&api=other')).status, 400);
    const r = await fetch(base + '/api/nope');
    assert.strictEqual(r.status, 404);
    assert.ok((r.headers.get('content-type') || '').includes('application/json'));
  } finally {
    s.close();
  }
});

function mockGithub(handler) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
  return { calls, restore: () => { global.fetch = real; } };
}

function repoPage(from, n, stars) {
  return Array.from({ length: n }, (_, i) => ({ name: 'r' + (from + i), stargazers_count: stars, language: 'JS', fork: false }));
}

test('stars add up across every page of repositories', async () => {
  const gh = require('../src/github');
  gh.resetLimits();
  const m = mockGithub((url) => {
    if (url === 'https://github.com/octo') return new Response('<html></html>', { status: 200 });
    if (url === 'https://api.github.com/users/octo') return Response.json({ login: 'octo', public_repos: 250 });
    if (url.includes('/users/octo/repos') && url.endsWith('page=1')) return Response.json(repoPage(0, 100, 2));
    if (url.includes('/users/octo/repos') && url.endsWith('page=2')) return Response.json(repoPage(100, 100, 2));
    if (url.includes('/users/octo/repos') && url.endsWith('page=3')) return Response.json(repoPage(200, 50, 2));
    if (url.includes('/search/issues')) return Response.json({ total_count: 3 });
    return new Response('{}', { status: 404 });
  });
  try {
    const r = await gh.lookup('octo');
    assert.strictEqual(r.stats.totalStars, 500);
    assert.strictEqual(r.stats.totalStarsPartial, false);
    assert.ok(!r.notice || !r.notice.missing.includes('repos'));
    assert.strictEqual(m.calls.filter((u) => u.includes('/users/octo/repos')).length, 3);
  } finally {
    m.restore();
  }
});

test('stars are marked partial when a page of repositories cannot be read', async () => {
  const gh = require('../src/github');
  gh.resetLimits();
  const m = mockGithub((url) => {
    if (url === 'https://github.com/pat') return new Response('<html></html>', { status: 200 });
    if (url === 'https://api.github.com/users/pat') return Response.json({ login: 'pat', public_repos: 200 });
    if (url.includes('/users/pat/repos') && url.endsWith('page=1')) return Response.json(repoPage(0, 100, 3));
    if (url.includes('/users/pat/repos')) return new Response('{}', { status: 500 });
    if (url.includes('/search/issues')) return Response.json({ total_count: 3 });
    return new Response('{}', { status: 404 });
  });
  try {
    const r = await gh.lookup('pat');
    assert.strictEqual(r.stats.totalStars, 300);
    assert.strictEqual(r.stats.totalStarsPartial, true);
    assert.ok(!r.notice || !r.notice.missing.includes('repos'));
  } finally {
    m.restore();
  }
});

test('when GitHub rate limits the API, calls stop until its reset time and badges still load', async () => {
  const gh = require('../src/github');
  gh.resetLimits();
  const reset = String(Math.floor(Date.now() / 1000) + 120);
  const m = mockGithub((url) => {
    if (url === 'https://github.com/aa' || url === 'https://github.com/bb') return new Response('<html></html>', { status: 200 });
    if (url.startsWith('https://api.github.com/users/')) {
      return new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } });
    }
    if (url.includes('/search/')) return Response.json({ total_count: 0, items: [] });
    return new Response('', { status: 404 });
  });
  try {
    const first = await gh.lookup('aa');
    assert.deepStrictEqual(first.earned, []);
    assert.strictEqual(first.profile, null);
    assert.strictEqual(first.notice.kind, 'rate_limit');
    assert.ok(first.notice.missing.includes('profile') && first.notice.missing.includes('repos'));
    assert.ok(first.notice.retryAfter >= 100 && first.notice.retryAfter <= 121);
    const apiCalls = () => m.calls.filter((u) => u.startsWith('https://api.github.com/users/')).length;
    const before = apiCalls();
    await gh.lookup('bb');
    assert.strictEqual(apiCalls(), before);
  } finally {
    m.restore();
    gh.resetLimits();
  }
});

test('when GitHub rate limits the profile page, the error carries how long to wait', async () => {
  const gh = require('../src/github');
  gh.resetLimits();
  const m = mockGithub(() => new Response('', { status: 429, headers: { 'retry-after': '30' } }));
  try {
    await assert.rejects(() => gh.lookup('cc'), (e) => e.status === 429 && e.retryAfter === 30 && /30 seconds/.test(e.message));
    await assert.rejects(() => gh.lookup('dd'), (e) => e.status === 429 && e.retryAfter >= 1 && e.retryAfter <= 30);
    assert.strictEqual(m.calls.length, 1);
  } finally {
    m.restore();
    gh.resetLimits();
  }
});

test('api=skip makes no calls to the GitHub API', async () => {
  const gh = require('../src/github');
  gh.resetLimits();
  const m = mockGithub(async () => new Response('<html></html>', { status: 200 }));
  try {
    let r = null;
    try { r = await gh.lookup('skipcheck-user', { skipApi: true }); } catch (e) { r = { apiSkipped: true }; }
    assert.ok(m.calls.every((u) => !u.includes('api.github.com')));
    assert.strictEqual(r.apiSkipped, true);
  } finally {
    m.restore();
  }
});
