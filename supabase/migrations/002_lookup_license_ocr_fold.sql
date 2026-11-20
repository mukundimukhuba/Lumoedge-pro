-- OCR-safe license lookup: fold O→0 and I/L→1 on both stored + input keys.
-- Also backfill key_normalized so Activate matches mentor screenshots.

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

-- Rewrite normalized column with OCR fold so unique index + direct eq lookups work.
update public.license_keys
set key_normalized = translate(
  upper(regexp_replace(trim(key), '\s+', '', 'g')),
  'OIL',
  '011'
)
where key_normalized is distinct from translate(
  upper(regexp_replace(trim(key), '\s+', '', 'g')),
  'OIL',
  '011'
);
