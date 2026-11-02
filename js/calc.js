// Day / week / month logic from section 9 of the spec. Pure functions.
//
// A day's totals are the sum of its non-deleted entries. Unknown carbs/fat/fibre count as 0 in the
// totals, but the day is marked `missing`. Counts are over LOGGED days only: a day with no entries
// is "not logged" and never counted as met or missed.

import { TREAT_GROUPS } from './plan.js';
import { addDays, parseYmd, ymd, round1 } from './util.js';

export function totalsFor(entries) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, count: 0, missing: false };
  for (const e of entries) {
    if (e.deleted) continue;
    t.count++;
    t.kcal += e.kcal ?? 0;
    t.protein += e.protein_g ?? 0;
    t.carbs += e.carbs_g ?? 0;
    t.fat += e.fat_g ?? 0;
    t.fibre += e.fibre_g ?? 0;
    if (e.carbs_g === null || e.fat_g === null || e.fibre_g === null) t.missing = true;
  }
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fibre']) t[k] = round1(t[k]);
  return t;
}

export const kcalOnTarget = (kcal, s) => Math.abs(kcal - s.calorie_target) <= (s.calorie_target * s.calorie_band_pct) / 100;
export const proteinHit = (p, s) => p >= s.protein_hit_g;
export const fatOver = (f, s) => f > s.fat_limit_g;
export const isTreat = (e) => TREAT_GROUPS.includes(e.group);

/** Status of one day. `entries` are that day's entries (deleted ones are ignored). */
export function dayStatus(date, entries, s) {
  const live = entries.filter((e) => !e.deleted);
  const totals = totalsFor(live);
  const logged = live.length > 0;
  return {
    date, logged, totals, entries: live,
    kcalOk: logged && kcalOnTarget(totals.kcal, s),
    proteinOk: logged && proteinHit(totals.protein, s),
    fatOver: logged && fatOver(totals.fat, s),
    offPlan: live.some((e) => !e.on_plan),
    missing: logged && totals.missing,
    treats: live.filter(isTreat).length,
  };
}

export function groupByDate(entries) {
  const m = new Map();
  for (const e of entries) {
    if (e.deleted) continue;
    if (!m.has(e.date)) m.set(e.date, []);
    m.get(e.date).push(e);
  }
  return m;
}

/** Scorecard over a list of dates. Averages are over logged days only. */
export function summarize(dates, byDate, s) {
  const days = dates.map((d) => dayStatus(d, byDate.get(d) ?? [], s));
  const logged = days.filter((d) => d.logged);
  const sum = (f) => logged.reduce((a, d) => a + f(d), 0);
  return {
    days,
    dayCount: dates.length,
    daysLogged: logged.length,
    kcalOk: logged.filter((d) => d.kcalOk).length,
    proteinOk: logged.filter((d) => d.proteinOk).length,
    fatOver: logged.filter((d) => d.fatOver).length,
    offPlanDays: logged.filter((d) => d.offPlan).length,
    treats: sum((d) => d.treats),
    avgKcal: logged.length ? Math.round(sum((d) => d.totals.kcal) / logged.length) : null,
    avgProtein: logged.length ? round1(sum((d) => d.totals.protein) / logged.length) : null,
  };
}

/** The last 7 full days, oldest first. Today is NOT included. */
export function weekWindow(today) {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 7));
}

/** Monday-to-Sunday weeks of a month, clipped to the month. month0 is 0-11. */
export function weeksOfMonth(year, month0) {
  const last = new Date(year, month0 + 1, 0).getDate();
  const weeks = [];
  let cur = [];
  for (let day = 1; day <= last; day++) {
    const date = ymd(new Date(year, month0, day));
    cur.push(date);
    if (new Date(year, month0, day).getDay() === 0 || day === last) { weeks.push(cur); cur = []; }
  }
  return weeks;
}

export const monthKey = (date) => date.slice(0, 7);
export { parseYmd };
