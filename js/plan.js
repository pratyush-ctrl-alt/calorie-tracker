// Plan-menu seed data and default settings. Pure data, no DOM.
// A null fibre value means "unknown" (a dash in the nutritionist's table), not zero.

export const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Workout'];

// Groups that count as "Treats" in the Week and Month scorecards.
export const TREAT_GROUPS = ['Treat', 'Ice cream'];

export const PLAN_GROUPS = [
  'Early morning', 'Pre-workout', 'Post-workout', 'Breakfast', 'Snack',
  'Lunch', 'Instead of Kenko', 'Treat', 'Ice cream',
];

const row = (group, name, kcal, protein_g, carbs_g, fat_g, fibre_g, default_slot) =>
  ({ group, name, kcal, protein_g, carbs_g, fat_g, fibre_g, default_slot });

export const PLAN_MENU = [
  row('Early morning', 'Jeera water', 5, 0, 1, 0, 0, 'Breakfast'),
  row('Early morning', 'Methi water', 6, 0, 1, 0, 1, 'Breakfast'),
  row('Early morning', 'Warm lemon water', 5, 0, 2, 0, 0, 'Breakfast'),

  row('Pre-workout', 'Banana + 2 dates', 129, 2, 34, 0, 4, 'Workout'),
  row('Pre-workout', 'Oats 20g + banana', 167, 4, 36, 2, 5, 'Workout'),
  row('Pre-workout', 'Fruit + roasted makhana', 140, 3, 32, 0, 6, 'Workout'),

  row('Post-workout', 'Whey shake + banana', 209, 25, 26, 2, 3, 'Workout'),
  row('Post-workout', 'High-protein milk + banana', 252, 26, 37, 1, 3, 'Workout'),
  row('Post-workout', 'Sattu drink + roasted chana', 196, 11, 31, 3, 9, 'Workout'),

  row('Breakfast', 'High-protein muesli + milk', 255, 15.2, 32, 7.3, null, 'Breakfast'),
  row('Breakfast', 'Oats bowl (oats, curd, chia)', 231, 9, 29, 9, 5, 'Breakfast'),
  row('Breakfast', 'Protein smoothie', 244, 26, 27, 5, 4, 'Breakfast'),
  row('Breakfast', 'Idli + sambar + curd', 261, 11, 41, 6, 4, 'Breakfast'),
  row('Breakfast', 'Dosa + sambar + Greek yogurt', 280, 11, 39, 9, 4, 'Breakfast'),

  row('Snack', 'Fruit + peanut butter', 159, 4, 20, 8, 4, 'Snack'),
  row('Snack', 'Whey, 1 scoop', 120, 24, 3, 2, 0, 'Snack'),
  row('Snack', 'Greek yogurt 200g', 146, 20, 8, 4, 0, 'Snack'),

  row('Lunch', 'Dal + rice + dry sabzi + curd', 715, 30, 85, 18, null, 'Lunch'),
  row('Lunch', 'Moong dal khichdi + curd', 682, 30, 109, 14, 16, 'Lunch'),
  row('Lunch', 'Chana masala + brown rice', 678, 29, 108, 16, 23, 'Lunch'),

  row('Instead of Kenko', 'Rajma or chole chawal', 657, 25, 103, 15, 14, 'Dinner'),
  row('Instead of Kenko', 'Tofu + sprouts bowl + roti', 729, 44, 81, 27, 18, 'Dinner'),

  row('Treat', 'Pizza, 3 thin-crust slices + salad', 710, 29, 90, 25, 5, 'Dinner'),
  row('Treat', 'Steamed veg momos (16) + clear soup', 670, 26, 93, 24, 5, 'Dinner'),
  row('Treat', 'Pasta with paneer, tomato sauce', 705, 31, 104, 20, 5, 'Dinner'),
  row('Treat', 'Dal + rice + sabzi (no roti)', 745, 29, 122, 16, 6, 'Lunch'),
  row('Treat', 'Veg thali', 760, 28, 121, 19, 6, 'Lunch'),

  row('Ice cream', 'Ice cream, 1.5 scoops', 155, 3, 18, 8, 0, 'Snack'),
  row('Ice cream', 'Kulfi', 176, 4, 19, 9, 0, 'Snack'),
  row('Ice cream', 'High-protein ice cream', 135, 9, 18, 3, 3, 'Snack'),
  row('Ice cream', 'Fruit sorbet', 120, 0, 30, 0, 1, 'Snack'),
];

// Seeded into the Settings tab on first run; every value is editable in the app.
export const DEFAULT_SETTINGS = {
  calorie_target: 2037,    // nutritionist plan, daily total
  protein_target_g: 134,   // nutritionist plan, daily total
  calorie_band_pct: 10,    // my rule: on target = within +/-10% of calorie_target
  protein_hit_g: 120,      // my rule: protein "hit" at 120 g or more
  fat_limit_g: 60,         // my estimate; the plan gives no fat target
  fibre_target_g: 30,      // nutritionist plan
  kenko_kcal: 580,         // nutritionist plan
  kenko_protein_g: 50,     // nutritionist plan
  kenko_carbs_g: 61,       // my estimate
  kenko_fat_g: 15,         // my estimate
  kenko_fibre_g: 6,        // my estimate
};
