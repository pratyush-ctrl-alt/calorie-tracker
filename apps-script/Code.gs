/**
 * Plate Log: Google Apps Script backend.
 *
 * Paste this whole file into Extensions -> Apps Script of your Google Sheet, add a Script Property
 * named TOKEN (a long random value), then Deploy -> New deployment -> Web app
 * (Execute as: Me, Who has access: Anyone). See SETUP.md.
 *
 * Every request must carry the token. Tabs and headers are created on demand.
 *
 *   GET  ?action=ping&token=...
 *   GET  ?action=list&token=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   GET  ?action=config&token=...
 *   POST {token, action:"upsert", entries:[...]}
 *   POST {token, action:"saveItem", item:{...}}
 *   POST {token, action:"deleteItem", name:"..."}
 *   POST {token, action:"saveSettings", settings:{...}}
 *
 * Answers are JSON: {ok:true, ...} or {ok:false, error:"plain English reason"}.
 */

var LOG_HEADERS = ['id', 'date', 'time', 'slot', 'name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g',
  'source', 'on_plan', 'group', 'note', 'created_at', 'updated_at', 'deleted'];
var ITEM_HEADERS = ['name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'default_slot', 'on_plan', 'aliases'];
var SETTING_HEADERS = ['key', 'value'];
var NUM_COLS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'];
var SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Workout'];
var SOURCES = ['line', 'kenko', 'plan', 'saved', 'manual'];
var DEFAULT_SETTINGS = [
  ['calorie_target', 2037], ['protein_target_g', 134], ['calorie_band_pct', 10], ['protein_hit_g', 120],
  ['fat_limit_g', 60], ['fibre_target_g', 30], ['kenko_kcal', 580], ['kenko_protein_g', 50],
  ['kenko_carbs_g', 61], ['kenko_fat_g', 15], ['kenko_fibre_g', 6]
];

// ---------------------------------------------------------------- entry points

function doGet(e) {
  return handle_(function () {
    var p = (e && e.parameter) || {};
    var denied = checkToken_(p.token);
    if (denied) return denied;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureTabs_(ss);
    switch (p.action) {
      case 'ping': return { ok: true, sheetName: ss.getName() };
      case 'list': return listEntries_(ss, p.from, p.to);
      case 'config': return getConfig_(ss);
      default: return fail_('Unknown action "' + p.action + '".');
    }
  });
}

function doPost(e) {
  return handle_(function () {
    var body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || ''); }
    catch (err) { return fail_('The request body was not valid JSON.'); }
    var denied = checkToken_(body && body.token);
    if (denied) return denied;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureTabs_(ss);
    var lock = LockService.getScriptLock();
    try { lock.waitLock(20000); }
    catch (err) { return fail_('The Sheet is busy right now. Try again in a moment.', 'busy'); }
    try {
      switch (body.action) {
        case 'upsert': return upsertEntries_(ss, body.entries);
        case 'saveItem': return saveItem_(ss, body.item);
        case 'deleteItem': return deleteItem_(ss, body.name);
        case 'saveSettings': return saveSettings_(ss, body.settings);
        default: return fail_('Unknown action "' + body.action + '".');
      }
    } finally {
      lock.releaseLock();
    }
  });
}

/** Run this once from the editor (Run -> setup) to grant permissions and create the tabs. */
function setup() {
  ensureTabs_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log('Tabs ready. Now set the TOKEN script property and deploy as a web app.');
}

// ---------------------------------------------------------------- helpers

function handle_(fn) {
  var out;
  try { out = fn(); }
  catch (err) { out = fail_('Something went wrong in the script: ' + (err && err.message ? err.message : err)); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(message, code) {
  var r = { ok: false, error: message };
  if (code) r.code = code;
  return r;
}

function checkToken_(given) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) {
    return fail_('The TOKEN script property is not set. Add it in Project Settings -> Script Properties.', 'no_token_configured');
  }
  given = String(given || '');
  var diff = given.length === expected.length ? 0 : 1;
  for (var i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0 ? null : fail_('Wrong or missing token.', 'bad_token');
}

function ensureSheet_(ss, name, headers, onInit) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var current = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var same = true;
  for (var i = 0; i < headers.length; i++) if (current[i] !== headers[i]) same = false;
  if (!same) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (onInit) onInit(sh);
  }
  return sh;
}

function ensureTabs_(ss) {
  ensureSheet_(ss, 'Log', LOG_HEADERS, function (sh) {
    // Text columns stay plain text, otherwise Sheets turns "2026-11-02" / "09:30" / ISO timestamps into
    // Date values. Columns: id, date, time, slot, name | source | group, note, created_at, updated_at.
    var rows = sh.getMaxRows();
    sh.getRange(1, 1, rows, 5).setNumberFormat('@');
    sh.getRange(1, 11, rows, 1).setNumberFormat('@');
    sh.getRange(1, 13, rows, 4).setNumberFormat('@');
  });
  ensureSheet_(ss, 'Items', ITEM_HEADERS, function (sh) {
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
    sh.getRange(1, 7, sh.getMaxRows(), 1).setNumberFormat('@');
    sh.getRange(1, 9, sh.getMaxRows(), 1).setNumberFormat('@');
  });
  var settings = ensureSheet_(ss, 'Settings', SETTING_HEADERS);
  var last = settings.getLastRow();
  var have = {};
  if (last > 1) {
    settings.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[String(r[0])] = true; });
  }
  var add = DEFAULT_SETTINGS.filter(function (kv) { return !have[kv[0]]; });
  if (add.length) settings.getRange(settings.getLastRow() + 1, 1, add.length, 2).setValues(add);
}

function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); }

function textDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v === null || v === undefined ? '' : v);
}
function textTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  return String(v === null || v === undefined ? '' : v);
}
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function numCell_(v, label) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  if (!isFinite(n)) throw new Error(label + ' must be a number.');
  return n;
}
function numOut_(v) { return v === '' || v === null ? null : Number(v); }

// ---------------------------------------------------------------- Log

function entryToRow_(e) {
  if (!e || typeof e !== 'object') throw new Error('An entry was missing.');
  var id = String(e.id || '').trim();
  if (!id) throw new Error('An entry has no id.');
  var name = String(e.name || '').trim();
  if (!name) throw new Error('Entry ' + id + ' needs a name.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) throw new Error('Entry "' + name + '" needs a date like 2026-11-02.');
  if (SLOTS.indexOf(e.slot) < 0) throw new Error('Entry "' + name + '" has an unknown slot "' + e.slot + '".');
  var kcal = numCell_(e.kcal, 'kcal'), protein = numCell_(e.protein_g, 'protein_g');
  if (kcal === '') throw new Error('Entry "' + name + '" needs kcal.');
  if (protein === '') throw new Error('Entry "' + name + '" needs protein.');
  var source = SOURCES.indexOf(e.source) >= 0 ? e.source : 'manual';
  var now = new Date().toISOString();
  return [
    id, String(e.date), String(e.time || ''), e.slot, name, kcal, protein,
    numCell_(e.carbs_g, 'carbs_g'), numCell_(e.fat_g, 'fat_g'), numCell_(e.fibre_g, 'fibre_g'),
    source, bool_(e.on_plan), String(e.group || ''), String(e.note || ''),
    String(e.created_at || now), String(e.updated_at || now), bool_(e.deleted)
  ];
}

function rowToEntry_(r) {
  return {
    id: String(r[0]), date: textDate_(r[1]), time: textTime_(r[2]), slot: r[3], name: r[4],
    kcal: numOut_(r[5]), protein_g: numOut_(r[6]), carbs_g: numOut_(r[7]), fat_g: numOut_(r[8]), fibre_g: numOut_(r[9]),
    source: r[10], on_plan: bool_(r[11]), group: r[12], note: r[13],
    created_at: String(r[14]), updated_at: String(r[15]), deleted: bool_(r[16])
  };
}

function upsertEntries_(ss, entries) {
  if (!Array.isArray(entries) || !entries.length) return fail_('No entries were sent.');
  if (entries.length > 200) return fail_('Too many entries in one request (max 200).');
  var rows = {}, order = [];
  entries.forEach(function (e) {
    var row = entryToRow_(e);               // throws a plain-English error on bad input
    if (!rows[row[0]]) order.push(row[0]);
    if (!rows[row[0]] || String(row[15]) >= String(rows[row[0]][15])) rows[row[0]] = row; // latest edit of an id wins
  });

  var sh = ss.getSheetByName('Log');
  var last = sh.getLastRow();
  var existing = {};
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    var upd = sh.getRange(2, 16, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) existing[String(ids[i][0])] = { row: i + 2, updated: String(upd[i][0]) };
  }
  var append = [];
  order.forEach(function (id) {
    var row = rows[id], ex = existing[id];
    if (ex) {
      if (ex.updated > String(row[15])) return;  // the Sheet already has a newer version
      sh.getRange(ex.row, 1, 1, LOG_HEADERS.length).setValues([row]);
    } else {
      append.push(row);
    }
  });
  if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, LOG_HEADERS.length).setValues(append);
  return { ok: true, saved: order };
}

function listEntries_(ss, from, to) {
  var re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(from || '')) || !re.test(String(to || ''))) return fail_('"from" and "to" must be dates like 2026-11-02.');
  var sh = ss.getSheetByName('Log');
  var last = sh.getLastRow();
  var out = [];
  if (last > 1) {
    sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues().forEach(function (r) {
      if (!r[0]) return;
      var d = textDate_(r[1]);
      if (d >= from && d <= to) out.push(rowToEntry_(r));
    });
  }
  out.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
  return { ok: true, entries: out };
}

// ---------------------------------------------------------------- Items & Settings

function itemToRow_(it) {
  if (!it || typeof it !== 'object') throw new Error('The item was missing.');
  var name = String(it.name || '').trim();
  if (!name) throw new Error('The item needs a name.');
  var kcal = numCell_(it.kcal, 'kcal'), protein = numCell_(it.protein_g, 'protein_g');
  if (kcal === '') throw new Error('The item needs kcal.');
  if (protein === '') throw new Error('The item needs protein.');
  return [name, kcal, protein, numCell_(it.carbs_g, 'carbs_g'), numCell_(it.fat_g, 'fat_g'), numCell_(it.fibre_g, 'fibre_g'),
    SLOTS.indexOf(it.default_slot) >= 0 ? it.default_slot : '', bool_(it.on_plan), String(it.aliases || '')];
}

function findItemRow_(sh, name) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var names = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim().toLowerCase() === String(name).trim().toLowerCase()) return i + 2;
  }
  return 0;
}

function saveItem_(ss, item) {
  var row = itemToRow_(item);
  var sh = ss.getSheetByName('Items');
  var at = findItemRow_(sh, row[0]);
  if (at) sh.getRange(at, 1, 1, ITEM_HEADERS.length).setValues([row]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, ITEM_HEADERS.length).setValues([row]);
  return { ok: true, name: row[0] };
}

function deleteItem_(ss, name) {
  if (!String(name || '').trim()) return fail_('Say which item to delete.');
  var sh = ss.getSheetByName('Items');
  var at = findItemRow_(sh, name);
  if (at) sh.deleteRow(at);
  return { ok: true, deleted: !!at };
}

function saveSettings_(ss, settings) {
  if (!settings || typeof settings !== 'object') return fail_('No settings were sent.');
  var known = {};
  DEFAULT_SETTINGS.forEach(function (kv) { known[kv[0]] = true; });
  var sh = ss.getSheetByName('Settings');
  var last = sh.getLastRow();
  var rowOf = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { rowOf[String(r[0])] = i + 2; });
  var keys = Object.keys(settings);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!known[k]) return fail_('Unknown setting "' + k + '".');
    var n = Number(settings[k]);
    if (settings[k] === '' || settings[k] === null || !isFinite(n)) return fail_('Setting "' + k + '" must be a number.');
  }
  keys.forEach(function (k) {
    if (rowOf[k]) sh.getRange(rowOf[k], 2).setValue(Number(settings[k]));
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setValues([[k, Number(settings[k])]]);
  });
  return { ok: true, saved: keys };
}

function getConfig_(ss) {
  var settings = {};
  var s = ss.getSheetByName('Settings');
  if (s.getLastRow() > 1) {
    s.getRange(2, 1, s.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0] === '') return;
      var n = Number(r[1]);
      settings[String(r[0])] = r[1] !== '' && isFinite(n) ? n : r[1];
    });
  }
  var items = [];
  var it = ss.getSheetByName('Items');
  if (it.getLastRow() > 1) {
    it.getRange(2, 1, it.getLastRow() - 1, ITEM_HEADERS.length).getValues().forEach(function (r) {
      if (!r[0]) return;
      items.push({
        name: String(r[0]), kcal: numOut_(r[1]), protein_g: numOut_(r[2]), carbs_g: numOut_(r[3]), fat_g: numOut_(r[4]),
        fibre_g: numOut_(r[5]), default_slot: String(r[6] || ''), on_plan: bool_(r[7]), aliases: String(r[8] || '')
      });
    });
  }
  return { ok: true, settings: settings, items: items };
}
