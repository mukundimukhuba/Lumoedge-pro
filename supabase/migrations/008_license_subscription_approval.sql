-- License key ownership + subscription payment approval (008)
-- Apply after 001–007 (incl. 007_mentor_roles_suspended). Safe to re-run.
-- Super admin: mukundimukhuba8@gmail.com

-- ---------------------------------------------------------------------------
-- Subscriptions (client payment → pending → approved | declined)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id text primary key,
  client_name text not null default '',
  client_email text not null,
  ea_id text,
  ea_name text,
  mentor_email text,
  mentor_name text,
  amount_usd numeric(10, 2) not null default 35,
  payment_method text not null default '',
  payment_reference text not null default '',
  payment_proof text,
  payment_date timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'active', 'expired')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_id_uidx
  on public.subscriptions (id);

create index if not exists subscriptions_client_email_idx
  on public.subscriptions (lower(trim(client_email)));

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

create index if not exists subscriptions_mentor_email_idx
  on public.subscriptions (lower(trim(coalesce(mentor_email, ''))));

alter table public.subscriptions enable row level security;

-- Close public dumps: deny direct anon/authenticated table access.
-- All reads/writes go through security-definer RPCs or service-role API.
drop policy if exists subscriptions_anon_all on public.subscriptions;
drop policy if exists subscriptions_deny_all on public.subscriptions;
create policy subscriptions_deny_all
  on public.subscriptions
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- License key ownership columns (additive)
-- ---------------------------------------------------------------------------
alter table public.managed_eas
  add column if not exists owner_email text;

create index if not exists managed_eas_owner_email_idx
  on public.managed_eas (owner_email);

alter table public.license_keys
  add column if not exists assignee_name text,
  add column if not exists assignee_email text,
  add column if not exists issued_by_email text,
  add column if not exists status text,
  add column if not exists activated_at timestamptz,
  add column if not exists subscription_id text,
  add column if not exists mentor_id text,
  add column if not exists license_duration text,
  add column if not exists license_status text,
  add column if not exists expires_at timestamptz;

-- Default legacy rows
update public.license_keys
set status = coalesce(nullif(trim(status), ''), 'unused')
where status is null or trim(status) = '';

update public.license_keys
set license_status = coalesce(
  nullif(trim(license_status), ''),
  case
    when lower(coalesce(status, '')) = 'active' then 'active'
    when lower(coalesce(status, '')) = 'revoked' then 'revoked'
    else 'unused'
  end
)
where license_status is null or trim(license_status) = '';

update public.license_keys
set mentor_id = lower(trim(issued_by_email))
where (mentor_id is null or trim(mentor_id) = '')
  and issued_by_email is not null
  and length(trim(issued_by_email)) > 0;

create index if not exists license_keys_assignee_email_idx
  on public.license_keys (lower(trim(coalesce(assignee_email, ''))));

create index if not exists license_keys_issued_by_email_idx
  on public.license_keys (issued_by_email);

create index if not exists license_keys_subscription_id_idx
  on public.license_keys (subscription_id);

create index if not exists license_keys_mentor_id_idx
  on public.license_keys (mentor_id);

-- One non-revoked key per subscription (regenerate must revoke/replace first)
create unique index if not exists license_keys_subscription_active_uidx
  on public.license_keys (subscription_id)
  where subscription_id is not null
    and coalesce(lower(trim(license_status)), '') <> 'revoked'
    and coalesce(lower(trim(status)), '') <> 'revoked';

-- Tighten license_keys RLS: no public dump of all keys
drop policy if exists license_keys_anon_all on public.license_keys;
drop policy if exists license_keys_deny_direct on public.license_keys;
create policy license_keys_deny_direct
  on public.license_keys
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Keep managed_eas readable for branding lookups by id via RPC below;
-- remove wide-open write from anon if present (service role still writes).
drop policy if exists managed_eas_anon_all on public.managed_eas;
drop policy if exists managed_eas_select_authenticated on public.managed_eas;
create policy managed_eas_select_authenticated
  on public.managed_eas
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin(actor_email text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(actor_email, ''))) = 'mukundimukhuba8@gmail.com';
$$;

-- ---------------------------------------------------------------------------
-- Subscriptions RPCs
-- ---------------------------------------------------------------------------
create or replace function public.submit_subscription(
  p_client_name text,
  p_client_email text,
  p_payment_method text,
  p_payment_reference text,
  p_payment_proof text default null,
  p_amount_usd numeric default 35,
  p_ea_name text default null,
  p_mentor_email text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  email text := lower(trim(coalesce(p_client_email, '')));
  row public.subscriptions;
  new_id text;
begin
  if email = '' or position('@' in email) = 0 then
    raise exception 'invalid client email';
  end if;
  if length(trim(coalesce(p_client_name, ''))) = 0 then
    raise exception 'client name required';
  end if;
  if length(trim(coalesce(p_payment_method, ''))) = 0 then
    raise exception 'payment method required';
  end if;
  if length(trim(coalesce(p_payment_reference, ''))) = 0 then
    raise exception 'payment reference / proof required';
  end if;

  new_id := 'sub_' || to_char(now() at time zone 'utc', 'YYMMDDHH24MISS')
    || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  insert into public.subscriptions (
    id, client_name, client_email, ea_name, mentor_email,
    amount_usd, payment_method, payment_reference, payment_proof,
    payment_date, status, created_at, updated_at
  ) values (
    new_id,
    trim(p_client_name),
    email,
    nullif(trim(coalesce(p_ea_name, '')), ''),
    nullif(lower(trim(coalesce(p_mentor_email, ''))), ''),
    coalesce(p_amount_usd, 35),
    trim(p_payment_method),
    trim(p_payment_reference),
    nullif(trim(coalesce(p_payment_proof, '')), ''),
    now(),
    'pending',
    now(),
    now()
  )
  returning * into row;

  return row;
end;
$$;

revoke all on function public.submit_subscription(text, text, text, text, text, numeric, text, text) from public;
grant execute on function public.submit_subscription(text, text, text, text, text, numeric, text, text)
  to anon, authenticated;

create or replace function public.list_client_subscriptions(p_client_email text)
returns setof public.subscriptions
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  email text := lower(trim(coalesce(p_client_email, '')));
begin
  if email = '' then
    return;
  end if;
  return query
    select *
    from public.subscriptions
    where lower(trim(client_email)) = email
    order by created_at desc;
end;
$$;

revoke all on function public.list_client_subscriptions(text) from public;
grant execute on function public.list_client_subscriptions(text)
  to anon, authenticated;

create or replace function public.list_admin_subscriptions(actor_email text)
returns setof public.subscriptions
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(actor_email) then
    raise exception 'not authorized: only super admin can list all subscriptions';
  end if;
  return query
    select * from public.subscriptions
    order by
      case status
        when 'pending' then 0
        when 'approved' then 1
        when 'active' then 2
        when 'declined' then 3
        else 4
      end,
      created_at desc;
end;
$$;

revoke all on function public.list_admin_subscriptions(text) from public;
grant execute on function public.list_admin_subscriptions(text)
  to anon, authenticated;

create or replace function public.admin_set_subscription_status(
  actor_email text,
  p_subscription_id text,
  p_new_status text,
  p_review_note text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.subscriptions;
  st text := lower(trim(coalesce(p_new_status, '')));
begin
  if not public.is_super_admin(actor_email) then
    raise exception 'not authorized: only super admin can approve or decline payments';
  end if;
  if st not in ('approved', 'declined', 'active', 'expired', 'pending') then
    raise exception 'invalid subscription status';
  end if;

  update public.subscriptions
  set
    status = st,
    reviewed_by = lower(trim(actor_email)),
    reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_review_note, '')), ''),
    updated_at = now()
  where id = trim(p_subscription_id)
  returning * into row;

  if row.id is null then
    raise exception 'subscription not found';
  end if;

  -- Approving activates the subscription for license access.
  if st = 'approved' then
    update public.subscriptions
    set status = 'active', updated_at = now()
    where id = row.id
    returning * into row;
  end if;

  return row;
end;
$$;

revoke all on function public.admin_set_subscription_status(text, text, text, text) from public;
grant execute on function public.admin_set_subscription_status(text, text, text, text)
  to anon, authenticated;

-- Mentors: approved/active subscriptions for a client email (to generate keys)
create or replace function public.list_mentor_client_subscriptions(
  actor_email text,
  p_client_email text default null
)
returns setof public.subscriptions
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor text := lower(trim(coalesce(actor_email, '')));
  client text := lower(trim(coalesce(p_client_email, '')));
begin
  if actor = '' then
    return;
  end if;

  if public.is_super_admin(actor) then
    return query
      select *
      from public.subscriptions
      where status in ('approved', 'active')
        and (client = '' or lower(trim(client_email)) = client)
      order by created_at desc;
    return;
  end if;

  return query
    select *
    from public.subscriptions
    where status in ('approved', 'active')
      and (client = '' or lower(trim(client_email)) = client)
      and (
        mentor_email is null
        or length(trim(mentor_email)) = 0
        or lower(trim(mentor_email)) = actor
      )
    order by created_at desc;
end;
$$;

revoke all on function public.list_mentor_client_subscriptions(text, text) from public;
grant execute on function public.list_mentor_client_subscriptions(text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scoped license key RPCs (no public dumps)
-- ---------------------------------------------------------------------------
create or replace function public.list_client_license_keys(p_client_email text)
returns setof public.license_keys
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  email text := lower(trim(coalesce(p_client_email, '')));
begin
  if email = '' then
    return;
  end if;
  return query
    select *
    from public.license_keys
    where lower(trim(coalesce(assignee_email, ''))) = email
      and coalesce(lower(trim(license_status)), '') <> 'revoked'
      and coalesce(lower(trim(status)), '') <> 'revoked'
    order by created_at desc;
end;
$$;

revoke all on function public.list_client_license_keys(text) from public;
grant execute on function public.list_client_license_keys(text)
  to anon, authenticated;

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
    where lower(trim(coalesce(k.issued_by_email, k.mentor_id, ''))) = actor
       or lower(trim(coalesce(e.owner_email, ''))) = actor
    order by k.created_at desc;
end;
$$;

revoke all on function public.list_mentor_license_keys(text) from public;
grant execute on function public.list_mentor_license_keys(text)
  to anon, authenticated;

create or replace function public.list_mentor_eas(actor_email text)
returns setof public.managed_eas
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
    return query select * from public.managed_eas order by created_at desc;
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

-- Keep OCR-safe lookup (activate by typed key) — returns at most matching rows
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
  where (
    translate(
      upper(regexp_replace(trim(lk.key_normalized), '\s+', '', 'g')),
      'OIL',
      '011'
    ) = q.norm
    or translate(
      upper(regexp_replace(trim(lk.key), '\s+', '', 'g')),
      'OIL',
      '011'
    ) = q.norm
  )
  and coalesce(lower(trim(lk.license_status)), '') <> 'revoked'
  and coalesce(lower(trim(lk.status)), '') <> 'revoked';
$$;

grant execute on function public.lookup_license_key(text) to anon, authenticated;
