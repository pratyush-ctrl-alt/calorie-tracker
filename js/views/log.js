import { h, todayStr, fmt } from '../util.js';
import { parseLog } from '../parser.js';
import { GEMINI_PROMPT, EXAMPLE_LINE } from '../prompt.js';
import { buildEntry, validateEntry, numOrNull, NUM_FIELDS } from '../entries.js';
import { copyText, field, largeTitle, nav, numInput, openEntrySheet, openQuickLog, slotSelect, switchRow, toast } from '../components.js';
import * as store from '../store.js';

const NUM_LABELS = { kcal: 'kcal', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat', fibre_g: 'Fibre' };
const SOURCE_TAG = { line: 'From text', kenko: 'Kenko', saved: 'My Items' };

export function createLogView() {
  const el = h('section', { class: 'view', id: 'view-log', 'aria-label': 'Log' });

  const ta = h('textarea', {
    id: 'paste-box', rows: 4, placeholder: 'Paste the line from Gemini, or type a saved item such as "coffee"',
    autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Paste the line from Gemini',
    oninput: () => { reparse(); clearWrap.hidden = !ta.value; },
  });
  const clearBtn = h('button', { class: 'link-btn', type: 'button', onclick: () => { ta.value = ''; edits.clear(); reparse(); clearWrap.hidden = true; ta.focus(); } }, 'Clear');
  const clearWrap = h('div', { class: 'clear-wrap', hidden: true }, clearBtn);
  const dateIn = h('input', { type: 'date', value: todayStr(), max: todayStr(), 'aria-label': 'Date for these entries' });
  const previewBox = h('div', { class: 'previews', 'aria-live': 'polite' });
  const saveBtn = h('button', { class: 'btn primary big block', type: 'button', disabled: true, onclick: () => save() }, 'Save');
  const quickBox = h('div', {});

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
      const guessed = h('p', { class: 'hint', hidden: !c.slotGuessed }, 'Meal guessed from the time. Check it.');
      const showWarn = () => {
        const err = validateEntry({ ...c.entry, date: dateIn.value || todayStr() });
        const extra = c.warnings.length ? `Note: ${c.warnings.join('; ')}` : '';
        warn.textContent = err ? `Fix before saving: ${err}` : extra;
        warn.hidden = !warn.textContent;
        warn.className = err ? 'warn-text' : 'hint';
      };
      const set = (f, value) => { c.entry[f] = value; noteEdit(c, { fields: { [f]: value } }); showWarn(); refreshSaveButton(); };

      const slot = slotSelect(c.entry.slot, (v) => { c.slotGuessed = false; guessed.hidden = true; noteEdit(c, { slotTouched: true }); set('slot', v); });
      const name = h('input', { type: 'text', value: c.entry.name, 'aria-label': 'Name', oninput: (e) => set('name', e.target.value) });
      const nums = NUM_FIELDS.map((f) => h('label', { class: 'mini' },
        h('span', {}, NUM_LABELS[f]),
        numInput(c.entry[f], { 'aria-label': NUM_LABELS[f], oninput: (e) => set(f, numOrNull(e.target.value)) })));
      const onPlan = switchRow('On plan', c.entry.on_plan, (v) => set('on_plan', v));
      const asItem = switchRow('Save to My Items', c.saveItem, (v) => { c.saveItem = v; noteEdit(c, { saveItem: v }); });
      showWarn();
      return h('div', { class: 'pcard' },
        h('div', { class: 'pcard-top' }, slot, h('span', { class: 'tag' }, SOURCE_TAG[c.entry.source] ?? '')),
        guessed, name, h('div', { class: 'grid5' }, nums),
        onPlan.el, asItem.el, warn);
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
      store.saveItem({ name: e.name, kcal: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g, fibre_g: e.fibre_g, default_slot: e.slot, on_plan: e.on_plan, aliases: '', favorite: false });
    }
    const skipped = cards.length - good.length;
    ta.value = '';
    clearWrap.hidden = true;
    edits.clear();
    reparse();
    toast(`Saved ${good.length} ${good.length === 1 ? 'entry' : 'entries'}${skipped ? `, ${skipped} line${skipped === 1 ? '' : 's'} skipped` : ''}`);
    if (date === todayStr()) nav.go('today');
  }

  const afterLog = (date) => { if (date === todayStr()) nav.go('today'); };

  function renderQuick() {
    const quick = store.quickItems();
    quickBox.replaceChildren(
      h('h2', { class: 'section-title' }, 'Quick add', h('button', { class: 'link-btn', type: 'button', onclick: () => nav.go('items') }, 'My Items')),
      quick.length
        ? h('div', { class: 'chips-wrap' }, quick.map(({ item }) => h('button', { class: 'qchip', type: 'button', onclick: () => openQuickLog(item, { getDate: () => dateIn.value || todayStr(), onDone: afterLog }) },
          h('span', { class: 'q-name' }, item.name), h('span', { class: 'q-sub num' }, `${fmt(item.kcal, 0)} kcal`))))
        : h('p', { class: 'empty' }, 'Nothing here yet. Turn on "Save to My Items" when you log something, then star your favourites.'));
  }

  const help = h('details', { class: 'card help' },
    h('summary', {}, 'How to write a line'),
    h('p', { class: 'small muted' }, 'One meal per line: meal | name | kcal | protein | carbs | fat | fibre. Carbs, fat and fibre are optional, any order works, and a range like 500-560 becomes its midpoint.'),
    h('pre', { class: 'example' }, EXAMPLE_LINE),
    h('p', { class: 'small muted' }, 'You can also type just the name of something in My Items (for example "kenko" or "coffee").'),
    h('button', {
      class: 'btn block', type: 'button',
      onclick: async () => toast((await copyText(GEMINI_PROMPT)) ? 'Prompt copied' : 'Could not copy the prompt'),
    }, 'Copy Gemini prompt'));

  el.append(
    largeTitle('Log', 'Add what you ate'),
    h('div', { class: 'card' },
      ta,
      h('div', { class: 'switch-row' }, h('span', {}, 'Date'), dateIn),
      clearWrap),
    previewBox,
    h('div', { class: 'sticky-save' }, saveBtn),
    quickBox,
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn', type: 'button', onclick: () => openEntrySheet({ mode: 'create', date: dateIn.value || todayStr() }) }, 'Enter numbers'),
      h('button', { class: 'btn', type: 'button', onclick: () => nav.go('items') }, 'Browse My Items')),
    help);

  dateIn.addEventListener('change', () => { renderCards(); });
  renderQuick();
  reparse();

  return {
    el,
    title: 'Log',
    update() { // items may have changed; don't re-render cards while one is being edited
      renderQuick();
      if (ta.value && !previewBox.contains(document.activeElement)) reparse();
    },
    onShow() { dateIn.max = todayStr(); if (!dateIn.value) dateIn.value = todayStr(); renderQuick(); },
  };
}
