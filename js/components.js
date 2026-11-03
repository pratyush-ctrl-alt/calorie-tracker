// Shared UI pieces: navigation hook, toast, bottom sheets, rings, switches, and the sheets used from
// several screens (entry editor, quick log, item editor).

import { h, svgEl, todayStr, fmt } from './util.js';
import { SLOTS } from './plan.js';
import { buildEntry, validateEntry, itemFields, numOrNull, NUM_FIELDS } from './entries.js';
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
      h('button', { class: 'icon-btn', type: 'button', onclick: close }, 'Cancel'),
      h('h2', {}, title)),
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

/** A label on the left and an iOS switch on the right. Returns {el, input}. */
export function switchRow(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', class: 'switch', checked: !!checked, role: 'switch', 'aria-label': label, onchange: (e) => onChange?.(e.target.checked) });
  return { input, el: h('label', { class: 'switch-row' }, h('span', {}, label), input) };
}

export function largeTitle(title, subtitle, right) {
  return h('div', { class: 'large-title' }, h('div', {}, h('h1', {}, title), subtitle ? h('p', { class: 'sub' }, subtitle) : null), right ?? null);
}

export function starIcon() {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  svg.append(svgEl('path', { d: 'M12 3l2.7 5.7 6.2.8-4.6 4.3 1.2 6.2L12 17l-5.5 3 1.2-6.2L3.1 9.5l6.2-.8z' }));
  return svg;
}

// ---- progress bars ------------------------------------------------------------------
/** A labelled horizontal bar. `over` turns it red (used for calories above the target). */
export function metricBar({ label, color, value, target, unit, over = false, dp = 1 }) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  return h('div', { class: `metric ${over ? 'over' : ''}`, style: `--c:${color}` },
    h('div', { class: 'metric-head' },
      h('span', { class: 'metric-name' }, label),
      h('span', { class: 'metric-val num' }, h('strong', {}, fmt(value, dp)), ` / ${fmt(target, 0)} ${unit}`)),
    h('div', { class: 'metric-track', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': value },
      h('div', { class: 'metric-fill', style: `width:${pct}%` })));
}

/** A small tile: coloured label, big value, thin bar. */
export function tile({ label, color, value, unit, target, limit = false }) {
  const over = limit && target > 0 && value > target;
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return h('div', { class: `tile ${over ? 'bad' : ''}` },
    h('span', { class: 'tile-label', style: `color:${over ? 'var(--red)' : color}` }, label),
    h('span', { class: 'tile-value num' }, fmt(value), ' ', h('small', {}, unit)),
    target > 0 ? h('div', { class: 'mini-track', role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': value },
      h('div', { class: 'mini-fill', style: `width:${pct}%;background:${over ? 'var(--red)' : color}` })) : null);
}

// ---- entry editor (edit an entry, or enter one manually) -------------------------------------------------
export function openEntrySheet({ mode = 'edit', entry = null, date = todayStr(), onDone } = {}) {
  const e = entry ?? {
    name: '', slot: guessSlot(new Date().getHours()), date, time: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '',
    on_plan: false, note: '',
  };
  return openSheet(mode === 'edit' ? 'Edit entry' : 'Enter numbers', (close) => {
    const name = h('input', { type: 'text', value: e.name, autocomplete: 'off', placeholder: 'e.g. Dal, rice, curd' });
    const slot = slotSelect(e.slot);
    const dateIn = h('input', { type: 'date', value: e.date, max: todayStr() });
    const timeIn = h('input', { type: 'time', value: e.time });
    const nums = Object.fromEntries(NUM_FIELDS.map((f) => [f, numInput(e[f])]));
    const onPlan = switchRow('On plan', e.on_plan);
    const note = h('input', { type: 'text', value: e.note ?? '', autocomplete: 'off', placeholder: 'Optional' });
    const asItem = switchRow('Save to My Items', false);
    const msg = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const confirmBox = h('div', { class: 'confirm', hidden: true });

    const read = () => ({
      ...(entry ?? {}),
      name: name.value, slot: slot.value, date: dateIn.value, time: timeIn.value || entry?.time,
      ...Object.fromEntries(NUM_FIELDS.map((f) => [f, nums[f].value])),
      on_plan: onPlan.input.checked, note: note.value.trim(),
    });
    const numbers = (f) => Object.fromEntries(NUM_FIELDS.map((k) => [k, numOrNull(f[k])]));

    const save = () => {
      const f = read();
      const err = validateEntry(f);
      if (err) { msg.textContent = err; msg.hidden = false; return; }
      if (mode === 'edit') {
        store.updateEntry({ ...entry, ...f, name: f.name.trim(), ...numbers(f) });
      } else {
        store.addEntries([buildEntry({ ...f, source: 'manual' }, { date: f.date })]);
        if (asItem.input.checked) {
          store.saveItem({ name: f.name.trim(), ...numbers(f), default_slot: f.slot, on_plan: f.on_plan, aliases: '', favorite: false });
        }
      }
      close();
      onDone?.();
    };

    const delBtn = h('button', { type: 'button', class: 'btn danger-outline block', onclick: () => {
      delBtn.hidden = true;
      confirmBox.hidden = false;
      confirmBox.replaceChildren(
        h('p', {}, 'Delete this entry? It disappears from your totals.'),
        h('div', { class: 'row-btns' },
          h('button', { type: 'button', class: 'btn', onclick: () => { confirmBox.hidden = true; delBtn.hidden = false; } }, 'Keep it'),
          h('button', { type: 'button', class: 'btn danger', onclick: () => { store.deleteEntry(entry.id); close(); onDone?.(); } }, 'Delete')));
    } }, 'Delete entry');

    return h('form', { class: 'form', onsubmit: (ev) => { ev.preventDefault(); save(); } },
      field('Name', name),
      h('div', { class: 'grid2' }, field('Meal', slot), field('Date', dateIn)),
      mode === 'edit' ? field('Time', timeIn) : null,
      h('div', { class: 'grid2' }, field('kcal', nums.kcal), field('Protein (g)', nums.protein_g)),
      h('div', { class: 'grid3' }, field('Carbs (g)', nums.carbs_g), field('Fat (g)', nums.fat_g), field('Fibre (g)', nums.fibre_g)),
      h('p', { class: 'hint' }, 'Leave carbs, fat or fibre blank if you do not know them. Blank means unknown, not zero.'),
      field('Note', note),
      onPlan.el,
      mode === 'create' ? asItem.el : null,
      msg,
      h('button', { type: 'submit', class: 'btn primary big block' }, mode === 'edit' ? 'Save changes' : 'Save entry'),
      mode === 'edit' ? h('div', { class: 'danger-zone' }, delBtn, confirmBox) : null);
  });
}

// ---- quick log: pick an item, adjust, save (2 taps for the common case) ----------------------------------------
export function openQuickLog(item, { getDate = todayStr, onDone } = {}) {
  return openSheet(item.name, (close) => {
    let qty = 1;
    const slot = slotSelect(SLOTS.includes(item.default_slot) ? item.default_slot : guessSlot(new Date().getHours()));
    const note = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Optional, e.g. pasta with grilled paneer' });
    const summary = h('p', { class: 'num quick-sum' });
    const fields = () => ({ ...itemFields(item, { slot: slot.value, qty }), note: note.value.trim() });
    const upd = () => {
      const f = fields();
      summary.textContent = `${fmt(f.kcal, 0)} kcal · ${fmt(f.protein_g)} g protein · ${fmt(f.carbs_g)} g carbs · ${fmt(f.fat_g)} g fat · ${fmt(f.fibre_g)} g fibre`;
    };
    slot.addEventListener('change', upd);
    upd();
    return h('div', { class: 'form' },
      field('Meal', slot),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Quantity'),
        segmented([{ value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }, { value: 1.5, label: '×1.5' }, { value: 2, label: '×2' }], 1, (v) => { qty = Number(v); upd(); }, 'Quantity')),
      field('Note', note),
      summary,
      h('p', { class: 'muted small' }, `Logged for ${getDate() === todayStr() ? 'today' : getDate()}`),
      h('button', {
        type: 'button', class: 'btn primary big block',
        onclick: () => {
          const date = getDate();
          store.addEntries([buildEntry(fields(), { date })]);
          close();
          toast('Logged');
          onDone?.(date);
        },
      }, 'Log'));
  });
}

// ---- item editor (My Items) ---------------------------------------------------------------------
export function openItemSheet(item = null) {
  return openSheet(item ? 'Edit item' : 'New item', (close) => {
    const it = item ?? { name: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', default_slot: 'Snack', on_plan: false, aliases: '', favorite: false };
    const name = h('input', { type: 'text', value: it.name, autocomplete: 'off', placeholder: 'e.g. Banana' });
    const n = { kcal: numInput(it.kcal), protein_g: numInput(it.protein_g), carbs_g: numInput(it.carbs_g), fat_g: numInput(it.fat_g), fibre_g: numInput(it.fibre_g) };
    const slot = slotSelect(it.default_slot || 'Snack');
    const onPlan = switchRow('On plan', it.on_plan);
    const aliases = h('input', { type: 'text', value: it.aliases, placeholder: 'comma, separated', autocomplete: 'off' });
    const msg = h('p', { class: 'form-error', hidden: true, role: 'alert' });
    const confirmBox = h('div', { class: 'confirm', hidden: true });
    const delBtn = item ? h('button', { type: 'button', class: 'btn danger-outline block', onclick: () => {
      delBtn.hidden = true;
      confirmBox.hidden = false;
      confirmBox.replaceChildren(
        h('p', {}, `Delete "${item.name}" from My Items? Past entries stay as they are.`),
        h('div', { class: 'row-btns' },
          h('button', { type: 'button', class: 'btn', onclick: () => { confirmBox.hidden = true; delBtn.hidden = false; } }, 'Keep it'),
          h('button', { type: 'button', class: 'btn danger', onclick: () => { store.deleteItem(item.name); close(); } }, 'Delete')));
    } }, 'Delete item') : null;

    return h('form', { class: 'form', onsubmit: (ev) => {
      ev.preventDefault();
      const next = {
        name: name.value.trim(), default_slot: slot.value, on_plan: onPlan.input.checked, aliases: aliases.value.trim(), favorite: !!it.favorite,
        ...Object.fromEntries(Object.entries(n).map(([k, i]) => [k, numOrNull(i.value)])),
      };
      const err = !next.name ? 'Needs a name' : next.kcal === null ? 'Needs kcal' : next.protein_g === null ? 'Needs protein' : '';
      if (err) { msg.textContent = err; msg.hidden = false; return; }
      if (item && item.name.toLowerCase() !== next.name.toLowerCase()) store.deleteItem(item.name);
      store.saveItem(next);
      close();
    } },
    field('Name', name),
    h('div', { class: 'grid2' }, field('kcal', n.kcal), field('Protein (g)', n.protein_g)),
    h('div', { class: 'grid3' }, field('Carbs (g)', n.carbs_g), field('Fat (g)', n.fat_g), field('Fibre (g)', n.fibre_g)),
    field('Usual meal', slot),
    field('Shortcut words', aliases, 'Type any of these in the paste box to log this item, for example "chai".'),
    onPlan.el,
    msg,
    h('button', { type: 'submit', class: 'btn primary big block' }, 'Save'),
    delBtn ? h('div', { class: 'danger-zone' }, delBtn, confirmBox) : null);
  });
}
