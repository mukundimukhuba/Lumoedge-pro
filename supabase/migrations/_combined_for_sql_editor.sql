-- Combined 001–004 + 006 mentor catalog isolation (apply 005 from approval PR if present)
-- Paste into Supabase → SQL → New query → Run

-- Edges / Lumo Edge Pro — shared EA catalog + license keys
-- Apply with: node scripts/apply-supabase-schema.mjs
-- (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)

create table if not exists public.managed_eas (
  id text primary key,
  name text not null,
  picture_uri text,
  symbols jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_keys (
  id text primary key,
  ea_id text not null references public.managed_eas (id) on delete cascade,
  ea_name text not null,
  key text not null,
  key_normalized text not null,
  created_at timestamptz not null default now(),
  ea_picture_uri text,
  ea_symbols jsonb not null default '[]'::jsonb
);

create unique index if not exists license_keys_key_normalized_uidx
  on public.license_keys (key_normalized);

create index if not exists license_keys_ea_id_idx
  on public.license_keys (ea_id);

alter table public.managed_eas enable row level security;
alter table public.license_keys enable row level security;

-- Demo RLS: anon client (portal + Activate) can read/write the shared catalog.
-- Tighten later when mentor auth moves onto Supabase Auth.
drop policy if exists managed_eas_anon_all on public.managed_eas;
create policy managed_eas_anon_all
  on public.managed_eas
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists license_keys_anon_all on public.license_keys;
create policy license_keys_anon_all
  on public.license_keys
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Optional helper for Activate lookups (OCR-safe: O→0, I/L→1)
create or replace function public.lookup_license_key(p_key text)
returns setof public.license_keys
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select translate(
      upper(regexp_replace(trim(p_key), '\s+', '', 'g')),
      'OIL',
      '011'
    ) as norm
  )
  select lk.*
  from public.license_keys lk, q
  where translate(
    upper(regexp_replace(trim(lk.key_normalized), '\s+', '', 'g')),
    'OIL',
    '011'
  ) = q.norm
     or translate(
    upper(regexp_replace(trim(lk.key), '\s+', '', 'g')),
    'OIL',
    '011'
  ) = q.norm;
$$;

grant execute on function public.lookup_license_key(text) to anon, authenticated;


-- Public bucket for EA / license snapshot pictures (cross-device).
-- Note: public bucket ≠ public reads; uploads still need INSERT/UPDATE policies.
-- Prefer 003_ea_pictures_catalog_policies.sql (TO public) for Production fallback.
insert into storage.buckets (id, name, public)
values ('ea-pictures', 'ea-pictures', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists ea_pictures_anon_read on storage.objects;
create policy ea_pictures_anon_read
  on storage.objects
  for select
  to anon, authenticated, service_role
  using (bucket_id = 'ea-pictures');

drop policy if exists ea_pictures_anon_write on storage.objects;
create policy ea_pictures_anon_write
  on storage.objects
  for insert
  to anon, authenticated, service_role
  with check (bucket_id = 'ea-pictures');

drop policy if exists ea_pictures_anon_update on storage.objects;
create policy ea_pictures_anon_update
  on storage.objects
  for update
  to anon, authenticated, service_role
  using (bucket_id = 'ea-pictures')
  with check (bucket_id = 'ea-pictures');

drop policy if exists ea_pictures_anon_delete on storage.objects;
create policy ea_pictures_anon_delete
  on storage.objects
  for delete
  to anon, authenticated, service_role
  using (bucket_id = 'ea-pictures');


-- OCR-safe license lookup: fold O→0 and I/L→1 on both stored + input keys.
-- Also backfill key_normalized so Activate matches mentor screenshots.

create or replace function public.lookup_license_key(p_key text)
returns setof public.license_keys
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select translate(
      upper(regexp_replace(trim(p_key), '\s+', '', 'g')),
      'OIL',
      '011'
    ) as norm
  )
  select lk.*
  from public.license_keys lk, q
  where translate(
    upper(regexp_replace(trim(lk.key_normalized), '\s+', '', 'g')),
    'OIL',
    '011'
  ) = q.norm
     or translate(
    upper(regexp_replace(trim(lk.key), '\s+', '', 'g')),
    'OIL',
    '011'
  ) = q.norm;
$$;

grant execute on function public.lookup_license_key(text) to anon, authenticated;

-- Rewrite normalized column with OCR fold so unique index + direct eq lookups work.
update public.license_keys
set key_normalized = translate(
  upper(regexp_replace(trim(key), '\s+', '', 'g')),
  'OIL',
  '011'
)
where key_normalized is distinct from translate(
  upper(regexp_replace(trim(key), '\s+', '', 'g')),
  'OIL',
  '011'
);


-- Harden ea-pictures RLS so catalog writes work for:
--   * real service_role / sb_secret (already bypasses RLS; policies are belt-and-suspenders)
--   * publishable / anon keys (Production may have these labeled as SERVICE_ROLE)
-- Upsert needs SELECT + UPDATE in addition to INSERT.

insert into storage.buckets (id, name, public)
values ('ea-pictures', 'ea-pictures', true)
on conflict (id) do update set public = excluded.public;

-- Broad read (public bucket + authenticated path)
drop policy if exists ea_pictures_anon_read on storage.objects;
drop policy if exists ea_pictures_public_read on storage.objects;
create policy ea_pictures_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'ea-pictures');

-- Insert / update / delete for catalog + general bucket objects
drop policy if exists ea_pictures_anon_write on storage.objects;
drop policy if exists ea_pictures_anon_update on storage.objects;
drop policy if exists ea_pictures_public_insert on storage.objects;
drop policy if exists ea_pictures_public_update on storage.objects;
drop policy if exists ea_pictures_public_delete on storage.objects;

create policy ea_pictures_public_insert
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'ea-pictures');

create policy ea_pictures_public_update
  on storage.objects
  for update
  to public
  using (bucket_id = 'ea-pictures')
  with check (bucket_id = 'ea-pictures');

create policy ea_pictures_public_delete
  on storage.objects
  for delete
  to public
  using (bucket_id = 'ea-pictures');


-- Edges Mentors Portal — mentors, license assignees, brokers, signals
-- Apply with: npm run supabase:apply

-- Mentor signups (portal register → approve / decline + key allotment)
create table if not exists public.mentor_profiles (
  email text primary key,
  mentor_name text not null default '',
  name text not null default '',
  contact text not null default '',
  password_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'demo')),
  key_allotment integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mentor_profiles enable row level security;

drop policy if exists mentor_profiles_anon_all on public.mentor_profiles;
create policy mentor_profiles_anon_all
  on public.mentor_profiles
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- License key assignee + issuer metadata (additive; safe if columns already exist)
alter table public.license_keys
  add column if not exists assignee_name text,
  add column if not exists assignee_email text,
  add column if not exists issued_by_email text,
  add column if not exists status text not null default 'unused',
  add column if not exists activated_at timestamptz;

create index if not exists license_keys_issued_by_email_idx
  on public.license_keys (issued_by_email);

create index if not exists license_keys_assignee_email_idx
  on public.license_keys (assignee_email);

-- Live broker connections (for Settings counts)
create table if not exists public.broker_connections (
  id text primary key,
  broker text not null,
  server text,
  login_mask text,
  user_email text,
  mentor_email text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broker_connections_broker_idx
  on public.broker_connections (broker);

alter table public.broker_connections enable row level security;

drop policy if exists broker_connections_anon_all on public.broker_connections;
create policy broker_connections_anon_all
  on public.broker_connections
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Global direction / event signals (floating chip)
create table if not exists public.signal_events (
  id text primary key,
  title text not null,
  direction text not null default 'watch'
    check (direction in ('buy', 'sell', 'watch', 'news')),
  symbol text,
  starts_at timestamptz not null,
  note text,
  published_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists signal_events_starts_at_idx
  on public.signal_events (starts_at);

alter table public.signal_events enable row level security;

drop policy if exists signal_events_anon_all on public.signal_events;
create policy signal_events_anon_all
  on public.signal_events
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Self-hosting EA signal mirror (mentor → students on same EA)
create table if not exists public.mirror_signals (
  id text primary key,
  ea_id text not null,
  ea_name text,
  symbol text not null,
  direction text not null check (direction in ('buy', 'sell')),
  mentor_email text,
  lot_size numeric,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists mirror_signals_ea_id_idx
  on public.mirror_signals (ea_id);

create index if not exists mirror_signals_created_at_idx
  on public.mirror_signals (created_at desc);

alter table public.mirror_signals enable row level security;

drop policy if exists mirror_signals_anon_all on public.mirror_signals;
create policy mirror_signals_anon_all
  on public.mirror_signals
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Mentor signup approval guards
-- Apply after 004_mentors_portal.sql (or paste both into Supabase SQL editor).
-- Super admin: mukundimukhuba8@gmail.com

-- Ensure mentor_profiles exists (safe if 004 already applied)
create table if not exists public.mentor_profiles (
  email text primary key,
  mentor_name text not null default '',
  name text not null default '',
  contact text not null default '',
  password_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'demo', 'suspended')),
  key_allotment integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mentor_profiles enable row level security;

-- Seed / upsert the super-admin row as approved demo (no password stored here)
insert into public.mentor_profiles (
  email, mentor_name, name, contact, status, key_allotment, updated_at
) values (
  'mukundimukhuba8@gmail.com',
  'Mukundi',
  'Mukundi Mukhuba',
  '',
  'demo',
  999,
  now()
)
on conflict (email) do update set
  status = excluded.status,
  key_allotment = greatest(public.mentor_profiles.key_allotment, excluded.key_allotment),
  updated_at = now();

-- RPC: only the hardcoded super-admin email may approve / decline / allot keys.
-- Note: without Supabase Auth the actor_email argument can still be spoofed;
-- the portal UI also gates these actions. Tighten when mentors use Auth.
create or replace function public.admin_set_mentor_status(
  actor_email text,
  target_email text,
  new_status text,
  new_allotment integer default null
)
returns public.mentor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  admin constant text := 'mukundimukhuba8@gmail.com';
  row public.mentor_profiles;
begin
  if lower(trim(coalesce(actor_email, ''))) <> admin then
    raise exception 'not authorized: only super admin can change mentor status';
  end if;

  if new_status not in ('pending', 'approved', 'declined', 'suspended') then
    raise exception 'invalid status';
  end if;

  update public.mentor_profiles
  set
    status = new_status,
    key_allotment = case
      when new_allotment is null then key_allotment
      else greatest(0, new_allotment)
    end,
    updated_at = now()
  where email = lower(trim(target_email))
  returning * into row;

  if row.email is null then
    raise exception 'mentor not found';
  end if;

  return row;
end;
$$;

revoke all on function public.admin_set_mentor_status(text, text, text, integer) from public;
grant execute on function public.admin_set_mentor_status(text, text, text, integer)
  to anon, authenticated;

-- Self-service: mentors may only create/update their own row as pending
-- (portal client still uses upsert; this RPC is for future Auth wiring).
create or replace function public.register_mentor_pending(
  p_email text,
  p_mentor_name text,
  p_name text,
  p_contact text,
  p_password_hash text default null
)
returns public.mentor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  admin constant text := 'mukundimukhuba8@gmail.com';
  key text := lower(trim(p_email));
  row public.mentor_profiles;
begin
  if key = '' or position('@' in key) = 0 then
    raise exception 'invalid email';
  end if;

  -- Super admin account is never demoted to pending via this path
  if key = admin then
    raise exception 'cannot register super admin via pending signup';
  end if;

  insert into public.mentor_profiles (
    email, mentor_name, name, contact, password_hash, status, key_allotment, updated_at
  ) values (
    key,
    coalesce(nullif(trim(p_mentor_name), ''), ''),
    coalesce(nullif(trim(p_name), ''), ''),
    coalesce(nullif(trim(p_contact), ''), ''),
    p_password_hash,
    'pending',
    0,
    now()
  )
  on conflict (email) do update set
    mentor_name = excluded.mentor_name,
    name = excluded.name,
    contact = excluded.contact,
    password_hash = coalesce(excluded.password_hash, public.mentor_profiles.password_hash),
    -- Never let a re-register flip approved → pending or approved → declined
    status = case
      when public.mentor_profiles.status in ('approved', 'demo') then public.mentor_profiles.status
      else 'pending'
    end,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.register_mentor_pending(text, text, text, text, text) from public;
grant execute on function public.register_mentor_pending(text, text, text, text, text)
  to anon, authenticated;


-- Per-mentor EA + license isolation (+ 009 SA EA privacy)
-- Apply after 001–004 (and 005 if present). Safe to paste alone if columns already exist.
-- Super admin may oversee license keys; managed_eas listing is always owner-scoped.

alter table public.managed_eas
  add column if not exists owner_email text;

create index if not exists managed_eas_owner_email_idx
  on public.managed_eas (owner_email);

-- Backfill owner from a single consistent license issuer per EA (when unambiguous)
update public.managed_eas ea
set owner_email = sub.issuer
from (
  select
    ea_id,
    lower(trim(min(issued_by_email))) as issuer
  from public.license_keys
  where issued_by_email is not null
    and length(trim(issued_by_email)) > 0
  group by ea_id
  having count(distinct lower(trim(issued_by_email))) = 1
) sub
where ea.id = sub.ea_id
  and (ea.owner_email is null or length(trim(ea.owner_email)) = 0);

-- Ensure issued_by_email exists (also in 004)
alter table public.license_keys
  add column if not exists issued_by_email text;

create index if not exists license_keys_issued_by_email_idx
  on public.license_keys (issued_by_email);

-- List EAs owned by actor only (super admin is not exempt — privacy)
create or replace function public.list_mentor_eas(actor_email text)
returns setof public.managed_eas
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor text := lower(trim(coalesce(actor_email, '')));
begin
  if actor = '' then
    return;
  end if;

  return query
    select *
    from public.managed_eas
    where lower(trim(coalesce(owner_email, ''))) = actor
    order by created_at desc;
end;
$$;

revoke all on function public.list_mentor_eas(text) from public;
grant execute on function public.list_mentor_eas(text) to anon, authenticated;

comment on function public.list_mentor_eas(text) is
  'Returns managed_eas owned by actor_email only. Super admin is not exempt (privacy).';

-- List license keys for one mentor (or all when super admin)
create or replace function public.list_mentor_license_keys(actor_email text)
returns setof public.license_keys
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  admin constant text := 'mukundimukhuba8@gmail.com';
  actor text := lower(trim(coalesce(actor_email, '')));
begin
  if actor = '' then
    return;
  end if;

  if actor = admin then
    return query select * from public.license_keys order by created_at desc;
    return;
  end if;

  return query
    select k.*
    from public.license_keys k
    left join public.managed_eas e on e.id = k.ea_id
    where lower(trim(coalesce(k.issued_by_email, ''))) = actor
       or lower(trim(coalesce(e.owner_email, ''))) = actor
    order by k.created_at desc;
end;
$$;

revoke all on function public.list_mentor_license_keys(text) from public;
grant execute on function public.list_mentor_license_keys(text)
  to anon, authenticated;


-- Mentor roles + suspended lifecycle (additive; safe after 005/006)
-- Super admin: mukundimukhuba8@gmail.com
-- Coordinates with license/subscription approval work — no destructive drops of shared tables.

-- portal_role: super_admin | mentor | regular_admin
alter table public.mentor_profiles
  add column if not exists portal_role text not null default 'mentor';

-- Expand status check to include suspended (drop legacy check if present)
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'mentor_profiles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.mentor_profiles drop constraint %I', cname);
  end if;
end $$;

alter table public.mentor_profiles
  add constraint mentor_profiles_status_check
  check (status in ('pending', 'approved', 'declined', 'demo', 'suspended'));

alter table public.mentor_profiles
  drop constraint if exists mentor_profiles_portal_role_check;
alter table public.mentor_profiles
  add constraint mentor_profiles_portal_role_check
  check (portal_role in ('super_admin', 'mentor', 'regular_admin'));

-- Super admin seed
insert into public.mentor_profiles (
  email, mentor_name, name, contact, status, portal_role, key_allotment, updated_at
) values (
  'mukundimukhuba8@gmail.com',
  'Mukundi',
  'Mukundi Mukhuba',
  '',
  'demo',
  'super_admin',
  999,
  now()
)
on conflict (email) do update set
  status = 'demo',
  portal_role = 'super_admin',
  key_allotment = greatest(public.mentor_profiles.key_allotment, excluded.key_allotment),
  updated_at = now();

-- Backfill roles
update public.mentor_profiles
set portal_role = 'super_admin'
where lower(email) = 'mukundimukhuba8@gmail.com';

update public.mentor_profiles
set portal_role = 'mentor'
where portal_role is null
   or portal_role = ''
   or (lower(email) <> 'mukundimukhuba8@gmail.com' and portal_role = 'super_admin' and status <> 'demo');

-- Replace approval RPC: suspended + never change super-admin role via status alone
create or replace function public.admin_set_mentor_status(
  actor_email text,
  target_email text,
  new_status text,
  new_allotment integer default null
)
returns public.mentor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  admin constant text := 'mukundimukhuba8@gmail.com';
  row public.mentor_profiles;
  key text := lower(trim(target_email));
begin
  if lower(trim(coalesce(actor_email, ''))) <> admin then
    raise exception 'not authorized: only super admin can change mentor status';
  end if;

  if new_status not in ('pending', 'approved', 'declined', 'suspended') then
    raise exception 'invalid status';
  end if;

  if key = admin then
    raise exception 'cannot change super admin account status via this RPC';
  end if;

  update public.mentor_profiles
  set
    status = new_status,
    key_allotment = case
      when new_allotment is null then key_allotment
      else greatest(0, new_allotment)
    end,
    -- Approved mentors keep mentor role; never auto-promote to super_admin
    portal_role = case
      when portal_role = 'regular_admin' then 'regular_admin'
      else 'mentor'
    end,
    updated_at = now()
  where email = key
  returning * into row;

  if row.email is null then
    raise exception 'mentor not found';
  end if;

  return row;
end;
$$;

revoke all on function public.admin_set_mentor_status(text, text, text, integer) from public;
grant execute on function public.admin_set_mentor_status(text, text, text, integer)
  to anon, authenticated;

-- Register always creates mentor + pending (never super_admin / regular_admin)
create or replace function public.register_mentor_pending(
  p_email text,
  p_mentor_name text,
  p_name text,
  p_contact text,
  p_password_hash text default null
)
returns public.mentor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  admin constant text := 'mukundimukhuba8@gmail.com';
  key text := lower(trim(p_email));
  row public.mentor_profiles;
begin
  if key = '' or position('@' in key) = 0 then
    raise exception 'invalid email';
  end if;

  if key = admin then
    raise exception 'cannot register super admin via pending signup';
  end if;

  insert into public.mentor_profiles (
    email, mentor_name, name, contact, password_hash, status, portal_role, key_allotment, updated_at
  ) values (
    key,
    coalesce(nullif(trim(p_mentor_name), ''), ''),
    coalesce(nullif(trim(p_name), ''), ''),
    coalesce(nullif(trim(p_contact), ''), ''),
    p_password_hash,
    'pending',
    'mentor',
    0,
    now()
  )
  on conflict (email) do update set
    mentor_name = excluded.mentor_name,
    name = excluded.name,
    contact = excluded.contact,
    password_hash = coalesce(excluded.password_hash, public.mentor_profiles.password_hash),
    status = case
      when public.mentor_profiles.status in ('approved', 'demo', 'suspended') then public.mentor_profiles.status
      else 'pending'
    end,
    portal_role = case
      when public.mentor_profiles.portal_role = 'regular_admin' then 'regular_admin'
      else 'mentor'
    end,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

revoke all on function public.register_mentor_pending(text, text, text, text, text) from public;
grant execute on function public.register_mentor_pending(text, text, text, text, text)
  to anon, authenticated;

-- Optional: set regular_admin role (super admin only) — additive for future assignments
create or replace function public.admin_set_portal_role(
  actor_email text,
  target_email text,
  new_role text
)
returns public.mentor_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  admin constant text := 'mukundimukhuba8@gmail.com';
  row public.mentor_profiles;
  key text := lower(trim(target_email));
begin
  if lower(trim(coalesce(actor_email, ''))) <> admin then
    raise exception 'not authorized';
  end if;
  if new_role not in ('mentor', 'regular_admin') then
    raise exception 'invalid role (super_admin is reserved)';
  end if;
  if key = admin then
    raise exception 'cannot demote super admin';
  end if;

  update public.mentor_profiles
  set portal_role = new_role, updated_at = now()
  where email = key
  returning * into row;

  if row.email is null then
    raise exception 'mentor not found';
  end if;
  return row;
end;
$$;

revoke all on function public.admin_set_portal_role(text, text, text) from public;
grant execute on function public.admin_set_portal_role(text, text, text)
  to anon, authenticated;
