'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../server');
const { RateLimiter } = require('../src/ratelimit');
const { HttpError } = require('../src/github');

function start(opts) {
  return new Promise((resolve) => {
    const s = createServer(opts);
    s.listen(0, '127.0.0.1', () => resolve({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

const fakeLookup = async (user) => {
  if (user === 'ghost') throw new HttpError(404, 'User not found.');
  return { user, earned: [], stats: {}, languages: [], topRepos: [], profile: null };
};

test('api behaves: validation, CORS, not found, rate limit', async () => {
  const { s, base } = await start({
    allowedOrigins: 'http://localhost:5173',
    lookup: fakeLookup,
    limiter: new RateLimiter({ max: 4, windowMs: 60000 }),
  });
  try {
    let r = await fetch(base + '/api/health');
    assert.strictEqual(r.status, 200);

    r = await fetch(base + '/api/badges?user=octocat', { headers: { Origin: 'http://localhost:5173' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.strictEqual((await r.json()).user, 'octocat');

    r = await fetch(base + '/api/badges?user=octocat', { headers: { Origin: 'https://evil.example' } });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), null);

    r = await fetch(base + '/api/badges?user=' + encodeURIComponent('../etc/passwd'));
    assert.strictEqual(r.status, 400);

    r = await fetch(base + '/api/badges?user=ghost');
    assert.strictEqual(r.status, 404);

    r = await fetch(base + '/nope');
    assert.strictEqual(r.status, 404);

    r = await fetch(base + '/api/badges?user=octocat'); // 4th counted request (health, 404s and blocked origins are not counted)
    assert.strictEqual(r.status, 200);
    r = await fetch(base + '/api/badges?user=octocat'); // 5th counted request
    assert.strictEqual(r.status, 429);
    assert.ok(r.headers.get('retry-after'));
  } finally {
    s.close();
  }
});
