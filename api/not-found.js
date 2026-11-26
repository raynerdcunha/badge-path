'use strict';

module.exports = function handler(req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify({ error: 'Not found.' }));
};
