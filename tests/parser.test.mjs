import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLog, guessSlot } from '../js/parser.js';

const at = (h, m = 0) => new Date(2026, 10, 2, h, m);
const LINE = 'Lunch | Dal, rice, bhindi, curd | 720 kcal | 28g P | 95g C | 22g F | 9g Fib';

function one(text, opts = {}) {
  const r = parseLog(text, { now: at(13), ...opts });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.entries.length, 1);
  return r.entries[0];
}

function checkLunch(e) {
  assert.equal(e.slot, 'Lunch');
  assert.equal(e.slotGuessed, false);
  assert.equal(e.name, 'Dal, rice, bhindi, curd');
  assert.equal(e.kcal, 720);
  assert.equal(e.protein_g, 28);
  assert.equal(e.carbs_g, 95);
  assert.equal(e.fat_g, 22);
  assert.equal(e.fibre_g, 9);
  assert.equal(e.source, 'line');
  assert.equal(e.on_plan, false);
}

test('1. full line gives every field', () => checkLunch(one(LINE)));

test('2a. wrapped in backticks', () => checkLunch(one('`' + LINE + '`')));
test('2b. wrapped in a ``` fence', () => checkLunch(one('```\n' + LINE + '\n```')));
test('2c. fence with a language tag', () => checkLunch(one('```text\n' + LINE + '\n```')));
test('2d. with ** bold markers', () => {
  checkLunch(one('**Lunch** | **Dal, rice, bhindi, curd** | **720 kcal** | 28g P | 95g C | 22g F | 9g Fib'));
});
test('2e. bullet and quotes', () => {
  checkLunch(one('- "' + LINE + '"'));
  checkLunch(one('• ' + LINE));
});

test('3. out of order, spelled-out labels', () => {
  const e = one('Dinner | Paneer tikka | Protein 32g | Calories 410 | Fat 24g | Carbs 12g');
  assert.equal(e.slot, 'Dinner');
  assert.equal(e.name, 'Paneer tikka');
  assert.equal(e.kcal, 410);
  assert.equal(e.protein_g, 32);
  assert.equal(e.fat_g, 24);
  assert.equal(e.carbs_g, 12);
  assert.equal(e.fibre_g, null, 'missing fibre is unknown, not zero');
});

test('4. range and tilde use the midpoint', () => {
  const e = one('Snack | Samosa x2 | ~500-560 kcal | 10 P | 58 C | 28 F');
  assert.equal(e.kcal, 530);
  assert.equal(e.name, 'Samosa x2');
  assert.equal(e.protein_g, 10);
  assert.equal(one('Snack | X | 500 to 560 kcal | 10 P').kcal, 530);
  assert.equal(one('Snack | X | approx 400 kcal | 10 P').kcal, 400);
});

test('5. no slot: taken from the time and flagged as guessed', () => {
  const text = 'Pani puri | 300 kcal | 6g P | 45 C | 11 F';
  const cases = [[8, 'Breakfast'], [10, 'Breakfast'], [11, 'Lunch'], [15, 'Lunch'], [16, 'Snack'], [18, 'Snack'], [19, 'Dinner'], [23, 'Dinner']];
  for (const [h, slot] of cases) {
    const e = one(text, { now: at(h, h === 10 || h === 15 || h === 18 ? 59 : 0) });
    assert.equal(e.slot, slot, `hour ${h}`);
    assert.equal(e.slotGuessed, true);
  }
  assert.equal(one(text).name, 'Pani puri');
  assert.equal(guessSlot(10), 'Breakfast');
});

test('6. three lines, one junk: two entries plus one error', () => {
  const r = parseLog(`${LINE}\nthis is not a meal\nSnack | Apple | 95 kcal | 0.5g P`, { now: at(13) });
  assert.equal(r.entries.length, 2);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 2);
  assert.equal(r.entries[1].name, 'Apple');
  assert.equal(r.entries[1].protein_g, 0.5);
});

test('7. missing protein gives "needs protein"', () => {
  const r = parseLog('Lunch | Salad | 200 kcal | 20g C', { now: at(13) });
  assert.equal(r.entries.length, 0);
  assert.equal(r.errors[0].error, 'needs protein');
  assert.equal(parseLog('Lunch | Salad | 20g P', { now: at(13) }).errors[0].error, 'needs kcal');
});

test('8. a saved item name or alias logs that item', () => {
  const items = [{ name: 'Coffee', kcal: 60, protein_g: 2, carbs_g: 8, fat_g: 2, fibre_g: 0, default_slot: 'Snack', on_plan: false, aliases: 'chai, cappuccino' }];
  for (const text of ['coffee', 'Coffee', '  COFFEE  ', 'chai']) {
    const e = one(text, { items });
    assert.equal(e.name, 'Coffee');
    assert.equal(e.kcal, 60);
    assert.equal(e.protein_g, 2);
    assert.equal(e.slot, 'Snack');
    assert.equal(e.slotGuessed, false);
    assert.equal(e.source, 'saved');
    assert.equal(e.on_plan, false);
  }
  assert.equal(one('Dinner | coffee', { items }).slot, 'Dinner', 'explicit slot wins');
});

test('8b. plan-menu names are no longer shortcuts (the plan menu was removed)', () => {
  const r = parseLog('veg thali', { now: at(13) });
  assert.equal(r.entries.length, 0);
  assert.equal(r.errors.length, 1);
});

test('9. kenko alone gives the Kenko meal', () => {
  const e = one('kenko');
  assert.equal(e.name, 'Kenko meal');
  assert.equal(e.source, 'kenko');
  assert.equal(e.on_plan, true);
  assert.equal(e.slot, 'Dinner');
  assert.equal(e.kcal, 580);
  assert.equal(e.protein_g, 50);
  const custom = one('Kenko', { settings: { kenko_kcal: 600, kenko_protein_g: 52 } });
  assert.equal(custom.kcal, 600);
  assert.equal(custom.protein_g, 52);
});

test('9b. a saved item called "Kenko meal" (alias kenko) wins over the built-in one', () => {
  const items = [{ name: 'Kenko meal', kcal: 600, protein_g: 55, carbs_g: 60, fat_g: 23, fibre_g: 8, default_slot: 'Dinner', on_plan: true, aliases: 'kenko' }];
  const e = one('kenko', { items });
  assert.equal(e.source, 'saved');
  assert.equal(e.kcal, 600);
  assert.equal(e.fat_g, 23);
  assert.equal(e.on_plan, true);
});

test('10. fibre/fiber/fib and kcal/cal/calories spellings', () => {
  for (const fib of ['9g Fib', '9g Fibre', '9g Fiber', 'Fiber 9g', 'fibre: 9', '9 fib']) {
    assert.equal(one(`Lunch | X | 100 kcal | 5 P | ${fib}`).fibre_g, 9, fib);
  }
  for (const k of ['720 kcal', '720 cal', '720 cals', '720 calories', 'Calories 720', 'cal 720', 'kcal: 720']) {
    assert.equal(one(`Lunch | X | ${k} | 5 P`).kcal, 720, k);
  }
});

test('extras: decimals round to 1dp, several lines, blank carbs/fat stay null', () => {
  const e = one('Lunch | Soup | 150.46 kcal | 7.25g P');
  assert.equal(e.kcal, 150.5);
  assert.equal(e.protein_g, 7.3);
  assert.equal(e.carbs_g, null);
  assert.equal(e.fat_g, null);
  const r = parseLog(`Breakfast | A | 100 kcal | 5 P\n\nLunch | B | 200 kcal | 10 P\nDinner | C | 300 kcal | 15 P`, { now: at(9) });
  assert.deepEqual(r.entries.map((x) => x.name), ['A', 'B', 'C']);
});

test('extras: short slot forms', () => {
  const forms = { bf: 'Breakfast', snk: 'Snack', pre: 'Workout', post: 'Workout', 'pre-workout': 'Workout', 'Post-Workout': 'Workout', workout: 'Workout' };
  for (const [w, slot] of Object.entries(forms)) {
    assert.equal(one(`${w} | X | 100 kcal | 5 P`).slot, slot, w);
  }
});

test('extras: empty and whitespace input', () => {
  assert.equal(parseLog('', { now: at(9) }).results.length, 0);
  assert.equal(parseLog('  \n \n', { now: at(9) }).results.length, 0);
});
