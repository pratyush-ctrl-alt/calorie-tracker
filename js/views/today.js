import { h, todayStr, fmt, fmtFullDate, fmtTime12 } from '../util.js';
import { SLOTS } from '../plan.js';
import { totalsFor } from '../calc.js';
import { largeTitle, nav, openEntrySheet, openQuickLog, ringsSvg, tile } from '../components.js';
import * as store from '../store.js';

export function createTodayView() {
  const el = h('section', { class: 'view', id: 'view-today', 'aria-label': 'Today' });

  /** The answer to "how much is left today", as two big numbers that never wrap awkwardly. */
  function leftRow(t, s) {
    const remK = s.calorie_target - t.kcal;
    const remP = s.protein_target_g - t.protein;
    const kcalOver = remK < 0;
    return h('div', { class: 'left-row' },
      h('div', { class: `left-stat ${kcalOver ? 'over' : ''}` },
        h('span', { class: 'left-num num' }, fmt(Math.abs(remK), 0)),
        h('span', { class: 'left-unit' }, kcalOver ? 'kcal over target' : 'kcal left')),
      remP > 0
        ? h('div', { class: 'left-stat' },
          h('span', { class: 'left-num num' }, fmt(remP, 0)),
          h('span', { class: 'left-unit' }, 'g protein to go'))
        : h('div', { class: 'left-stat met' },
          h('span', { class: 'left-num' }, 'Met'),
          h('span', { class: 'left-unit' }, 'protein target')));
  }

  function legendItem(label, color, value, target, unit) {
    return h('div', { class: 'legend-item' },
      h('span', { class: 'legend-label', style: `color:${color}` }, label),
      h('span', { class: 'legend-value num' }, fmt(value, unit === 'kcal' ? 0 : 1), ' ', h('small', {}, `/ ${fmt(target, 0)} ${unit}`)));
  }

  function entryRow(e) {
    const macros = [
      e.protein_g !== null ? `P ${fmt(e.protein_g)}` : '',
      e.carbs_g !== null ? `C ${fmt(e.carbs_g)}` : '',
      e.fat_g !== null ? `F ${fmt(e.fat_g)}` : '',
    ].filter(Boolean).join(' · ');
    const meta = [fmtTime12(e.time), macros && `${macros} g`, e.note].filter(Boolean).join(' · ');
    return h('button', { class: 'row entry', type: 'button', onclick: () => openEntrySheet({ mode: 'edit', entry: e }) },
      h('span', { class: 'entry-main' },
        h('span', { class: 'entry-name' }, e.name),
        h('span', { class: 'entry-sub' }, meta, e.on_plan ? null : [meta ? ' · ' : '', h('span', { class: 'off' }, 'Off plan')])),
      h('span', { class: 'entry-kcal num' }, h('strong', {}, fmt(e.kcal, 0)), h('span', {}, 'kcal')),
      h('span', { class: 'chev', 'aria-hidden': 'true' }));
  }

  function render() {
    const today = todayStr();
    const s = store.getSettings();
    const entries = store.entriesOn(today);
    const t = totalsFor(entries);
    const over = t.kcal > s.calorie_target;

    const summary = h('div', { class: 'card hero' },
      h('span', { class: 'eyebrow' }, 'Left today'),
      leftRow(t, s),
      h('div', { class: 'summary' },
        ringsSvg([
          { value: t.kcal, target: s.calorie_target, color: over ? 'var(--orange)' : 'var(--m-kcal)' },
          { value: t.protein, target: s.protein_target_g, color: 'var(--m-protein)' },
          { value: t.fibre, target: s.fibre_target_g, color: 'var(--m-fibre)' },
        ], `Calories ${fmt(t.kcal, 0)} of ${fmt(s.calorie_target, 0)}, protein ${fmt(t.protein)} of ${fmt(s.protein_target_g, 0)}, fibre ${fmt(t.fibre)} of ${fmt(s.fibre_target_g, 0)}`),
        h('div', { class: 'legend' },
          legendItem('Calories', over ? 'var(--orange)' : 'var(--m-kcal)', t.kcal, s.calorie_target, 'kcal'),
          legendItem('Protein', 'var(--m-protein)', t.protein, s.protein_target_g, 'g'),
          legendItem('Fibre', 'var(--m-fibre)', t.fibre, s.fibre_target_g, 'g'))),
      t.missing ? h('p', { class: 'hint' }, 'Some values are missing: unknown carbs, fat or fibre count as 0 here.') : null);

    const tiles = h('div', { class: 'tiles' },
      tile({ label: 'Fat (limit)', color: 'var(--m-fat)', value: t.fat, unit: `/ ${fmt(s.fat_limit_g, 0)} g`, target: s.fat_limit_g, limit: true }),
      tile({ label: 'Carbs', color: 'var(--m-carb)', value: t.carbs, unit: 'g' }));

    // Quick add: pinned items first, then the most used.
    const quick = store.quickItems();
    const quickSection = [
      h('h2', { class: 'section-title' }, 'Quick add', h('button', { class: 'link-btn', type: 'button', onclick: () => nav.go('items') }, 'My Items')),
      quick.length
        ? h('div', { class: 'qrow' }, quick.map(({ item }) => h('button', { class: 'qchip', type: 'button', onclick: () => openQuickLog(item) },
          h('span', { class: 'q-name' }, item.name), h('span', { class: 'q-sub num' }, `${fmt(item.kcal, 0)} kcal`))))
        : h('p', { class: 'empty' }, 'Star items in My Items to pin them here. Your most used ones appear automatically.'),
    ];

    const groups = SLOTS.map((slot) => [slot, entries.filter((e) => e.slot === slot)]).filter(([, list]) => list.length);
    const meals = [
      h('h2', { class: 'section-title' }, 'Meals'),
      ...(groups.length
        ? groups.map(([slot, list]) => h('div', {},
          h('div', { class: 'meal-head' }, h('h3', {}, slot), h('span', { class: 'num' }, `${fmt(list.reduce((a, e) => a + (e.kcal ?? 0), 0), 0)} kcal`)),
          h('div', { class: 'group' }, list.map(entryRow))))
        : [h('div', { class: 'card' }, h('p', { class: 'empty' }, 'Nothing logged yet today.'))]),
    ];

    el.replaceChildren(
      largeTitle('Today', fmtFullDate(today)),
      summary, tiles,
      h('button', { class: 'btn primary big block', type: 'button', onclick: () => nav.go('log') }, 'Log a meal'),
      ...quickSection,
      ...meals);
  }

  return {
    el,
    title: 'Today',
    update() {
      const a = document.activeElement;
      if (a && el.contains(a) && a.matches('input, textarea, select')) return; // don't clobber typing
      render();
    },
    onShow: render,
  };
}
