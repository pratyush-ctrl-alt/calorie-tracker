// Inline SVG bar chart, no library. Colours come from CSS classes so light and dark themes just work.

import { svgEl, fmt, dayName, parseYmd } from './util.js';

/**
 * days:     [{date, value|null}]  value null = not logged (or not happened yet)
 * band:     {lo, hi}  shaded target band (optional)
 * line:     number    dashed target / limit line (optional)
 * barClass: (value) -> 'good' | 'warn' | 'bad' | 'plain'   colour of that bar
 * compact:  true for a whole month (many thin bars, no value labels, day numbers every 5th day)
 */
export function barChart({ days, band, line, unit, dp = 0, barClass = () => 'plain', label, compact = false }) {
  const W = 340, H = 168, L = 34, R = 8, T = 14, B = 30;
  const vals = days.map((d) => d.value ?? 0);
  const top = Math.max(...vals, band?.hi ?? 0, line ?? 0, 1) * 1.12;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const slot = (W - L - R) / days.length;
  const bw = compact ? Math.max(3, slot * 0.68) : Math.min(26, slot * 0.62);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  for (const tv of niceTicks(top)) {
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(tv), y2: y(tv), class: 'c-grid' }));
    svg.append(svgEl('text', { x: L - 5, y: y(tv) + 3.5, class: 'c-axis', 'text-anchor': 'end' }, fmt(tv, 0)));
  }
  if (band) svg.append(svgEl('rect', { x: L, width: W - L - R, y: y(band.hi), height: y(band.lo) - y(band.hi), class: 'c-band' }));
  if (line) svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(line), y2: y(line), class: 'c-target' }));

  days.forEach((d, i) => {
    const cx = L + slot * i + slot / 2;
    if (d.value === null) {
      if (!compact) svg.append(svgEl('text', { x: cx, y: y(0) - 4, class: 'c-axis', 'text-anchor': 'middle' }, '–'));
    } else {
      svg.append(svgEl('rect', {
        x: cx - bw / 2, y: y(d.value), width: bw, height: Math.max(1.5, y(0) - y(d.value)), rx: compact ? 1.5 : 3,
        class: `c-bar ${barClass(d.value)}`,
      }, svgEl('title', {}, `${d.date}: ${fmt(d.value, dp)} ${unit}`)));
      if (!compact) svg.append(svgEl('text', { x: cx, y: y(d.value) - 4, class: 'c-val', 'text-anchor': 'middle' }, fmt(d.value, dp)));
    }
    if (compact) {
      const n = parseYmd(d.date).getDate();
      if (n === 1 || n % 5 === 0) svg.append(svgEl('text', { x: cx, y: H - 8, class: 'c-axis', 'text-anchor': 'middle' }, String(n)));
    } else {
      svg.append(svgEl('text', { x: cx, y: H - 14, class: 'c-axis', 'text-anchor': 'middle' }, dayName(d.date).slice(0, 3)));
      svg.append(svgEl('text', { x: cx, y: H - 3, class: 'c-axis', 'text-anchor': 'middle' }, String(parseYmd(d.date).getDate())));
    }
  });
  return svg;
}

function niceTicks(top) {
  const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find((s) => top / s <= 4.5) ?? 2000;
  const out = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}
