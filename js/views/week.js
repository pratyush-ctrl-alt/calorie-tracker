import { h, todayStr, fmt, fmtShort } from '../util.js';
import { groupByDate, summarize, weekWindow, totalsFor, rate } from '../calc.js';
import { createTrendCard, ratingLegend } from './trend-card.js';
import * as store from '../store.js';

/** A number coloured by how it compares with the target: green on target, yellow close, red off target. */
const cell = (metric, value, s, dp) => h('td', { class: `num v-${rate(metric, value, s) ?? 'none'}` }, fmt(value, dp));

export function createWeekView() {
  const el = h('section', { class: 'view', id: 'view-week', 'aria-label': 'Last 7 days' });
  const trend = createTrendCard();

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

    trend.set({
      days: sum.days.map((d) => ({ date: d.date, totals: d.logged ? d.totals : null })),
      compact: false, period: 'last 7 days',
    });

    const rows = sum.days.slice().reverse().map((d) => h('tr', {},
      h('th', { scope: 'row' }, fmtShort(d.date),
        d.offPlan ? h('span', { class: 'dot-off', role: 'img', 'aria-label': 'has an off-plan entry' }) : null,
        d.missing ? h('span', { class: 'lg-star', 'aria-label': 'some values missing' }, '*') : null),
      d.logged
        ? [cell('kcal', d.totals.kcal, s, 0), cell('protein', d.totals.protein, s, 1), cell('carbs', d.totals.carbs, s, 0),
          cell('fat', d.totals.fat, s, 1), cell('fibre', d.totals.fibre, s, 1)]
        : h('td', { colspan: 5, class: 'muted' }, 'not logged')));
    const table = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Day by day'),
      ratingLegend({ extra: true }),
      h('table', { class: 'tbl days' },
        h('thead', {}, h('tr', {}, ['Date', 'kcal', 'Protein', 'Carbs', 'Fat', 'Fibre'].map((t, i) => h('th', { scope: 'col', class: i ? 'r' : '' }, t)))),
        h('tbody', {}, rows)));

    el.replaceChildren(inProgress, score, trend.el, table);
  }

  return { el, update: render, onShow: render };
}
