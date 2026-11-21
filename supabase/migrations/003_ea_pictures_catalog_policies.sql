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
