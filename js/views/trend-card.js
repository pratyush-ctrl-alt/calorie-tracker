import { h, fmt } from '../util.js';
import { METRICS, rate, explainRating } from '../calc.js';
import { segmented } from '../components.js';
import { barChart } from '../charts.js';
import * as store from '../store.js';

// The chosen metric is shared by the 7-day and the month charts, and remembered on this phone.
const KEY = 'plate.trendMetric';
let metric = 'kcal';
try { const saved = localStorage.getItem(KEY); if (saved in METRICS) metric = saved; } catch { /* private mode */ }
const instances = new Set();

/** A small legend: what the three colours mean. `extra` adds the two markers used in the day table. */
export function ratingLegend({ extra = false } = {}) {
  const item = (cls, text) => h('span', { class: 'lg-item' }, h('span', { class: `lg-dot ${cls}` }), text);
  return h('div', { class: 'legend-row', role: 'note' },
    item('good', 'On target'), item('warn', 'Close'), item('bad', 'Off target'),
    extra ? item('off', 'Off-plan entry') : null,
    extra ? h('span', { class: 'lg-item' }, h('span', { class: 'lg-star' }, '*'), 'Some values missing') : null);
}

/**
 * "Daily trend": one chart with a metric picker (Calories, Protein, Carbs, Fat, Fibre).
 * Call set({ days: [{date, totals|null}], compact }) whenever the period's data changes.
 * `totals` is null for days that are not logged or have not finished yet.
 */
export function createTrendCard() {
  let data = { days: [], compact: false, period: '' };
  const chartBox = h('div', {});
  const avgLine = h('p', { class: 'trend-avg num' });
  const note = h('p', { class: 'hint' });
  const seg = segmented(Object.values(METRICS).map((m) => ({ value: m.key, label: m.short })), metric, (v) => {
    metric = v;
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
    instances.forEach((i) => i.render());
  }, 'Metric');
  seg.classList.add('seg-small');

  function render() {
    seg.set(metric);
    const s = store.getSettings();
    const m = METRICS[metric];
    const dp = metric === 'kcal' ? 0 : 1;
    const days = data.days.map((d) => ({ date: d.date, value: d.totals ? d.totals[m.key] : null }));
    const logged = days.filter((d) => d.value !== null);
    const avg = logged.length ? logged.reduce((a, d) => a + d.value, 0) / logged.length : null;

    avgLine.replaceChildren(...(avg === null
      ? [h('span', { class: 'muted' }, 'Nothing logged in this period yet.')]
      : [h('strong', {}, fmt(avg, dp)), ` ${m.unit} average`, h('span', { class: 'muted' }, ` over ${logged.length} logged ${logged.length === 1 ? 'day' : 'days'}`)]));

    const band = metric === 'kcal' ? { lo: s.calorie_target * (1 - s.calorie_band_pct / 100), hi: s.calorie_target * (1 + s.calorie_band_pct / 100) } : null;
    const line = { kcal: s.calorie_target, protein: s.protein_target_g, fat: s.fat_limit_g, fibre: s.fibre_target_g }[metric] ?? null;
    chartBox.replaceChildren(barChart({
      days, band, line, unit: m.unit, dp: 0, compact: data.compact,
      barClass: (v) => rate(metric, v, s) ?? 'plain',
      label: `${m.label} per day, ${data.period}`,
    }));
    note.textContent = [line ? `Dashed line: ${metric === 'fat' ? 'limit' : 'target'} ${fmt(line, 0)} ${m.unit}.` : '', explainRating(metric, s),
      metric === 'kcal' ? '' : 'Unknown carbs, fat or fibre count as 0.'].filter(Boolean).join(' ');
  }

  const api = {
    el: h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Daily trend'), seg, avgLine, chartBox, ratingLegend(), note),
    set(next) { data = next; render(); },
    render,
  };
  instances.add(api);
  return api;
}
