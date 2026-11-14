-- Phase 2: additive public discovery read model. No rows or stored files are deleted.
begin;

alter table public.categories
  add column short_name text check (short_name is null or length(trim(short_name)) between 1 and 40),
  add column cover_image_path text check (cover_image_path is null or cover_image_path ~ '^/images/demo/[a-z0-9-]+\.(webp|avif|jpg)$');
alter table public.listings
  add column demo_image_path text check (demo_image_path is null or (
    is_demo and demo_image_path ~ '^/images/demo/[a-z0-9-]+\.(webp|avif|jpg)$'
  ));
alter table public.advertisements
  add column demo_image_path text check (demo_image_path is null or (
    is_demo and demo_image_path ~ '^/images/demo/[a-z0-9-]+\.(webp|avif|jpg)$'
  )),
  add column demo_mobile_image_path text check (demo_mobile_image_path is null or (
    is_demo and demo_mobile_image_path ~ '^/images/demo/[a-z0-9-]+\.(webp|avif|jpg)$'
  ));
-- Replace only the known Phase 1 image-presence check. Existing rows remain valid.
-- Real advertisements still require their private Storage image reference.
alter table public.advertisements drop constraint advertisements_check1;
alter table public.advertisements add constraint advertisements_image_required
  check (not enabled or desktop_image_path is not null or (is_demo and demo_image_path is not null));

create index products_discovery_price on public.products(merchant_id, price_minor, id)
  where active and archived_at is null;

-- SECURITY INVOKER preserves the caller's underlying RLS and table privileges.
-- Explicit public eligibility also makes these public RPCs safe for authenticated admins.
create view public.discovery_listing_cards
with (security_invoker = true, security_barrier = true) as
select
  l.id, l.city_id, l.slug, l.name, l.listing_type, l.short_description, l.description,
  l.is_demo, l.sponsored, l.created_at, l.demo_image_path, l.locality_id,
  loc.name as locality_name, loc.slug as locality_slug,
  primary_category.id as category_id, primary_category.slug as category_slug,
  primary_category.name as category_name, primary_category.short_name as category_short_name,
  coalesce(category_data.ids, '{}'::uuid[]) as category_ids,
  coalesce(area_data.ids, '{}'::uuid[]) as service_locality_ids,
  lower(l.name || ' ' || l.short_description || ' ' || l.description || ' ' ||
    coalesce(category_data.names, '') || ' ' || coalesce(loc.name, '') || ' ' ||
    coalesce(offering_data.names, '')) as search_text,
  coalesce(product_price.price_minor, offering_price.indicative_price_minor) as price_minor,
  coalesce(product_price.unit, offering_price.price_unit) as price_unit,
  coalesce(attribute_data.values, '{}'::jsonb) as facets,
  case when current_override.status = 'closed' then 'temporarily_closed' else 'hours_unverified' end as availability,
  case when media.id is not null then jsonb_build_object(
    'bucket_id', media.bucket_id, 'object_path', media.object_path, 'alt_text', media.alt_text
  ) else null end as media
from public.listings l
left join public.localities loc on loc.id = l.locality_id and loc.enabled
left join lateral (
  select c.id, c.slug, c.name, c.short_name
  from public.listing_categories lc join public.categories c on c.id = lc.category_id
  where lc.listing_id = l.id and public.is_category_public(c.id)
  order by lc.is_primary desc, c.display_order, c.id limit 1
) primary_category on true
left join lateral (
  select array_agg(c.id order by c.id) as ids, string_agg(c.name, ' ') as names
  from public.listing_categories lc join public.categories c on c.id = lc.category_id
  where lc.listing_id = l.id and public.is_category_public(c.id)
) category_data on true
left join lateral (
  select array_agg(a.locality_id) as ids from public.listing_service_areas a
  join public.localities s on s.id = a.locality_id and s.enabled where a.listing_id = l.id
) area_data on true
left join lateral (
  select p.price_minor, p.unit from public.products p
  where p.merchant_id = l.id and p.active and p.archived_at is null and (
    p.product_category_id is null or exists (
      select 1 from public.product_categories pc where pc.id = p.product_category_id and pc.enabled
    )
  ) order by p.price_minor, p.id limit 1
) product_price on true
left join lateral (
  select o.indicative_price_minor, o.price_unit from public.offerings o
  where o.listing_id = l.id and o.enabled and o.indicative_price_minor is not null
  order by o.indicative_price_minor, o.id limit 1
) offering_price on true
left join lateral (
  select string_agg(o.name || ' ' || o.description, ' ') as names
  from public.offerings o where o.listing_id = l.id and o.enabled
) offering_data on true
left join lateral (
  select jsonb_object_agg(a.attribute_key, v.value order by a.id) as values
  from public.listing_attributes v join public.category_attributes a on a.id = v.attribute_id
  join public.listing_categories lc on lc.listing_id = v.listing_id and lc.category_id = a.category_id
  where v.listing_id = l.id and public.is_category_public(a.category_id)
) attribute_data on true
left join lateral (
  select o.status from public.temporary_status_overrides o
  where o.listing_id = l.id and o.revoked_at is null and o.starts_at <= now()
    and (o.expires_at is null or o.expires_at > now())
  order by o.starts_at desc, o.id limit 1
) current_override on true
left join lateral (
  select m.id, m.bucket_id, m.object_path, m.alt_text from public.listing_media m
  where m.listing_id = l.id and m.enabled and m.media_role in ('banner', 'gallery')
  order by (m.media_role = 'banner') desc, m.display_order, m.id limit 1
) media on true
where public.is_listing_public(l.id);

revoke all on public.discovery_listing_cards from public, anon, authenticated;
grant select on public.discovery_listing_cards to anon, authenticated, service_role;

create function public.discovery_context(p_city_slug text default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare selected_city uuid;
begin
  if p_city_slug is not null and (length(p_city_slug) > 120 or p_city_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
    raise exception 'Invalid city slug' using errcode = '22023';
  end if;
  select c.id into selected_city from public.cities c
  where c.enabled and ((p_city_slug is null and c.is_default) or c.slug = p_city_slug)
  order by c.id limit 1;
  return jsonb_build_object(
    'city', (select jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'state',c.state,'timezone',c.timezone)
      from public.cities c where c.id = selected_city),
    'brand', (select jsonb_build_object('name',s.brand_name,'tagline',s.tagline) from public.platform_settings s where s.singleton),
    'cities', coalesce((select jsonb_agg(to_jsonb(c)) from (
      select id,name,slug,state from public.cities where enabled order by name,id limit 20
    ) c), '[]'::jsonb),
    'localities', coalesce((select jsonb_agg(to_jsonb(p)) from (
      select id,name,slug,is_demo from public.localities where city_id = selected_city and enabled order by name,id limit 100
    ) p), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c)) from (
      select id,parent_id,name,short_name,slug,description,icon_name,cover_image_path,is_demo
      from public.categories where public.is_category_public(id) order by display_order,id limit 60
    ) c), '[]'::jsonb),
    'attributes', coalesce((select jsonb_agg(to_jsonb(a)) from (
      select id,category_id,attribute_key,label,value_type,options from public.category_attributes
      where filterable and public.is_category_public(category_id) order by display_order,id limit 200
    ) a), '[]'::jsonb),
    'advertisements', coalesce((select jsonb_agg(to_jsonb(a)) from (
      select id,title,subtitle,cta_text,destination_url,listing_id,sponsored,is_demo,
        desktop_image_path,mobile_image_path,demo_image_path,demo_mobile_image_path,alt_text,starts_at,ends_at
      from public.advertisements where city_id = selected_city and public.is_ad_public(id)
      order by priority,id limit 10
    ) a), '[]'::jsonb),
    'has_demo_content', exists (
      select 1 from public.listings where city_id = selected_city and is_demo and public.is_listing_public(id)
    )
  );
end;
$$;

create function public.discovery_home(
  p_city_id uuid, p_locality_id uuid default null, p_offset integer default 0, p_limit integer default 4
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_city_id is null or p_offset is null or p_offset not between 0 and 10000
    or p_limit is null or p_limit not between 1 and 6 then
    raise exception 'Invalid section pagination' using errcode = '22023';
  end if;
  return (
    with eligible_sections as (
      select s.id,s.category_id,s.display_order,coalesce(s.title,c.name) as title,c.description,c.slug,c.short_name
      from public.homepage_sections s join public.categories c on c.id = s.category_id
      where s.city_id = p_city_id and s.enabled and public.is_city_public(s.city_id) and public.is_category_public(c.id)
    ), page as (
      select * from eligible_sections order by display_order,id limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'sections', coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'category_id',s.category_id,'title',s.title,'description',s.description,'slug',s.slug,'short_name',s.short_name,
        'items',coalesce((
          select jsonb_agg((to_jsonb(card) - 'description' - 'search_text' - 'category_ids' - 'service_locality_ids') order by card.rank,card.id)
          from (
            select c.*,f.rank from public.homepage_featured_listings f
            join public.discovery_listing_cards c on c.id = f.listing_id
            where f.section_id = s.id and f.enabled and c.city_id = p_city_id
              and (p_locality_id is null or c.locality_id = p_locality_id or p_locality_id = any(c.service_locality_ids))
            order by f.rank,c.id limit 4
          ) card
        ),'[]'::jsonb)
      ) order by s.display_order,s.id) from page s),'[]'::jsonb),
      'has_more', (select count(*) from eligible_sections) > p_offset + p_limit,
      'next_offset', p_offset + p_limit
    )
  );
end;
$$;

create function public.discovery_listings(
  p_city_id uuid, p_category_id uuid default null, p_locality_id uuid default null,
  p_query text default '', p_sort text default 'recommended',
  p_offset integer default 0, p_limit integer default 12, p_facets jsonb default '{}'::jsonb
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare query_text text;
begin
  if p_city_id is null or p_offset is null or p_offset not between 0 and 10000
    or p_limit is null or p_limit not between 1 and 24 or p_query is null or length(p_query) > 100
    or p_sort is null or p_sort not in ('recommended','name','newest','price_asc','price_desc')
    or p_facets is null or jsonb_typeof(p_facets) <> 'object' or pg_column_size(p_facets) > 4096 then
    raise exception 'Invalid discovery filters or pagination' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_each(p_facets)) > 6 or exists (
    select 1 from jsonb_each(p_facets) f where f.key !~ '^[a-z0-9-]{1,120}$'
      or jsonb_typeof(f.value) <> 'string' or length(f.value #>> '{}') > 120
  ) then
    raise exception 'Invalid discovery attribute filters' using errcode = '22023';
  end if;
  query_text := lower(regexp_replace(trim(p_query), '\s+', ' ', 'g'));
  return (
    with recursive category_scope as (
      select c.id from public.categories c where c.id = p_category_id and public.is_category_public(c.id)
      union
      select c.id from public.categories c join category_scope parent on c.parent_id = parent.id where public.is_category_public(c.id)
    ), candidates as (
      select c.*,
        coalesce((
          select min(f.rank) from public.homepage_featured_listings f
          join public.homepage_sections s on s.id = f.section_id and s.enabled
          where f.listing_id = c.id and f.enabled and public.is_category_public(s.category_id)
            and (p_category_id is null or s.category_id in (select id from category_scope))
        ),2147483647) as rank,
        (select p.name from public.products p where p.merchant_id = c.id and p.active and p.archived_at is null
          and query_text <> '' and strpos(lower(p.name || ' ' || p.description),query_text) > 0
          and (p.product_category_id is null or exists (
            select 1 from public.product_categories pc where pc.id = p.product_category_id and pc.enabled
          )) order by p.display_order,p.id limit 1) as matched_product
      from public.discovery_listing_cards c where c.city_id = p_city_id
        and (p_category_id is null or c.category_ids && array(select id from category_scope))
        and (p_locality_id is null or c.locality_id = p_locality_id or p_locality_id = any(c.service_locality_ids))
        and not exists (
          select 1 from jsonb_each(p_facets) f where not coalesce(
            (c.facets -> f.key) = f.value or
              (jsonb_typeof(c.facets -> f.key) = 'array' and (c.facets -> f.key) @> jsonb_build_array(f.value)),
            false
          )
        )
    ), matching as (
      select * from candidates c where query_text = '' or strpos(c.search_text,query_text) > 0
        or to_tsvector('simple',c.search_text) @@ websearch_to_tsquery('simple',query_text)
        or c.matched_product is not null
    ), page as (
      select * from matching
      order by
        case when p_sort='name' then lower(name) end asc,
        case when p_sort='newest' then created_at end desc,
        case when p_sort='price_asc' then price_minor end asc nulls last,
        case when p_sort='price_desc' then price_minor end desc nulls last,
        case when p_sort='recommended' then rank end asc,
        lower(name),id
      limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(p) - 'description' - 'search_text' - 'category_ids' - 'service_locality_ids') from page p),'[]'::jsonb),
      'total',(select count(*) from matching),
      'has_more',(select count(*) from matching) > p_offset + p_limit,
      'next_offset',p_offset + p_limit
    )
  );
end;
$$;

-- A compact preview supports Phase 2 cards; catalogs, hours calculations and checkout remain Phase 3.
create function public.discovery_preview(p_listing_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(c) - 'search_text' - 'category_ids' - 'service_locality_ids'
  from public.discovery_listing_cards c where c.id = p_listing_id limit 1;
$$;

revoke all on function public.discovery_context(text),
  public.discovery_home(uuid,uuid,integer,integer),
  public.discovery_listings(uuid,uuid,uuid,text,text,integer,integer,jsonb),
  public.discovery_preview(uuid) from public, anon, authenticated;
grant execute on function public.discovery_context(text),
  public.discovery_home(uuid,uuid,integer,integer),
  public.discovery_listings(uuid,uuid,uuid,text,text,integer,integer,jsonb),
  public.discovery_preview(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

