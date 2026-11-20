-- Public bucket for EA / license snapshot pictures (cross-device).
insert into storage.buckets (id, name, public)
values ('ea-pictures', 'ea-pictures', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists ea_pictures_anon_read on storage.objects;
create policy ea_pictures_anon_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'ea-pictures');

drop policy if exists ea_pictures_anon_write on storage.objects;
create policy ea_pictures_anon_write
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'ea-pictures');

drop policy if exists ea_pictures_anon_update on storage.objects;
create policy ea_pictures_anon_update
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'ea-pictures')
  with check (bucket_id = 'ea-pictures');
