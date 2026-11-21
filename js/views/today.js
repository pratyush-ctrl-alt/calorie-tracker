// Diary: one day at a time. Arrows (or a swipe) move between days, tapping the date opens a calendar.
// For the day shown: how much is left, each macro against its target (tap one to see which items made it
// up), a plain-English review of what pushed a target off, and the meals, each with its own "+ Add".

import { h, todayStr, addDays, fmt, fmtFullDate, fmtTime12, fmtShort } from '../util.js';
import { SLOTS } from '../plan.js';
import { totalsFor, contributors, dayReview, targetFor, rate } from '../calc.js';
import { METRIC_UI, nav, openBreakdown, openEntryDetail, ring } from '../components.js';
import { CACHE_DAYS } from '../store.js';
import * as store from '../store.js';
import { getDay, setDay, setPreferredSlot } from '../day-state.js';

const MAIN_SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];

export function createTodayView() {
  const el = h('section', { class: 'view diary', id: 'view-today', 'aria-label': 'Diary' });

  const go = (date) => { setDay(date); render(); window.scrollTo({ top: 0 }); };
  const minDate = () => addDays(todayStr(), -(CACHE_DAYS - 1));

  function dayLabel(date) {
    const t = todayStr();
    if (date === t) return 'Today';
    if (date === addDays(t, -1)) return 'Yesterday';
    return fmtShort(date);
  }

  function switcher(date) {
    const t = todayStr();
    const picker = h('input', {
      type: 'date', class: 'day-picker', value: date, max: t, min: minDate(), 'aria-label': 'Pick a day',
      onchange: (e) => { if (e.target.value) go(e.target.value); },
    });
    return h('div', { class: 'day-switch' },
      h('button', { class: 'day-arrow', type: 'button', 'aria-label': 'Previous day', disabled: date <= minDate(), onclick: () => go(addDays(date, -1)) }, h('span', { class: 'chev left' })),
      h('label', { class: 'day-center' },
        h('span', { class: 'day-name' }, dayLabel(date)),
        h('span', { class: 'day-date' }, fmtFullDate(date), h('span', { class: 'chev down small' })),
        picker),
      h('button', { class: 'day-arrow', type: 'button', 'aria-label': 'Next day', disabled: date >= t, onclick: () => go(addDays(date, 1)) }, h('span', { class: 'chev' })));
  }

  function summary(date, entries, s) {
    const t = totalsFor(entries);
    const isToday = date === todayStr();
    const left = s.calorie_target - t.kcal;
    const over = left < 0;
    const openBd = (metric) => openBreakdown({
      metric, contrib: contributors(entries, metric), target: targetFor(metric, s), dateLabel: dayLabel(date),
      onPick: (entry) => openDetail(entry, entries, s),
    });

    const center = [
      h('span', { class: `ring-num num ${over ? 'over' : ''}` }, fmt(Math.abs(left), 0)),
      h('span', { class: 'ring-unit' }, over ? 'kcal over' : isToday ? 'kcal left' : 'kcal under'),
    ];
    const kcalBlock = h('button', { class: 'ring-btn', type: 'button', 'aria-label': 'Calories by item', onclick: () => openBd('kcal') },
      ring({ value: t.kcal, target: s.calorie_target, over, children: center }));
    const kcalLine = h('div', { class: 'kcal-line' },
      h('div', {}, h('span', { class: 'kl-num num' }, fmt(t.kcal, 0)), h('span', { class: 'kl-lbl' }, 'eaten')),
      h('div', {}, h('span', { class: 'kl-num num' }, fmt(s.calorie_target, 0)), h('span', { class: 'kl-lbl' }, 'target')));

    const macro = (metric, value) => {
      const m = METRIC_UI[metric];
      const target = targetFor(metric, s);
      const st = target ? rate(metric, value, s) : null;
      // On a day in progress, "short" is not a failure yet: only "over" counts.
      const shown = isToday && (metric === 'protein' || metric === 'fibre') && st !== 'good' ? null : st;
      const pct = target ? Math.min(100, (value / target) * 100) : 0;
      return h('button', { class: 'macro', type: 'button', 'aria-label': `${m.label} by item`, onclick: () => openBd(metric) },
        h('span', { class: 'macro-top' },
          h('span', { class: 'macro-name' }, h('i', { class: 'dot', style: `background:${m.color}` }), m.label),
          h('span', { class: `macro-val num ${shown ? `v-${shown}` : ''}` }, h('strong', {}, fmt(value, 0)), target ? ` / ${fmt(target, 0)} g` : ' g')),
        h('span', { class: 'macro-track' }, target ? h('span', { class: 'macro-fill', style: `width:${pct}%;background:${shown === 'bad' && metric === 'fat' ? 'var(--badc)' : m.color}` }) : null),
        h('span', { class: 'macro-chev chev', 'aria-hidden': 'true' }));
    };

    return h('div', { class: 'card hero' },
      h('div', { class: 'hero-top' }, kcalBlock, kcalLine),
      h('div', { class: 'macros' },
        macro('protein', t.protein), macro('carbs', t.carbs), macro('fat', t.fat), macro('fibre', t.fibre)),
      t.missing ? h('p', { class: 'hint' }, 'Some items have no carbs, fat or fibre value; they count as 0 here.') : null);
  }

  function openDetail(entry, entries, s) {
    openEntryDetail({ entry, dayEntries: entries, settings: s, onChanged: render });
  }

  function review(date, entries, s) {
    const isToday = date === todayStr();
    const notes = dayReview(entries, s, { inProgress: isToday });
    if (!notes.length) return null;
    const worst = notes[0].status;
    const verdict = worst === 'good' ? 'Everything on target' : isToday ? 'How today is going' : worst === 'bad' ? 'What went off target' : 'Close, with a few misses';
    return h('div', { class: 'card review' },
      h('div', { class: 'review-head' }, h('h2', { class: 'card-title' }, 'Day review'), h('span', { class: `verdict v-${worst}` }, verdict)),
      h('div', { class: 'notes' }, notes.map((n) => {
        const m = METRIC_UI[n.valueMetric] ?? METRIC_UI.kcal;
        return h('div', { class: `note s-${n.status}` },
          h('span', { class: 'note-dot', 'aria-hidden': 'true' }),
          h('div', { class: 'note-body' },
            h('p', { class: 'note-title' }, h('span', { class: 'note-metric' }, METRIC_UI[n.metric]?.label ?? ''), n.title),
            n.items.length ? h('div', { class: 'note-items' },
              n.lead ? h('span', { class: 'note-lead' }, n.lead) : null,
              n.items.map((it) => h('button', { class: 'pill', type: 'button', onclick: () => openDetail(it.entry, entries, s) },
                h('span', { class: 'pill-name' }, it.entry.name),
                h('span', { class: 'pill-val num' }, `${fmt(it.value, 0)} ${m.unit}`, n.valueMetric === n.metric || n.metric === 'plan' ? ` · ${Math.round(it.share * 100)}%` : '')))) : null));
      })));
  }

  function entryRow(e, entries, s) {
    const macros = [
      e.protein_g !== null ? `P ${fmt(e.protein_g, 0)}` : '',
      e.carbs_g !== null ? `C ${fmt(e.carbs_g, 0)}` : '',
      e.fat_g !== null ? `F ${fmt(e.fat_g, 0)}` : '',
    ].filter(Boolean).join('  ');
    return h('button', { class: 'row entry', type: 'button', onclick: () => openDetail(e, entries, s) },
      h('span', { class: 'entry-main' },
        h('span', { class: 'entry-name' }, e.name),
        h('span', { class: 'entry-sub' },
          [fmtTime12(e.time), macros].filter(Boolean).join(' · '),
          e.on_plan ? null : h('span', { class: 'off' }, ' · Off plan'))),
      h('span', { class: 'entry-kcal num' }, h('strong', {}, fmt(e.kcal, 0)), h('span', {}, 'kcal')));
  }

  function meals(date, entries, s) {
    const slots = [...MAIN_SLOTS, ...SLOTS.filter((x) => !MAIN_SLOTS.includes(x) && entries.some((e) => e.slot === x))];
    const add = (slot) => { setPreferredSlot(slot); nav.go('log'); };
    return h('div', { class: 'meals' }, slots.map((slot) => {
      const list = entries.filter((e) => e.slot === slot).sort((a, b) => String(a.time).localeCompare(String(b.time)));
      const kcal = list.reduce((a, e) => a + (e.kcal ?? 0), 0);
      return h('div', { class: 'meal' },
        h('div', { class: 'meal-head' },
          h('h3', {}, slot),
          h('span', { class: 'meal-kcal num' }, list.length ? `${fmt(kcal, 0)} kcal` : ''),
          h('button', { class: 'meal-add', type: 'button', 'aria-label': `Add to ${slot}`, onclick: () => add(slot) }, '+')),
        list.length
          ? h('div', { class: 'group' }, list.map((e) => entryRow(e, entries, s)))
          : h('button', { class: 'meal-empty', type: 'button', onclick: () => add(slot) }, `Add ${slot.toLowerCase()}`));
    }));
  }

  function render() {
    const date = getDay();
    const s = store.getSettings();
    const entries = store.entriesOn(date);
    const isToday = date === todayStr();
    el.replaceChildren(...[
      switcher(date),
      isToday ? null : h('div', { class: 'back-today' }, h('button', { class: 'btn small', type: 'button', onclick: () => go(todayStr()) }, 'Back to today')),
      summary(date, entries, s),
      entries.length ? review(date, entries, s) : h('div', { class: 'card empty-day' },
        h('p', { class: 'card-title' }, isToday ? 'Nothing logged yet today' : 'Nothing logged on this day'),
        h('p', { class: 'hint' }, 'Tap + below, or the + next to a meal, to add food.')),
      meals(date, entries, s),
    ].filter(Boolean)); // replaceChildren would print a null as the text "null"
  }

  // Swipe left / right to move between days.
  let sx = 0; let sy = 0; let tracking = false;
  el.addEventListener('touchstart', (e) => {
    if (e.target.closest('input, textarea, select, .sheet')) return;
    tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
    const date = getDay();
    if (dx < 0 && date < todayStr()) go(addDays(date, 1));
    else if (dx > 0 && date > minDate()) go(addDays(date, -1));
  }, { passive: true });

  return {
    el,
    title: 'Diary',
    update() {
      const a = document.activeElement;
      if (a && el.contains(a) && a.matches('input:not(.day-picker), textarea, select')) return;
      render();
    },
    onShow(opts) { if (opts?.date) setDay(opts.date); render(); },
  };
}
