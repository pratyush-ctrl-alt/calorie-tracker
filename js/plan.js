// Shared constants and default settings. Pure data, no DOM.

export const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Workout'];

// How many items can be pinned (starred) into "Quick add".
export const MAX_FAVORITES = 5;

// Seeded into the Settings table on first run; every value is editable in the app.
// The kenko_* values are only used once, to create the "Kenko meal" item in My Items.
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
