// Local-first store.
//
//  * Live mode (an Apps Script URL is set): every write lands in the local cache AND in a pending
//    queue (localStorage) first; the queue is flushed to the database in the background and is only
//    emptied for operations the database confirmed. A failed network never loses an entry.
//  * Demo mode (no URL): everything stays in a separate local namespace and nothing is ever sent.

import * as api from './api.js';
import { DEFAULT_SETTINGS } from './plan.js';
import { normalizeEntry, normalizeItem, buildEntry } from './entries.js';
import { addDays, todayStr, uuid } from './util.js';
import { DEMO_ITEMS, sampleEntries } from './demo.js';

export const CACHE_DAYS = 120;
const K = { conn: 'plate.conn', live: 'plate.live', queue: 'plate.queue', demo: 'plate.demo' };

// ---- storage with an in-memory fallback (private windows can throw) ----------
const mem = {};
const ls = {
  get(key, dflt) {
    if (key in mem) return mem[key];
    try {
      const v = localStorage.getItem(key);
      return v === null ? dflt : JSON.parse(v);
    } catch { return dflt; }
  },
  set(key, value) {
    mem[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* keep in memory */ }
  },
};

// ---- state -------------------------------------------------------------------
let conn = { url: '', key: '', token: '' };
let data = { entries: {}, items: [], settings: {}, fetchedAt: 0 };
let queue = [];
let flushing = false;
let flushAgain = false;
let refreshing = false;
let lastFail = false;     // last network attempt failed
let lastError = '';       // plain-English reason for the most recent problem
let lastDetail = '';      // technical detail for that problem (which call, HTTP status)
let lastSyncAt = 0;
const listeners = new Set();

export const isDemo = () => !conn.url;
export const getConn = () => ({ ...conn });
const emit = (kind) => listeners.forEach((fn) => { try { fn(kind); } catch (e) { console.error(e); } });
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function persist() {
  if (isDemo()) ls.set(K.demo, data);
  else { ls.set(K.live, data); ls.set(K.queue, queue); }
}

function loadNamespace() {
  if (isDemo()) {
    let d = ls.get(K.demo, null);
    if (!d) d = { entries: sampleEntries(), items: DEMO_ITEMS.map(normalizeItem), settings: {}, fetchedAt: 0 };
    data = d;
    queue = [];
  } else {
    data = ls.get(K.live, { entries: {}, items: [], settings: {}, fetchedAt: 0 });
    queue = ls.get(K.queue, []);
  }
  if (isDemo()) ls.set(K.demo, data);
}

export function init() {
  conn = { url: '', key: '', token: '', ...ls.get(K.conn, {}) };
  if (/script\.google/.test(conn.url)) conn = { url: '', key: '', token: '' }; // old Apps Script setup: start over in Demo mode
  loadNamespace();
  lastFail = false;
  lastError = '';
  lastDetail = '';
  emit('data');
  emit('sync');
  if (!isDemo()) { flush().then(refresh); }
}

export function setConn(next) {
  conn = { url: String(next.url ?? '').trim(), key: String(next.key ?? '').trim(), token: String(next.token ?? '').trim() };
  ls.set(K.conn, conn);
  loadNamespace();
  lastFail = false;
  lastError = '';
  lastDetail = '';
  emit('data');
  emit('sync');
  if (!isDemo()) { flush().then(refresh); }
}

export function resetDemo() {
  if (!isDemo()) return;
  data = { entries: sampleEntries(), items: DEMO_ITEMS.map(normalizeItem), settings: {}, fetchedAt: 0 };
  persist();
  emit('data');
}

// ---- reads -------------------------------------------------------------------
export function getSettings() {
  const s = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(data.settings ?? {})) {
    if (k in DEFAULT_SETTINGS) { const n = Number(v); if (v !== '' && v !== null && Number.isFinite(n)) s[k] = n; }
  }
  return s;
}
export const getItems = () => data.items.slice().sort((a, b) => a.name.localeCompare(b.name));
export const allEntries = () => Object.values(data.entries);

const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.created_at.localeCompare(b.created_at);
export function entriesBetween(from, to) {
  return allEntries().filter((e) => !e.deleted && e.date >= from && e.date <= to).sort(byTime);
}
export const entriesOn = (date) => entriesBetween(date, date);
export const getEntry = (id) => data.entries[id] ?? null;

// ---- sync status -------------------------------------------------------------
export function syncStatus() {
  const pending = queue.length;
  if (isDemo()) return { kind: 'demo', text: 'Demo mode', pending: 0, error: '' };
  if (flushing || refreshing) return { kind: 'syncing', text: pending ? `Syncing ${pending}…` : 'Syncing…', pending, error: lastError, detail: lastDetail };
  if (lastFail) return { kind: 'offline', text: "Can't reach database, will retry", pending, error: lastError, detail: lastDetail };
  if (lastError) return { kind: 'problem', text: 'Database problem, see Settings', pending, error: lastError, detail: lastDetail };
  if (pending) return { kind: 'waiting', text: `${pending} waiting to sync`, pending, error: '' };
  return { kind: 'saved', text: 'Saved', pending: 0, error: '' };
}
export const lastSync = () => lastSyncAt;

// ---- writes (local first, then queued) ----------------------------------------
function enqueue(op) {
  if (isDemo()) return;
  queue.push({ qid: uuid(), ...op });
}
function committed() {
  persist();
  emit('data');
  emit('sync');
  if (!isDemo()) flush();
}

export function addEntries(entries) {
  for (const e of entries) {
    data.entries[e.id] = e;
    enqueue({ op: 'upsert', entry: e });
  }
  committed();
}

export function updateEntry(entry) {
  const e = { ...entry, updated_at: new Date().toISOString() };
  data.entries[e.id] = e;
  enqueue({ op: 'upsert', entry: e });
  committed();
}

/** Soft delete: the row stays, flagged deleted, and reports ignore it. */
export function deleteEntry(id) {
  const cur = data.entries[id];
  if (!cur) return;
  updateEntry({ ...cur, deleted: true });
}

export function saveItem(item) {
  const it = normalizeItem(item);
  const i = data.items.findIndex((x) => x.name.toLowerCase() === it.name.toLowerCase());
  if (i >= 0) data.items[i] = it; else data.items.push(it);
  enqueue({ op: 'saveItem', item: it });
  committed();
}

export function deleteItem(name) {
  data.items = data.items.filter((x) => x.name.toLowerCase() !== name.toLowerCase());
  enqueue({ op: 'deleteItem', name });
  committed();
}

export function saveSettings(partial) {
  data.settings = { ...data.settings, ...partial };
  enqueue({ op: 'saveSettings', settings: partial });
  committed();
}

// ---- flush: pending queue -> database --------------------------------------------
const removeOps = (ids) => { queue = queue.filter((o) => !ids.has(o.qid)); };

async function sendEntries(entries) {
  try {
    await api.upsert(conn, entries);
    return new Set(entries.map((e) => e.id));
  } catch (err) {
    if (err.network || api.isFatal(err) || entries.length === 1) throw err;
    // One bad entry must not hold the rest hostage: retry them one by one.
    const saved = new Set();
    let firstErr = err;
    for (const e of entries) {
      try { await api.upsert(conn, [e]); saved.add(e.id); } catch (e2) { if (e2.network || api.isFatal(e2)) throw e2; firstErr = e2; }
    }
    lastError = firstErr.message;
    return saved;
  }
}

export async function flush() {
  if (isDemo()) return;
  if (flushing) { flushAgain = true; return; }
  flushing = true;
  emit('sync');
  try {
    do {
      flushAgain = false;
      const snap = queue.slice();
      if (!snap.length) break;
      let problem = '';

      // Entries: merge into one request, latest version of each id wins.
      const ups = snap.filter((o) => o.op === 'upsert');
      if (ups.length) {
        const latest = new Map(ups.map((o) => [o.entry.id, o.entry]));
        const saved = await sendEntries([...latest.values()]);
        removeOps(new Set(ups.filter((o) => saved.has(o.entry.id)).map((o) => o.qid)));
        if (saved.size < latest.size) problem = lastError || 'The database rejected an entry';
      }

      // Everything else, in order.
      for (const o of snap.filter((x) => x.op !== 'upsert')) {
        try {
          if (o.op === 'saveItem') await api.saveItem(conn, o.item);
          else if (o.op === 'deleteItem') await api.deleteItem(conn, o.name);
          else if (o.op === 'saveSettings') await api.saveSettings(conn, o.settings);
          removeOps(new Set([o.qid]));
        } catch (err) {
          if (err.network || api.isFatal(err)) throw err;
          problem = err.message;
        }
      }
      lastError = problem;
      persist();
    } while (flushAgain);
    lastFail = false;
  } catch (err) {
    lastDetail = err.detail ?? '';
    if (err.network) { lastFail = true; lastError = err.message; }
    else { lastFail = false; lastError = err.message; }
  } finally {
    flushing = false;
    persist();
    emit('sync');
  }
}

// ---- refresh: database -> local cache ---------------------------------------------
export async function refresh() {
  if (isDemo() || refreshing) return;
  refreshing = true;
  emit('sync');
  try {
    const today = todayStr();
    const from = addDays(today, -CACHE_DAYS);
    const [listed, cfg] = await Promise.all([api.list(conn, from, today), api.config(conn)]);

    const pendingIds = new Set(queue.filter((o) => o.op === 'upsert').map((o) => o.entry.id));
    const next = {};
    for (const id of pendingIds) if (data.entries[id]) next[id] = data.entries[id]; // local, unsynced edits win
    for (const row of listed.entries ?? []) {
      const e = normalizeEntry(row);
      if (!pendingIds.has(e.id)) next[e.id] = e;
    }
    data.entries = next;

    if (!queue.some((o) => o.op === 'saveSettings')) data.settings = cfg.settings ?? {};
    if (!queue.some((o) => o.op === 'saveItem' || o.op === 'deleteItem')) data.items = (cfg.items ?? []).map(normalizeItem);

    data.fetchedAt = Date.now();
    lastFail = false;
    lastError = '';
  lastDetail = '';
    lastSyncAt = Date.now();
    persist();
    emit('data');
  } catch (err) {
    lastFail = !!err.network;
    lastError = err.message;
    lastDetail = err.detail ?? '';
  } finally {
    refreshing = false;
    emit('sync');
  }
}

/** Run on app open, focus, back-online and a timer: push anything waiting, then pull the database. */
export async function sync() {
  if (isDemo()) return;
  await flush();
  await refresh();
}

/** Read a date range for CSV export. Live mode asks the database first and falls back to the cache. */
export async function entriesForExport(from, to) {
  if (!isDemo()) {
    try {
      const res = await api.list(conn, from, to);
      const pending = new Map(queue.filter((o) => o.op === 'upsert').map((o) => [o.entry.id, o.entry]));
      const rows = (res.entries ?? []).map(normalizeEntry).map((e) => pending.get(e.id) ?? e);
      for (const [id, e] of pending) if (!rows.some((r) => r.id === id) && e.date >= from && e.date <= to) rows.push(e);
      return { entries: rows.filter((e) => !e.deleted).sort(byTime), fromSheet: true };
    } catch { /* fall through to cache */ }
  }
  return { entries: entriesBetween(from, to), fromSheet: false };
}

export async function testConnection(c) {
  return api.ping({ url: String(c.url ?? '').trim(), key: String(c.key ?? '').trim(), token: String(c.token ?? '').trim() });
}

export { buildEntry };
