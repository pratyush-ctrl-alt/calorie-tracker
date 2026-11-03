import { h } from '../util.js';
import { largeTitle, segmented } from '../components.js';
import { createWeekView } from './week.js';
import { createMonthView } from './month.js';

/** Trends: the last 7 days and the month behind one Apple-style segmented control. */
export function createTrendsView() {
  const el = h('section', { class: 'view', id: 'view-trends', 'aria-label': 'Trends' });
  const week = createWeekView();
  const month = createMonthView();
  let mode = 'week';

  const show = () => {
    week.el.hidden = mode !== 'week';
    month.el.hidden = mode !== 'month';
    (mode === 'week' ? week : month).onShow?.();
  };
  const seg = segmented([{ value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Month' }], mode, (v) => { mode = v; show(); }, 'Period');

  el.append(largeTitle('Trends', 'How you are doing against your targets'), seg, week.el, month.el);
  month.el.hidden = true;

  return {
    el,
    title: 'Trends',
    update() { week.update(); month.update(); },
    onShow: show,
  };
}
