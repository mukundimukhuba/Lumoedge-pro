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
