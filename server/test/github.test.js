'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseAchievements, parseAchievementDetail, parseHighlights, parseContributions, streaks } = require('../src/github');
const { Cache } = require('../src/cache');

const A = 'https://github.githubassets.com/assets/';

test('parseAchievements reads slug, tier and skin tone', () => {
  const html = `
    <img title="Achievement: Pull Shark" alt="Achievement: Pull Shark" height="64" src="${A}pull-shark-silver-0643f87ac9fd.png" width="64">
    <img alt="Achievement: Starstruck" src="${A}starstruck-default--dark-e2e2f78e1660.png">
    <img alt="Achievement: Quickdraw" src="${A}quickdraw-default--light-medium-5450fadcbe37.png">
    <img alt="Achievement: Pull Shark" src="${A}pull-shark-silver-0643f87ac9fd.png">
    <img alt="avatar" src="https://avatars.githubusercontent.com/u/1">`;
  const got = parseAchievements(html);
  assert.deepStrictEqual(got.map((g) => [g.slug, g.tier, g.tone]), [
    ['pull-shark', 'silver', null],
    ['starstruck', 'default', 'dark'],
    ['quickdraw', 'default', 'light-medium'],
  ]);
});

test('parseAchievements ignores unrelated and malformed images', () => {
  assert.deepStrictEqual(parseAchievements('<img alt="Achievement: X" src="https://evil.example/a.png">'), []);
  assert.deepStrictEqual(parseAchievements('<p>nothing</p>'), []);
});

test('streaks counts current and longest runs', () => {
  const d = (c) => ({ contributionCount: c });
  assert.deepStrictEqual(streaks([d(1), d(1), d(0), d(2), d(3), d(0)]), { current: 2, longest: 2 });
  assert.deepStrictEqual(streaks([d(0), d(4), d(5), d(6)]), { current: 3, longest: 3 });
  assert.deepStrictEqual(streaks([]), { current: 0, longest: 0 });
});

// Mirrors the real fragment: cells are listed by weekday row (not date order); counts live in <tool-tip>.
const FRAGMENT = `
<h2 id="js-contribution-activity-description" class="f4 text-normal mb-2">
  414 contributions in the last year
</h2>
<table><tbody><tr>
<td tabindex="-1" data-ix="0" aria-selected="false" aria-describedby="contribution-graph-legend-level-0" style="width: 10px" data-date="2026-11-03" id="contribution-day-component-0-0" data-level="0" role="gridcell" data-view-component="true" class="ContributionCalendar-day"></td>
<td tabindex="-1" data-ix="1" data-date="2026-11-01" id="contribution-day-component-0-1" data-level="2" class="ContributionCalendar-day"></td>
<td tabindex="-1" data-ix="2" data-date="2026-11-02" id="contribution-day-component-0-2" data-level="1" class="ContributionCalendar-day"></td>
<td tabindex="-1" data-ix="3" data-date="2026-11-04" id="contribution-day-component-0-3" data-level="3" class="ContributionCalendar-day"></td>
</tr></tbody></table>
<tool-tip id="tooltip-1" for="contribution-day-component-0-0" popover="manual" data-direction="n" data-type="label" data-view-component="true" class="sr-only position-absolute">No contributions on November 3rd.</tool-tip>
<tool-tip id="tooltip-2" for="contribution-day-component-0-1" popover="manual" class="sr-only position-absolute">2 contributions on November 1st.</tool-tip>
<tool-tip id="tooltip-3" for="contribution-day-component-0-2" popover="manual" class="sr-only position-absolute">1 contribution on November 2nd.</tool-tip>
<tool-tip id="tooltip-4" for="contribution-day-component-0-3" popover="manual" class="sr-only position-absolute">12 contributions on November 4th.</tool-tip>`;

test('parseContributions reads total and per-day counts in date order', () => {
  const r = parseContributions(FRAGMENT);
  assert.strictEqual(r.total, 414);
  assert.deepStrictEqual(r.days.map((d) => [d.date, d.contributionCount]), [
    ['2026-11-01', 2], ['2026-11-02', 1], ['2026-11-03', 0], ['2026-11-04', 12],
  ]);
  assert.deepStrictEqual(streaks(r.days), { current: 1, longest: 2 });
});

test('parseContributions returns null for a page it does not understand', () => {
  assert.strictEqual(parseContributions('<html>sign in</html>'), null);
});

test('Cache serves fresh values, shares in-flight calls, and falls back to stale on error', async () => {
  let t = 0, calls = 0;
  const c = new Cache(() => t);
  const fn = async () => { calls += 1; await new Promise((r) => setTimeout(r, 10)); return calls; };
  const [a, b] = await Promise.all([c.get('k', 1000, fn), c.get('k', 1000, fn)]);
  assert.deepStrictEqual([a, b, calls], [1, 1, 1]);
  t = 500;
  assert.strictEqual(await c.get('k', 1000, fn), 1);
  t = 2000;
  assert.strictEqual(await c.get('k', 1000, async () => { throw new Error('boom'); }), 1);
  await assert.rejects(() => c.get('other', 1000, async () => { throw new Error('boom'); }));
});

test('parseHighlights reads the sidebar list and ignores icons', () => {
  const html = `<div><h2 class="h4 mb-2">Highlights</h2><ul class="list-style-none"><li class="mt-2">
    <a class="Link--primary" href="https://docs.github.com/x"> <svg class="octicon"><path d="M1 1"/></svg> Developer Program Member </a></li>
    <li class="mt-2"><a href="/pro"><span class="Label">Pro</span></a></li></ul></div>`;
  assert.deepStrictEqual(parseHighlights(html), ['Developer Program Member', 'Pro']);
  assert.deepStrictEqual(parseHighlights('<h2>Organizations</h2>'), []);
});

test('parseAchievementDetail reads the first-unlock time and the event for each tier', () => {
  const html = `<h3>Pull Shark</h3><h4>History</h4>
   <div><div><svg/></div><div><span class="x"> Bronze and Silver unlocked </span> · First unlocked <relative-time datetime="2012-02-09T14:40:17Z" month="short">2012-02-09 14:40:17 UTC</relative-time></div></div>
   <div><div><svg/></div><div><span>inaccessible</span> · <span>2nd pull request merged</span></div></div>
   <div><div><svg/></div><div><a href="/doctrine/orm/pull/856">doctrine/orm#856</a> · <span>16th pull request merged</span></div></div>
   <div><div><svg/></div><div><a href="//evil.example/x">bad</a> · <span>128th pull request merged</span></div></div>`;
  const d = parseAchievementDetail(html);
  assert.strictEqual(d.firstUnlocked, '2012-02-09T14:40:17.000Z');
  assert.deepStrictEqual(d.events, [
    { text: '2nd pull request merged', label: 'private repository', url: null },
    { text: '16th pull request merged', label: 'doctrine/orm#856', url: 'https://github.com/doctrine/orm/pull/856' },
    { text: '128th pull request merged', label: 'bad', url: null },
  ]);
  assert.deepStrictEqual(parseAchievementDetail('<p>nothing</p>'), { firstUnlocked: null, events: [] });
});

test('parseAchievementDetail copes with links inside the event text (co-authors)', () => {
  const html = `<h4>History</h4>
   <div><div><svg/></div><div><span> Bronze and Silver unlocked </span> · First unlocked <relative-time datetime="2025-12-05T21:09:42Z">x</relative-time></div></div>
   <div><div><svg/></div><div><a href="/home-assistant/core/pull/158071">home-assistant/core#158071</a> · <span>Coauthored with <a href="/quebulm" hovercard-type="user">@quebulm</a>, <a href="/joostlek">@joostlek</a></span></div></div>`;
  const d = parseAchievementDetail(html);
  assert.strictEqual(d.events.length, 1);
  assert.strictEqual(d.events[0].text, 'Coauthored with @quebulm, @joostlek');
  assert.strictEqual(d.events[0].url, 'https://github.com/home-assistant/core/pull/158071');
});

test('cache: a failed fetch is not retried for a minute, and stale value is kept', async () => {
  let t = 0;
  const c = new Cache(() => t);
  let calls = 0;
  const bad = async () => { calls++; throw new Error('429'); };
  await assert.rejects(c.get('k', 1000, bad));
  await assert.rejects(c.get('k', 1000, bad));
  assert.equal(calls, 1);
  t = 61e3;
  await assert.rejects(c.get('k', 1000, bad));
  assert.equal(calls, 2);
});
