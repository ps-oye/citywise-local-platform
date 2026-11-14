begin;

-- No role comes from user-editable auth metadata or an email comparison.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.admin_users
    where user_id = (select auth.uid()) and active
  );
$$;

create function public.is_city_public(target_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cities where id = target_id and enabled);
$$;

create function public.is_category_public(target_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive ancestors as (
    select id, parent_id, enabled from public.categories where id = target_id
    union
    select c.id, c.parent_id, c.enabled
    from public.categories c join ancestors a on c.id = a.parent_id
  )
  select coalesce(bool_and(enabled), false) from ancestors;
$$;

create function public.is_listing_public(target_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listings l
    where l.id = target_id
      and l.publication_status = 'published' and l.enabled and l.archived_at is null
      and public.is_city_public(l.city_id)
      and (l.locality_id is null or exists (
        select 1 from public.localities p where p.id = l.locality_id and p.enabled
      ))
      and exists (
        select 1 from public.listing_categories lc
        where lc.listing_id = l.id and public.is_category_public(lc.category_id)
      )
  );
$$;

create function public.is_ad_public(target_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.advertisements a
    where a.id = target_id and a.enabled and a.archived_at is null
      and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
      and public.is_city_public(a.city_id)
      and (a.listing_id is null or public.is_listing_public(a.listing_id))
  );
$$;

revoke all on function public.is_admin(), public.is_city_public(uuid),
  public.is_category_public(uuid), public.is_listing_public(uuid), public.is_ad_public(uuid)
  from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_city_public(uuid), public.is_category_public(uuid),
  public.is_listing_public(uuid), public.is_ad_public(uuid) to anon, authenticated, service_role;

-- Every public business table has an administrator policy and an explicit public read policy.
-- Direct API writes still require RLS, even if a caller uses the authenticated role.
do $$
declare target record;
begin
  for target in select * from private.application_tables()
  loop
    execute format('revoke all on table %I.%I from public, anon, authenticated', target.schema_name, target.table_name);
    execute format('grant all on table %I.%I to service_role', target.schema_name, target.table_name);
    if target.schema_name = 'public' then
      execute format('grant select on public.%I to anon, authenticated', target.table_name);
      execute format('grant insert, update, delete on public.%I to authenticated', target.table_name);
      execute format('create policy admin_manage on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', target.table_name);
    elsif target.table_name <> 'admin_users' then
      execute format('grant select on private.%I to authenticated', target.table_name);
      execute format('create policy admin_read on private.%I for select to authenticated using ((select public.is_admin()))', target.table_name);
    end if;
  end loop;
end;
$$;

create policy public_read on public.cities for select to anon, authenticated
  using (enabled);
create policy public_read on public.localities for select to anon, authenticated
  using (enabled and public.is_city_public(city_id));
create policy public_read on public.categories for select to anon, authenticated
  using (public.is_category_public(id));
create policy public_read on public.category_attributes for select to anon, authenticated
  using (public.is_category_public(category_id));
create policy public_read on public.platform_settings for select to anon, authenticated
  using (true);
create policy public_read on public.listings for select to anon, authenticated
  using (public.is_listing_public(id));
create policy public_read on public.listing_categories for select to anon, authenticated
  using (public.is_listing_public(listing_id) and public.is_category_public(category_id));
create policy public_read on public.listing_slug_history for select to anon, authenticated
  using (public.is_listing_public(listing_id));
create policy public_read on public.listing_media for select to anon, authenticated
  using (enabled and public.is_listing_public(listing_id));
create policy public_read on public.listing_attributes for select to anon, authenticated
  using (public.is_listing_public(listing_id) and exists (
    select 1 from public.category_attributes a
    join public.listing_categories lc on lc.category_id = a.category_id
    where a.id = attribute_id and lc.listing_id = listing_attributes.listing_id
  ));
create policy public_read on public.listing_service_areas for select to anon, authenticated
  using (public.is_listing_public(listing_id) and exists (
    select 1 from public.localities p where p.id = locality_id and p.enabled
  ));
create policy public_read on public.listing_actions for select to anon, authenticated
  using (public.is_listing_public(listing_id));
create policy public_read on public.offerings for select to anon, authenticated
  using (enabled and public.is_listing_public(listing_id));
create policy public_read on public.product_categories for select to anon, authenticated
  using (enabled and public.is_listing_public(merchant_id));
-- Unavailable active products remain readable so a catalog can label them out of stock.
create policy public_read on public.products for select to anon, authenticated
  using (active and archived_at is null and public.is_listing_public(merchant_id) and (
    product_category_id is null or exists (
      select 1 from public.product_categories c where c.id = product_category_id and c.enabled
    )
  ));
create policy public_read on public.business_hours for select to anon, authenticated
  using (public.is_listing_public(listing_id));
create policy public_read on public.special_hours for select to anon, authenticated
  using (public.is_listing_public(listing_id));
create policy public_read on public.special_hour_intervals for select to anon, authenticated
  using (exists (
    select 1 from public.special_hours h where h.id = special_hours_id and not h.closed
  ));
create policy public_read on public.temporary_status_overrides for select to anon, authenticated
  using (revoked_at is null and public.is_listing_public(listing_id));
create policy public_read on public.advertisements for select to anon, authenticated
  using (public.is_ad_public(id));
create policy public_read on public.homepage_sections for select to anon, authenticated
  using (enabled and public.is_city_public(city_id) and public.is_category_public(category_id));
create policy public_read on public.homepage_featured_listings for select to anon, authenticated
  using (enabled and public.is_listing_public(listing_id) and exists (
    select 1 from public.homepage_sections s where s.id = section_id
  ));

-- Minimal audit metadata; do not duplicate contacts, descriptions or private customer data.
create function private.record_admin_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare record_data jsonb;
begin
  if (select auth.uid()) is not null then
    record_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    insert into private.admin_audit_logs(actor_id, table_name, record_id, operation)
    values (
      auth.uid(), tg_table_schema || '.' || tg_table_name,
      coalesce(record_data->>'id', record_data->>'listing_id', record_data->>'singleton', 'record'),
      tg_op
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.record_admin_change() from public, anon, authenticated;
do $$
declare target record;
begin
  for target in select * from private.application_tables() where schema_name = 'public'
  loop
    execute format('create trigger audit_admin_change after insert or update or delete on public.%I for each row execute function private.record_admin_change()', target.table_name);
  end loop;
end;
$$;

grant execute on function private.touch_updated_at(), private.validate_timezone(),
  private.validate_checkout_configuration(), private.validate_category_tree(),
  private.application_tables(), private.record_admin_change() to service_role;

commit;
