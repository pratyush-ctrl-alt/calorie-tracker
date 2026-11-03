// Inline SVG bar charts, no library. Colours come from CSS classes so light/dark themes just work.

import { svgEl, fmt, dayName, parseYmd } from './util.js';

/**
 * days: [{date, value|null}]  value null = not logged
 * band: {lo, hi}  shaded target band (optional)
 * line: number    target line (optional)
 * isGood(value) -> bool  decides the bar colour
 */
export function barChart({ days, band, line, lineLabel, unit, isGood, label, kind = 'kcal' }) {
  const W = 340, H = 168, L = 34, R = 8, T = 14, B = 30;
  const vals = days.map((d) => d.value ?? 0);
  const top = Math.max(...vals, band?.hi ?? 0, line ?? 0, 1) * 1.12;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const slot = (W - L - R) / days.length;
  const bw = Math.min(26, slot * 0.62);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  const ticks = niceTicks(top);
  for (const tv of ticks) {
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(tv), y2: y(tv), class: 'c-grid' }));
    svg.append(svgEl('text', { x: L - 5, y: y(tv) + 3.5, class: 'c-axis', 'text-anchor': 'end' }, fmt(tv, 0)));
  }
  if (band) {
    svg.append(svgEl('rect', { x: L, width: W - L - R, y: y(band.hi), height: y(band.lo) - y(band.hi), class: 'c-band' }));
  }
  if (line) {
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(line), y2: y(line), class: 'c-target' }));
  }
  days.forEach((d, i) => {
    const cx = L + slot * i + slot / 2;
    if (d.value === null) {
      svg.append(svgEl('text', { x: cx, y: y(0) - 4, class: 'c-axis', 'text-anchor': 'middle' }, '–'));
    } else {
      const good = isGood?.(d.value);
      svg.append(svgEl('rect', {
        x: cx - bw / 2, y: y(d.value), width: bw, height: Math.max(1, y(0) - y(d.value)), rx: 3,
        class: good ? `c-bar good ${kind}` : 'c-bar',
      }, svgEl('title', {}, `${d.date}: ${fmt(d.value, 0)} ${unit}`)));
      svg.append(svgEl('text', { x: cx, y: y(d.value) - 4, class: 'c-val', 'text-anchor': 'middle' }, fmt(d.value, 0)));
    }
    svg.append(svgEl('text', { x: cx, y: H - 14, class: 'c-axis', 'text-anchor': 'middle' }, dayName(d.date).slice(0, 3)));
    svg.append(svgEl('text', { x: cx, y: H - 3, class: 'c-axis', 'text-anchor': 'middle' }, String(parseYmd(d.date).getDate())));
  });
  return svg;
}

function niceTicks(top) {
  const step = [50, 100, 200, 250, 500, 1000].find((s) => top / s <= 4) ?? 1000;
  const out = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}
