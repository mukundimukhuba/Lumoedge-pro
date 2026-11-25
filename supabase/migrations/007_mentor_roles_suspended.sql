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
