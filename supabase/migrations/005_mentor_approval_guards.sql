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
