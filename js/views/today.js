import { h, todayStr, fmt, fmtLong } from '../util.js';
import { SLOTS } from '../plan.js';
import { totalsFor } from '../calc.js';
import { buildEntry, kenkoFields } from '../entries.js';
import { bar, nav, openEntrySheet, segmented, toast } from '../components.js';
import * as store from '../store.js';

export function createTodayView() {
  const el = h('section', { class: 'view', id: 'view-today', 'aria-label': 'Today' });
  // UI state that must survive re-renders (background refreshes, edits).
  const ui = { kenkoSlot: 'Dinner', kenkoNote: '', kenkoOpen: null };

  function leftHeadline(t, s) {
    const remK = s.calorie_target - t.kcal;
    const remP = s.protein_target_g - t.protein;
    const kcalPart = remK >= 0 ? `${fmt(remK, 0)} kcal` : `Over by ${fmt(-remK, 0)} kcal`;
    const protPart = remP > 0 ? `${fmt(remP, 0)} g protein` : 'protein target met';
    if (remK >= 0) return `Left today: ${kcalPart} · ${protPart}`;
    return `${kcalPart} · ${remP > 0 ? `${fmt(remP, 0)} g protein left` : protPart}`;
  }

  function kenkoCard(entries, s, today) {
    const logged = entries.find((e) => e.source === 'kenko');
    if (logged) {
      return h('div', { class: 'card kenko' },
        h('div', { class: 'kenko-done' },
          h('div', {}, h('strong', {}, 'Kenko meal logged'), ` · ${logged.slot}`,
            logged.note ? h('div', { class: 'muted small' }, logged.note) : null),
          h('button', { class: 'btn small', type: 'button', onclick: () => { store.deleteEntry(logged.id); toast('Kenko meal removed'); } }, 'Undo')));
    }
    const isSunday = new Date().getDay() === 0;
    const open = ui.kenkoOpen ?? !isSunday;
    const head = h('button', {
      class: 'kenko-head', type: 'button', 'aria-expanded': String(open),
      onclick: () => { ui.kenkoOpen = !open; render(); },
    }, h('strong', {}, 'Had your Kenko meal?'), isSunday ? h('span', { class: 'muted small' }, 'No box on Sundays') : null,
    h('span', { class: `chev ${open ? 'open' : ''}`, 'aria-hidden': 'true' }));
    if (!open) return h('div', { class: 'card kenko' }, head);

    const note = h('input', {
      type: 'text', value: ui.kenkoNote, placeholder: 'Optional note, e.g. pasta with grilled paneer', autocomplete: 'off',
      oninput: (e) => { ui.kenkoNote = e.target.value; },
    });
    return h('div', { class: 'card kenko' }, head,
      h('div', { class: 'kenko-body' },
        segmented(['Dinner', 'Lunch'], ui.kenkoSlot, (v) => { ui.kenkoSlot = v; }, 'Meal slot'),
        note,
        h('button', {
          class: 'btn primary block', type: 'button',
          onclick: () => {
            store.addEntries([buildEntry(kenkoFields(store.getSettings(), ui.kenkoSlot, ui.kenkoNote), { date: today })]);
            ui.kenkoNote = '';
            toast('Kenko meal logged');
          },
        }, `Log Kenko meal · ${fmt(s.kenko_kcal, 0)} kcal, ${fmt(s.kenko_protein_g, 0)} g protein`)));
  }

  function entryRow(e) {
    return h('button', { class: 'entry', type: 'button', onclick: () => openEntrySheet({ mode: 'edit', entry: e }) },
      h('span', { class: 'entry-main' },
        h('span', { class: 'entry-name' }, e.name),
        h('span', { class: 'entry-sub muted small' },
          [e.time, e.note, e.on_plan ? '' : 'off plan'].filter(Boolean).join(' · '))),
      h('span', { class: 'entry-nums num' },
        h('strong', {}, `${fmt(e.kcal, 0)} kcal`), h('span', { class: 'muted' }, `${fmt(e.protein_g)} g P`)));
  }

  function render() {
    const today = todayStr();
    const s = store.getSettings();
    const entries = store.entriesOn(today);
    const t = totalsFor(entries);
    const over = t.kcal > s.calorie_target;

    const left = h('div', { class: 'card hero' },
      h('div', { class: `hero-text ${over ? 'over' : ''}` }, leftHeadline(t, s)),
      h('div', { class: 'bars' },
        bar({ label: 'Calories', value: t.kcal, target: s.calorie_target, unit: ' kcal', warnOver: true }),
        bar({ label: 'Protein', value: t.protein, target: s.protein_target_g, unit: ' g' }),
        bar({ label: 'Fat (limit)', value: t.fat, target: s.fat_limit_g, unit: ' g', limit: true }),
        h('div', { class: 'bar-row plain' }, h('div', { class: 'bar-head' }, h('span', {}, 'Carbs'), h('span', { class: 'num' }, `${fmt(t.carbs)} g`))),
        bar({ label: 'Fibre', value: t.fibre, target: s.fibre_target_g, unit: ' g' })),
      t.missing ? h('p', { class: 'muted small' }, 'Some values missing: unknown carbs, fat or fibre count as 0 here.') : null);

    const groups = SLOTS.map((slot) => [slot, entries.filter((e) => e.slot === slot)]).filter(([, list]) => list.length);
    const list = groups.length
      ? groups.map(([slot, list]) => h('div', { class: 'slot-group' },
        h('h3', {}, slot, h('span', { class: 'muted num' }, `${fmt(list.reduce((a, e) => a + (e.kcal ?? 0), 0), 0)} kcal`)),
        h('div', { class: 'entries' }, list.map(entryRow))))
      : [h('p', { class: 'empty' }, 'Nothing logged yet today.')];

    el.replaceChildren(
      left,
      kenkoCard(entries, s, today),
      h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Today’s entries'), list),
      h('button', { class: 'btn primary big block', type: 'button', onclick: () => nav.go('add') }, '+ Add'));
  }

  return {
    el,
    title: () => fmtLong(todayStr()),
    update() {
      const a = document.activeElement;
      if (a && el.contains(a) && a.matches('input, textarea, select')) return; // don't clobber typing
      render();
    },
    onShow: render,
  };
}
