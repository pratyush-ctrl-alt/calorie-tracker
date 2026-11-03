import { h, todayStr, fmt, fmtShort } from '../util.js';
import { groupByDate, summarize, weekWindow, totalsFor } from '../calc.js';
import { barChart } from '../charts.js';
import * as store from '../store.js';

export function chips(d) {
  const out = [];
  if (!d.logged) return [h('span', { class: 'tag muted-tag' }, 'not logged')];
  out.push(h('span', { class: `tag ${d.kcalOk ? 'ok' : 'miss'}` }, d.kcalOk ? 'kcal ✓' : 'kcal off'));
  out.push(h('span', { class: `tag ${d.proteinOk ? 'ok' : 'miss'}` }, d.proteinOk ? 'protein ✓' : 'protein low'));
  if (d.fatOver) out.push(h('span', { class: 'tag bad' }, 'fat over'));
  if (d.offPlan) out.push(h('span', { class: 'tag warn' }, 'off-plan'));
  if (d.missing) out.push(h('span', { class: 'tag muted-tag' }, 'some values missing'));
  return out;
}

export function createWeekView() {
  const el = h('section', { class: 'view', id: 'view-week', 'aria-label': 'Week' });

  function render() {
    const today = todayStr();
    const s = store.getSettings();
    const dates = weekWindow(today);
    const byDate = groupByDate(store.entriesBetween(dates[0], today));
    const sum = summarize(dates, byDate, s);
    const tt = totalsFor(byDate.get(today) ?? []);

    const inProgress = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Today · in progress'),
      tt.count
        ? h('p', { class: 'num' }, `${fmt(tt.kcal, 0)} kcal · ${fmt(tt.protein)} g protein · ${fmt(tt.fat)} g fat · ${fmt(tt.fibre)} g fibre`)
        : h('p', { class: 'muted' }, 'Nothing logged yet today.'),
      h('p', { class: 'muted small' }, 'Today is not part of the scorecard below until it is over.'));

    const score = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Scorecard'),
      h('p', { class: 'muted small' }, `${fmtShort(dates[0])} to ${fmtShort(dates[6])}. Counts are over logged days only.`),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl score' },
        h('thead', {}, h('tr', {}, ['Days logged', 'Calories on target', 'Protein hit', 'Fat over limit', 'Off-plan days'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, h('tr', {}, [
          `${sum.daysLogged}/7`, sum.kcalOk, sum.proteinOk, sum.fatOver, sum.offPlanDays,
        ].map((v) => h('td', { class: 'num strong' }, String(v))))))));

    const rows = sum.days.slice().reverse().flatMap((d) => [
      h('tr', { class: 'day-main' },
        h('th', { scope: 'row' }, fmtShort(d.date)),
        d.logged
          ? [h('td', { class: 'num' }, fmt(d.totals.kcal, 0)), h('td', { class: 'num' }, fmt(d.totals.protein)),
            h('td', { class: 'num' }, fmt(d.totals.fat)), h('td', { class: 'num' }, fmt(d.totals.fibre))]
          : h('td', { colspan: 4, class: 'muted' }, 'not logged')),
      h('tr', { class: 'day-tags' }, h('td', { colspan: 5 }, h('div', { class: 'tags' }, chips(d)))),
    ]);
    const table = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Day by day'),
      h('table', { class: 'tbl days' },
        h('thead', {}, h('tr', {}, ['Date', 'kcal', 'Protein', 'Fat', 'Fibre'].map((t, i) => h('th', { scope: 'col', class: i ? 'r' : '' }, t)))),
        h('tbody', {}, rows)));

    const band = { lo: s.calorie_target * (1 - s.calorie_band_pct / 100), hi: s.calorie_target * (1 + s.calorie_band_pct / 100) };
    const kcalChart = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Calories per day'),
      barChart({
        days: sum.days.map((d) => ({ date: d.date, value: d.logged ? d.totals.kcal : null })),
        band, line: s.calorie_target, unit: 'kcal',
        isGood: (v) => v >= band.lo && v <= band.hi, kind: 'kcal', label: 'Calories per day for the last 7 days, with the target band shaded',
      }),
      h('p', { class: 'muted small' }, `Shaded band: ${fmt(band.lo, 0)} to ${fmt(band.hi, 0)} kcal (target ±${s.calorie_band_pct}%). Green bars are inside it.`));
    const protChart = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Protein per day'),
      barChart({
        days: sum.days.map((d) => ({ date: d.date, value: d.logged ? d.totals.protein : null })),
        line: s.protein_target_g, unit: 'g',
        isGood: (v) => v >= s.protein_hit_g, kind: 'protein', label: 'Protein per day for the last 7 days, with the target line',
      }),
      h('p', { class: 'muted small' }, `Dashed line: target ${fmt(s.protein_target_g, 0)} g. Green bars reached the ${fmt(s.protein_hit_g, 0)} g "protein hit" mark.`));

    el.replaceChildren(inProgress, score, kcalChart, protChart, table);
  }

  return { el, update: render, onShow: render };
}
