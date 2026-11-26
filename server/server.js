'use strict';
// GitHub Badge Tracker API (no dependencies). Run: node server.js
//   GET /api/badges?user=<github username>   badges + progress data
//   GET /api/health                          is the server up

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { lookup } = require('./src/github');
const { RateLimiter } = require('./src/ratelimit');

// Read server/.env (KEY=value lines) without any library. Real environment variables win.
function loadEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

function createServer(options = {}) {
  const allowed = (options.allowedOrigins ||
    process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .toString().split(',').map((s) => s.trim()).filter(Boolean);
  const limiter = options.limiter ||
    new RateLimiter({ max: Number(process.env.RATE_LIMIT) || 60, windowMs: 60000 });
  const doLookup = options.lookup || lookup;

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const originOk = !origin || allowed.includes(origin);

    const send = (status, body, headers = {}) => {
      const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers);
      if (origin && originOk) {
        h['Access-Control-Allow-Origin'] = origin;
        h.Vary = 'Origin';
      }
      res.writeHead(status, h);
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      const h = { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' };
      if (origin && originOk) {
        h['Access-Control-Allow-Origin'] = origin;
        h.Vary = 'Origin';
      }
      res.writeHead(originOk ? 204 : 403, h);
      return res.end();
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/health') {
      return send(200, { ok: true });
    }

    if (url.pathname !== '/api/badges') return send(404, { error: 'Not found.' });
    if (req.method !== 'GET') return send(405, { error: 'Use GET.' });
    if (!originOk) return send(403, { error: 'Origin not allowed.' });

    const rl = limiter.check(req.socket.remoteAddress || 'unknown');
    if (!rl.ok) return send(429, { error: 'Too many requests. Try again shortly.' }, { 'Retry-After': String(rl.retryAfterSec) });

    const user = (url.searchParams.get('user') || '').trim();
    if (!USERNAME.test(user)) return send(400, { error: 'Invalid GitHub username.' });

    try {
      return send(200, await doLookup(user));
    } catch (e) {
      const status = e && e.status;
      if (!status) console.error('lookup failed:', e && e.message);
      return send(status || 500, { error: status ? e.message : 'Something went wrong.' });
    }
  });
}

module.exports = { createServer, loadEnv, USERNAME };

if (require.main === module) {
  loadEnv(path.join(__dirname, '.env'));
  const port = Number(process.env.PORT || 3001);
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`API listening on http://localhost:${port}`);
    console.log('No token or account needed. Running on public pages and the free GitHub API, with caching.');
  });
}
