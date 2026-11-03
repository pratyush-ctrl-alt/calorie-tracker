-- =====================================================================================
-- Plate Log: database setup for Supabase.   Paste this whole file into
-- Supabase -> SQL Editor -> New query, then press Run.   It is safe to run again.
--
-- STEP 1 (before running): find the single line ending in  <<< YOUR TOKEN  (about 25 lines
--         down). On that line only, replace the words between the quote marks with your own
--         long random text (30+ characters; letters and digits are easiest). Do NOT use
--         "replace all". You type the same token into the app's Settings screen.
--         Keep a copy in a password manager.
--
-- How it is protected: the tables are completely locked (row level security on, no
-- policies, no table privileges for the public key). The ONLY way in is through the
-- plate_* functions at the bottom, and every one of them first checks your token.
-- So the public "anon" key alone can read and write nothing.
--
-- To change the token later:   update plate_secret set token = 'new value';
-- =====================================================================================

-- ---------- the secret token (stays as first inserted; re-running does not overwrite it)
create table if not exists plate_secret (
  id    boolean primary key default true check (id),
  token text not null
);
insert into plate_secret (id, token)
values (true, 'CHANGE-ME-TO-A-LONG-RANDOM-VALUE')   -- <<< YOUR TOKEN
on conflict (id) do nothing;

-- ---------- Log: one row per entry. Deletes are soft (deleted = true).
-- A blank carbs / fat / fibre (null) means "unknown", not zero.
create table if not exists plate_log (
  id         text primary key,                     -- client-generated UUID, so retries never duplicate
  date       date not null,                        -- the phone's local calendar date
  time       text not null default '',             -- HH:mm, phone's local time
  slot       text not null check (slot in ('Breakfast','Lunch','Snack','Dinner','Workout')),
  name       text not null check (length(trim(name)) > 0),
  kcal       numeric not null check (kcal >= 0),
  protein_g  numeric not null check (protein_g >= 0),
  carbs_g    numeric check (carbs_g >= 0),
  fat_g      numeric check (fat_g >= 0),
  fibre_g    numeric check (fibre_g >= 0),
  source     text not null default 'manual' check (source in ('line','kenko','plan','saved','manual')),
  on_plan    boolean not null default false,
  grp        text not null default '',             -- plan-menu group, e.g. 'Treat'
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);
create index if not exists plate_log_date_idx on plate_log (date);

-- ---------- Items: saved quick items
create table if not exists plate_items (
  name_key     text primary key,                   -- lower(trim(name)), so "Coffee" and "coffee" are one item
  name         text not null,
  kcal         numeric not null,
  protein_g    numeric not null,
  carbs_g      numeric,
  fat_g        numeric,
  fibre_g      numeric,
  default_slot text not null default '',
  on_plan      boolean not null default false,
  aliases      text not null default ''            -- comma separated
);

-- ---------- Settings: targets and Kenko box values (all editable in the app)
create table if not exists plate_settings (
  key   text primary key,
  value numeric not null
);
insert into plate_settings (key, value) values
  ('calorie_target', 2037), ('protein_target_g', 134), ('calorie_band_pct', 10), ('protein_hit_g', 120),
  ('fat_limit_g', 60), ('fibre_target_g', 30), ('kenko_kcal', 580), ('kenko_protein_g', 50),
  ('kenko_carbs_g', 61), ('kenko_fat_g', 15), ('kenko_fibre_g', 6)
on conflict (key) do nothing;

-- ---------- lock the tables
alter table plate_secret   enable row level security;
alter table plate_log      enable row level security;
alter table plate_items    enable row level security;
alter table plate_settings enable row level security;
revoke all on plate_secret, plate_log, plate_items, plate_settings from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on plate_secret, plate_log, plate_items, plate_settings from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on plate_secret, plate_log, plate_items, plate_settings from authenticated;
  end if;
end $$;

-- =====================================================================================
-- Functions (the only way in). Each one checks the token first.
-- They run with the owner's rights (security definer), so the public key never touches the tables.
-- =====================================================================================

create or replace function plate_auth(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare expected text;
begin
  select token into expected from plate_secret where id;
  if expected is null or length(expected) < 20 or left(expected, 9) = 'CHANGE-ME' then
    raise exception 'The token has not been set up in the database yet. Re-run supabase/schema.sql with your own token, or run: update plate_secret set token = ''your long value'';'
      using errcode = 'PT401';
  end if;
  if p_token is null or p_token <> expected then
    raise exception 'Wrong or missing token.' using errcode = 'PT401';
  end if;
end $$;

-- plain-English validation of one entry
create or replace function plate_check_entry(e jsonb) returns void
language plpgsql set search_path = public as $$
declare nm text; f text;
begin
  if e is null or jsonb_typeof(e) <> 'object' then raise exception 'An entry was missing.'; end if;
  if coalesce(trim(e->>'id'), '') = '' then raise exception 'An entry has no id.'; end if;
  nm := coalesce(trim(e->>'name'), '');
  if nm = '' then raise exception 'Entry % needs a name.', e->>'id'; end if;
  if coalesce(e->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Entry "%" needs a date like 2026-11-02.', nm;
  end if;
  begin perform (e->>'date')::date; exception when others then
    raise exception 'Entry "%" has an impossible date "%".', nm, e->>'date';
  end;
  if coalesce(e->>'slot', '') not in ('Breakfast','Lunch','Snack','Dinner','Workout') then
    raise exception 'Entry "%" has an unknown slot "%".', nm, coalesce(e->>'slot', '');
  end if;
  if jsonb_typeof(e->'kcal') is distinct from 'number' then raise exception 'Entry "%" needs kcal.', nm; end if;
  if jsonb_typeof(e->'protein_g') is distinct from 'number' then raise exception 'Entry "%" needs protein.', nm; end if;
  foreach f in array array['kcal','protein_g','carbs_g','fat_g','fibre_g'] loop
    if e ? f and jsonb_typeof(e->f) not in ('number','null') then
      raise exception 'Entry "%": % must be a number.', nm, f;
    end if;
    if jsonb_typeof(e->f) = 'number' and (e->>f)::numeric < 0 then
      raise exception 'Entry "%": % cannot be negative.', nm, f;
    end if;
  end loop;
end $$;

create or replace function plate_ping(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform plate_auth(p_token);
  return jsonb_build_object('ok', true, 'name', 'Plate Log database');
end $$;

create or replace function plate_upsert(p_token text, p_entries jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; ids jsonb;
begin
  perform plate_auth(p_token);
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'No entries were sent.';
  end if;
  if jsonb_array_length(p_entries) > 200 then raise exception 'Too many entries in one request (max 200).'; end if;
  for v in select value from jsonb_array_elements(p_entries) loop
    perform plate_check_entry(v);
  end loop;

  -- upsert by id; within one request the latest edit of an id wins, and a row the database already
  -- holds in a newer version is never overwritten by an older retry.
  insert into plate_log as l (id, date, time, slot, name, kcal, protein_g, carbs_g, fat_g, fibre_g,
                              source, on_plan, grp, note, created_at, updated_at, deleted)
  select distinct on (t.v->>'id')
         t.v->>'id', (t.v->>'date')::date, coalesce(t.v->>'time', ''), t.v->>'slot', trim(t.v->>'name'),
         (t.v->>'kcal')::numeric, (t.v->>'protein_g')::numeric,
         (t.v->>'carbs_g')::numeric, (t.v->>'fat_g')::numeric, (t.v->>'fibre_g')::numeric,
         case when t.v->>'source' in ('line','kenko','plan','saved','manual') then t.v->>'source' else 'manual' end,
         coalesce((t.v->>'on_plan')::boolean, false), coalesce(t.v->>'group', ''), coalesce(t.v->>'note', ''),
         coalesce((t.v->>'created_at')::timestamptz, now()), coalesce((t.v->>'updated_at')::timestamptz, now()),
         coalesce((t.v->>'deleted')::boolean, false)
  from jsonb_array_elements(p_entries) as t(v)
  order by t.v->>'id', coalesce((t.v->>'updated_at')::timestamptz, now()) desc
  on conflict (id) do update set
    date = excluded.date, time = excluded.time, slot = excluded.slot, name = excluded.name,
    kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g, fibre_g = excluded.fibre_g, source = excluded.source,
    on_plan = excluded.on_plan, grp = excluded.grp, note = excluded.note,
    updated_at = excluded.updated_at, deleted = excluded.deleted
  where l.updated_at <= excluded.updated_at;

  select coalesce(jsonb_agg(distinct x.v->>'id'), '[]'::jsonb) into ids from jsonb_array_elements(p_entries) as x(v);
  return jsonb_build_object('ok', true, 'saved', ids);
end $$;

create or replace function plate_list(p_token text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform plate_auth(p_token);
  if p_from is null or p_to is null then raise exception '"from" and "to" must be dates like 2026-11-02.'; end if;
  return jsonb_build_object('ok', true, 'entries', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'date', to_char(l.date, 'YYYY-MM-DD'), 'time', l.time, 'slot', l.slot, 'name', l.name,
             'kcal', l.kcal, 'protein_g', l.protein_g, 'carbs_g', l.carbs_g, 'fat_g', l.fat_g, 'fibre_g', l.fibre_g,
             'source', l.source, 'on_plan', l.on_plan, 'group', l.grp, 'note', l.note,
             'created_at', l.created_at, 'updated_at', l.updated_at, 'deleted', l.deleted)
           order by l.date, l.time, l.created_at)
    from plate_log l where l.date between p_from and p_to), '[]'::jsonb));
end $$;

create or replace function plate_config(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform plate_auth(p_token);
  return jsonb_build_object('ok', true,
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from plate_settings s), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
               'name', i.name, 'kcal', i.kcal, 'protein_g', i.protein_g, 'carbs_g', i.carbs_g, 'fat_g', i.fat_g,
               'fibre_g', i.fibre_g, 'default_slot', i.default_slot, 'on_plan', i.on_plan, 'aliases', i.aliases)
             order by i.name) from plate_items i), '[]'::jsonb));
end $$;

create or replace function plate_save_item(p_token text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nm text; f text;
begin
  perform plate_auth(p_token);
  if p_item is null or jsonb_typeof(p_item) <> 'object' then raise exception 'The item was missing.'; end if;
  nm := coalesce(trim(p_item->>'name'), '');
  if nm = '' then raise exception 'The item needs a name.'; end if;
  if jsonb_typeof(p_item->'kcal') is distinct from 'number' then raise exception 'The item needs kcal.'; end if;
  if jsonb_typeof(p_item->'protein_g') is distinct from 'number' then raise exception 'The item needs protein.'; end if;
  foreach f in array array['kcal','protein_g','carbs_g','fat_g','fibre_g'] loop
    if p_item ? f and jsonb_typeof(p_item->f) not in ('number','null') then
      raise exception 'The item: % must be a number.', f;
    end if;
  end loop;
  insert into plate_items (name_key, name, kcal, protein_g, carbs_g, fat_g, fibre_g, default_slot, on_plan, aliases)
  values (lower(nm), nm, (p_item->>'kcal')::numeric, (p_item->>'protein_g')::numeric,
          (p_item->>'carbs_g')::numeric, (p_item->>'fat_g')::numeric, (p_item->>'fibre_g')::numeric,
          case when p_item->>'default_slot' in ('Breakfast','Lunch','Snack','Dinner','Workout') then p_item->>'default_slot' else '' end,
          coalesce((p_item->>'on_plan')::boolean, false), coalesce(p_item->>'aliases', ''))
  on conflict (name_key) do update set
    name = excluded.name, kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g, fibre_g = excluded.fibre_g, default_slot = excluded.default_slot,
    on_plan = excluded.on_plan, aliases = excluded.aliases;
  return jsonb_build_object('ok', true, 'name', nm);
end $$;

create or replace function plate_delete_item(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform plate_auth(p_token);
  if coalesce(trim(p_name), '') = '' then raise exception 'Say which item to delete.'; end if;
  delete from plate_items where name_key = lower(trim(p_name));
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'deleted', n > 0);
end $$;

create or replace function plate_save_settings(p_token text, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text; known text[] := array['calorie_target','protein_target_g','calorie_band_pct','protein_hit_g',
  'fat_limit_g','fibre_target_g','kenko_kcal','kenko_protein_g','kenko_carbs_g','kenko_fat_g','kenko_fibre_g'];
begin
  perform plate_auth(p_token);
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'No settings were sent.'; end if;
  for k in select key from jsonb_each(p_settings) loop
    if not (k = any(known)) then raise exception 'Unknown setting "%".', k; end if;
    if jsonb_typeof(p_settings->k) <> 'number' then raise exception 'Setting "%" must be a number.', k; end if;
  end loop;
  insert into plate_settings (key, value)
  select e.key, (e.value)::numeric from jsonb_each_text(p_settings) as e(key, value)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- who may call what: only the plate_* functions are public; helpers are not
revoke all on function plate_auth(text)         from public;
revoke all on function plate_check_entry(jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function plate_auth(text), plate_check_entry(jsonb) from anon;
    grant execute on function plate_ping(text), plate_upsert(text, jsonb), plate_list(text, date, date),
      plate_config(text), plate_save_item(text, jsonb), plate_delete_item(text, text),
      plate_save_settings(text, jsonb) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function plate_auth(text), plate_check_entry(jsonb) from authenticated;
    grant execute on function plate_ping(text), plate_upsert(text, jsonb), plate_list(text, date, date),
      plate_config(text), plate_save_item(text, jsonb), plate_delete_item(text, text),
      plate_save_settings(text, jsonb) to authenticated;
  end if;
end $$;

-- make the API pick up the new functions straight away
notify pgrst, 'reload schema';
