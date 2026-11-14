-- Phase 6: public SEO reads, separately limited event intake and authorized aggregate analytics.
-- Installation does not alter business data, events, enquiries, Auth or Storage policies.
begin;

create table private.analytics_rate_limits (
  scope text not null check(scope='global' or scope ~ '^client:[a-f0-9]{64}$'),
  window_seconds integer not null check(window_seconds in(60,3600)),
  window_start timestamptz not null,
  event_count integer not null check(event_count between 1 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(scope,window_seconds)
);
alter table private.analytics_rate_limits enable row level security;
revoke all on private.analytics_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on private.analytics_rate_limits to service_role;
create index analytics_limits_expiry on private.analytics_rate_limits(updated_at);
create trigger analytics_limits_updated before update on private.analytics_rate_limits for each row execute function private.touch_updated_at();
create index analytics_city_type_time on private.analytics_events(city_id,event_type,created_at desc);
create index checkout_handoff_time on private.checkout_intents(handoff_created_at) where handoff_created_at is not null;

create function public.seo_public_paths() returns table(path text)
language sql stable security invoker set search_path='' as $$
  with recursive eligible as materialized(
    select l.id,l.city_id,l.slug from public.listings l where not l.is_demo and public.is_listing_public(l.id)
  ), groups as(
    select distinct l.city_id,c.id,c.parent_id,c.slug from eligible l join public.listing_categories lc on lc.listing_id=l.id
      join public.categories c on c.id=lc.category_id where public.is_category_public(c.id)
    union
    select g.city_id,c.id,c.parent_id,c.slug from groups g join public.categories c on c.id=g.parent_id where public.is_category_public(c.id)
  )
  select '/'||c.slug from public.cities c where c.enabled and exists(select 1 from eligible l where l.city_id=c.id)
  union
  select '/'||city.slug||'/'||g.slug from groups g join public.cities city on city.id=g.city_id and city.enabled
  union
  select '/'||city.slug||'/'||category.slug||'/'||l.slug from eligible l join public.cities city on city.id=l.city_id
    join lateral(select c.slug from public.listing_categories lc join public.categories c on c.id=lc.category_id
      where lc.listing_id=l.id and public.is_category_public(c.id) order by lc.is_primary desc,c.display_order,c.id limit 1) category on true;
$$;
create function public.seo_sitemap_index() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare total bigint;
begin
  select count(*) into total from public.seo_public_paths();
  if total>1000000 then raise exception 'SITEMAP_CAPACITY_REACHED' using errcode='54000';end if;
  return jsonb_build_object('total',total,'pages',ceil(total::numeric/1000)::integer);
end;
$$;
create function public.seo_sitemap_page(p_page integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_page is null or p_page not between 0 and 999 then raise exception 'Invalid sitemap page' using errcode='22023';end if;
  return coalesce((select jsonb_agg(path order by path collate "C") from(select path from public.seo_public_paths() order by path collate "C" limit 1000 offset p_page*1000)p),'[]'::jsonb);
end;
$$;
create function public.public_media(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('bucket_id',m.bucket_id,'object_path',m.object_path,'alt_text',m.alt_text,'is_demo',(select l.is_demo from public.listings l where l.id=m.listing_id))
    from public.listing_media m where m.id=p_id and m.enabled and public.is_listing_public(m.listing_id);
$$;

-- Call and commit independently before event recording. Counts are events, not batches.
create function public.analytics_consume_limit(p_client_hash text,p_count integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rule record; current_count integer; start_time timestamptz; retry_seconds integer:=1; allowed boolean:=true;
begin
  if p_client_hash is null or p_client_hash!~ '^[a-f0-9]{64}$' or p_count is null or p_count not between 1 and 20 then raise exception 'Invalid event budget' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtext('rawatbhata:analytics-limiter'));
  -- Only expired infrastructure counters are pruned. No event/enquiry/business record is deleted.
  delete from private.analytics_rate_limits where updated_at<now()-interval '2 days';
  if exists(select 1 from private.analytics_rate_limits where scope='global' and window_seconds=60
    and window_start=to_timestamp(floor(extract(epoch from now())/60)*60) and event_count+p_count>5000) then
    return jsonb_build_object('allowed',false,'retry_after',60);
  end if;
  for rule in select * from(values ('client:'||p_client_hash,60,120),('client:'||p_client_hash,3600,1000),('global',60,5000))r(scope,seconds,maximum)
  loop
    if rule.scope='global' and not allowed then return jsonb_build_object('allowed',false,'retry_after',retry_seconds);end if;
    start_time:=to_timestamp(floor(extract(epoch from now())/rule.seconds)*rule.seconds);
    insert into private.analytics_rate_limits(scope,window_seconds,window_start,event_count) values(rule.scope,rule.seconds,start_time,p_count)
      on conflict(scope,window_seconds) do update set window_start=excluded.window_start,
        event_count=case when analytics_rate_limits.window_start=excluded.window_start then least(analytics_rate_limits.event_count+excluded.event_count,1000000) else excluded.event_count end
      returning event_count into current_count;
    if current_count>rule.maximum then allowed:=false;retry_seconds:=greatest(retry_seconds,ceil(extract(epoch from start_time+make_interval(secs=>rule.seconds)-now()))::integer);end if;
  end loop;
  return jsonb_build_object('allowed',allowed,'retry_after',retry_seconds);
end;
$$;
create function public.analytics_record_events(p_events jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; kind text; target uuid; event_id uuid; city uuid; listing uuid; advertisement uuid; previous private.analytics_events; accepted integer:=0; duplicate_count integer:=0;
begin
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) not between 1 and 20 or pg_column_size(p_events)>8192 then raise exception 'Invalid events' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_events) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'event_key') is distinct from 'string' or (item->>'event_key')!~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof(item->'event_type') is distinct from 'string' or item->>'event_type' not in ('listing_view','phone_click','directions_click','whatsapp_click','ad_visible_impression','ad_click') then raise exception 'Invalid event fields' using errcode='22023';end if;
    kind:=item->>'event_type';event_id:=(item->>'event_key')::uuid;city:=null;listing:=null;advertisement:=null;
    if kind in ('ad_visible_impression','ad_click') then
      if (select count(*) from jsonb_object_keys(item))<>3 or not(item ? 'advertisement_id') or jsonb_typeof(item->'advertisement_id') is distinct from 'string' then raise exception 'Invalid advertisement event' using errcode='22023';end if;
      target:=(item->>'advertisement_id')::uuid;
      select a.city_id,a.listing_id,a.id into city,listing,advertisement from public.advertisements a where a.id=target and public.is_ad_public(a.id) for share;
    else
      if (select count(*) from jsonb_object_keys(item))<>3 or not(item ? 'listing_id') or jsonb_typeof(item->'listing_id') is distinct from 'string' then raise exception 'Invalid listing event' using errcode='22023';end if;
      target:=(item->>'listing_id')::uuid;
      select l.city_id,l.id into city,listing from public.listings l where l.id=target and public.is_listing_public(l.id)
        and (kind='listing_view' or not l.is_demo and case kind
          when 'phone_click' then l.contact_verified_at is not null and l.phone_number is not null
          when 'whatsapp_click' then l.contact_verified_at is not null and l.whatsapp_number is not null
          when 'directions_click' then exists(select 1 from public.listing_actions a where a.listing_id=l.id and a.directions_enabled)
            and (l.maps_place_id is not null or l.latitude is not null and l.longitude is not null)
          else false end) for share;
    end if;
    if city is null then continue;end if;
    insert into private.analytics_events(city_id,listing_id,advertisement_id,event_type,event_key) values(city,listing,advertisement,kind,event_id)
      on conflict(event_key) do nothing;
    if found then accepted:=accepted+1;
    else
      select * into previous from private.analytics_events where event_key=event_id;
      if previous.city_id is distinct from city or previous.listing_id is distinct from listing or previous.advertisement_id is distinct from advertisement or previous.event_type<>kind then raise exception 'EVENT_KEY_CONFLICT' using errcode='22023';end if;
      duplicate_count:=duplicate_count+1;
    end if;
  end loop;
  return jsonb_build_object('accepted',accepted,'duplicates',duplicate_count);
end;
$$;

create function public.admin_analytics(p_city_id uuid,p_from date,p_to date,p_include_demo boolean default false) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare zone text; start_time timestamptz; end_time timestamptz;
begin
  perform private.require_admin();select timezone into zone from public.cities where id=p_city_id;
  if zone is null or p_from is null or p_to is null or p_from>p_to or p_to-p_from>89 or p_include_demo is null then raise exception 'ANALYTICS_INVALID_RANGE' using errcode='22023';end if;
  start_time:=p_from::timestamp at time zone zone;end_time:=(p_to+1)::timestamp at time zone zone;
  return(with events as materialized(
    select e.* from private.analytics_events e left join public.listings l on l.id=e.listing_id left join public.advertisements a on a.id=e.advertisement_id
    where e.city_id=p_city_id and e.created_at>=start_time and e.created_at<end_time and (p_include_demo or not(coalesce(l.is_demo,false) or coalesce(a.is_demo,false)))
  ), enquiries as materialized(
    select q.* from private.checkout_intents q join public.listings l on l.id=q.merchant_id where l.city_id=p_city_id and (p_include_demo or not l.is_demo)
      and (q.created_at>=start_time and q.created_at<end_time or q.handoff_created_at>=start_time and q.handoff_created_at<end_time)
  ), daily_events as(select (created_at at time zone zone)::date as day,count(*) filter(where event_type='listing_view') as views,
    count(*) filter(where event_type='ad_visible_impression') as impressions,count(*) filter(where event_type='ad_click') as ad_clicks,
    count(*) filter(where event_type in('phone_click','directions_click','whatsapp_click')) as contact_clicks from events group by 1),
  daily_enquiries as(select (created_at at time zone zone)::date as day,count(*) as initiations from enquiries where created_at>=start_time and created_at<end_time group by 1),
  daily_handoffs as(select (handoff_created_at at time zone zone)::date as day,count(*) as handoffs from enquiries where handoff_created_at>=start_time and handoff_created_at<end_time group by 1),
  top_listings as(select l.id,l.name,l.is_demo,count(*) filter(where e.event_type='listing_view') as views,
    count(*) filter(where e.event_type in('phone_click','directions_click','whatsapp_click')) as contact_clicks from events e join public.listings l on l.id=e.listing_id
    where e.advertisement_id is null group by l.id order by views desc,contact_clicks desc,l.id limit 10),
  top_ads as(select a.id,a.title,a.is_demo,count(*) filter(where e.event_type='ad_visible_impression') as impressions,count(*) filter(where e.event_type='ad_click') as clicks
    from events e join public.advertisements a on a.id=e.advertisement_id group by a.id order by impressions desc,clicks desc,a.id limit 10),
  recent as(select q.reference,q.state,q.created_at,q.handoff_created_at,l.name as merchant_name from enquiries q join public.listings l on l.id=q.merchant_id order by q.created_at desc,q.id limit 20)
  select jsonb_build_object('from',p_from,'to',p_to,'timezone',zone,'include_demo',p_include_demo,
    'totals',jsonb_build_object('listing_views',(select count(*) from events where event_type='listing_view'),
      'phone_clicks',(select count(*) from events where event_type='phone_click'),'directions_clicks',(select count(*) from events where event_type='directions_click'),
      'whatsapp_clicks',(select count(*) from events where event_type='whatsapp_click'),'ad_impressions',(select count(*) from events where event_type='ad_visible_impression'),
      'ad_clicks',(select count(*) from events where event_type='ad_click'),
      'checkout_initiations',(select count(*) from enquiries where created_at>=start_time and created_at<end_time),
      'handoffs_prepared',(select count(*) from enquiries where handoff_created_at>=start_time and handoff_created_at<end_time)),
    'daily',(select jsonb_agg(jsonb_build_object('date',d.day::date,'views',coalesce(e.views,0),'impressions',coalesce(e.impressions,0),
      'ad_clicks',coalesce(e.ad_clicks,0),'contact_clicks',coalesce(e.contact_clicks,0),'initiations',coalesce(q.initiations,0),'handoffs',coalesce(h.handoffs,0)) order by d.day)
      from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')d(day) left join daily_events e on e.day=d.day::date
        left join daily_enquiries q on q.day=d.day::date left join daily_handoffs h on h.day=d.day::date),
    'listings',coalesce((select jsonb_agg(to_jsonb(l)) from top_listings l),'[]'::jsonb),
    'advertisements',coalesce((select jsonb_agg(to_jsonb(a)) from top_ads a),'[]'::jsonb),
    'enquiries',coalesce((select jsonb_agg(to_jsonb(r)) from recent r),'[]'::jsonb)));
end;
$$;

revoke all on function public.seo_public_paths(),public.seo_sitemap_index(),public.seo_sitemap_page(integer),public.public_media(uuid) from public,anon,authenticated;
grant execute on function public.seo_public_paths(),public.seo_sitemap_index(),public.seo_sitemap_page(integer),public.public_media(uuid) to anon,authenticated,service_role;
revoke all on function public.analytics_consume_limit(text,integer),public.analytics_record_events(jsonb) from public,anon,authenticated;
grant execute on function public.analytics_consume_limit(text,integer),public.analytics_record_events(jsonb) to service_role;
revoke all on function public.admin_analytics(uuid,date,date,boolean) from public,anon,authenticated;
grant execute on function public.admin_analytics(uuid,date,date,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
