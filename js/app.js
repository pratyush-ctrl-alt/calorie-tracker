import { h, svgEl } from './util.js';
import * as store from './store.js';
import { nav } from './components.js';
import { createTodayView } from './views/today.js';
import { createLogView } from './views/log.js';
import { createItemsView } from './views/items.js';
import { createTrendsView } from './views/trends.js';
import { createSettingsView } from './views/settings.js';

// Tab icons: simple strokes in the style of SF Symbols.
const TABS = [
  ['today', 'Today', ['M4 6.5h16', 'M4 12h11', 'M4 17.5h6.5']],
  ['log', 'Log', ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8v8', 'M8 12h8']],
  ['items', 'My Items', ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01']],
  ['trends', 'Trends', ['M5 20V10', 'M12 20V4', 'M19 20v-7']],
  ['settings', 'Settings', ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10', 'M16 4v6', 'M8 14v6']],
];

// Load saved connection + cache first: views read the store while they are being built.
store.init();

const views = {
  today: createTodayView(),
  log: createLogView(),
  items: createItemsView(),
  trends: createTrendsView(),
  settings: createSettingsView(),
};

const main = document.getElementById('main');
const tabbar = document.getElementById('tabbar');
const navbar = document.getElementById('navbar');
const navTitle = document.getElementById('nav-title');
const chip = document.getElementById('sync-chip');
const banner = document.getElementById('demo-banner');

function icon(paths) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'tab-icon', 'aria-hidden': 'true' });
  for (const d of paths) svg.append(svgEl('path', { d }));
  return svg;
}

function go(tab) {
  if (!views[tab]) return;
  for (const [id, v] of Object.entries(views)) v.el.hidden = id !== tab;
  tabbar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  navTitle.textContent = views[tab].title ?? '';
  views[tab].onShow?.();
  window.scrollTo(0, 0);
  navbar.classList.remove('scrolled');
  try { history.replaceState(null, '', `#${tab}`); } catch { /* ignore */ }
}
nav.go = go;

function renderChrome() {
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
TABS.forEach(([id, label, paths]) => tabbar.append(h('button', { type: 'button', class: 'tab', dataset: { tab: id }, onclick: () => go(id) }, icon(paths), h('span', {}, label))));
Object.values(views).forEach((v) => { v.el.hidden = true; main.append(v.el); });

store.subscribe((kind) => { if (kind === 'sync') { renderChrome(); views.settings.renderSync(); } else renderAll(); });
chip.addEventListener('click', () => { if (!store.isDemo()) store.sync(); else go('settings'); });
banner.querySelector('button').addEventListener('click', () => go('settings'));

// The large title collapses into the bar once you scroll, like iOS.
window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 44), { passive: true });

// Retry triggers: open, focus / visible, back online, and a timer while something is waiting.
const retry = () => { if (!document.hidden) store.sync(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderAll(); retry(); } });
window.addEventListener('focus', retry);
window.addEventListener('online', retry);
setInterval(() => { if (!store.isDemo() && store.syncStatus().pending) store.sync(); }, 30000);

const start = location.hash.slice(1);
go(views[start] ? start : 'today');
renderAll();
