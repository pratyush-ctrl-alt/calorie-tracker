// Runs apps-script/Code.gs against a small in-memory fake of SpreadsheetApp, so the backend logic
// (token check, idempotent upsert, list, items, settings) is tested without Google.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function makeSheet(name) {
  const rows = []; // rows[r][c], 0-based
  const sh = {
    name,
    getLastRow: () => rows.length,
    getMaxRows: () => Math.max(rows.length, 1000),
    setFrozenRows() {},
    deleteRow(r) { rows.splice(r - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
        setValues(vals) {
          vals.forEach((row, i) => { rows[r - 1 + i] ??= []; row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; }); });
          return this;
        },
        setValue(v) { return this.setValues([[v]]); },
        setFontWeight() { return this; },
        setNumberFormat() { return this; },
      };
    },
  };
  return sh;
}

function load(token = 'secret') {
  const sheets = {};
  const ss = {
    getName: () => 'My Food Sheet',
    getSpreadsheetTimeZone: () => 'Asia/Kolkata',
    getSheetByName: (n) => sheets[n] ?? null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'TOKEN' ? token : null) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    Logger: { log() {} },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const get = (params) => JSON.parse(ctx.doGet({ parameter: params }).text);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  return { get, post, sheets };
}

const entry = (o = {}) => ({
  id: 'a1', date: '2026-11-02', time: '13:10', slot: 'Lunch', name: 'Dal rice', kcal: 700, protein_g: 28, carbs_g: 90,
  fat_g: null, fibre_g: null, source: 'line', on_plan: false, group: '', note: '', created_at: '2026-11-02T07:40:00.000Z',
  updated_at: '2026-11-02T07:40:00.000Z', deleted: false, ...o,
});

test('ping needs the right token', () => {
  const api = load();
  assert.deepEqual(api.get({ action: 'ping', token: 'secret' }), { ok: true, sheetName: 'My Food Sheet' });
  const bad = api.get({ action: 'ping', token: 'nope' });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'bad_token');
  assert.equal(api.get({ action: 'ping' }).ok, false);
  assert.equal(api.post({ token: 'nope', action: 'upsert', entries: [entry()] }).ok, false);
  assert.equal(load('').get({ action: 'ping', token: '' }).ok, false, 'no TOKEN property set -> refuse everything');
});

test('tabs and headers are created, settings are seeded', () => {
  const api = load();
  const cfg = api.get({ action: 'config', token: 'secret' });
  assert.equal(cfg.ok, true);
  assert.equal(cfg.settings.calorie_target, 2037);
  assert.equal(cfg.settings.kenko_protein_g, 50);
  assert.deepEqual(cfg.items, []);
  assert.equal(api.sheets.Log.getRange(1, 1, 1, 17).getValues()[0][16], 'deleted');
  assert.equal(api.sheets.Items.getRange(1, 1, 1, 9).getValues()[0][8], 'aliases');
});

test('upsert is idempotent: a retried request never duplicates a row', () => {
  const api = load();
  const body = { token: 'secret', action: 'upsert', entries: [entry()] };
  assert.deepEqual(api.post(body), { ok: true, saved: ['a1'] });
  assert.deepEqual(api.post(body), { ok: true, saved: ['a1'] });
  assert.equal(api.sheets.Log.getLastRow(), 2);
  const edit = api.post({ token: 'secret', action: 'upsert', entries: [entry({ kcal: 650, updated_at: '2026-11-02T08:00:00.000Z' })] });
  assert.equal(edit.ok, true);
  assert.equal(api.sheets.Log.getLastRow(), 2);
  const listed = api.get({ action: 'list', token: 'secret', from: '2026-11-01', to: '2026-11-02' });
  assert.equal(listed.entries.length, 1);
  assert.equal(listed.entries[0].kcal, 650);
  assert.equal(listed.entries[0].fat_g, null, 'blank stays unknown');
  assert.equal(listed.entries[0].on_plan, false);
});

test('an older retry never overwrites a newer edit', () => {
  const api = load();
  api.post({ token: 'secret', action: 'upsert', entries: [entry({ kcal: 650, updated_at: '2026-11-02T09:00:00.000Z' })] });
  api.post({ token: 'secret', action: 'upsert', entries: [entry({ kcal: 999, updated_at: '2026-11-02T08:00:00.000Z' })] });
  assert.equal(api.get({ action: 'list', token: 'secret', from: '2026-11-02', to: '2026-11-02' }).entries[0].kcal, 650);
});

test('soft delete keeps the row and returns the deleted flag', () => {
  const api = load();
  api.post({ token: 'secret', action: 'upsert', entries: [entry()] });
  api.post({ token: 'secret', action: 'upsert', entries: [entry({ deleted: true, updated_at: '2026-11-02T10:00:00.000Z' })] });
  const e = api.get({ action: 'list', token: 'secret', from: '2026-11-02', to: '2026-11-02' }).entries;
  assert.equal(e.length, 1);
  assert.equal(e[0].deleted, true);
});

test('list filters by date range', () => {
  const api = load();
  api.post({ token: 'secret', action: 'upsert', entries: [entry({ id: 'x1', date: '2026-10-01' }), entry({ id: 'x2', date: '2026-11-02' }), entry({ id: 'x3', date: '2026-11-05' })] });
  const ids = api.get({ action: 'list', token: 'secret', from: '2026-10-15', to: '2026-11-03' }).entries.map((e) => e.id);
  assert.deepEqual(ids, ['x2']);
  assert.equal(api.get({ action: 'list', token: 'secret', from: 'bad', to: '2026-11-03' }).ok, false);
});

test('bad input returns a plain-English error', () => {
  const api = load();
  const r1 = api.post({ token: 'secret', action: 'upsert', entries: [entry({ protein_g: null })] });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /protein/);
  assert.match(api.post({ token: 'secret', action: 'upsert', entries: [entry({ slot: 'Brunch' })] }).error, /slot/);
  assert.match(api.post('{not json').error, /JSON/);
  assert.match(api.post({ token: 'secret', action: 'nope' }).error, /Unknown action/);
  assert.equal(api.sheets.Log.getLastRow(), 1, 'nothing written for rejected input');
});

test('items: add, update by name, delete', () => {
  const api = load();
  const item = { name: 'Coffee', kcal: 60, protein_g: 2, carbs_g: 8, fat_g: 2, fibre_g: 0, default_slot: 'Snack', on_plan: false, aliases: 'chai' };
  assert.equal(api.post({ token: 'secret', action: 'saveItem', item }).ok, true);
  assert.equal(api.post({ token: 'secret', action: 'saveItem', item: { ...item, name: 'coffee', kcal: 70 } }).ok, true);
  let items = api.get({ action: 'config', token: 'secret' }).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].kcal, 70);
  assert.equal(items[0].aliases, 'chai');
  assert.equal(api.post({ token: 'secret', action: 'deleteItem', name: 'COFFEE' }).ok, true);
  assert.equal(api.get({ action: 'config', token: 'secret' }).items.length, 0);
});

test('settings: save known keys, reject unknown or non-numeric', () => {
  const api = load();
  assert.equal(api.post({ token: 'secret', action: 'saveSettings', settings: { calorie_target: 1900 } }).ok, true);
  assert.equal(api.get({ action: 'config', token: 'secret' }).settings.calorie_target, 1900);
  assert.equal(api.post({ token: 'secret', action: 'saveSettings', settings: { nope: 1 } }).ok, false);
  assert.equal(api.post({ token: 'secret', action: 'saveSettings', settings: { calorie_target: 'abc' } }).ok, false);
});
