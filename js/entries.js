// Entry shape, validation and builders. Pure (the only "impure" bits are clock and id generation).
//
// Entry: { id, date, time, slot, name, kcal, protein_g, carbs_g, fat_g, fibre_g,
//          source, on_plan, group, note, created_at, updated_at, deleted }
// A null carbs/fat/fibre means "unknown", not zero.

import { SLOTS } from './plan.js';
import { isYmd, nowHM, round1, uuid } from './util.js';

export const NUM_FIELDS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'];
export const SOURCES = ['line', 'kenko', 'plan', 'saved', 'manual'];
export const LOG_HEADERS = [
  'id', 'date', 'time', 'slot', 'name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g',
  'source', 'on_plan', 'group', 'note', 'created_at', 'updated_at', 'deleted',
];

/** '' / null / undefined / NaN -> null, otherwise a number rounded to 1 dp. */
export function numOrNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.');
    if (t === '') return null;
    v = Number(t);
  }
  return Number.isFinite(v) ? round1(v) : null;
}

export const truthy = (v) => v === true || String(v).trim().toUpperCase() === 'TRUE';

/** Returns '' when the entry is valid, otherwise a plain-English reason. */
export function validateEntry(e) {
  if (!String(e.name ?? '').trim()) return 'Needs a name';
  if (!SLOTS.includes(e.slot)) return 'Pick a slot';
  if (!isYmd(e.date)) return 'Needs a date';
  if (numOrNull(e.kcal) === null) return 'Needs kcal';
  if (numOrNull(e.protein_g) === null) return 'Needs protein';
  for (const f of NUM_FIELDS) {
    const v = numOrNull(e[f]);
    if (v !== null && v < 0) return 'Numbers cannot be negative';
  }
  return '';
}

/** Builds a complete entry from partial fields. */
export function buildEntry(fields, { date, now = new Date() } = {}) {
  const ts = now.toISOString();
  return {
    id: fields.id ?? uuid(),
    date: date ?? fields.date,
    time: fields.time ?? nowHM(now),
    slot: fields.slot,
    name: String(fields.name ?? '').trim(),
    kcal: numOrNull(fields.kcal),
    protein_g: numOrNull(fields.protein_g),
    carbs_g: numOrNull(fields.carbs_g),
    fat_g: numOrNull(fields.fat_g),
    fibre_g: numOrNull(fields.fibre_g),
    source: fields.source ?? 'manual',
    on_plan: truthy(fields.on_plan),
    group: fields.group ?? '',
    note: fields.note ?? '',
    created_at: fields.created_at ?? ts,
    updated_at: ts,
    deleted: false,
  };
}

const QTY_LABEL = { 0.5: '×0.5', 1.5: '×1.5', 2: '×2' };

/** Scales a food's nutrient values by a quantity multiplier; unknown stays unknown. */
export function scaleFood(food, qty = 1) {
  const out = { ...food };
  for (const f of NUM_FIELDS) {
    const v = numOrNull(food[f]);
    out[f] = v === null ? null : round1(v * qty);
  }
  if (qty !== 1 && QTY_LABEL[qty]) out.name = `${food.name} ${QTY_LABEL[qty]}`;
  return out;
}

export function kenkoFields(settings, slot = 'Dinner', note = '') {
  return {
    name: 'Kenko meal', slot, note: note.trim(),
    kcal: settings.kenko_kcal, protein_g: settings.kenko_protein_g, carbs_g: settings.kenko_carbs_g,
    fat_g: settings.kenko_fat_g, fibre_g: settings.kenko_fibre_g,
    source: 'kenko', on_plan: true, group: '',
  };
}

export function itemFields(item, { slot, qty = 1 } = {}) {
  return {
    ...scaleFood(item, qty),
    slot: slot ?? (SLOTS.includes(item.default_slot) ? item.default_slot : 'Snack'),
    source: 'saved', on_plan: truthy(item.on_plan), group: '',
  };
}

/** Normalises a row coming from the database (or an old cache) into the entry shape. */
export function normalizeEntry(r) {
  return {
    id: String(r.id), date: String(r.date), time: String(r.time ?? ''), slot: r.slot, name: String(r.name ?? ''),
    kcal: numOrNull(r.kcal), protein_g: numOrNull(r.protein_g), carbs_g: numOrNull(r.carbs_g),
    fat_g: numOrNull(r.fat_g), fibre_g: numOrNull(r.fibre_g),
    source: r.source || 'manual', on_plan: truthy(r.on_plan), group: r.group ?? '', note: r.note ?? '',
    created_at: r.created_at ?? '', updated_at: r.updated_at ?? '', deleted: truthy(r.deleted),
  };
}

export function normalizeItem(r) {
  return {
    name: String(r.name ?? '').trim(),
    kcal: numOrNull(r.kcal), protein_g: numOrNull(r.protein_g), carbs_g: numOrNull(r.carbs_g),
    fat_g: numOrNull(r.fat_g), fibre_g: numOrNull(r.fibre_g),
    default_slot: SLOTS.includes(r.default_slot) ? r.default_slot : '',
    on_plan: truthy(r.on_plan), aliases: String(r.aliases ?? ''), favorite: truthy(r.favorite),
  };
}
