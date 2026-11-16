'use strict';
// Vercel serverless function: GET /api/badges?user=<name>. Same lookup code as server/server.js.
const { lookup } = require('../server/src/github');

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
  const user = String((req.query && req.query.user) || '').trim();
  if (!USERNAME.test(user)) return send(400, { error: 'Invalid GitHub username.' });
  try {
    return send(200, await lookup(user), 'public, s-maxage=30, stale-while-revalidate=120');
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    if (!e.status) console.error('lookup failed:', e);
    return send(status, { error: e.status ? e.message : 'Something went wrong.' });
  }
};
