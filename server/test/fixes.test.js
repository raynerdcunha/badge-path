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

test('rate limiter never holds more than maxKeys live entries', () => {
  const { RateLimiter } = require('../src/ratelimit');
  const t = 0;
  const rl = new RateLimiter({ max: 5, windowMs: 60000, now: () => t, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) rl.check('ip' + i);
  assert.ok(rl.hits.size <= 100);
  assert.strictEqual(rl.check('ip999').ok, true);
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
  const { RateLimiter } = require('../src/ratelimit');
  const s = createServer({
    allowedOrigins: 'http://localhost:5173',
    lookup: async (user) => ({ user }),
    limiter: new RateLimiter({ max: 50, windowMs: 60000 }),
  });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${s.address().port}`;
    assert.strictEqual((await fetch(base + '/api/badges?user=octocat&x=1')).status, 400);
    assert.strictEqual((await fetch(base + '/api/badges?user=octocat')).status, 200);
    const r = await fetch(base + '/api/nope');
    assert.strictEqual(r.status, 404);
    assert.ok((r.headers.get('content-type') || '').includes('application/json'));
  } finally {
    s.close();
  }
});
