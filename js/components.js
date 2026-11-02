// Shared UI pieces: navigation hook, toast, bottom sheet, entry form, bars, segmented control.

import { h, todayStr, fmt } from './util.js';
import { SLOTS } from './plan.js';
import { buildEntry, validateEntry, numOrNull, NUM_FIELDS } from './entries.js';
import { guessSlot } from './parser.js';
import * as store from './store.js';

export const nav = { go: () => {} };

// ---- toast -------------------------------------------------------------------
let toastTimer;
export function toast(message, kind = '') {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

// ---- clipboard ------------------------------------------------------------------
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0;top:0' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

// ---- bottom sheet ------------------------------------------------------------------
export function openSheet(title, build) {
  const prevFocus = document.activeElement;
  const close = () => {
    backdrop.remove();
    document.body.classList.toggle('noscroll', !!document.querySelector('.sheet-backdrop'));
    prevFocus?.focus?.();
  };
  const body = h('div', { class: 'sheet-body' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, '×')),
    body);
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, panel);
  document.body.append(backdrop);
  document.body.classList.add('noscroll');
  body.append(build(close));
  return close;
}

// ---- small controls ---------------------------------------------------------------------
export function segmented(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label ?? '' });
  const set = (v) => {
    wrap.dataset.value = v;
    [...wrap.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  };
  for (const opt of options) {
    const o = typeof opt === 'object' ? opt : { value: opt, label: String(opt) };
    wrap.append(h('button', {
      type: 'button', class: 'seg-btn', dataset: { v: o.value },
      onclick: () => { set(o.value); onChange(o.value); },
    }, o.label));
  }
  set(value);
  wrap.get = () => wrap.dataset.value;
  wrap.set = set;
  return wrap;
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}

export const numInput = (value, attrs = {}) => h('input', {
  type: 'text', inputmode: 'decimal', autocomplete: 'off', value: value ?? '', ...attrs,
});

export function slotSelect(value, onChange) {
  const sel = h('select', { onchange: (e) => onChange?.(e.target.value) }, SLOTS.map((s) => h('option', { value: s }, s)));
  sel.value = SLOTS.includes(value) ? value : 'Snack';
  return sel;
}

/** A progress bar row. `limit` mode turns red when over; otherwise a target to fill. */
export function bar({ label, value, target, unit = '', limit = false, warnOver = false }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  const cls = limit ? (over ? 'bad' : '') : (warnOver && over ? 'warn' : '');
  return h('div', { class: 'bar-row' },
    h('div', { class: 'bar-head' },
      h('span', {}, label),
      h('span', { class: 'num' }, `${fmt(value)} / ${fmt(target)}${unit}`)),
    h('div', { class: 'track', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': value },
      h('div', { class: `fill ${cls}`, style: `width:${pct}%` })));
}

// ---- entry form sheet (edit an entry / enter one manually) ----------------------------------------------
/**
 * mode 'edit': pass `entry`; has delete with an in-page confirm.
 * mode 'create': blank form; `date` pre-fills the date; offers "save as quick item".
 */
export function openEntrySheet({ mode = 'edit', entry = null, date = todayStr(), onDone } = {}) {
  const e = entry ?? {
    name: '', slot: guessSlot(new Date().getHours()), date, time: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '',
    on_plan: false, note: '',
  };
  return openSheet(mode === 'edit' ? 'Edit entry' : 'Enter numbers myself', (close) => {
    const name = h('input', { type: 'text', value: e.name, autocomplete: 'off', placeholder: 'e.g. Dal, rice, curd' });
    const slot = slotSelect(e.slot);
    const dateIn = h('input', { type: 'date', value: e.date, max: todayStr() });
    const timeIn = h('input', { type: 'time', value: e.time });
    const nums = Object.fromEntries(NUM_FIELDS.map((f) => [f, numInput(e[f])]));
    const onPlan = h('input', { type: 'checkbox', checked: e.on_plan });
    const note = h('input', { type: 'text', value: e.note ?? '', autocomplete: 'off' });
    const asItem = h('input', { type: 'checkbox' });
    const msg = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const confirmBox = h('div', { class: 'confirm', hidden: true });

    const read = () => ({
      ...(entry ?? {}),
      name: name.value, slot: slot.value, date: dateIn.value, time: timeIn.value || entry?.time,
      ...Object.fromEntries(NUM_FIELDS.map((f) => [f, nums[f].value])),
      on_plan: onPlan.checked, note: note.value.trim(),
    });

    const save = () => {
      const f = read();
      const err = validateEntry(f);
      if (err) { msg.textContent = err; msg.hidden = false; return; }
      if (mode === 'edit') {
        store.updateEntry({ ...entry, ...f, name: f.name.trim(), ...Object.fromEntries(NUM_FIELDS.map((k) => [k, numOrNull(f[k])])) });
      } else {
        store.addEntries([buildEntry({ ...f, source: 'manual' }, { date: f.date })]);
        if (asItem.checked) {
          store.saveItem({ name: f.name.trim(), ...Object.fromEntries(NUM_FIELDS.map((k) => [k, numOrNull(f[k])])), default_slot: f.slot, on_plan: f.on_plan, aliases: '' });
        }
      }
      close();
      onDone?.();
    };

    const askDelete = () => {
      confirmBox.hidden = false;
      confirmBox.replaceChildren(
        h('p', {}, 'Delete this entry? It disappears from your totals.'),
        h('div', { class: 'row-btns' },
          h('button', { type: 'button', class: 'btn', onclick: () => { confirmBox.hidden = true; delBtn.hidden = false; } }, 'Keep it'),
          h('button', { type: 'button', class: 'btn danger', onclick: () => { store.deleteEntry(entry.id); close(); onDone?.(); } }, 'Delete')));
      delBtn.hidden = true;
    };
    const delBtn = h('button', { type: 'button', class: 'btn danger-outline', onclick: askDelete }, 'Delete entry');

    return h('form', { class: 'form', onsubmit: (ev) => { ev.preventDefault(); save(); } },
      field('Name', name),
      h('div', { class: 'grid2' }, field('Slot', slot), field('Date', dateIn)),
      mode === 'edit' ? field('Time', timeIn) : null,
      h('div', { class: 'grid2' }, field('kcal', nums.kcal), field('Protein (g)', nums.protein_g)),
      h('div', { class: 'grid3' }, field('Carbs (g)', nums.carbs_g), field('Fat (g)', nums.fat_g), field('Fibre (g)', nums.fibre_g)),
      h('p', { class: 'hint' }, 'Leave carbs, fat or fibre blank if you do not know them (blank means unknown, not zero).'),
      h('label', { class: 'check' }, onPlan, h('span', {}, 'On plan')),
      field('Note (optional)', note),
      mode === 'create' ? h('label', { class: 'check' }, asItem, h('span', {}, 'Save as quick item')) : null,
      msg,
      h('div', { class: 'row-btns' },
        h('button', { type: 'submit', class: 'btn primary' }, mode === 'edit' ? 'Save changes' : 'Save entry'),
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel')),
      mode === 'edit' ? h('div', { class: 'danger-zone' }, delBtn, confirmBox) : null);
  });
}
