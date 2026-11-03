// Tests supabase/schema.sql against a real, throwaway PostgreSQL (started in a temp folder, unix
// socket only). It plays the part of Supabase's public key by running as the `anon` role, so it also
// proves the tables are locked and the token gate works.
// Skipped automatically when PostgreSQL is not installed.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN = 'a-long-random-test-token-1234567890';
const PORT = '54329';

function findBin() {
  const dirs = [];
  try { for (const v of readdirSync('/usr/lib/postgresql')) dirs.push(`/usr/lib/postgresql/${v}/bin`); } catch { /* none */ }
  dirs.push(...(process.env.PATH ?? '').split(':'));
  return dirs.find((d) => existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl')) && existsSync(join(d, 'psql')));
}
const BIN = findBin();
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
let dir;

function run(cmd, args, opts = {}) {
  const full = asRoot ? ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : [cmd, args];
  return spawnSync(full[0], full[1], { encoding: 'utf8', ...opts });
}

function psql(sql, { role } = {}) {
  const prefix = role ? `set role ${role};\n` : '';
  const r = run(join(BIN, 'psql'), ['-h', dir, '-p', PORT, '-U', 'postgres', '-d', 'plate', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: prefix + sql });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

const lit = (v) => `$j$${JSON.stringify(v)}$j$::jsonb`;
/** Call a plate_* function as the public (anon) role and parse the JSON it returns. */
function call(fn, args, { role = 'anon' } = {}) {
  const r = psql(`select ${fn}(${args});`, { role });
  if (!r.ok) return { ok: false, error: (r.err.match(/ERROR:\s+(?:PT\d+:\s+)?(.*)/)?.[1] ?? r.err).trim(), raw: r.err };
  const lines = r.out.split('\n').filter((l) => l.startsWith('{'));
  return JSON.parse(lines[0]);
}
const T = `'${TOKEN}'`;
const entry = (o = {}) => ({
  id: 'a1', date: '2026-11-02', time: '13:10', slot: 'Lunch', name: 'Dal rice', kcal: 700, protein_g: 28, carbs_g: 90,
  fat_g: null, fibre_g: null, source: 'line', on_plan: false, group: '', note: '',
  created_at: '2026-11-02T07:40:00.000Z', updated_at: '2026-11-02T07:40:00.000Z', deleted: false, ...o,
});
const upsert = (entries, token = T) => call('plate_upsert', `${token}, ${lit(entries)}`);
const list = (from = '2026-11-01', to = '2026-11-30') => call('plate_list', `${T}, '${from}', '${to}'`);

const skip = !BIN && 'PostgreSQL is not installed';

before(() => {
  if (skip) return;
  dir = mkdtempSync(join(tmpdir(), 'plate-pg-'));
  chmodSync(dir, 0o777);
  const data = join(dir, 'data');
  let r = run(join(BIN, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8']);
  assert.equal(r.status, 0, r.stderr);
  r = run(join(BIN, 'pg_ctl'), ['-D', data, '-o', `-p ${PORT} -k ${dir} -c listen_addresses=`, '-l', join(dir, 'log'), '-w', 'start']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(psql('create database plate;').ok || true);
  r = run(join(BIN, 'createdb'), ['-h', dir, '-p', PORT, '-U', 'postgres', 'plate']);
  assert.equal(r.status, 0, r.stderr);
  // stand-ins for the roles Supabase provides
  assert.ok(psql('create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;').ok);
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
    .replace(/'CHANGE-ME-TO-A-LONG-RANDOM-VALUE'(\)\s+-- <<< YOUR TOKEN)/, `'${TOKEN}'$1`);
  assert.ok(schema.includes(TOKEN), 'the token line was not found in schema.sql');
  const loaded = psql(schema);
  assert.ok(loaded.ok, loaded.err);
});

after(() => {
  if (skip || !dir) return;
  run(join(BIN, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
  rmSync(dir, { recursive: true, force: true });
});

test('schema can be run twice (safe to re-run) and keeps the token', { skip }, () => {
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const again = psql(schema); // placeholder token in the file must NOT replace the real one
  assert.ok(again.ok, again.err);
  assert.equal(call('plate_ping', T).ok, true);
});

test('the public key alone cannot touch the tables or the helpers', { skip }, () => {
  for (const sql of ['select * from plate_log', 'select * from plate_secret', 'select * from plate_items',
    'select * from plate_settings', "insert into plate_log (id) values ('x')", 'delete from plate_log',
    `select plate_auth('${TOKEN}')`]) {
    const r = psql(sql, { role: 'anon' });
    assert.equal(r.ok, false, `anon should be refused: ${sql}`);
    assert.match(r.err, /permission denied/);
  }
});

test('every function refuses a wrong, empty or missing token', { skip }, () => {
  const calls = [
    ['plate_ping', `'nope'`], ['plate_ping', 'null'], ['plate_ping', `''`],
    ['plate_list', `'nope', '2026-11-01', '2026-11-30'`], ['plate_config', `'nope'`],
    ['plate_upsert', `'nope', ${lit([entry()])}`], ['plate_save_item', `'nope', ${lit({ name: 'x', kcal: 1, protein_g: 1 })}`],
    ['plate_delete_item', `'nope', 'x'`], ['plate_save_settings', `'nope', ${lit({ calorie_target: 1 })}`],
  ];
  for (const [fn, args] of calls) {
    const r = psql(`select ${fn}(${args});`, { role: 'anon' });
    assert.equal(r.ok, false, fn);
    assert.match(r.err, /PT401|Wrong or missing token/, fn);
  }
  assert.equal(psql('select count(*) from plate_log').out, '0', 'nothing was written');
});

test('the shipped placeholder token is refused, so a forgotten edit is not a backdoor', { skip }, () => {
  assert.ok(psql(`update plate_secret set token = 'CHANGE-ME-TO-A-LONG-RANDOM-VALUE'`).ok);
  const r = call('plate_ping', `'CHANGE-ME-TO-A-LONG-RANDOM-VALUE'`);
  assert.equal(r.ok, false);
  assert.match(r.error, /not been set up/);
  assert.ok(psql(`update plate_secret set token = '${TOKEN}'`).ok);
});

test('ping, and the config seeds the default settings', { skip }, () => {
  assert.equal(call('plate_ping', T).ok, true);
  const cfg = call('plate_config', T);
  assert.equal(cfg.settings.calorie_target, 2037);
  assert.equal(cfg.settings.protein_target_g, 134);
  assert.equal(cfg.settings.kenko_protein_g, 50);
  assert.deepEqual(cfg.items, []);
});

test('upsert is idempotent: a retried request never duplicates a row', { skip }, () => {
  const a = upsert([entry()]);
  assert.equal(a.ok, true);
  assert.deepEqual(a.saved, ['a1']);
  assert.equal(upsert([entry()]).ok, true);
  assert.equal(psql('select count(*) from plate_log').out, '1');
  assert.equal(upsert([entry({ kcal: 650, updated_at: '2026-11-02T08:00:00.000Z' })]).ok, true);
  const rows = list().entries;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kcal, 650);
  assert.equal(rows[0].fat_g, null, 'blank stays unknown, not zero');
  assert.equal(rows[0].on_plan, false);
  assert.equal(rows[0].date, '2026-11-02');
  assert.equal(rows[0].group, '');
});

test('an older retry never overwrites a newer edit', { skip }, () => {
  upsert([entry({ id: 'n1', kcal: 650, updated_at: '2026-11-02T09:00:00.000Z' })]);
  upsert([entry({ id: 'n1', kcal: 999, updated_at: '2026-11-02T08:00:00.000Z' })]);
  assert.equal(list().entries.find((e) => e.id === 'n1').kcal, 650);
});

test('the same id twice in one request: the latest edit wins and nothing errors', { skip }, () => {
  const r = upsert([entry({ id: 'd1', kcal: 100, updated_at: '2026-11-02T09:00:00.000Z' }), entry({ id: 'd1', kcal: 200, updated_at: '2026-11-02T10:00:00.000Z' })]);
  assert.equal(r.ok, true, r.error);
  assert.equal(list().entries.find((e) => e.id === 'd1').kcal, 200);
});

test('soft delete keeps the row and reports the deleted flag', { skip }, () => {
  upsert([entry({ id: 's1' })]);
  upsert([entry({ id: 's1', deleted: true, updated_at: '2026-11-02T11:00:00.000Z' })]);
  const row = list().entries.find((e) => e.id === 's1');
  assert.equal(row.deleted, true);
});

test('list filters by date range and sorts by date then time', { skip }, () => {
  upsert([entry({ id: 'r1', date: '2026-10-01' }), entry({ id: 'r2', date: '2026-11-05', time: '09:00' }), entry({ id: 'r3', date: '2026-11-05', time: '08:00' })]);
  assert.deepEqual(list('2026-11-04', '2026-11-06').entries.map((e) => e.id), ['r3', 'r2']);
  assert.ok(!list().entries.some((e) => e.id === 'r1'));
});

test('bad input gives a plain-English error and writes nothing', { skip }, () => {
  const before = psql('select count(*) from plate_log').out;
  assert.match(upsert([entry({ id: 'b1', protein_g: null })]).error, /needs protein/);
  assert.match(upsert([entry({ id: 'b2', kcal: undefined })]).error, /needs kcal/);
  assert.match(upsert([entry({ id: 'b3', slot: 'Brunch' })]).error, /unknown slot/);
  assert.match(upsert([entry({ id: 'b4', date: '11/02/2026' })]).error, /needs a date/);
  assert.match(upsert([entry({ id: 'b5', date: '2026-13-45' })]).error, /impossible date/);
  assert.match(upsert([entry({ id: 'b6', name: '  ' })]).error, /needs a name/);
  assert.match(upsert([entry({ id: 'b7', fat_g: -1 })]).error, /negative/);
  assert.match(upsert([]).error, /No entries/);
  // one bad entry in a batch rejects the whole batch (the app then retries entry by entry)
  assert.match(upsert([entry({ id: 'good1' }), entry({ id: 'bad1', slot: 'x' })]).error, /unknown slot/);
  assert.equal(psql('select count(*) from plate_log').out, before);
});

test('items: add, update by name (case-insensitive), delete', { skip }, () => {
  const item = { name: 'Coffee', kcal: 60, protein_g: 2, carbs_g: 8, fat_g: 2, fibre_g: 0, default_slot: 'Snack', on_plan: false, aliases: 'chai' };
  assert.equal(call('plate_save_item', `${T}, ${lit(item)}`).ok, true);
  assert.equal(call('plate_save_item', `${T}, ${lit({ ...item, name: 'coffee', kcal: 70 })}`).ok, true);
  let items = call('plate_config', T).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].kcal, 70);
  assert.equal(items[0].aliases, 'chai');
  assert.equal(items[0].default_slot, 'Snack');
  assert.match(call('plate_save_item', `${T}, ${lit({ name: 'x', kcal: 1 })}`).error, /protein/);
  assert.equal(call('plate_delete_item', `${T}, 'COFFEE'`).deleted, true);
  assert.equal(call('plate_config', T).items.length, 0);
});

test('favourites: pin up to 5, the 6th is refused, unpinning frees a slot, schema version is 2', { skip }, () => {
  const mk = (n, favorite) => ({ name: `Fav ${n}`, kcal: 100, protein_g: 5, default_slot: 'Snack', favorite });
  assert.equal(call('plate_config', T).schema, 2);
  for (let i = 1; i <= 5; i++) assert.equal(call('plate_save_item', `${T}, ${lit(mk(i, true))}`).ok, true, `pin ${i}`);
  const sixth = call('plate_save_item', `${T}, ${lit(mk(6, true))}`);
  assert.equal(sixth.ok, false);
  assert.match(sixth.error, /up to 5 favourites/);
  assert.equal(call('plate_save_item', `${T}, ${lit(mk(6, false))}`).ok, true, 'an unpinned 6th item is fine');
  assert.equal(call('plate_save_item', `${T}, ${lit(mk(1, true))}`).ok, true, 're-saving an already pinned item is fine');
  assert.equal(call('plate_save_item', `${T}, ${lit(mk(1, false))}`).ok, true);
  assert.equal(call('plate_save_item', `${T}, ${lit(mk(6, true))}`).ok, true, 'a slot was freed');
  const items = call('plate_config', T).items;
  assert.equal(items.filter((i) => i.favorite).length, 5);
  assert.equal(items.find((i) => i.name === 'Fav 1').favorite, false);
  for (let i = 1; i <= 6; i++) call('plate_delete_item', `${T}, 'Fav ${i}'`);
  assert.equal(call('plate_config', T).items.length, 0);
});

test('an item saved without a favorite key (older app version) is simply not pinned', { skip }, () => {
  assert.equal(call('plate_save_item', `${T}, ${lit({ name: 'Old', kcal: 10, protein_g: 1 })}`).ok, true);
  assert.equal(call('plate_config', T).items.find((i) => i.name === 'Old').favorite, false);
  call('plate_delete_item', `${T}, 'Old'`);
});

test('upgrading a version-1 database keeps its items and adds favourites', { skip }, () => {
  // simulate a database created before favourites existed
  assert.ok(psql(`alter table plate_items drop column favorite;`).ok);
  assert.ok(psql(`insert into plate_items (name_key, name, kcal, protein_g) values ('banana', 'Banana', 105, 1);`).ok);
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'); // placeholder token must not replace the real one
  const upgraded = psql(schema);
  assert.ok(upgraded.ok, upgraded.err);
  const item = call('plate_config', T).items.find((i) => i.name === 'Banana');
  assert.ok(item, 'existing item survived');
  assert.equal(item.favorite, false);
  assert.equal(call('plate_ping', T).ok, true, 'token survived');
  call('plate_delete_item', `${T}, 'Banana'`);
});

test('settings: save known keys, reject unknown or non-numeric', { skip }, () => {
  assert.equal(call('plate_save_settings', `${T}, ${lit({ calorie_target: 1900 })}`).ok, true);
  assert.equal(call('plate_config', T).settings.calorie_target, 1900);
  assert.match(call('plate_save_settings', `${T}, ${lit({ nope: 1 })}`).error, /Unknown setting/);
  assert.match(call('plate_save_settings', `${T}, ${lit({ calorie_target: 'abc' })}`).error, /must be a number/);
  assert.equal(call('plate_config', T).settings.calorie_target, 1900, 'rejected input changed nothing');
});

test('the signed-in role is locked out of the tables too', { skip }, () => {
  const r = psql('select * from plate_log', { role: 'authenticated' });
  assert.equal(r.ok, false);
  assert.match(r.err, /permission denied/);
});
