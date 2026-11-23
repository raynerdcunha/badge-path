'use strict';
// Tiny static file server for the web folder (no dependencies). Run: node serve.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.WEB_PORT || 5173);
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const PUBLIC = new Set(['index.html', 'style.css', 'app.js', 'config.js', 'badges.json', 'favicon.svg', 'logo-mark.png', 'logo-mark-sm.png', 'logo-full.png', 'logo-mark-light.svg', 'logo-mark-dark.svg', 'logo-mark-light.png', 'logo-mark-dark.png', 'logo-full-dark.png', 'logo-full-light.png', 'favicon-64.png', 'favicon-64-light.png']);

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad request');
  }
  if (pathname === '/favicon.ico') pathname = '/favicon-64.png';
  let name = pathname === '/' ? 'index.html' : pathname.replace(/^\/+|\/+$/g, '');
  // /<github username> is the same page; the page reads the name from the address.
  // Anything that is not a file (no extension) is the page; it reads the username from the address.
  if (!PUBLIC.has(name) && !TYPES[path.extname(name).toLowerCase()]) name = 'index.html';
  if (!PUBLIC.has(name)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(path.join(ROOT, name), (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://github.githubassets.com https://avatars.githubusercontent.com; connect-src 'self' http://localhost:3001; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Web page on http://localhost:${PORT}`));
