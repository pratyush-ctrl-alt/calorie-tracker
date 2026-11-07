import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { totalsFor, dayStatus, summarize, groupByDate, weekWindow, weeksOfMonth, kcalOnTarget, rate, explainRating, METRICS } from '../js/calc.js';
import { DEFAULT_SETTINGS } from '../js/plan.js';
import { buildEntry, scaleFood, validateEntry, kenkoFields } from '../js/entries.js';
import { GEMINI_PROMPT } from '../js/prompt.js';

const S = DEFAULT_SETTINGS;
const E = (date, o = {}) => ({
  id: Math.random().toString(36), date, time: '12:00', slot: 'Lunch', name: 'x', kcal: 500, protein_g: 30,
  carbs_g: 50, fat_g: 10, fibre_g: 5, source: 'line', on_plan: true, group: '', note: '', deleted: false, ...o,
});

test('totals ignore deleted rows and treat unknown macros as 0 but flag the day', () => {
  const t = totalsFor([E('2026-11-01'), E('2026-11-01', { carbs_g: null }), E('2026-11-01', { deleted: true, kcal: 9999 })]);
  assert.equal(t.kcal, 1000);
  assert.equal(t.carbs, 50);
  assert.equal(t.count, 2);
  assert.equal(t.missing, true);
});

test('calorie band is +/-10% of target', () => {
  assert.equal(kcalOnTarget(2037, S), true);
  assert.equal(kcalOnTarget(1834, S), true);
  assert.equal(kcalOnTarget(1833, S), false);
  assert.equal(kcalOnTarget(2240, S), true);
  assert.equal(kcalOnTarget(2242, S), false);
});

test('day status: protein hit at >= 120, fat over only above limit, off-plan if any entry off plan', () => {
  const ok = dayStatus('d', [E('d', { kcal: 2000, protein_g: 120, fat_g: 60 })], S);
  assert.equal(ok.proteinOk, true);
  assert.equal(ok.fatOver, false);
  assert.equal(ok.kcalOk, true);
  assert.equal(ok.offPlan, false);
  const bad = dayStatus('d', [E('d', { fat_g: 61, protein_g: 119, on_plan: false })], S);
  assert.equal(bad.proteinOk, false);
  assert.equal(bad.fatOver, true);
  assert.equal(bad.offPlan, true);
});

test('an unlogged day is never counted as met or missed', () => {
  const byDate = groupByDate([E('2026-11-01', { kcal: 2000, protein_g: 130 })]);
  const sum = summarize(['2026-10-31', '2026-11-01'], byDate, S);
  assert.equal(sum.daysLogged, 1);
  assert.equal(sum.kcalOk, 1);
  assert.equal(sum.proteinOk, 1);
  assert.equal(sum.fatOver, 0);
  assert.equal(sum.avgKcal, 2000);
  assert.equal(sum.days[0].logged, false);
  assert.equal(sum.days[0].kcalOk, false);
});

test('week window is the 7 full days before today', () => {
  const w = weekWindow('2026-11-02');
  assert.equal(w.length, 7);
  assert.equal(w[0], '2026-10-26');
  assert.equal(w[6], '2026-11-01');
  assert.ok(!w.includes('2026-11-02'));
});

test('month weeks are Mon-Sun, clipped to the month', () => {
  const w = weeksOfMonth(2026, 10); // November 2026 starts on a Sunday
  assert.deepEqual(w[0], ['2026-11-01']);
  assert.equal(w[1].length, 7);
  assert.equal(w.flat().length, 30);
  assert.equal(w.at(-1).at(-1), '2026-11-30');
});

test('chip quantity scales values and keeps unknown as unknown', () => {
  const s = scaleFood({ name: 'Idli', kcal: 261, protein_g: 11, carbs_g: 41, fat_g: 6, fibre_g: null }, 1.5);
  assert.equal(s.kcal, 391.5);
  assert.equal(s.fibre_g, null);
  assert.equal(s.name, 'Idli ×1.5');
  assert.equal(scaleFood({ name: 'Idli', kcal: 1 }, 1).name, 'Idli');
});

test('entry validation and kenko builder', () => {
  const k = buildEntry(kenkoFields(S, 'Lunch', ' pasta '), { date: '2026-11-02' });
  assert.equal(validateEntry(k), '');
  assert.equal(k.source, 'kenko');
  assert.equal(k.on_plan, true);
  assert.equal(k.slot, 'Lunch');
  assert.equal(k.note, 'pasta');
  assert.equal(k.kcal, 580);
  assert.equal(validateEntry({ ...k, protein_g: null }), 'Needs protein');
  assert.equal(validateEntry({ ...k, name: ' ' }), 'Needs a name');
});

test('the Gemini prompt in README.md matches the one in the app', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(GEMINI_PROMPT), 'README.md must contain the exact prompt from js/prompt.js');
});

test('rating: calories are green within the band, yellow within twice the band, red beyond', () => {
  assert.equal(rate('kcal', 2037, S), 'good');
  assert.equal(rate('kcal', 1885, S), 'good');      // -7.5%
  assert.equal(rate('kcal', 1730, S), 'warn');      // -15%
  assert.equal(rate('kcal', 2105, S), 'good');      // +3.3%
  assert.equal(rate('kcal', 2500, S), 'bad');       // +22.7%
  assert.equal(rate('kcal', 1500, S), 'bad');
});

test('rating: protein, fat and fibre thresholds', () => {
  assert.equal(rate('protein', 120, S), 'good');
  assert.equal(rate('protein', 116.1, S), 'warn');
  assert.equal(rate('protein', 107.3, S), 'warn');
  assert.equal(rate('protein', 90, S), 'bad');
  assert.equal(rate('fat', 60, S), 'good');
  assert.equal(rate('fat', 63.7, S), 'warn');
  assert.equal(rate('fat', 69, S), 'warn');
  assert.equal(rate('fat', 81.7, S), 'bad');
  assert.equal(rate('fibre', 32.7, S), 'good');
  assert.equal(rate('fibre', 25, S), 'warn');
  assert.equal(rate('fibre', 10, S), 'bad');
});

test('rating: carbs are never rated, and a missing value is not rated', () => {
  assert.equal(rate('carbs', 250, S), null);
  assert.equal(rate('kcal', null, S), null);
  assert.equal(rate('nonsense', 5, S), null);
});

test('rating follows edited settings, and every metric has an explanation', () => {
  const custom = { ...S, calorie_target: 1800, calorie_band_pct: 5, fat_limit_g: 50 };
  assert.equal(rate('kcal', 1900, custom), 'warn');   // +5.6% is outside 5% but inside 10%
  assert.equal(rate('fat', 55, custom), 'warn');
  for (const m of Object.keys(METRICS)) assert.ok(explainRating(m, S).length > 10, m);
  assert.match(explainRating('kcal', S), /10%/);
});
