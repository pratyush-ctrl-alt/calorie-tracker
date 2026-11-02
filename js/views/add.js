import { h, todayStr, fmt } from '../util.js';
import { PLAN_MENU, PLAN_GROUPS, SLOTS } from '../plan.js';
import { parseLog } from '../parser.js';
import { GEMINI_PROMPT, EXAMPLE_LINE } from '../prompt.js';
import { buildEntry, validateEntry, itemFields, planFields, numOrNull, NUM_FIELDS } from '../entries.js';
import { copyText, nav, numInput, openEntrySheet, openSheet, segmented, slotSelect, toast } from '../components.js';
import * as store from '../store.js';

const NUM_LABELS = { kcal: 'kcal', protein_g: 'P g', carbs_g: 'C g', fat_g: 'F g', fibre_g: 'Fib g' };

export function createAddView() {
  const el = h('section', { class: 'view', id: 'view-add', 'aria-label': 'Add' });

  const ta = h('textarea', {
    id: 'paste-box', rows: 4, placeholder: 'Paste the line from Gemini', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Paste the line from Gemini',
    oninput: () => reparse(),
  });
  const pasteHint = h('p', { class: 'hint', hidden: true }, 'Paste is blocked here. Long-press inside the box and choose Paste.');
  const dateIn = h('input', { type: 'date', value: todayStr(), max: todayStr(), 'aria-label': 'Date for these entries' });
  const previewBox = h('div', { class: 'previews', 'aria-live': 'polite' });
  const saveBtn = h('button', { class: 'btn primary block', type: 'button', disabled: true, onclick: () => save() }, 'Save');
  const chipBox = h('div', {});

  // Card edits survive re-parsing while the line text stays the same.
  let cards = [];
  const edits = new Map();

  const cardError = (c) => (c.error ? c.error : validateEntry({ ...c.entry, date: dateIn.value || todayStr() }));

  function refreshSaveButton() {
    const n = cards.filter((c) => !cardError(c)).length;
    saveBtn.textContent = n === 1 ? 'Save 1 entry' : `Save ${n} entries`;
    saveBtn.disabled = n === 0;
  }

  function reparse() {
    const parsed = parseLog(ta.value, { items: store.getItems(), settings: store.getSettings(), now: new Date() });
    const seen = new Map();
    cards = parsed.results.map((r) => {
      const n = (seen.get(r.raw) ?? 0) + 1;
      seen.set(r.raw, n);
      const key = `${r.raw}#${n}`;
      if (r.error) return { key, raw: r.raw, error: r.error };
      const ed = edits.get(key) ?? {};
      return { key, raw: r.raw, warnings: r.warnings ?? [], entry: { ...r.entry, ...ed.fields }, saveItem: !!ed.saveItem, slotGuessed: ed.slotTouched ? false : r.entry.slotGuessed };
    });
    renderCards();
  }

  function noteEdit(c, patch) {
    const ed = edits.get(c.key) ?? { fields: {} };
    Object.assign(ed.fields, patch.fields ?? {});
    if ('saveItem' in patch) ed.saveItem = patch.saveItem;
    if (patch.slotTouched) ed.slotTouched = true;
    edits.set(c.key, ed);
  }

  function renderCards() {
    if (!cards.length) { previewBox.replaceChildren(); refreshSaveButton(); return; }
    previewBox.replaceChildren(...cards.map((c) => {
      if (c.error) {
        return h('div', { class: 'pcard bad' },
          h('div', { class: 'raw' }, c.raw),
          h('p', { class: 'warn-text' }, `Can't save this line: ${c.error}`));
      }
      const warn = h('p', { class: 'warn-text', hidden: true });
      const guessed = h('p', { class: 'hint', hidden: !c.slotGuessed }, 'Slot guessed from the time. Check it.');
      const showWarn = () => {
        const err = validateEntry({ ...c.entry, date: dateIn.value || todayStr() });
        const extra = c.warnings.length ? `Note: ${c.warnings.join('; ')}` : '';
        warn.textContent = err ? `Fix before saving: ${err}` : extra;
        warn.hidden = !warn.textContent;
        warn.className = err ? 'warn-text' : 'hint';
      };
      const set = (field, value) => { c.entry[field] = value; noteEdit(c, { fields: { [field]: value } }); showWarn(); refreshSaveButton(); };

      const slot = slotSelect(c.entry.slot, (v) => { c.slotGuessed = false; guessed.hidden = true; noteEdit(c, { slotTouched: true }); set('slot', v); });
      const name = h('input', { type: 'text', value: c.entry.name, 'aria-label': 'Name', oninput: (e) => set('name', e.target.value) });
      const nums = NUM_FIELDS.map((f) => h('label', { class: 'mini' },
        h('span', {}, NUM_LABELS[f]),
        numInput(c.entry[f], { 'aria-label': NUM_LABELS[f], oninput: (e) => set(f, numOrNull(e.target.value)) })));
      const onPlan = h('input', { type: 'checkbox', checked: c.entry.on_plan, onchange: (e) => set('on_plan', e.target.checked) });
      const asItem = h('input', { type: 'checkbox', checked: c.saveItem, onchange: (e) => { c.saveItem = e.target.checked; noteEdit(c, { saveItem: e.target.checked }); } });
      showWarn();
      return h('div', { class: 'pcard' },
        h('div', { class: 'pcard-top' }, slot, h('span', { class: 'tag muted-tag' }, { line: 'from text', kenko: 'Kenko', plan: 'plan menu', saved: 'saved item' }[c.entry.source] ?? '')),
        guessed, name, h('div', { class: 'grid5' }, nums),
        h('div', { class: 'checks' },
          h('label', { class: 'check' }, onPlan, h('span', {}, 'On plan')),
          h('label', { class: 'check' }, asItem, h('span', {}, 'Save as quick item'))),
        warn);
    }));
    refreshSaveButton();
  }

  function save() {
    const date = dateIn.value || todayStr();
    const good = cards.filter((c) => !cardError(c));
    if (!good.length) return;
    store.addEntries(good.map((c) => buildEntry({ ...c.entry }, { date })));
    for (const c of good.filter((x) => x.saveItem)) {
      const e = c.entry;
      store.saveItem({ name: e.name, kcal: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g, fibre_g: e.fibre_g, default_slot: e.slot, on_plan: e.on_plan, aliases: '' });
    }
    const skipped = cards.length - good.length;
    ta.value = '';
    edits.clear();
    reparse();
    toast(`Saved ${good.length} ${good.length === 1 ? 'entry' : 'entries'}${skipped ? `, ${skipped} line${skipped === 1 ? '' : 's'} skipped` : ''}`);
    if (date === todayStr()) nav.go('today');
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) throw new Error('empty');
      ta.value = text;
      pasteHint.hidden = true;
      reparse();
    } catch {
      pasteHint.hidden = false;
      ta.focus();
    }
  }

  // ---- quick chips -------------------------------------------------------------------
  function openQuick(food, kind) {
    openSheet(food.name, (close) => {
      let qty = 1;
      const slot = slotSelect(kind === 'plan' ? food.default_slot : (SLOTS.includes(food.default_slot) ? food.default_slot : 'Snack'));
      const summary = h('p', { class: 'num quick-sum' });
      const fields = () => (kind === 'plan' ? planFields(food, { slot: slot.value, qty }) : itemFields(food, { slot: slot.value, qty }));
      const upd = () => {
        const f = fields();
        summary.textContent = `${fmt(f.kcal, 0)} kcal · ${fmt(f.protein_g)} g P · ${fmt(f.carbs_g)} g C · ${fmt(f.fat_g)} g F · ${fmt(f.fibre_g)} g Fib`;
      };
      slot.addEventListener('change', upd);
      upd();
      return h('div', { class: 'form' },
        food.group ? h('p', { class: 'muted small' }, `Plan menu · ${food.group}`) : null,
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Slot'), slot),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Quantity'),
          segmented([{ value: 0.5, label: '×0.5' }, { value: 1, label: '×1' }, { value: 1.5, label: '×1.5' }, { value: 2, label: '×2' }], 1, (v) => { qty = Number(v); upd(); }, 'Quantity')),
        summary,
        h('p', { class: 'muted small' }, `Date: ${dateIn.value || todayStr()}`),
        h('button', {
          type: 'button', class: 'btn primary block big',
          onclick: () => {
            const date = dateIn.value || todayStr();
            store.addEntries([buildEntry(fields(), { date })]);
            close();
            toast('Saved');
            if (date === todayStr()) nav.go('today');
          },
        }, 'Save'));
    });
  }

  function renderChips() {
    const items = store.getItems();
    const planGroups = PLAN_GROUPS.map((g) => [g, PLAN_MENU.filter((p) => p.group === g)]);
    chipBox.replaceChildren(
      h('h2', { class: 'section-title' }, 'Quick items'),
      items.length
        ? h('div', { class: 'chips' }, items.map((it) => h('button', { class: 'chip', type: 'button', onclick: () => openQuick(it, 'item') },
          it.name, h('span', { class: 'chip-sub num' }, `${fmt(it.kcal, 0)}`))))
        : h('p', { class: 'muted small' }, 'No saved items yet. Tick "Save as quick item" when you log something.'),
      h('details', { class: 'plan-menu' },
        h('summary', {}, 'Plan menu'),
        planGroups.map(([g, list]) => h('div', { class: 'plan-group' },
          h('h3', {}, g),
          h('div', { class: 'chips' }, list.map((p) => h('button', { class: 'chip', type: 'button', onclick: () => openQuick(p, 'plan') },
            p.name, h('span', { class: 'chip-sub num' }, `${fmt(p.kcal, 0)}`))))))));
  }

  const help = h('details', { class: 'card help' },
    h('summary', {}, 'Format help'),
    h('p', {}, 'One meal per line: slot | name | kcal | protein | carbs | fat | fibre. Carbs, fat and fibre are optional. Any order works, and a range like 500-560 becomes its midpoint.'),
    h('pre', { class: 'example' }, EXAMPLE_LINE),
    h('p', { class: 'muted small' }, 'You can also type just a saved item or plan-menu name (for example "coffee"), or "kenko".'),
    h('button', {
      class: 'btn block', type: 'button',
      onclick: async () => toast((await copyText(GEMINI_PROMPT)) ? 'Prompt copied' : 'Could not copy. Long-press the prompt in the README instead.'),
    }, 'Copy Gemini prompt'));

  el.append(
    h('div', { class: 'card' },
      h('label', { class: 'field-label', for: 'paste-box' }, 'Paste the line from Gemini'),
      ta, pasteHint,
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', type: 'button', onclick: paste }, 'Paste'),
        h('button', { class: 'btn', type: 'button', onclick: () => { ta.value = ''; edits.clear(); reparse(); } }, 'Clear')),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Date'), dateIn)),
    previewBox,
    h('div', { class: 'sticky-save' }, saveBtn),
    h('div', { class: 'card' }, chipBox),
    h('button', { class: 'btn block', type: 'button', onclick: () => openEntrySheet({ mode: 'create', date: dateIn.value || todayStr() }) }, 'Enter numbers myself'),
    help);

  dateIn.addEventListener('change', () => { renderCards(); });
  renderChips();
  reparse();

  return {
    el,
    update() { // saved items may have changed; don't re-render cards while one is being edited
      renderChips();
      if (ta.value && !previewBox.contains(document.activeElement)) reparse();
    },
    onShow() { dateIn.max = todayStr(); if (!dateIn.value) dateIn.value = todayStr(); },
  };
}
