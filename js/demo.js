// Sample week for Demo mode. Generated relative to today; never sent to the Sheet.

import { PLAN_MENU } from './plan.js';
import { buildEntry, planFields, kenkoFields } from './entries.js';
import { DEFAULT_SETTINGS } from './plan.js';
import { addDays, todayStr } from './util.js';

const plan = (name) => PLAN_MENU.find((p) => p.name === name);

export const DEMO_ITEMS = [
  { name: 'Coffee', kcal: 60, protein_g: 2, carbs_g: 8, fat_g: 2, fibre_g: 0, default_slot: 'Snack', on_plan: false, aliases: 'chai, cappuccino' },
  { name: 'Pani puri', kcal: 300, protein_g: 6, carbs_g: 45, fat_g: 11, fibre_g: 3, default_slot: 'Snack', on_plan: false, aliases: 'golgappa' },
  { name: 'Marie biscuits', kcal: 110, protein_g: 2, carbs_g: 18, fat_g: 3, fibre_g: 0.5, default_slot: 'Snack', on_plan: false, aliases: 'biscuits' },
];

const P = (name, slot) => ({ ...planFields(plan(name), { slot }) });
const K = (slot = 'Dinner', note = '') => kenkoFields(DEFAULT_SETTINGS, slot, note);
const I = (name, slot) => ({
  ...DEMO_ITEMS.find((i) => i.name === name), slot: slot ?? DEMO_ITEMS.find((i) => i.name === name).default_slot,
  source: 'saved', group: '',
});
const L = (slot, name, kcal, p, c, f, fib) => ({ slot, name, kcal, protein_g: p, carbs_g: c, fat_g: f, fibre_g: fib, source: 'line', on_plan: false, group: '' });

// offset 1 = yesterday ... 7 = a week ago. Offset 0 is today, in progress.
const TEMPLATE = {
  7: [P('Warm lemon water', 'Breakfast'), P('Idli + sambar + curd'), P('Dal + rice + dry sabzi + curd'), P('Whey, 1 scoop'), K()],
  6: [P('Protein smoothie'), P('Chana masala + brown rice'), P('Greek yogurt 200g'), K('Dinner', 'pasta with grilled paneer'), P('Whey shake + banana', 'Workout')],
  5: [P('Oats bowl (oats, curd, chia)'), L('Lunch', 'Office canteen thali', 820, 24, 120, 26, 8), I('Coffee'), I('Pani puri'), K()],
  4: [P('Methi water', 'Breakfast'), P('Dosa + sambar + Greek yogurt'), P('Moong dal khichdi + curd'), P('Whey, 1 scoop'), K(), P('Banana + 2 dates', 'Workout')],
  3: [P('High-protein muesli + milk'), P('Veg thali'), P('Kulfi'), P('Greek yogurt 200g', 'Snack'), L('Dinner', 'Vegetable soup + toast', 260, 9, 36, 8, 5)],
  2: [P('Protein smoothie'), P('Dal + rice + dry sabzi + curd'), I('Marie biscuits'), K('Lunch'), P('Whey, 1 scoop', 'Dinner')],
  1: [P('Idli + sambar + curd'), P('Tofu + sprouts bowl + roti', 'Lunch'), P('Fruit + peanut butter'), P('High-protein milk + banana', 'Workout'), L('Dinner', 'Paneer bhurji, 2 rotis', 540, 31, 42, 28, 7)],
  0: [P('Oats bowl (oats, curd, chia)'), I('Coffee', 'Breakfast')],
};

const TIMES = { Breakfast: '08:30', Lunch: '13:15', Snack: '17:00', Dinner: '20:30', Workout: '07:00' };

export function sampleEntries(now = new Date()) {
  const today = todayStr();
  const out = {};
  let n = 0;
  for (const [offset, rows] of Object.entries(TEMPLATE)) {
    const date = addDays(today, -Number(offset));
    for (const f of rows) {
      const e = buildEntry({ ...f, id: `demo-${++n}`, time: TIMES[f.slot], note: f.note ?? '' }, { date, now });
      out[e.id] = e;
    }
  }
  return out;
}
