// Log-line parser. Pure functions, no DOM access, no network.
//
//   Lunch | Dal, rice, bhindi, curd | 720 kcal | 28g P | 95g C | 22g F | 9g Fib
//
// parseLog(text, opts) -> { results, entries, errors }
//   opts.now      Date (or an hour number) used to guess a missing slot. Default: new Date()
//   opts.items    saved items [{name, kcal, protein_g, carbs_g, fat_g, fibre_g, default_slot, on_plan, aliases}]
//   opts.settings settings object holding the kenko_* values (default: DEFAULT_SETTINGS)
//
// Each parsed entry: { name, slot, slotGuessed, kcal, protein_g, carbs_g, fat_g, fibre_g,
//                      source, on_plan, group }. A null macro means "unknown", never zero.

import { DEFAULT_SETTINGS, SLOTS } from './plan.js';

const SLOT_WORDS = {
  bf: 'Breakfast', breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack', snk: 'Snack',
  dinner: 'Dinner',
  workout: 'Workout', pre: 'Workout', post: 'Workout',
  'pre-workout': 'Workout', 'post-workout': 'Workout',
};

export function guessSlot(hour) {
  if (hour < 11) return 'Breakfast';
  if (hour < 16) return 'Lunch';
  if (hour < 19) return 'Snack';
  return 'Dinner';
}

const round1 = (x) => Math.round(x * 10) / 10;

function hourOf(now) {
  if (typeof now === 'number') return now;
  const d = now instanceof Date ? now : new Date();
  return d.getHours();
}

// ---- clean-up -------------------------------------------------------------

const QUOTE_PAIRS = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']];

function cleanLine(line) {
  let s = line.replace(/`/g, '').replace(/\*/g, '').trim();
  s = s.replace(/^[-•]\s*/, '').trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
      s = s.slice(1, -1).trim();
      break;
    }
  }
  return s;
}

export function cleanLines(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !/^`{3,}[\w-]*$/.test(l)) // a bare code-fence line, with or without a language tag
    .map(cleanLine)
    .filter(Boolean);
}

// ---- nutrient fields ------------------------------------------------------

const NUM = '(\\d+(?:\\.\\d+)?)';
const RANGE = `${NUM}(?:\\s*(?:-|–|—|to)\\s*${NUM})?`;
const LABEL = '(kcals?|calories|cals?|protein|p|carbohydrates|carbs?|c|fats?|f|fibre|fiber|fib)';
const NUMBER_FIRST = new RegExp(`^${RANGE}\\s*g?\\s*${LABEL}$`);
const LABEL_FIRST = new RegExp(`^${LABEL}\\s*[:=]?\\s*${RANGE}\\s*g?$`);

function labelKey(label) {
  if (/^(kcals?|calories|cals?)$/.test(label)) return 'kcal';
  if (/^(protein|p)$/.test(label)) return 'protein_g';
  if (/^(carbohydrates|carbs?|c)$/.test(label)) return 'carbs_g';
  if (/^(fats?|f)$/.test(label)) return 'fat_g';
  return 'fibre_g';
}

function midpoint(a, b) {
  const x = parseFloat(a);
  return b === undefined ? x : (x + parseFloat(b)) / 2;
}

/** Returns {key, value} if the field is a "number + label" nutrient field, else null. */
export function parseNutrientField(field) {
  const f = field
    .toLowerCase()
    .replace(/[~≈]/g, '')
    .replace(/\bapprox(?:imately|\.)?/g, '')
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
  let m = f.match(NUMBER_FIRST);
  if (m) return { key: labelKey(m[3]), value: round1(midpoint(m[1], m[2])) };
  m = f.match(LABEL_FIRST);
  if (m) return { key: labelKey(m[1]), value: round1(midpoint(m[2], m[3])) };
  return null;
}

// ---- shortcuts (saved items, and a built-in "kenko" if you have not saved one) ----

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function aliasList(a) {
  if (Array.isArray(a)) return a.map(norm).filter(Boolean);
  return String(a ?? '').split(',').map(norm).filter(Boolean);
}

function buildLookup(opts) {
  const map = new Map();
  for (const it of opts.items ?? []) {
    map.set(norm(it.name), { type: 'item', data: it });
    for (const a of aliasList(it.aliases)) map.set(a, { type: 'item', data: it });
  }
  if (!map.has('kenko')) map.set('kenko', { type: 'kenko', data: null }); // a saved item called "kenko" wins
  return map;
}

const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : round1(Number(v)));

function shortcutEntry(hit, slot, hour, opts) {
  let base;
  if (hit.type === 'kenko') {
    const s = { ...DEFAULT_SETTINGS, ...(opts.settings ?? {}) };
    base = {
      name: 'Kenko meal', kcal: numOrNull(s.kenko_kcal), protein_g: numOrNull(s.kenko_protein_g),
      carbs_g: numOrNull(s.kenko_carbs_g), fat_g: numOrNull(s.kenko_fat_g), fibre_g: numOrNull(s.kenko_fibre_g),
      default_slot: 'Dinner', source: 'kenko', on_plan: true, group: '',
    };
  } else {
    const it = hit.data;
    base = {
      name: it.name, kcal: numOrNull(it.kcal), protein_g: numOrNull(it.protein_g),
      carbs_g: numOrNull(it.carbs_g), fat_g: numOrNull(it.fat_g), fibre_g: numOrNull(it.fibre_g),
      default_slot: it.default_slot, source: 'saved',
      on_plan: it.on_plan === true || String(it.on_plan).toUpperCase() === 'TRUE', group: '',
    };
  }
  let slotGuessed = false;
  let finalSlot = slot;
  if (!finalSlot) {
    if (SLOTS.includes(base.default_slot)) finalSlot = base.default_slot;
    else { finalSlot = guessSlot(hour); slotGuessed = true; }
  }
  return {
    name: base.name, slot: finalSlot, slotGuessed,
    kcal: numOrNull(base.kcal), protein_g: numOrNull(base.protein_g), carbs_g: numOrNull(base.carbs_g),
    fat_g: numOrNull(base.fat_g), fibre_g: numOrNull(base.fibre_g),
    source: base.source, on_plan: base.on_plan, group: base.group ?? '',
  };
}

// ---- one line ---------------------------------------------------------------

function parseLine(line, hour, lookup, opts) {
  const fields = line.split('|').map((s) => s.trim()).filter((s) => s !== '');
  if (!fields.length) return { error: 'empty line' };

  let slot = null;
  const slotWord = SLOT_WORDS[fields[0].toLowerCase().replace(/\s+/g, '-')];
  let rest = fields;
  if (slotWord) { slot = slotWord; rest = fields.slice(1); }

  // Shortcut: the line (after any slot) is only a saved item / plan option / "kenko".
  if (rest.length === 1 && !parseNutrientField(rest[0])) {
    const hit = lookup.get(norm(rest[0]));
    if (hit) return { entry: shortcutEntry(hit, slot, hour, opts) };
  }

  const values = {};
  const warnings = [];
  let name = null;
  for (const f of rest) {
    const n = parseNutrientField(f);
    if (n) {
      if (n.key in values) warnings.push(`duplicate ${n.key.replace('_g', '')} ignored`);
      else values[n.key] = n.value;
    } else if (name === null) name = f;
    else warnings.push(`ignored "${f}"`);
  }

  const missing = [];
  if (values.kcal === undefined) missing.push('kcal');
  if (values.protein_g === undefined) missing.push('protein');
  if (missing.length) return { error: `needs ${missing.join(' and ')}` };
  if (!name) return { error: 'needs a dish name' };

  let slotGuessed = false;
  if (!slot) { slot = guessSlot(hour); slotGuessed = true; }

  return {
    entry: {
      name, slot, slotGuessed,
      kcal: values.kcal, protein_g: values.protein_g,
      carbs_g: values.carbs_g ?? null, fat_g: values.fat_g ?? null, fibre_g: values.fibre_g ?? null,
      source: 'line', on_plan: false, group: '',
    },
    warnings,
  };
}

export function parseLog(text, opts = {}) {
  const hour = hourOf(opts.now);
  const lookup = buildLookup(opts);
  const results = cleanLines(text).map((raw, i) => ({ line: i + 1, raw, ...parseLine(raw, hour, lookup, opts) }));
  return {
    results,
    entries: results.filter((r) => r.entry).map((r) => r.entry),
    errors: results.filter((r) => r.error).map(({ line, raw, error }) => ({ line, raw, error })),
  };
}
