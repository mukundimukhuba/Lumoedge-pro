-- Super Admin must NOT list other mentors' managed_eas (names/pictures/symbols).
-- Keys remain visible to SA via list_mentor_license_keys (grouped by issuer in UI).
-- Mentors still see only their own EAs. Does not delete or reassign rows.

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

  -- Always owner-scoped — including super admin (no full EA catalog dump).
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
