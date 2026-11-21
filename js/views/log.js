// Add food. One screen, five ways in, picked with the tabs at the top:
//   Describe  type or speak what you ate; Gemini estimates it
//   Photo     take or choose a photo; Gemini estimates it
//   Saved     your My Items, one tap to log
//   Manual    type the numbers yourself
//   Paste     paste a line from another AI (the original flow)
// Describe, Photo and Paste all end in the same editable preview cards and one Save button.
// Food is added to the day the Diary was showing (changeable here).

import { h, todayStr, fmt, fmtFullDate, addDays } from '../util.js';
import { parseLog } from '../parser.js';
import { GEMINI_PROMPT, EXAMPLE_LINE } from '../prompt.js';
import { buildEntry, validateEntry, numOrNull, NUM_FIELDS } from '../entries.js';
import { copyText, entryForm, nav, numInput, openQuickLog, segmented, slotSelect, switchRow, toast } from '../components.js';
import { analyzePhoto, analyzeText, compressImage, entriesToLines, speechRecognition } from '../photo.js';
import { CACHE_DAYS } from '../store.js';
import * as store from '../store.js';
import { getDay, takePreferredSlot } from '../day-state.js';

const NUM_LABELS = { kcal: 'kcal', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat', fibre_g: 'Fibre' };
const SOURCE_TAG = { line: 'Estimate', kenko: 'Kenko', saved: 'My Items' };
const MODES = [
  { value: 'describe', label: 'Describe' },
  { value: 'photo', label: 'Photo' },
  { value: 'saved', label: 'Saved' },
  { value: 'manual', label: 'Manual' },
  { value: 'paste', label: 'Paste' },
];
const MODE_KEY = 'plate.addMode';
const loadMode = () => { try { const m = localStorage.getItem(MODE_KEY); return MODES.some((x) => x.value === m) ? m : 'describe'; } catch { return 'describe'; } };
const saveMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* fine */ } };

export function createLogView() {
  const el = h('section', { class: 'view', id: 'view-log', 'aria-label': 'Add food' });
  let mode = loadMode();
  let slotPref = null; // a meal picked from the Diary's "+ Add" on that meal

  // ---- the day being logged to ------------------------------------------------------------------------
  const dayText = h('span', {});
  const dateIn = h('input', {
    type: 'date', class: 'day-picker', value: todayStr(), max: todayStr(), 'aria-label': 'Day to add to',
    onchange: () => { if (!dateIn.value) dateIn.value = todayStr(); showDay(); renderCards(); },
  });
  const slotText = h('span', { class: 'slot-pref', hidden: true });
  function showDay() {
    const d = dateIn.value || todayStr();
    dayText.textContent = d === todayStr() ? 'Today' : d === addDays(todayStr(), -1) ? 'Yesterday' : fmtFullDate(d);
    slotText.hidden = !slotPref;
    slotText.textContent = slotPref ? ` · ${slotPref}` : '';
  }
  const header = h('div', { class: 'add-head' },
    h('h1', {}, 'Add food'),
    h('label', { class: 'date-pill' }, h('span', { class: 'muted' }, 'To '), dayText, slotText, h('span', { class: 'chev down small' }), dateIn));

  // ---- paste box: also where AI estimates land, so they share the preview cards ----------------------
  const ta = h('textarea', {
    id: 'paste-box', rows: 4, placeholder: 'Paste the line from Gemini, or type a saved item such as "coffee"',
    autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Paste the line from Gemini',
    oninput: () => { reparse(); clearWrap.hidden = !ta.value; },
  });
  const clearBtn = h('button', { class: 'link-btn', type: 'button', onclick: () => { clearAll(); ta.focus(); } }, 'Clear');
  const clearWrap = h('div', { class: 'clear-wrap', hidden: true }, clearBtn);
  const previewBox = h('div', { class: 'previews', 'aria-live': 'polite' });
  const saveBtn = h('button', { class: 'btn primary big block', type: 'button', disabled: true, onclick: () => save() }, 'Save');
  const saveWrap = h('div', { class: 'sticky-save', hidden: true }, saveBtn);

  let cards = [];
  const edits = new Map(); // card edits survive re-parsing while the line text stays the same

  const cardError = (c) => (c.error ? c.error : validateEntry({ ...c.entry, date: dateIn.value || todayStr() }));

  function refreshSaveButton() {
    const n = cards.filter((c) => !cardError(c)).length;
    saveBtn.textContent = n === 1 ? 'Save 1 item' : `Save ${n} items`;
    saveBtn.disabled = n === 0;
    saveWrap.hidden = cards.length === 0;
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
    previewBox.replaceChildren(
      h('h2', { class: 'section-title' }, 'Check and save'),
      ...cards.map((c) => {
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

  function clearAll() {
    ta.value = '';
    clearWrap.hidden = true;
    edits.clear();
    photoText = '';
    descText = '';
    reparse();
  }

  function finish(date, count, extra = '') {
    toast(`Saved ${count} ${count === 1 ? 'item' : 'items'}${extra}`);
    slotPref = null;
    nav.go('today', { date });
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
    clearAll();
    resetPhoto();
    resetDesc();
    finish(date, good.length, skipped ? `, ${skipped} line${skipped === 1 ? '' : 's'} skipped` : '');
  }

  /** Puts AI lines into the paste box, replacing the lines the same source added last time. Returns them. */
  function putLines(previous, items) {
    const lines = entriesToLines(slotPref ? items.map((i) => ({ ...i, slot: slotPref })) : items);
    const rest = previous ? ta.value.replace(previous, '').trim() : ta.value.trim();
    ta.value = rest ? `${rest}\n${lines}` : lines;
    clearWrap.hidden = false;
    reparse();
    return lines;
  }

  const aiDone = (r) => `Estimated by AI${r.confidence === 'low' ? ' (not very sure)' : ''}${r.backup ? `; the main model was busy, so ${r.model} answered` : ''}. Check the numbers below, then save.${r.notes ? ` ${r.notes}` : ''}`;
  const needConn = () => { const conn = store.getConn(); return store.isDemo() || !conn.token ? null : conn; };

  // ---- Describe ---------------------------------------------------------------------------------------
  const DESC_HINT = 'Amounts help: "50-50 black coffee and milk, very little sugar", "exactly 10 g salted roasted peanuts", "2 rotis with dal".';
  const descBox = h('textarea', {
    rows: 3, placeholder: 'What did you eat?', 'aria-label': 'Describe what you ate', maxlength: 1000,
    oninput: () => { descBtn.disabled = descBusy || !descBox.value.trim(); },
  });
  const descMsg = h('p', { class: 'hint', role: 'status' }, DESC_HINT);
  const Speech = speechRecognition();
  const micHint = h('p', { class: 'hint small' }, Speech ? 'Speak uses your browser’s speech-to-text, which sends the audio to Google or Apple to turn it into words.' : 'To speak, tap the microphone key on your phone’s keyboard.');
  const descBtn = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => runDescribe() }, 'Estimate');
  const micBtn = h('button', { class: 'btn', type: 'button', hidden: !Speech, 'aria-pressed': 'false', onclick: () => toggleMic() }, 'Speak');
  let descBusy = false;
  let descText = '';
  let rec = null;
  const sayDesc = (text, cls = 'hint') => { descMsg.className = cls; descMsg.textContent = text; };

  function resetDesc() { stopMic(); descBox.value = ''; descText = ''; descBtn.disabled = true; sayDesc(DESC_HINT); }
  function stopMic() { if (rec) { try { rec.stop(); } catch { /* already stopped */ } } }

  function toggleMic() {
    if (rec) { stopMic(); return; }
    rec = new Speech();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    const before = descBox.value.trim();
    rec.onresult = (e) => {
      const heard = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
      descBox.value = before ? `${before} ${heard}` : heard;
      descBtn.disabled = descBusy || !descBox.value.trim();
    };
    rec.onerror = (e) => {
      sayDesc(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone access was refused. Allow it in your browser settings, or use the microphone key on your keyboard.'
        : e.error === 'no-speech' ? 'Did not hear anything. Tap Speak and try again.' : `Speech input stopped (${e.error}). You can type instead.`, 'warn-text');
    };
    rec.onend = () => { rec = null; micBtn.textContent = 'Speak'; micBtn.setAttribute('aria-pressed', 'false'); micBtn.classList.remove('primary'); };
    try {
      rec.start();
      micBtn.textContent = 'Stop';
      micBtn.setAttribute('aria-pressed', 'true');
      micBtn.classList.add('primary');
      sayDesc('Listening… say what you ate.');
    } catch (err) {
      rec = null;
      sayDesc(`Could not start the microphone: ${err.message}`, 'warn-text');
    }
  }

  async function runDescribe() {
    const text = descBox.value.trim();
    if (!text || descBusy) return;
    stopMic();
    const conn = needConn();
    if (!conn) { sayDesc('Connect your database first (Settings). Estimates use the same token.', 'warn-text'); return; }
    descBusy = true;
    descBtn.disabled = true;
    descBtn.textContent = 'Estimating…';
    sayDesc('Estimating…');
    try {
      const r = await analyzeText(conn, text);
      if (!r.items.length) sayDesc(r.notes || 'No food found in the description.', 'warn-text');
      else { descText = putLines(descText, r.items); sayDesc(aiDone(r)); }
    } catch (err) {
      sayDesc(err.message, 'warn-text');
    } finally {
      descBusy = false;
      descBtn.textContent = descText ? 'Estimate again' : 'Estimate';
      descBtn.disabled = !descBox.value.trim();
    }
  }

  const describePane = h('div', { class: 'card' },
    descBox, h('div', { class: 'row-btns' }, micBtn, descBtn), descMsg, micHint);

  // ---- Photo ------------------------------------------------------------------------------------------
  const PHOTO_HINT = 'Take or choose a photo of your meal. AI estimates the numbers and you check them before saving.';
  const photoInput = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Choose a photo', onchange: (e) => onPhoto(e.target.files?.[0]) });
  const thumb = h('img', { class: 'thumb', alt: 'Your photo', hidden: true });
  const photoMsg = h('p', { class: 'hint', role: 'status' }, PHOTO_HINT);
  const photoNote = h('input', { type: 'text', placeholder: 'Optional: anything the photo does not show', autocomplete: 'off', hidden: true, 'aria-label': 'Note about the photo' });
  const reBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => runAnalysis() }, 'Estimate again');
  const photoBtn = h('button', { class: 'btn primary block', type: 'button', onclick: () => photoInput.click() }, 'Take or choose a photo');
  let photo = null;
  let busy = false;
  let thumbUrl = '';
  let photoText = '';
  const say = (text, cls = 'hint') => { photoMsg.className = cls; photoMsg.textContent = text; };

  function resetPhoto() {
    photo = null;
    photoText = '';
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = '';
    thumb.hidden = true;
    photoNote.hidden = true;
    photoNote.value = '';
    reBtn.hidden = true;
    photoBtn.textContent = 'Take or choose a photo';
    say(PHOTO_HINT);
  }

  async function onPhoto(file) {
    photoInput.value = '';
    if (!file) return;
    try {
      say('Preparing your photo…');
      photo = await compressImage(file);
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = URL.createObjectURL(photo.blob);
      thumb.src = thumbUrl;
      thumb.hidden = false;
      photoNote.hidden = false;
      photoBtn.textContent = 'Use a different photo';
      photoText = '';
      await runAnalysis();
    } catch (err) {
      say(err.message, 'warn-text');
    }
  }

  async function runAnalysis() {
    if (!photo || busy) return;
    const conn = needConn();
    if (!conn) { say('Connect your database first (Settings). Estimates use the same token.', 'warn-text'); return; }
    busy = true;
    photoBtn.disabled = true;
    reBtn.hidden = true;
    say('Estimating from your photo…');
    try {
      const r = await analyzePhoto(conn, { base64: photo.base64, mime: photo.mime, note: photoNote.value.trim() });
      if (!r.items.length) say(r.notes || 'No food found in the photo.', 'warn-text');
      else { photoText = putLines(photoText, r.items); say(aiDone(r)); }
    } catch (err) {
      say(err.message, 'warn-text');
    } finally {
      busy = false;
      photoBtn.disabled = false;
      reBtn.hidden = false;
    }
  }

  const photoPane = h('div', { class: 'card' }, photoBtn, photoInput, thumb, photoNote, h('div', { class: 'row-btns' }, reBtn), photoMsg);

  // ---- Saved (My Items) ------------------------------------------------------------------------------------
  let q = '';
  const savedList = h('div', {});
  const savedSearch = h('input', { type: 'search', placeholder: 'Search My Items', autocomplete: 'off', 'aria-label': 'Search My Items', oninput: (e) => { q = e.target.value; renderSaved(); } });
  function renderSaved() {
    const all = store.sortedItems();
    const qq = q.trim().toLowerCase();
    const list = qq ? all.filter(({ item }) => `${item.name} ${item.aliases}`.toLowerCase().includes(qq)) : all;
    savedList.replaceChildren(list.length
      ? h('div', { class: 'group' }, list.slice(0, 60).map(({ item }) => h('button', {
        class: 'row', type: 'button',
        onclick: () => openQuickLog(item, { getDate: () => dateIn.value || todayStr(), onDone: (date) => { slotPref = null; nav.go('today', { date }); } }),
      },
      h('span', { class: 'row-main' }, h('span', { class: 'row-label' }, item.name, item.favorite ? h('span', { class: 'fav' }, ' ★') : null),
        h('span', { class: 'entry-sub' }, `${fmt(item.kcal, 0)} kcal · ${fmt(item.protein_g)} g protein`)),
      h('span', { class: 'add-plus', 'aria-hidden': 'true' }, '+'))))
      : h('p', { class: 'empty' }, qq ? 'No item matches.' : 'Nothing saved yet. Turn on "Save to My Items" when you save something, or add items in My Items.'));
  }
  const savedPane = h('div', { class: 'stack' }, savedSearch, savedList,
    h('button', { class: 'link-btn', type: 'button', onclick: () => nav.go('items') }, 'Manage My Items'));

  // ---- Manual -----------------------------------------------------------------------------------------
  const manualPane = h('div', { class: 'card' });
  function renderManual() {
    manualPane.replaceChildren(entryForm({
      mode: 'create', date: dateIn.value || todayStr(), slot: slotPref,
      close: () => {}, onDone: () => { const d = dateIn.value || todayStr(); renderManual(); finish(d, 1); },
    }));
    // keep the date in the form in step with the day picker at the top
    const formDate = manualPane.querySelector('input[type="date"]');
    if (formDate) formDate.closest('.field')?.setAttribute('hidden', '');
    formDate && (formDate.value = dateIn.value || todayStr());
  }

  // ---- Paste ------------------------------------------------------------------------------------------
  const help = h('details', { class: 'help' },
    h('summary', {}, 'How to write a line'),
    h('p', { class: 'small muted' }, 'One meal per line: meal | name | kcal | protein | carbs | fat | fibre. Carbs, fat and fibre are optional, any order works, and a range like 500-560 becomes its midpoint.'),
    h('pre', { class: 'example' }, EXAMPLE_LINE),
    h('p', { class: 'small muted' }, 'You can also type just the name of something in My Items (for example "kenko" or "coffee").'),
    h('button', {
      class: 'btn block', type: 'button',
      onclick: async () => toast((await copyText(GEMINI_PROMPT)) ? 'Prompt copied' : 'Could not copy the prompt'),
    }, 'Copy Gemini prompt'));
  const pastePane = h('div', { class: 'card' }, ta, clearWrap, help);

  // ---- layout -----------------------------------------------------------------------------------------
  const panes = { describe: describePane, photo: photoPane, saved: savedPane, manual: manualPane, paste: pastePane };
  const showMode = () => {
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== mode;
    const usesCards = mode === 'describe' || mode === 'photo' || mode === 'paste';
    previewBox.hidden = !usesCards;
    if (!usesCards) saveWrap.hidden = true; else refreshSaveButton();
    if (mode === 'saved') renderSaved();
    if (mode === 'manual') renderManual();
  };
  const tabs = segmented(MODES, mode, (v) => { mode = v; saveMode(v); showMode(); }, 'How to add');
  tabs.classList.add('mode-tabs');

  el.append(header, tabs, ...Object.values(panes), previewBox, saveWrap);
  dateIn.min = addDays(todayStr(), -(CACHE_DAYS - 1));
  showDay();
  reparse();
  showMode();

  return {
    el,
    title: 'Add food',
    update() { // items may have changed; don't re-render cards while one is being edited
      if (mode === 'saved' && !el.contains(document.activeElement)) renderSaved();
      if (ta.value && !previewBox.contains(document.activeElement)) reparse();
    },
    onShow() {
      dateIn.max = todayStr();
      dateIn.value = getDay();
      slotPref = takePreferredSlot(); // set only by a meal's "+ Add" in the Diary
      showDay();
      showMode();
    },
  };
}
