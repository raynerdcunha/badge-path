'use strict';
// Small in-memory cache: remembers results for a while, shares one in-flight request between
// callers, and falls back to the last good value if a refresh fails.

class Cache {
  constructor(now = Date.now) {
    this.now = now;
    this.items = new Map(); // key -> { value, at }
    this.pending = new Map(); // key -> Promise
    this.fails = new Map(); // key -> { err, at }: after a failure, don't hammer GitHub again for a minute
    this.failMs = 60e3;
  }

  // Returns the cached value if younger than ttlMs, otherwise calls fn() once and stores it.
  async get(key, ttlMs, fn) {
    const hit = this.items.get(key);
    if (hit && this.now() - hit.at < ttlMs) return hit.value;
    const bad = this.fails.get(key);
    if (bad && this.now() - bad.at < this.failMs) {
      if (hit) return hit.value;
      throw bad.err;
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        this.items.set(key, { value, at: this.now() });
        this.fails.delete(key);
        this.trim();
        return value;
      } catch (e) {
        this.fails.set(key, { err: e, at: this.now() });
        this.trim();
        if (hit) return hit.value; // stale beats broken
        throw e;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, p);
    return p;
  }

  has(key) {
    return this.items.has(key);
  }

  trim() {
    const t = this.now();
    for (const [k, f] of this.fails) if (t - f.at >= this.failMs) this.fails.delete(k);
    if (this.items.size <= 2000) return;
    const oldest = [...this.items.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 500);
    oldest.forEach(([k]) => this.items.delete(k));
  }
}

module.exports = { Cache };
