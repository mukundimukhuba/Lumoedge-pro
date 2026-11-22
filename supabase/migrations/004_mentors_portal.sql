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
