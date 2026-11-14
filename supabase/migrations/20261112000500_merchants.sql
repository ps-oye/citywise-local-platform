-- Phase 3: additive merchant reads and trusted checkout. No business data is deleted.
begin;

alter table public.products add column demo_image_path text
  check (demo_image_path is null or demo_image_path ~ '^/images/demo/[a-z0-9-]+\.(webp|avif|jpg)$');
create function private.validate_product_demo_image() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.demo_image_path is not null and not exists (
    select 1 from public.listings where id=new.merchant_id and is_demo
  ) then raise exception 'Local demo product images require a demo merchant' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger products_demo_image before insert or update on public.products
  for each row execute function private.validate_product_demo_image();
create function private.validate_listing_demo_products() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_demo and exists(select 1 from public.products where merchant_id=new.id and demo_image_path is not null) then
    raise exception 'Clear demo product image references before converting a demo merchant' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger listings_demo_products before update of is_demo on public.listings
  for each row execute function private.validate_listing_demo_products();

create function private.remember_listing_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.listing_slug_history where city_id=new.city_id and old_slug=new.slug and listing_id<>new.id) then
    raise exception 'This listing slug is reserved by a historical URL' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.city_id=new.city_id and old.slug<>new.slug then
    if exists(select 1 from public.listing_slug_history where city_id=old.city_id and old_slug=old.slug and listing_id<>old.id) then
      raise exception 'Conflicting historical listing URL requires review' using errcode='23514'; end if;
    insert into public.listing_slug_history(listing_id,city_id,old_slug) values(old.id,old.city_id,old.slug) on conflict(city_id,old_slug) do nothing;
  end if;
  return new;
end;
$$;
create trigger listings_remember_slug before insert or update of slug,city_id on public.listings
  for each row execute function private.remember_listing_slug();

alter table private.checkout_intents
  add column request_hash text check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$'),
  add column merchant_name text check (merchant_name is null or length(merchant_name) between 1 and 180),
  add column whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');
alter table private.checkout_intent_items add column unit text not null default 'item'
  check (length(trim(unit)) between 1 and 80);

-- Infrastructure table: explicit grants/RLS, intentionally outside the Phase 1 business-table manifest.
create table private.checkout_rate_limits (
  scope text not null check (scope ~ '^(global|client:[a-f0-9]{64}|merchant:[a-f0-9-]{36})$'),
  window_seconds integer not null check (window_seconds in (60,3600)),
  window_start timestamptz not null,
  request_count integer not null check (request_count between 1 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope,window_seconds)
);
alter table private.checkout_rate_limits enable row level security;
revoke all on private.checkout_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on private.checkout_rate_limits to service_role;
create index checkout_rate_expiry on private.checkout_rate_limits(updated_at);

create function public.merchant_availability(p_listing_id uuid,p_at timestamptz default now()) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare zone text; local_day date; active_override record; pending_override record; is_open boolean; next_open timestamptz; closes timestamptz; has_weekly boolean; today_special boolean;
begin
  select l.timezone into zone from public.listings l where l.id=p_listing_id and public.is_listing_public(l.id);
  if zone is null or p_at is null then return null; end if;
  local_day := (p_at at time zone zone)::date;
  select o.* into active_override from public.temporary_status_overrides o
    where o.listing_id=p_listing_id and o.revoked_at is null and o.starts_at<=p_at
      and (o.expires_at is null or o.expires_at>p_at) order by o.starts_at desc,o.id limit 1;
  if active_override.id is not null then
    return jsonb_build_object('state',case when active_override.status='open' then 'open' else 'temporarily_closed' end,
      'source','manual','timezone',zone,'checked_at',p_at,'next_change_at',active_override.expires_at,'next_open_at',null);
  end if;
  has_weekly:=exists(select 1 from public.business_hours where listing_id=p_listing_id);
  today_special:=exists(select 1 from public.special_hours where listing_id=p_listing_id and on_date=local_day);
  if not has_weekly and not exists(select 1 from public.special_hours where listing_id=p_listing_id and on_date between local_day-1 and local_day) then
    return jsonb_build_object('state','hours_unavailable','source','none','timezone',zone,'checked_at',p_at);
  end if;
  with days as (
    select local_day+i as day from generate_series(-1,8) i
  ), intervals as (
    select d.day,b.opens_at,b.closes_at,b.ends_next_day from days d
    join public.business_hours b on b.listing_id=p_listing_id and b.weekday=extract(dow from d.day)
    where not exists(select 1 from public.special_hours s where s.listing_id=p_listing_id and s.on_date=d.day)
    union all
    select d.day,i.opens_at,i.closes_at,i.ends_next_day from days d
    join public.special_hours s on s.listing_id=p_listing_id and s.on_date=d.day and not s.closed
    join public.special_hour_intervals i on i.special_hours_id=s.id
  ), windows as (
    select (i.day+i.opens_at) at time zone zone as starts,
      (case when i.ends_next_day and exists(
        select 1 from public.special_hours s where s.listing_id=p_listing_id and s.on_date=i.day+1
      ) then (i.day+1)::timestamp else i.day+i.closes_at+case when i.ends_next_day then interval '1 day' else interval '0 day' end end)
      at time zone zone as ends
    from intervals i
  ), merged as (
    select unnest(range_agg(tstzrange(starts,ends,'[)'))) as span from windows where ends>starts
  ) select coalesce(bool_or(lower(span)<=p_at and upper(span)>p_at),false),
      min(lower(span)) filter(where lower(span)>p_at),
      max(upper(span)) filter(where lower(span)<=p_at and upper(span)>p_at)
    into is_open,next_open,closes from merged;
  if closes >= ((local_day+8)::timestamp at time zone zone) then closes:=null; end if;
  if not has_weekly and not today_special and not is_open then
    return jsonb_build_object('state','hours_unavailable','source','none','timezone',zone,'checked_at',p_at);
  end if;
  select * into pending_override from public.temporary_status_overrides where listing_id=p_listing_id and revoked_at is null and starts_at>p_at order by starts_at,id limit 1;
  if pending_override.id is not null then
    if pending_override.status='open' and not is_open then next_open:=least(next_open,pending_override.starts_at); end if;
    if pending_override.status='closed' and next_open>=pending_override.starts_at then next_open:=null; end if;
  end if;
  return jsonb_build_object('state',case when is_open then 'open' else 'closed' end,
    'source',case when exists(select 1 from public.special_hours where listing_id=p_listing_id and on_date=local_day) then 'special' else 'weekly' end,
    'timezone',zone,'checked_at',p_at,'next_open_at',case when is_open then null else next_open end,
    'next_change_at',least(case when is_open then closes else next_open end,pending_override.starts_at));
end;
$$;

-- Keep discovery cards consistent with the same authoritative schedule calculation.
create or replace view public.discovery_listing_cards
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
  case when current_override.status='open' then 'manually_open' else coalesce(public.merchant_availability(l.id)->>'state','hours_unavailable') end as availability,
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


create function public.merchant_detail(p_city_slug text,p_category_slug text,p_listing_slug text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare merchant uuid; result jsonb;
begin
  if p_city_slug is null or p_category_slug is null or p_listing_slug is null or exists(
    select 1 from unnest(array[p_city_slug,p_category_slug,p_listing_slug]) s where length(s)>120 or s !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ) then raise exception 'Invalid merchant route' using errcode='22023'; end if;
  select l.id into merchant from public.listings l join public.cities city on city.id=l.city_id
    where city.slug=p_city_slug and public.is_listing_public(l.id)
      and (l.slug=p_listing_slug or exists(select 1 from public.listing_slug_history h where h.listing_id=l.id and h.old_slug=p_listing_slug))
      and exists(select 1 from public.listing_categories lc join public.categories c on c.id=lc.category_id
        where lc.listing_id=l.id and c.slug=p_category_slug and public.is_category_public(c.id))
    order by (l.slug=p_listing_slug) desc,l.id limit 1;
  if merchant is null then return null; end if;
  select (to_jsonb(card)-'search_text'-'category_ids'-'service_locality_ids') || jsonb_build_object(
    'city',jsonb_build_object('id',city.id,'name',city.name,'slug',city.slug,'state',city.state),
    'canonical_path','/'||city.slug||'/'||card.category_slug||'/'||card.slug,
    'address',l.address,'latitude',l.latitude,'longitude',l.longitude,'maps_place_id',l.maps_place_id,
    'phone_number',l.phone_number,'whatsapp_number',l.whatsapp_number,'contact_verified_at',l.contact_verified_at,
    'verified_at',l.verified_at,'updated_at',l.updated_at,'timezone',l.timezone,
    'status',public.merchant_availability(l.id),
    'actions',(select to_jsonb(a)-'created_at'-'updated_at' from public.listing_actions a where a.listing_id=l.id),
    'gallery',coalesce((select jsonb_agg(to_jsonb(m)) from (
      select id,bucket_id,object_path,alt_text,media_role from public.listing_media where listing_id=l.id and enabled and media_role in ('banner','gallery')
      order by (media_role='banner') desc,display_order,id limit 12) m),'[]'::jsonb),
    'product_categories',coalesce((select jsonb_agg(to_jsonb(c)) from (
      select id,name,slug from public.product_categories where merchant_id=l.id and enabled order by display_order,id limit 100) c),'[]'::jsonb),
    'offerings',coalesce((select jsonb_agg(to_jsonb(o)) from (
      select id,kind,name,description,indicative_price_minor,price_unit,details,available from public.offerings where listing_id=l.id and enabled
      order by display_order,id limit 60) o),'[]'::jsonb),
    'service_areas',coalesce((select jsonb_agg(to_jsonb(s)) from (
      select p.id,p.name,p.slug from public.listing_service_areas a join public.localities p on p.id=a.locality_id
      where a.listing_id=l.id and p.enabled order by p.name,p.id limit 100) s),'[]'::jsonb),
    'weekly_hours',coalesce((select jsonb_agg(to_jsonb(b)) from (
      select weekday,opens_at,closes_at,ends_next_day from public.business_hours where listing_id=l.id order by weekday,opens_at limit 35) b),'[]'::jsonb),
    'special_hours',coalesce((select jsonb_agg(to_jsonb(s)) from (
      select h.id,h.on_date,h.closed,h.label,coalesce((select jsonb_agg(jsonb_build_object('opens_at',i.opens_at,'closes_at',i.closes_at,'ends_next_day',i.ends_next_day) order by i.opens_at)
        from public.special_hour_intervals i where i.special_hours_id=h.id),'[]'::jsonb) as intervals
      from public.special_hours h where h.listing_id=l.id and h.on_date between (now() at time zone l.timezone)::date-1 and (now() at time zone l.timezone)::date+8
      order by h.on_date limit 10) s),'[]'::jsonb)
  ) into result from public.discovery_listing_cards card join public.listings l on l.id=card.id
    join public.cities city on city.id=l.city_id where l.id=merchant;
  return result;
end;
$$;

create function public.merchant_products(
  p_merchant_id uuid,p_query text default '',p_category_id uuid default null,p_dietary text default '',
  p_available_only boolean default false,p_sort text default 'featured',p_offset integer default 0,p_limit integer default 12
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_merchant_id is null or p_query is null or length(p_query)>100 or p_dietary is null
    or p_dietary not in ('','vegetarian','non_vegetarian','egg','not_applicable') or p_available_only is null
    or p_sort is null or p_sort not in ('featured','name','price_asc','price_desc')
    or p_offset is null or p_offset not between 0 and 10000 or p_limit is null or p_limit not between 1 and 24 then
    raise exception 'Invalid catalog filters' using errcode='22023';
  end if;
  return (with eligible as (
    select p.id,p.merchant_id,p.product_category_id,p.sku,p.name,p.description,p.price_minor,p.original_price_minor,
      p.currency,p.unit,p.dietary_type,p.available,p.display_order,p.demo_image_path,
      case when m.id is not null then jsonb_build_object('bucket_id',m.bucket_id,'object_path',m.object_path,'alt_text',m.alt_text) else null end as media
    from public.products p left join public.listing_media m on m.id=p.image_media_id and m.enabled
    where p.merchant_id=p_merchant_id and public.is_listing_public(p.merchant_id) and p.active and p.archived_at is null
      and (p.product_category_id is null or exists(select 1 from public.product_categories c where c.id=p.product_category_id and c.enabled))
      and (p_category_id is null or p.product_category_id=p_category_id)
      and (p_dietary='' or p.dietary_type=p_dietary) and (not p_available_only or p.available)
      and (trim(p_query)='' or strpos(lower(p.name||' '||p.description),lower(trim(p_query)))>0)
  ), page as (
    select * from eligible order by
      case when p_sort='name' then lower(name) end,
      case when p_sort='price_asc' then price_minor end asc,
      case when p_sort='price_desc' then price_minor end desc,
      case when p_sort='featured' then display_order end,id limit p_limit offset p_offset
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),
    'total',(select count(*) from eligible),'has_more',(select count(*) from eligible)>p_offset+p_limit,'next_offset',p_offset+p_limit));
end;
$$;

create function public.merchant_cart_quote(p_merchant_id uuid,p_items jsonb,p_fulfilment text default 'enquiry') returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare merchant record; action record; lines jsonb; subtotal bigint; missing boolean; operating jsonb; reason text; token text;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>30 or pg_column_size(p_items)>8192
    or p_fulfilment is null or p_fulfilment not in ('enquiry','pickup','delivery') then
    raise exception 'Invalid cart' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) i where jsonb_typeof(i)<>'object'
    or (select count(*) from jsonb_object_keys(i))<>2 or not(i ? 'product_id' and i ? 'quantity')
    or coalesce(i->>'product_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    or jsonb_typeof(i->'quantity')<>'number' or coalesce(i->>'quantity','') !~ '^[1-9][0-9]?$')
    or (select count(distinct lower(i->>'product_id')) from jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items) then
    raise exception 'Invalid cart items' using errcode='22023';
  end if;
  select l.* into merchant from public.listings l where l.id=p_merchant_id and public.is_listing_public(l.id);
  if merchant.id is null then return jsonb_build_object('can_checkout',false,'reason','unavailable','items','[]'::jsonb,'total_minor',0); end if;
  select a.* into action from public.listing_actions a where a.listing_id=p_merchant_id;
  operating:=public.merchant_availability(p_merchant_id);
  with requested as (select * from jsonb_to_recordset(p_items) as i(product_id uuid,quantity integer)), line as (
    select r.product_id,r.quantity,p.name,p.unit,p.price_minor,coalesce(p.available,false) as available,
      case when p.id is null then null else p.price_minor*r.quantity end as line_total_minor,
      p.demo_image_path,case when m.id is not null then jsonb_build_object('bucket_id',m.bucket_id,'object_path',m.object_path,'alt_text',m.alt_text) else null end as media
    from requested r left join public.products p on p.id=r.product_id and p.merchant_id=p_merchant_id and p.active and p.archived_at is null
      and (p.product_category_id is null or exists(select 1 from public.product_categories c where c.id=p.product_category_id and c.enabled))
    left join public.listing_media m on m.id=p.image_media_id and m.enabled
  ) select coalesce(jsonb_agg(to_jsonb(line) order by product_id),'[]'::jsonb),coalesce(sum(line_total_minor),0),coalesce(bool_or(not available),false)
    into lines,subtotal,missing from line;
  reason:=case when jsonb_array_length(p_items)=0 then 'empty'
    when merchant.is_demo then 'demo'
    when merchant.listing_type not in ('COMMERCE','RESTAURANT') or not coalesce(action.checkout_enabled,false) then 'disabled'
    when merchant.whatsapp_number is null or merchant.contact_verified_at is null then 'unverified_contact'
    when missing then 'items_unavailable' when subtotal>99999999999 then 'total_limit'
    when (p_fulfilment='pickup' and not coalesce(action.pickup_available,false)) or (p_fulfilment='delivery' and not coalesce(action.delivery_available,false)) then 'fulfilment_unavailable'
    when operating->>'state' in ('closed','temporarily_closed') and not coalesce(action.enquiries_while_closed,false) then 'closed'
    else null end;
  token:=md5(jsonb_build_object('merchant',merchant.id,'phone',merchant.whatsapp_number,'items',lines,'fulfilment',p_fulfilment,
    'reason',reason,'operating',operating->>'state','merchant_name',merchant.name)::text);
  return jsonb_build_object('merchant_id',merchant.id,'merchant_name',merchant.name,'is_demo',merchant.is_demo,'items',lines,
    'total_minor',subtotal,'currency','INR','fulfilment',p_fulfilment,'can_checkout',reason is null,'reason',reason,
    'quote_token',token,'status',operating,'enquiry_while_closed',operating->>'state' in ('closed','temporarily_closed'));
end;
$$;

-- Call and commit this RPC separately, before processing a checkout request.
create function public.checkout_consume_limit(p_client_hash text,p_merchant_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare rule record; current_count integer; current_window timestamptz; allowed boolean:=true; retry_seconds integer:=1;
begin
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' or p_merchant_id is null then
    raise exception 'Invalid limiter input' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('rawatbhata:checkout-limiter'));
  -- Only ephemeral expired counters are removed; business/enquiry records are never cleaned here.
  delete from private.checkout_rate_limits where updated_at<now()-interval '2 days';
  if exists(select 1 from private.checkout_rate_limits where scope='global' and window_seconds=60
    and window_start=to_timestamp(floor(extract(epoch from now())/60)*60) and request_count>=120) then
    return jsonb_build_object('allowed',false,'retry_after',60);
  end if;
  for rule in select * from (values ('client:'||p_client_hash,60,12),
    ('client:'||p_client_hash,3600,60),('global',60,120),('merchant:'||p_merchant_id::text,60,40)) as r(scope,seconds,maximum)
  loop
    -- An already limited client must not consume the shared platform/merchant budget.
    if rule.scope='global' and not allowed then return jsonb_build_object('allowed',false,'retry_after',retry_seconds); end if;
    current_window:=to_timestamp(floor(extract(epoch from now())/rule.seconds)*rule.seconds);
    insert into private.checkout_rate_limits(scope,window_seconds,window_start,request_count)
      values(rule.scope,rule.seconds,current_window,1)
      on conflict(scope,window_seconds) do update set
        window_start=excluded.window_start,request_count=case when checkout_rate_limits.window_start=excluded.window_start
          then least(checkout_rate_limits.request_count+1,1000000) else 1 end,updated_at=now()
      returning request_count into current_count;
    if current_count>rule.maximum then
      allowed:=false;retry_seconds:=greatest(retry_seconds,ceil(extract(epoch from current_window+make_interval(secs=>rule.seconds)-now()))::integer);
    end if;
  end loop;
  return jsonb_build_object('allowed',allowed,'retry_after',retry_seconds);
end;
$$;

create function public.checkout_initiate(
  p_merchant_id uuid,p_items jsonb,p_fulfilment text,p_instructions text,p_quote_token text,p_idempotency_key uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare quote jsonb; canonical_items jsonb; request_hash text; intent record; merchant record; receipt jsonb;
begin
  if p_idempotency_key is null or p_quote_token is null or p_quote_token !~ '^[a-f0-9]{32}$'
    or p_instructions is null or length(p_instructions)>500 or p_instructions ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' then
    raise exception 'Invalid checkout request' using errcode='22023'; end if;
  -- Validate the entire cart even on retries; private records are never enumerated by malformed keys.
  quote:=public.merchant_cart_quote(p_merchant_id,p_items,p_fulfilment);
  select jsonb_agg(i order by i->>'product_id') into canonical_items from jsonb_array_elements(p_items) i;
  request_hash:=encode(sha256(convert_to(jsonb_build_object('merchant',p_merchant_id,'items',canonical_items,'fulfilment',p_fulfilment,
    'instructions',trim(p_instructions),'quote',p_quote_token)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtext('checkout:'||p_idempotency_key::text));
  select l.* into merchant from public.listings l where l.id=p_merchant_id and public.is_listing_public(l.id)
    and not l.is_demo and l.contact_verified_at is not null and l.whatsapp_number is not null
    and l.listing_type in ('COMMERCE','RESTAURANT') for share;
  if merchant.id is null then return jsonb_build_object('status','blocked','quote',quote); end if;
  perform 1 from public.listing_actions where listing_id=p_merchant_id for share;
  perform 1 from public.products where merchant_id=p_merchant_id and id in
    (select (i->>'product_id')::uuid from jsonb_array_elements(p_items) i) order by id for share;
  -- Recompute after locks for both new attempts and retries.
  quote:=public.merchant_cart_quote(p_merchant_id,p_items,p_fulfilment);
  select * into intent from private.checkout_intents where idempotency_key=p_idempotency_key;
  if intent.id is not null then
    if intent.request_hash is distinct from request_hash then return jsonb_build_object('status','conflict'); end if;
    if merchant.whatsapp_number is distinct from intent.whatsapp_number or not coalesce((quote->>'can_checkout')::boolean,false) then
      return jsonb_build_object('status','blocked','quote',quote); end if;
    if quote->>'quote_token'<>p_quote_token then return jsonb_build_object('status','changed','quote',quote); end if;
  else
    if not coalesce((quote->>'can_checkout')::boolean,false) then return jsonb_build_object('status','blocked','quote',quote); end if;
    if quote->>'quote_token'<>p_quote_token then return jsonb_build_object('status','changed','quote',quote); end if;
    insert into private.checkout_intents(merchant_id,reference,idempotency_key,total_minor,fulfilment,instructions,request_hash,merchant_name,whatsapp_number)
      values(p_merchant_id,'RB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),p_idempotency_key,
        (quote->>'total_minor')::bigint,p_fulfilment,nullif(trim(p_instructions),''),request_hash,merchant.name,merchant.whatsapp_number)
      returning * into intent;
    insert into private.checkout_intent_items(intent_id,merchant_id,product_id,product_name,quantity,unit_price_minor,line_total_minor,unit)
      select intent.id,p_merchant_id,(i->>'product_id')::uuid,i->>'name',(i->>'quantity')::integer,
        (i->>'price_minor')::bigint,(i->>'line_total_minor')::bigint,i->>'unit' from jsonb_array_elements(quote->'items') i;
  end if;
  select jsonb_build_object('reference',intent.reference,'merchant_name',intent.merchant_name,'whatsapp_number',intent.whatsapp_number,
    'total_minor',intent.total_minor,'currency',intent.currency,'fulfilment',intent.fulfilment,'instructions',intent.instructions,
    'items',coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',i.product_name,'unit',i.unit,'quantity',i.quantity,
      'price_minor',i.unit_price_minor,'line_total_minor',i.line_total_minor) order by i.product_id),'[]'::jsonb))
    into receipt from private.checkout_intent_items i where i.intent_id=intent.id;
  return jsonb_build_object('status','initiated','receipt',receipt,'request_hash',request_hash);
end;
$$;

create function public.checkout_mark_handoff(p_idempotency_key uuid,p_request_hash text) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update private.checkout_intents set state='handoff_created',handoff_created_at=coalesce(handoff_created_at,now())
    where idempotency_key=p_idempotency_key and request_hash=p_request_hash;
  return found;
end;
$$;

revoke all on function public.merchant_availability(uuid,timestamptz),public.merchant_detail(text,text,text),
  public.merchant_products(uuid,text,uuid,text,boolean,text,integer,integer),public.merchant_cart_quote(uuid,jsonb,text),
  public.checkout_consume_limit(text,uuid),public.checkout_initiate(uuid,jsonb,text,text,text,uuid),
  public.checkout_mark_handoff(uuid,text) from public,anon,authenticated;
grant execute on function public.merchant_availability(uuid,timestamptz),public.merchant_detail(text,text,text),
  public.merchant_products(uuid,text,uuid,text,boolean,text,integer,integer),public.merchant_cart_quote(uuid,jsonb,text) to anon,authenticated,service_role;
grant execute on function public.checkout_consume_limit(text,uuid),public.checkout_initiate(uuid,jsonb,text,text,text,uuid),
  public.checkout_mark_handoff(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
