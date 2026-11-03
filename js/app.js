import { h, fmtLong, todayStr } from './util.js';
import * as store from './store.js';
import { nav } from './components.js';
import { createTodayView } from './views/today.js';
import { createAddView } from './views/add.js';
import { createWeekView } from './views/week.js';
import { createMonthView } from './views/month.js';
import { createSettingsView } from './views/settings.js';

const TABS = [
  ['today', 'Today', 'M4 5h16v14H4zM4 10h16M9 5v14'],
  ['add', 'Add', 'M12 5v14M5 12h14'],
  ['week', 'Week', 'M5 20V10M12 20V4M19 20v-7'],
  ['month', 'Month', 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'],
  ['settings', 'Settings', 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6'],
];

// Load saved connection + cache first: views read the store while they are being built.
store.init();

const views = {
  today: createTodayView(),
  add: createAddView(),
  week: createWeekView(),
  month: createMonthView(),
  settings: createSettingsView(),
};

const main = document.getElementById('main');
const nav$ = document.getElementById('tabbar');
const chip = document.getElementById('sync-chip');
const dateEl = document.getElementById('today-date');
const banner = document.getElementById('demo-banner');

let current = 'today';

function icon(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tab-icon');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

function go(tab) {
  if (!views[tab]) return;
  current = tab;
  for (const [id, v] of Object.entries(views)) v.el.hidden = id !== tab;
  nav$.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  views[tab].onShow?.();
  window.scrollTo(0, 0);
  try { history.replaceState(null, '', `#${tab}`); } catch { /* ignore */ }
}
nav.go = go;

function renderChrome() {
  dateEl.textContent = fmtLong(todayStr());
  const st = store.syncStatus();
  chip.textContent = st.text;
  chip.dataset.kind = st.kind;
  banner.hidden = st.kind !== 'demo';
}

function renderAll() {
  renderChrome();
  for (const v of Object.values(views)) v.update?.();
}

// ---- boot --------------------------------------------------------------------------
TABS.forEach(([id, label, d]) => nav$.append(h('button', { type: 'button', class: 'tab', dataset: { tab: id }, onclick: () => go(id) }, icon(d), h('span', {}, label))));
Object.values(views).forEach((v) => { v.el.hidden = true; main.append(v.el); });

store.subscribe((kind) => (kind === 'sync' ? renderChrome() : renderAll()));
chip.addEventListener('click', () => { if (!store.isDemo()) store.sync(); else go('settings'); });
banner.querySelector('button').addEventListener('click', () => go('settings'));

// Retry triggers: open, focus / visible, back online, and a timer while something is waiting.
const retry = () => { if (!document.hidden) store.sync(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderAll(); retry(); } });
window.addEventListener('focus', retry);
window.addEventListener('online', retry);
setInterval(() => { if (!store.isDemo() && store.syncStatus().pending) store.sync(); }, 30000);

const start = location.hash.slice(1);
go(views[start] ? start : 'today');
renderAll();
