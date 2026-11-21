// The day the Diary is showing, shared with the Add screen so food is logged to the day you are looking at.
// null means "follow today", so the app rolls over at midnight without anyone touching it.
import { todayStr } from './util.js';

let picked = null;
let preferredSlot = null;

export const getDay = () => (picked && picked < todayStr() ? picked : todayStr());
export const isToday = () => getDay() === todayStr();
export function setDay(date) { picked = !date || date >= todayStr() ? null : date; }

/** A meal chosen from the Diary's "+ Add" on a meal, used once by the Add screen. */
export function setPreferredSlot(slot) { preferredSlot = slot ?? null; }
export function takePreferredSlot() { const s = preferredSlot; preferredSlot = null; return s; }
