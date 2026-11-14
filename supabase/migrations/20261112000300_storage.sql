begin;

-- Storage is Supabase-owned. Refuse an unsafe configuration rather than changing its RLS state.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_class where oid = 'storage.objects'::regclass and relrowsecurity) then
    raise exception 'RLS must be enabled on storage.objects before applying platform storage policies.';
  end if;
end;
$$;

-- Never use public buckets for draft listing or advertisement images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-media', 'listing-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('promotional-media', 'promotional-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- Do not silently change an existing bucket's visibility or upload contract.
-- A conflicting bucket aborts this transaction, including newly inserted bucket rows.
do $$
declare
  target record;
  expected_types text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
begin
  for target in
    select id, name, public, file_size_limit, allowed_mime_types from storage.buckets
    where id in ('listing-media', 'promotional-media') for update
  loop
    if target.name is distinct from target.id or target.public is distinct from false
      or target.file_size_limit is distinct from 5242880::bigint
      or target.allowed_mime_types is null
      or not (target.allowed_mime_types @> expected_types and target.allowed_mime_types <@ expected_types)
    then
      raise exception 'Storage bucket "%" already exists with incompatible settings. Review it manually; this migration will not overwrite it.', target.id;
    end if;
  end loop;
end;
$$;

create function public.can_read_media(target_bucket text, target_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when target_bucket = 'listing-media' then exists (
      select 1 from public.listing_media m where m.bucket_id = target_bucket
        and m.object_path = target_path and m.enabled and public.is_listing_public(m.listing_id)
    )
    when target_bucket = 'promotional-media' then exists (
      select 1 from public.advertisements a where
        (a.desktop_image_path = target_path or a.mobile_image_path = target_path)
        and public.is_ad_public(a.id)
    )
    else false
  end;
$$;

create function public.is_media_upload_target(target_bucket text, target_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select target_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(jpg|jpeg|png|webp|avif)$' and (
    (target_bucket = 'listing-media' and exists (
      select 1 from public.listings where id::text = split_part(target_path, '/', 1)
    )) or
    (target_bucket = 'promotional-media' and exists (
      select 1 from public.advertisements where id::text = split_part(target_path, '/', 1)
    ))
  );
$$;
revoke all on function public.can_read_media(text, text), public.is_media_upload_target(text, text) from public, anon, authenticated;
grant execute on function public.can_read_media(text, text) to anon, authenticated, service_role;
grant execute on function public.is_media_upload_target(text, text) to authenticated, service_role;

-- Supabase owns storage.objects and already enables RLS. Do not grant bucket administration.
create policy public_read_published_media on storage.objects for select to anon, authenticated
  using (public.can_read_media(bucket_id, name));
create policy admin_read_media on storage.objects for select to authenticated
  using (bucket_id in ('listing-media', 'promotional-media') and (select public.is_admin()));
create policy admin_insert_media on storage.objects for insert to authenticated
  with check ((select public.is_admin()) and owner_id = (select auth.uid())::text
    and public.is_media_upload_target(bucket_id, name));
create policy admin_update_media on storage.objects for update to authenticated
  using ((select public.is_admin()) and bucket_id in ('listing-media', 'promotional-media'))
  with check ((select public.is_admin()) and public.is_media_upload_target(bucket_id, name));
create policy admin_delete_media on storage.objects for delete to authenticated
  using ((select public.is_admin()) and bucket_id in ('listing-media', 'promotional-media'));

-- Restrictive guards are ANDed with every matching permissive policy, including legacy ones.
-- Other buckets retain their existing behavior. Anonymous guards never call is_admin(),
-- whose EXECUTE permission is intentionally restricted to authenticated/service roles.
create policy platform_anon_read_guard on storage.objects as restrictive for select to anon
  using (bucket_id not in ('listing-media', 'promotional-media') or public.can_read_media(bucket_id, name));
create policy platform_anon_insert_guard on storage.objects as restrictive for insert to anon
  with check (bucket_id not in ('listing-media', 'promotional-media'));
create policy platform_anon_update_guard on storage.objects as restrictive for update to anon
  using (bucket_id not in ('listing-media', 'promotional-media'))
  with check (bucket_id not in ('listing-media', 'promotional-media'));
create policy platform_anon_delete_guard on storage.objects as restrictive for delete to anon
  using (bucket_id not in ('listing-media', 'promotional-media'));

create policy platform_authenticated_read_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id not in ('listing-media', 'promotional-media')
    or (select public.is_admin()) or public.can_read_media(bucket_id, name));
create policy platform_authenticated_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('listing-media', 'promotional-media') or (
    (select public.is_admin()) and owner_id = (select auth.uid())::text
    and public.is_media_upload_target(bucket_id, name)
  ));
create policy platform_authenticated_update_guard on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('listing-media', 'promotional-media') or (select public.is_admin()))
  with check (bucket_id not in ('listing-media', 'promotional-media') or (
    (select public.is_admin()) and public.is_media_upload_target(bucket_id, name)
  ));
create policy platform_authenticated_delete_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id not in ('listing-media', 'promotional-media') or (select public.is_admin()));

commit;
