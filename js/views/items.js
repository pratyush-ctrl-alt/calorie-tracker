import { h, fmt } from '../util.js';
import { MAX_FAVORITES } from '../plan.js';
import { largeTitle, nav, openItemSheet, openQuickLog, starIcon, toast } from '../components.js';
import * as store from '../store.js';
import { getDay } from '../day-state.js';

/** My Items: everything you save. Star up to 5 to pin them to Quick add; most used ones fill the rest. */
export function createItemsView() {
  const el = h('section', { class: 'view', id: 'view-items', 'aria-label': 'My Items' });
  const ui = { q: '' };

  const search = h('input', {
    type: 'search', placeholder: 'Search My Items', autocomplete: 'off', 'aria-label': 'Search My Items',
    oninput: (e) => { ui.q = e.target.value; renderList(); },
  });
  const listBox = h('div', {});
  const noteBox = h('div', {});

  function row({ item, uses }) {
    const star = h('button', {
      class: 'star', type: 'button', 'aria-pressed': String(!!item.favorite), 'aria-label': item.favorite ? `Unpin ${item.name}` : `Pin ${item.name} to Quick add`,
      onclick: () => {
        const r = store.setFavorite(item.name, !item.favorite);
        if (!r.ok) toast(r.reason, 'bad');
      },
    }, starIcon());
    const sub = [`${fmt(item.kcal, 0)} kcal`, `${fmt(item.protein_g)} g protein`, uses ? `used ${uses}×` : '', item.on_plan ? '' : 'off plan'].filter(Boolean).join(' · ');
    return h('div', { class: 'item-row' },
      h('button', { class: 'row', type: 'button', onclick: () => openQuickLog(item, { getDate: getDay, onDone: (date) => nav.go('today', { date }) }) },
        h('span', { class: 'row-main' }, h('span', { class: 'row-label' }, item.name), h('span', { class: 'entry-sub' }, sub))),
      star,
      h('button', { class: 'dots', type: 'button', 'aria-label': `Edit ${item.name}`, onclick: () => openItemSheet(item) }, '•••'));
  }

  function renderList() {
    const q = ui.q.trim().toLowerCase();
    const all = store.sortedItems();
    const shown = q ? all.filter(({ item }) => `${item.name} ${item.aliases}`.toLowerCase().includes(q)) : all;
    listBox.replaceChildren(shown.length
      ? h('div', { class: 'group items-list' }, shown.map(row))
      : h('div', { class: 'card' }, h('p', { class: 'empty' }, all.length ? 'No items match.' : 'Nothing saved yet. Turn on "Save to My Items" when you log something, or tap + to add one.')));
  }

  function renderNote() {
    const pinned = store.getItems().filter((i) => i.favorite).length;
    noteBox.replaceChildren(
      store.schemaOutdated()
        ? h('p', { class: 'warn-text' }, 'Favourites need a one-time database update: run supabase/schema.sql again in Supabase (see SETUP.md). Until then Quick add shows your most used items.')
        : h('p', { class: 'footnote' }, `Star up to ${MAX_FAVORITES} items to pin them to Quick add (${pinned} of ${MAX_FAVORITES} pinned). Your most used items fill any free spots.`));
  }

  el.append(
    largeTitle('My Items', 'Everything you save lands here', h('button', { class: 'round-btn', type: 'button', 'aria-label': 'New item', onclick: () => openItemSheet(null) }, '+')),
    h('div', { class: 'search' }, search),
    noteBox,
    listBox);

  function render() { renderNote(); renderList(); }
  render();

  return {
    el,
    title: 'My Items',
    update: render, // only the note and the list are rebuilt, never the search box, so typing is not interrupted
    onShow: render,
  };
}
