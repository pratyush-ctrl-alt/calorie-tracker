import { h, todayStr, addDays } from '../util.js';
import { DEFAULT_SETTINGS } from '../plan.js';
import { LOG_HEADERS, numOrNull } from '../entries.js';
import { field, largeTitle, numInput, toast } from '../components.js';
import * as store from '../store.js';

const TARGETS = [
  ['calorie_target', 'Calorie target (kcal)'], ['protein_target_g', 'Protein target (g)'],
  ['calorie_band_pct', 'Calorie band (± %)'], ['protein_hit_g', 'Protein "hit" at (g)'],
  ['fat_limit_g', 'Fat limit (g)'], ['fibre_target_g', 'Fibre target (g)'],
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
  const ui = { connOpen: null }; // null = decide automatically (open only when not connected or something is wrong)

  // ---- database connection (collapsible) -------------------------------------------------------
  const url = h('input', { type: 'url', value: conn.url, placeholder: 'https://abcdefgh.supabase.co', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const key = h('input', { type: 'password', value: conn.key, placeholder: 'Public key (anon / publishable)', autocomplete: 'off' });
  const token = h('input', { type: 'password', value: conn.token, placeholder: 'The token you put in schema.sql', autocomplete: 'off' });
  const connStatus = h('p', { class: 'hint', role: 'status' });
  const syncBox = h('div', { class: 'sync-box' });
  const values = () => ({ url: url.value, key: key.value, token: token.value });

  // Pasted secrets are dots, so mistakes are invisible. Let the user reveal them and see their lengths.
  const lenHint = h('p', { class: 'hint' });
  const updLen = () => { lenHint.textContent = `Key: ${key.value.trim().length} characters · Token: ${token.value.trim().length} characters`; };
  key.addEventListener('input', updLen);
  token.addEventListener('input', updLen);
  updLen();
  const showBox = h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Show key and token', onchange: (e) => { for (const i of [key, token]) i.type = e.target.checked ? 'text' : 'password'; } });
  const revealRow = h('div', { class: 'reveal' }, h('label', { class: 'switch-row' }, h('span', {}, 'Show key and token'), showBox), lenHint);

  async function test() {
    connStatus.className = 'hint';
    connStatus.textContent = 'Testing…';
    try {
      const r = await store.testConnection(values());
      const saved = store.getConn();
      const same = saved.url === url.value.trim() && saved.key === key.value.trim() && saved.token === token.value.trim();
      connStatus.className = 'ok-text';
      connStatus.textContent = `Connected. Your database is ready.${same ? '' : ' These values are not saved yet: tap Save connection.'}`;
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

  const connBody = h('div', { class: 'conn-body' },
    h('p', { class: 'hint' }, 'Stored only on this phone. Leave all three empty to use Demo mode. Never paste the "service_role" or "secret" key here.'),
    field('Project URL', url), field('Public key (anon / publishable)', key), field('Token', token), revealRow,
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn', type: 'button', onclick: test }, 'Test connection'),
      h('button', { class: 'btn primary', type: 'button', onclick: saveConnection }, 'Save connection')),
    connStatus, syncBox);

  const connValue = h('span', {});
  const connChev = h('span', { class: 'chev', 'aria-hidden': 'true' });
  const connHead = h('button', { class: 'row', type: 'button', 'aria-expanded': 'false', onclick: () => { ui.connOpen = !isOpen(); applyOpen(); } },
    h('span', { class: 'row-main' }, h('span', { class: 'row-label' }, 'Database'), h('span', { class: 'entry-sub' }, 'Supabase connection and sync')),
    connValue, connChev);
  const connGroup = h('div', { class: 'group' }, connHead, connBody);

  function summaryOf(st) {
    if (st.kind === 'demo') return ['Demo mode', 'status-warn'];
    if (store.schemaOutdated()) return ['Update needed', 'status-warn'];
    if (st.kind === 'problem') return ['Problem', 'status-bad'];
    if (st.kind === 'offline') return ['Offline', 'status-bad'];
    if (st.kind === 'syncing') return ['Syncing…', 'status-warn'];
    if (st.kind === 'waiting') return [`${st.pending} waiting`, 'status-warn'];
    return ['Connected', 'status-ok'];
  }
  const isOpen = () => {
    if (ui.connOpen !== null) return ui.connOpen;
    const k = store.syncStatus().kind;
    return k === 'demo' || k === 'problem' || k === 'offline' || store.schemaOutdated();
  };
  function applyOpen() {
    const open = isOpen();
    connBody.hidden = !open;
    connHead.setAttribute('aria-expanded', String(open));
    connChev.className = `chev ${open ? 'up' : 'down'}`;
  }

  function renderSync() {
    const st = store.syncStatus();
    const [text, cls] = summaryOf(st);
    connValue.className = `row-value ${cls}`;
    connValue.textContent = text;
    applyOpen();
    if (st.kind === 'demo') {
      syncBox.replaceChildren(
        h('p', { class: 'hint' }, 'Demo mode: a sample week is shown and nothing you do here is sent anywhere.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { store.resetDemo(); toast('Sample data reset'); } }, 'Reset sample data'));
      return;
    }
    const last = store.lastSync();
    syncBox.replaceChildren(...[
      h('p', { class: 'small' }, h('strong', {}, st.text), st.pending ? ` · ${st.pending} waiting` : '', last ? ` · last sync ${new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''),
      st.error ? h('p', { class: 'warn-text' }, st.error) : null,
      st.error && st.detail ? h('p', { class: 'hint' }, `Details: ${st.detail}`) : null,
      store.schemaOutdated() ? h('p', { class: 'warn-text' }, 'The database needs a one-time update for favourites: run supabase/schema.sql again in the Supabase SQL Editor (see SETUP.md).') : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => store.sync() }, 'Sync now'),
    ].filter(Boolean));
  }

  // ---- targets -------------------------------------------------------------------------------------
  const inputs = {};
  const fillTargets = () => { const s = store.getSettings(); for (const [k] of TARGETS) if (document.activeElement !== inputs[k]) inputs[k].value = s[k]; };
  const targetsCard = h('div', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Daily targets'),
    h('p', { class: 'hint' }, 'Calories are "on target" within ± the band of the target. Protein is "hit" at the mark below.'),
    h('div', { class: 'grid2' }, TARGETS.map(([k, label]) => { inputs[k] = numInput(''); return field(label, inputs[k]); })),
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const patch = {};
        for (const [k, label] of TARGETS) {
          const n = numOrNull(inputs[k].value);
          if (n === null || n < 0) { toast(`${label} needs a number`, 'bad'); return; }
          patch[k] = n;
        }
        store.saveSettings(patch);
        toast('Saved');
      } }, 'Save'),
      h('button', { class: 'btn', type: 'button', onclick: () => { for (const [k] of TARGETS) inputs[k].value = DEFAULT_SETTINGS[k]; } }, 'Restore defaults')));
  fillTargets();

  // ---- CSV -----------------------------------------------------------------------------------------
  const from = h('input', { type: 'date', value: addDays(todayStr(), -29) });
  const to = h('input', { type: 'date', value: todayStr() });
  const csvMsg = h('p', { class: 'hint', role: 'status' });
  async function download() {
    if (!from.value || !to.value || from.value > to.value) { csvMsg.textContent = 'Pick a valid date range.'; return; }
    csvMsg.textContent = 'Preparing…';
    const { entries, fromSheet } = await store.entriesForExport(from.value, to.value);
    const blob = new Blob(['﻿' + toCsv(entries)], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `calorie-tracker_${from.value}_to_${to.value}.csv` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    csvMsg.textContent = `${entries.length} entries${store.isDemo() ? ' (demo data)' : fromSheet ? ' from the database' : ' from this phone’s cache (could not reach the database)'}.`;
  }
  const csvCard = h('div', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Export'),
    h('p', { class: 'hint' }, 'A CSV of your log. Worth saving now and then as a backup.'),
    h('div', { class: 'grid2' }, field('From', from), field('To', to)),
    h('button', { class: 'btn', type: 'button', onclick: download }, 'Download CSV'), csvMsg);

  el.append(
    largeTitle('Settings', 'Targets, database and export'),
    connGroup, targetsCard, csvCard);
  renderSync();

  return {
    el,
    title: 'Settings',
    renderSync,
    update() { renderSync(); fillTargets(); },
    onShow() { renderSync(); },
  };
}
