// Sample week for Demo mode. Generated relative to today; never sent to the database.

import { buildEntry } from './entries.js';
import { addDays, todayStr } from './util.js';

const item = (name, kcal, protein_g, carbs_g, fat_g, fibre_g, default_slot, on_plan, aliases = '', favorite = false) =>
  ({ name, kcal, protein_g, carbs_g, fat_g, fibre_g, default_slot, on_plan, aliases, favorite });

export const DEMO_ITEMS = [
  item('Kenko meal', 580, 50, 61, 15, 6, 'Dinner', true, 'kenko', true),
  item('Banana', 105, 1.3, 27, 0.4, 3.1, 'Snack', true, '', true),
  item('Whey, 1 scoop', 120, 24, 3, 2, 0, 'Snack', true, 'whey', true),
  item('Coffee', 60, 2, 8, 2, 0, 'Snack', false, 'chai, cappuccino'),
  item('Pani puri', 300, 6, 45, 11, 3, 'Snack', false, 'golgappa'),
];

const m = (slot, name, kcal, protein_g, carbs_g, fat_g, fibre_g, on_plan = true) =>
  ({ slot, name, kcal, protein_g, carbs_g, fat_g, fibre_g, on_plan, source: 'line', group: '' });
const K = (slot = 'Dinner') => ({ ...m(slot, 'Kenko meal', 580, 50, 61, 15, 6), source: 'saved' });
const I = (name, slot) => {
  const it = DEMO_ITEMS.find((i) => i.name === name);
  return { ...m(slot ?? it.default_slot, it.name, it.kcal, it.protein_g, it.carbs_g, it.fat_g, it.fibre_g, it.on_plan), source: 'saved' };
};

// offset 1 = yesterday ... 7 = a week ago. Offset 0 is today, in progress.
const TEMPLATE = {
  7: [m('Breakfast', 'Idli, sambar, curd', 261, 11, 41, 6, 4), m('Lunch', 'Dal, rice, dry sabzi, curd', 715, 30, 85, 18, 7), I('Whey, 1 scoop'), K()],
  6: [m('Breakfast', 'Protein smoothie', 244, 26, 27, 5, 4), m('Lunch', 'Chana masala, brown rice', 678, 29, 108, 16, 23), m('Snack', 'Greek yogurt 200g', 146, 20, 8, 4, 0), K(), m('Workout', 'Whey shake and banana', 209, 25, 26, 2, 3)],
  5: [m('Breakfast', 'Oats bowl', 231, 9, 29, 9, 5), m('Lunch', 'Office canteen thali', 820, 24, 120, 26, 8, false), I('Coffee'), I('Pani puri'), K()],
  4: [m('Breakfast', 'Dosa, sambar, Greek yogurt', 280, 11, 39, 9, 4), m('Lunch', 'Moong dal khichdi, curd', 682, 30, 109, 14, 16), I('Whey, 1 scoop'), K(), I('Banana', 'Workout')],
  3: [m('Breakfast', 'High-protein muesli, milk', 255, 15.2, 32, 7.3, 4), m('Lunch', 'Veg thali', 760, 28, 121, 19, 6, false), m('Snack', 'Kulfi', 176, 4, 19, 9, 0, false), I('Whey, 1 scoop'), m('Dinner', 'Vegetable soup, toast', 260, 9, 36, 8, 5)],
  2: [m('Breakfast', 'Protein smoothie', 244, 26, 27, 5, 4), m('Lunch', 'Dal, rice, dry sabzi, curd', 715, 30, 85, 18, 7), I('Coffee'), K('Lunch'), I('Whey, 1 scoop', 'Dinner')],
  1: [m('Breakfast', 'Idli, sambar, curd', 261, 11, 41, 6, 4), m('Lunch', 'Tofu and sprouts bowl, roti', 729, 44, 81, 27, 18), m('Snack', 'Fruit and peanut butter', 159, 4, 20, 8, 4), m('Dinner', 'Paneer bhurji, 2 rotis', 540, 31, 42, 28, 7)],
  0: [m('Breakfast', 'Oats bowl', 231, 9, 29, 9, 5), I('Coffee', 'Breakfast')],
};

const TIMES = { Breakfast: '08:30', Lunch: '13:15', Snack: '17:00', Dinner: '20:30', Workout: '07:00' };

export function sampleEntries(now = new Date()) {
  const today = todayStr();
  const out = {};
  let n = 0;
  for (const [offset, rows] of Object.entries(TEMPLATE)) {
    const date = addDays(today, -Number(offset));
    for (const f of rows) {
      const e = buildEntry({ ...f, id: `demo-${++n}`, time: TIMES[f.slot], note: '' }, { date, now });
      out[e.id] = e;
    }
  }
  return out;
}
