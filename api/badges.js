'use strict';
// Vercel serverless function: GET /api/badges?user=<name>. Same lookup code as server/server.js.
const { lookup } = require('../server/src/github');
const { RateLimiter } = require('../server/src/ratelimit');

// Best effort: each serverless instance keeps its own counter (the 30 s edge cache is the shared layer).
const limiter = new RateLimiter({ max: Number(process.env.RATE_LIMIT) || 60, windowMs: 60000 });

const USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

module.exports = async (req, res) => {
  const send = (status, body, cache) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Vercel's edge keeps a result for 30 s, so many visitors share one lookup.
    res.setHeader('Cache-Control', cache || 'no-store');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return send(405, { error: 'Use GET.' });
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();
  const rl = limiter.check(ip);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return send(429, { error: 'Too many requests. Try again shortly.' });
  }
  const user = String((req.query && req.query.user) || '').trim();
  if (!USERNAME.test(user)) return send(400, { error: 'Invalid GitHub username.' });
  try {
    return send(200, await lookup(user), 'public, s-maxage=30, stale-while-revalidate=120');
  } catch (e) {
    const status = e && e.status;
    if (!status) console.error('lookup failed:', e && e.message);
    return send(status || 500, { error: status ? e.message : 'Something went wrong.' });
  }
};
