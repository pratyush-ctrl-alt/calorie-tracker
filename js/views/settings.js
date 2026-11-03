import { h, todayStr, addDays, fmt } from '../util.js';
import { DEFAULT_SETTINGS, SLOTS } from '../plan.js';
import { LOG_HEADERS, numOrNull } from '../entries.js';
import { field, numInput, openSheet, slotSelect, toast } from '../components.js';
import * as store from '../store.js';

const TARGETS = [
  ['calorie_target', 'Calorie target (kcal)'], ['protein_target_g', 'Protein target (g)'],
  ['calorie_band_pct', 'Calorie band (± %)'], ['protein_hit_g', 'Protein "hit" at (g)'],
  ['fat_limit_g', 'Fat limit (g)'], ['fibre_target_g', 'Fibre target (g)'],
];
const KENKO = [
  ['kenko_kcal', 'Kenko kcal'], ['kenko_protein_g', 'Kenko protein (g)'], ['kenko_carbs_g', 'Kenko carbs (g)'],
  ['kenko_fat_g', 'Kenko fat (g)'], ['kenko_fibre_g', 'Kenko fibre (g)'],
];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(entries) {
  const rows = entries.map((e) => LOG_HEADERS.map((k) => (k === 'on_plan' || k === 'deleted' ? (e[k] ? 'TRUE' : 'FALSE') : csvCell(e[k]))));
  return [LOG_HEADERS.join(','), ...rows.map((r) => r.join(','))].join('\r\n') + '\r\n';
}

export function createSettingsView() {
  const el = h('section', { class: 'view', id: 'view-settings', 'aria-label': 'Settings' });
  const conn = store.getConn();

  // ---- connection ----------------------------------------------------------------------
  const url = h('input', { type: 'url', value: conn.url, placeholder: 'https://abcdefgh.supabase.co', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const key = h('input', { type: 'password', value: conn.key, placeholder: 'Public key (anon / publishable)', autocomplete: 'off' });
  const token = h('input', { type: 'password', value: conn.token, placeholder: 'The token you put in schema.sql', autocomplete: 'off' });
  const connStatus = h('p', { class: 'hint', role: 'status' });
  const syncBox = h('div', { class: 'sync-box' });

  const values = () => ({ url: url.value, key: key.value, token: token.value });

  async function test() {
    connStatus.className = 'hint';
    connStatus.textContent = 'Testing\u2026';
    try {
      const r = await store.testConnection(values());
      connStatus.className = 'ok-text';
      connStatus.textContent = `Connected. ${r.name ?? 'Database'} is ready.`;
    } catch (e) {
      connStatus.className = 'warn-text';
      connStatus.textContent = e.message;
    }
  }

  function saveConnection() {
    const v = values();
    const filled = [v.url, v.key, v.token].filter((x) => x.trim()).length;
    if (filled > 0 && filled < 3) {
      connStatus.className = 'warn-text';
      connStatus.textContent = 'Fill in all three (URL, public key and token), or clear all three to use Demo mode.';
      return;
    }
    store.setConn(v);
    toast(v.url.trim() ? 'Connection saved' : 'Back in Demo mode');
  }

  const connCard = h('div', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Database connection (Supabase)'),
    h('p', { class: 'muted small' }, 'Stored only on this phone. Leave all three empty to use Demo mode. Never paste the "service_role" or "secret" key here.'),
    field('Project URL', url), field('Public key (anon / publishable)', key), field('Token', token),
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn', type: 'button', onclick: test }, 'Test connection'),
      h('button', { class: 'btn primary', type: 'button', onclick: saveConnection }, 'Save connection')),
    connStatus, syncBox);

  function renderSync() {
    const st = store.syncStatus();
    if (st.kind === 'demo') {
      syncBox.replaceChildren(
        h('p', { class: 'muted small' }, 'Demo mode: a sample week is shown and nothing you do here is sent anywhere.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { store.resetDemo(); toast('Sample data reset'); } }, 'Reset sample data'));
      return;
    }
    const last = store.lastSync();
    syncBox.replaceChildren(...[
      h('p', { class: 'small' }, h('strong', {}, st.text), st.pending ? ` · ${st.pending} waiting` : '', last ? ` · last sync ${new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''),
      st.error ? h('p', { class: 'warn-text' }, st.error) : null,
      st.error && st.detail ? h('p', { class: 'hint' }, `Details: ${st.detail}`) : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => store.sync() }, 'Sync now')].filter(Boolean));
  }

  // ---- targets & kenko -------------------------------------------------------------------------
  function settingsCard(title, defs, note) {
    const inputs = {};
    const grid = h('div', { class: 'grid2' }, defs.map(([k, label]) => { inputs[k] = numInput(''); return field(label, inputs[k]); }));
    const fill = () => { const s = store.getSettings(); for (const [k] of defs) if (document.activeElement !== inputs[k]) inputs[k].value = s[k]; };
    const card = h('div', { class: 'card' }, h('h2', { class: 'card-title' }, title), note ? h('p', { class: 'muted small' }, note) : null, grid,
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          const patch = {};
          for (const [k, label] of defs) {
            const n = numOrNull(inputs[k].value);
            if (n === null || n < 0) { toast(`${label} needs a number`, 'bad'); return; }
            patch[k] = n;
          }
          store.saveSettings(patch);
          toast('Saved');
        } }, 'Save'),
        h('button', { class: 'btn', type: 'button', onclick: () => { for (const [k] of defs) inputs[k].value = DEFAULT_SETTINGS[k]; } }, 'Restore defaults')));
    fill();
    return { card, fill };
  }
  const targets = settingsCard('Targets', TARGETS, 'Calories are "on target" within ± the band of the target. Protein is "hit" at the mark above.');
  const kenko = settingsCard('Kenko box', KENKO, 'Used by the "Log Kenko meal" button and the word "kenko".');

  // ---- saved items -----------------------------------------------------------------------------
  const itemsBox = h('div', {});
  function openItemSheet(item) {
    openSheet(item ? 'Edit quick item' : 'New quick item', (close) => {
      const it = item ?? { name: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', default_slot: 'Snack', on_plan: false, aliases: '' };
      const name = h('input', { type: 'text', value: it.name, autocomplete: 'off' });
      const n = { kcal: numInput(it.kcal), protein_g: numInput(it.protein_g), carbs_g: numInput(it.carbs_g), fat_g: numInput(it.fat_g), fibre_g: numInput(it.fibre_g) };
      const slot = slotSelect(it.default_slot || 'Snack');
      const onPlan = h('input', { type: 'checkbox', checked: it.on_plan });
      const aliases = h('input', { type: 'text', value: it.aliases, placeholder: 'comma, separated', autocomplete: 'off' });
      const msg = h('p', { class: 'form-error', hidden: true, role: 'alert' });
      return h('form', { class: 'form', onsubmit: (ev) => {
        ev.preventDefault();
        const next = { name: name.value.trim(), default_slot: slot.value, on_plan: onPlan.checked, aliases: aliases.value.trim(),
          ...Object.fromEntries(Object.entries(n).map(([k, i]) => [k, numOrNull(i.value)])) };
        const err = !next.name ? 'Needs a name' : next.kcal === null ? 'Needs kcal' : next.protein_g === null ? 'Needs protein' : '';
        if (err) { msg.textContent = err; msg.hidden = false; return; }
        if (item && item.name.toLowerCase() !== next.name.toLowerCase()) store.deleteItem(item.name);
        store.saveItem(next);
        close();
      } },
      field('Name', name),
      h('div', { class: 'grid2' }, field('kcal', n.kcal), field('Protein (g)', n.protein_g)),
      h('div', { class: 'grid3' }, field('Carbs (g)', n.carbs_g), field('Fat (g)', n.fat_g), field('Fibre (g)', n.fibre_g)),
      field('Default slot', slot),
      field('Aliases (what you can type instead of the name)', aliases),
      h('label', { class: 'check' }, onPlan, h('span', {}, 'On plan')),
      msg,
      h('div', { class: 'row-btns' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'), h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel')));
    });
  }
  function renderItems() {
    const items = store.getItems();
    itemsBox.replaceChildren(...(items.length ? items.map((it) => {
      const row = h('div', { class: 'item-row' });
      const normal = () => row.replaceChildren(
        h('div', { class: 'item-main' }, h('strong', {}, it.name), h('span', { class: 'muted small num' }, `${fmt(it.kcal, 0)} kcal · ${fmt(it.protein_g)} g P${it.on_plan ? '' : ' · off plan'}`)),
        h('div', { class: 'row-btns tight' },
          h('button', { class: 'btn small', type: 'button', onclick: () => openItemSheet(it) }, 'Edit'),
          h('button', { class: 'btn small danger-outline', type: 'button', onclick: () => row.replaceChildren(
            h('div', { class: 'item-main' }, `Delete "${it.name}"?`),
            h('div', { class: 'row-btns tight' },
              h('button', { class: 'btn small', type: 'button', onclick: normal }, 'Keep'),
              h('button', { class: 'btn small danger', type: 'button', onclick: () => store.deleteItem(it.name) }, 'Delete'))) }, 'Delete')));
      normal();
      return row;
    }) : [h('p', { class: 'muted small' }, 'No saved items yet.')]));
  }
  const itemsCard = h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Saved quick items'), itemsBox,
    h('button', { class: 'btn', type: 'button', onclick: () => openItemSheet(null) }, 'Add item'));

  // ---- CSV -----------------------------------------------------------------------------------------
  const from = h('input', { type: 'date', value: addDays(todayStr(), -29) });
  const to = h('input', { type: 'date', value: todayStr() });
  const csvMsg = h('p', { class: 'hint', role: 'status' });
  async function download() {
    if (!from.value || !to.value || from.value > to.value) { csvMsg.textContent = 'Pick a valid date range.'; return; }
    csvMsg.textContent = 'Preparing…';
    const { entries, fromSheet } = await store.entriesForExport(from.value, to.value);
    const blob = new Blob(['﻿' + toCsv(entries)], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `plate-log_${from.value}_to_${to.value}.csv` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    csvMsg.textContent = `${entries.length} entries${store.isDemo() ? ' (demo data)' : fromSheet ? ' from the database' : ' from this phone’s cache (could not reach the database)'}.`;
  }
  const csvCard = h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Download CSV'),
    h('div', { class: 'grid2' }, field('From', from), field('To', to)),
    h('button', { class: 'btn', type: 'button', onclick: download }, 'Download CSV'), csvMsg);

  el.append(connCard, targets.card, kenko.card, itemsCard, csvCard);
  renderSync();
  renderItems();

  return {
    el,
    renderSync,
    update() { renderSync(); renderItems(); targets.fill(); kenko.fill(); },
    onShow() { renderSync(); },
  };
}
