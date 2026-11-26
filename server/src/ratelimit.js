'use strict';
// Tiny in-memory limiter: at most `max` requests per `windowMs` for each key (an IP address).

class RateLimiter {
  constructor({ max = 30, windowMs = 60000, now = Date.now, maxKeys = 10000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.maxKeys = maxKeys;
    this.hits = new Map(); // key -> { count, resetAt }
  }

  // Returns { ok, retryAfterSec }.
  check(key) {
    const t = this.now();
    if (this.hits.size >= this.maxKeys) this.makeRoom(t);
    let h = this.hits.get(key);
    if (!h || t >= h.resetAt) {
      h = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, h);
    }
    h.count += 1;
    if (h.count > this.max) return { ok: false, retryAfterSec: Math.ceil((h.resetAt - t) / 1000) };
    return { ok: true, retryAfterSec: 0 };
  }

  makeRoom(t) {
    this.sweep(t);
    if (this.hits.size < this.maxKeys) return;
    let drop = Math.ceil(this.maxKeys / 10);
    for (const k of this.hits.keys()) {
      if (drop-- <= 0) break;
      this.hits.delete(k);
    }
  }

  sweep(t) {
    for (const [k, h] of this.hits) if (t >= h.resetAt) this.hits.delete(k);
  }
}

module.exports = { RateLimiter };
