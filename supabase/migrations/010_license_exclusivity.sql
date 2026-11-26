-- License exclusivity: one email = one live key; device binding for activation.
-- Apply after 001–009. Safe to re-run. Does not mass-delete mentor data.

alter table public.license_keys
  add column if not exists device_id text;

create index if not exists license_keys_device_id_idx
  on public.license_keys (device_id)
  where device_id is not null and length(trim(device_id)) > 0;

-- One non-revoked key per client email (case-insensitive).
-- Mentors must delete/revoke the existing key before issuing another.
drop index if exists license_keys_assignee_email_active_uidx;
create unique index if not exists license_keys_assignee_email_active_uidx
  on public.license_keys (lower(trim(assignee_email)))
  where assignee_email is not null
    and length(trim(assignee_email)) > 0
    and coalesce(lower(trim(license_status)), '') <> 'revoked'
    and coalesce(lower(trim(status)), '') <> 'revoked';

comment on column public.license_keys.device_id is
  'Bound client device id after activation; blocks the same email on another device.';
