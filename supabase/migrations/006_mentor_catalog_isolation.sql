-- Per-mentor EA + license isolation
-- Apply after 001–004 (and 005 if present). Safe to paste alone if columns already exist.
-- Note: 009_sa_ea_privacy.sql removes the SA full-EA-catalog bypass; keys oversight remains.

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

-- List EAs for one mentor (or all when actor is super admin)
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
