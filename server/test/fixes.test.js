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
