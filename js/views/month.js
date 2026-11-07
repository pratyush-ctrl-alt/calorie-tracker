import { h, todayStr, fmt, fmtDayMonth, fmtShort, monthLabel, parseYmd } from '../util.js';
import { dayStatus, groupByDate, summarize, weeksOfMonth } from '../calc.js';
import { createTrendCard } from './trend-card.js';
import * as store from '../store.js';

export function createMonthView() {
  const el = h('section', { class: 'view', id: 'view-month', 'aria-label': 'Month' });
  const now = new Date();
  const ui = { year: now.getFullYear(), month: now.getMonth() };
  const trend = createTrendCard();

  function shift(delta) {
    const d = new Date(ui.year, ui.month + delta, 1);
    ui.year = d.getFullYear();
    ui.month = d.getMonth();
    render();
  }

  function render() {
    const today = todayStr();
    const s = store.getSettings();
    const weeks = weeksOfMonth(ui.year, ui.month);
    const all = weeks.flat();
    const entries = store.entriesBetween(all[0], all.at(-1));
    const byDate = groupByDate(entries);
    // Complete days only: today is still in progress, and later days have not happened.
    const complete = (dates) => dates.filter((d) => d < today);
    const atCurrent = ui.year === now.getFullYear() && ui.month === now.getMonth();
    const isFuture = new Date(ui.year, ui.month, 1) > new Date(now.getFullYear(), now.getMonth(), 1);

    const picker = h('div', { class: 'month-picker' },
      h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
      h('h2', {}, monthLabel(ui.year, ui.month)),
      h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Next month', disabled: atCurrent || isFuture, onclick: () => shift(1) }, '›'));

    const sums = weeks.map((w) => ({ w, sum: summarize(complete(w), byDate, s) }));
    const totalSum = summarize(complete(all), byDate, s);

    const cell = (v) => h('td', { class: 'num' }, v === null ? '–' : String(v));
    const body = sums.map(({ w, sum }) => h('tr', {},
      h('th', { scope: 'row' }, w.length === 1 ? fmtDayMonth(w[0]) : `${parseYmd(w[0]).getDate()}–${fmtDayMonth(w.at(-1))}`),
      sum.dayCount === 0
        ? h('td', { colspan: 7, class: 'muted' }, 'not finished yet')
        : [cell(`${sum.daysLogged}/${sum.dayCount}`), cell(sum.kcalOk), cell(sum.proteinOk), cell(sum.fatOver),
          cell(sum.offPlanDays), cell(sum.avgKcal === null ? null : fmt(sum.avgKcal, 0)), cell(sum.avgProtein === null ? null : fmt(sum.avgProtein))]));
    const total = h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'Total'),
      cell(`${totalSum.daysLogged}/${totalSum.dayCount}`), cell(totalSum.kcalOk), cell(totalSum.proteinOk), cell(totalSum.fatOver),
      cell(totalSum.offPlanDays),
      cell(totalSum.avgKcal === null ? null : fmt(totalSum.avgKcal, 0)), cell(totalSum.avgProtein === null ? null : fmt(totalSum.avgProtein)));

    const table = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Week by week'),
      h('p', { class: 'muted small' }, 'Weeks run Monday to Sunday. Counts and averages use logged days only; today is not counted until it is over.'),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl month' },
        h('thead', {}, h('tr', {}, ['Week', 'Days logged', 'Calories on target', 'Protein hit', 'Fat over', 'Off-plan days', 'Avg kcal', 'Avg protein'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, body, total))));

    const off = entries.filter((e) => !e.on_plan);
    const offKcal = off.reduce((a, e) => a + (e.kcal ?? 0), 0);
    const offCard = h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Off-plan entries'),
      off.length
        ? [h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, ['Date', 'Slot', 'Name', 'kcal'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, off.map((e) => h('tr', {},
            h('th', { scope: 'row' }, fmtShort(e.date)), h('td', {}, e.slot), h('td', {}, e.name), h('td', { class: 'num' }, fmt(e.kcal, 0))))))),
        h('p', { class: 'muted small' }, `${off.length} off-plan ${off.length === 1 ? 'entry' : 'entries'}, ${fmt(offKcal, 0)} kcal in total (includes today).`)]
        : h('p', { class: 'empty' }, 'No off-plan entries this month.'));

    // one bar per day of the month; days that are not logged, or not finished yet, have no bar
    trend.set({
      days: all.map((d) => {
        const st = d < today ? dayStatus(d, byDate.get(d) ?? [], s) : null;
        return { date: d, totals: st?.logged ? st.totals : null };
      }),
      compact: true, period: monthLabel(ui.year, ui.month),
    });

    el.replaceChildren(picker, table, trend.el, offCard);
  }

  return { el, update: render, onShow: render };
}
