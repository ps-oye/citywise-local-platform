-- Phase 4: bounded administrator transactions. Existing RLS and Storage policies stay in force.
begin;

create index listings_admin_page on public.listings(city_id,updated_at desc,id);
create index advertisements_admin_page on public.advertisements(city_id,priority,id);

create function private.require_admin() returns void
language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ACCESS_DENIED' using errcode='42501'; end if;
end;
$$;
create function private.admin_json(p_data jsonb,p_keys text[],p_max_size integer default 65536) returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>p_max_size
    or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(p_keys))) then
    raise exception 'ADMIN_INVALID_INPUT' using errcode='22023'; end if;
end;
$$;
create function private.admin_revision(p_expected timestamptz,p_actual timestamptz) returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_expected is distinct from p_actual then raise exception 'ADMIN_STALE_RECORD' using errcode='40001'; end if;
end;
$$;

create function public.admin_context(p_city_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare selected uuid;
begin
  perform private.require_admin();
  select id into selected from public.cities where p_city_id is null or id=p_city_id order by is_default desc,name,id limit 1;
  return jsonb_build_object('city_id',selected,
    'cities',coalesce((select jsonb_agg(to_jsonb(c)) from(select id,name,slug,state,country_code,timezone,enabled,is_default,updated_at from public.cities order by is_default desc,name,id limit 100)c),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c)) from(select id,parent_id,name,short_name,slug,description,icon_name,cover_image_path,display_order,enabled,is_demo,updated_at from public.categories order by display_order,name,id limit 300)c),'[]'::jsonb),
    'localities',coalesce((select jsonb_agg(to_jsonb(l)) from(select id,city_id,name,slug,enabled,is_demo,updated_at from public.localities where city_id=selected order by name,id limit 300)l),'[]'::jsonb),
    'attributes',coalesce((select jsonb_agg(to_jsonb(a)) from(select id,category_id,attribute_key,label,value_type,options,filterable from public.category_attributes order by display_order,id limit 2000)a),'[]'::jsonb));
end;
$$;

create function public.admin_overview(p_city_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'listings',(select count(*) from public.listings where city_id=p_city_id and archived_at is null),
    'published',(select count(*) from public.listings where city_id=p_city_id and publication_status='published' and archived_at is null),
    'discoverable',(select count(*) from public.listings where city_id=p_city_id and public.is_listing_public(id)),
    'drafts',(select count(*) from public.listings where city_id=p_city_id and publication_status='draft' and archived_at is null),
    'disabled',(select count(*) from public.listings where city_id=p_city_id and not enabled and archived_at is null),
    'categories',(select count(*) from public.categories where enabled),
    'products',(select count(*) from public.products p join public.listings l on l.id=p.merchant_id where l.city_id=p_city_id and p.active and p.archived_at is null),
    'active_ads',(select count(*) from public.advertisements where city_id=p_city_id and public.is_ad_public(id)),
    'checkout_initiations',(select count(*) from private.checkout_intents i join public.listings l on l.id=i.merchant_id where l.city_id=p_city_id),
    'recent',coalesce((select jsonb_agg(to_jsonb(l)) from(select id,name,slug,publication_status,enabled,updated_at from public.listings where city_id=p_city_id order by updated_at desc,id limit 6)l),'[]'::jsonb));
end;
$$;

create function public.admin_listings(p_city_id uuid,p_query text default '',p_status text default 'all',p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  if p_query is null or length(p_query)>100 or p_status is null or p_status not in ('all','published','draft','disabled','archived')
    or p_offset is null or p_offset not between 0 and 10000 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'ADMIN_INVALID_INPUT' using errcode='22023'; end if;
  return(with eligible as(
    select l.id,l.city_id,l.name,l.slug,l.listing_type,l.publication_status,l.enabled,l.sponsored,l.is_demo,l.archived_at,l.updated_at,l.demo_image_path,
      loc.name as locality_name,city.slug as city_slug,c.name as category_name,c.slug as category_slug,public.is_listing_public(l.id) as is_public,
      (select count(*) from public.products where merchant_id=l.id and archived_at is null) as product_count
    from public.listings l join public.cities city on city.id=l.city_id left join public.localities loc on loc.id=l.locality_id
    left join lateral(select cat.name,cat.slug from public.listing_categories lc join public.categories cat on cat.id=lc.category_id
      where lc.listing_id=l.id order by lc.is_primary desc,cat.display_order,cat.id limit 1)c on true
    where l.city_id=p_city_id and (trim(p_query)='' or strpos(lower(l.name||' '||l.slug),lower(trim(p_query)))>0)
      and case p_status when 'archived' then l.archived_at is not null or l.publication_status='archived'
        when 'disabled' then not l.enabled and l.archived_at is null
        when 'published' then l.publication_status='published' and l.archived_at is null
        when 'draft' then l.publication_status='draft' and l.archived_at is null else l.archived_at is null end
  ),page as(select * from eligible order by updated_at desc,id limit p_limit offset p_offset)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'total',(select count(*) from eligible),
    'has_more',(select count(*) from eligible)>p_offset+p_limit,'next_offset',p_offset+p_limit));
end;
$$;

create function public.admin_listing(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  return(select to_jsonb(l)||jsonb_build_object(
    'categories',coalesce((select jsonb_agg(jsonb_build_object('category_id',category_id,'is_primary',is_primary) order by is_primary desc,category_id) from public.listing_categories where listing_id=l.id),'[]'::jsonb),
    'attributes',coalesce((select jsonb_agg(jsonb_build_object('attribute_id',attribute_id,'value',value)) from public.listing_attributes where listing_id=l.id),'[]'::jsonb),
    'service_area_ids',coalesce((select jsonb_agg(locality_id) from public.listing_service_areas where listing_id=l.id),'[]'::jsonb),
    'actions',(select to_jsonb(a) from public.listing_actions a where a.listing_id=l.id),
    'offerings',coalesce((select jsonb_agg(to_jsonb(o)) from(select * from public.offerings where listing_id=l.id order by display_order,id limit 100)o),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(to_jsonb(m)) from(select * from public.listing_media where listing_id=l.id order by display_order,id limit 100)m),'[]'::jsonb),
    'featured_category_ids',coalesce((select jsonb_agg(distinct category_id) from public.homepage_featured_listings where listing_id=l.id and enabled),'[]'::jsonb),
    'is_public',public.is_listing_public(l.id)) from public.listings l where l.id=p_id);
end;
$$;

create function public.admin_save_listing(p_data jsonb,p_expected timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.listings; target uuid; city uuid; category_ids uuid[]; primary_id uuid; areas uuid[]; entry jsonb; definition record; value jsonb;
begin
  perform private.require_admin();
  perform private.admin_json(p_data,array['id','city_id','locality_id','name','slug','listing_type','short_description','description','address','latitude','longitude','maps_place_id','phone_number','whatsapp_number','contact_verified','timezone','publication_status','enabled','sponsored','is_demo','category_ids','primary_category_id','service_area_ids','attributes','actions','offerings']);
  target:=(p_data->>'id')::uuid;city:=(p_data->>'city_id')::uuid;
  if target is null or city is null or jsonb_typeof(p_data->'category_ids') is distinct from 'array'
    or jsonb_array_length(p_data->'category_ids') not between 1 and 20 then raise exception 'ADMIN_CATEGORY_REQUIRED' using errcode='22023';end if;
  select * into previous from public.listings where id=target for update;
  perform private.admin_revision(p_expected,previous.updated_at);
  if previous.id is not null and (previous.city_id<>city or previous.is_demo is distinct from (p_data->>'is_demo')::boolean) then
    raise exception 'ADMIN_FIXED_IDENTITY' using errcode='22023';end if;
  select array_agg(v::uuid) into category_ids from jsonb_array_elements_text(p_data->'category_ids')v;
  primary_id:=(p_data->>'primary_category_id')::uuid;
  if primary_id is null or not(primary_id=any(category_ids)) or cardinality(category_ids)<>(select count(distinct x) from unnest(category_ids)x) then
    raise exception 'ADMIN_CATEGORY_REQUIRED' using errcode='22023';end if;
  if exists(select 1 from public.homepage_featured_listings where listing_id=target and enabled and not(category_id=any(category_ids))) then
    raise exception 'ADMIN_UNFEATURE_FIRST' using errcode='22023';end if;
  if p_data->>'publication_status' not in ('draft','published','archived') then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  -- Required order: remove checkout permission before changing verified contact or listing type.
  update public.listing_actions set checkout_enabled=false where listing_id=target;
  insert into public.listings(id,city_id,locality_id,name,slug,listing_type,short_description,description,address,latitude,longitude,maps_place_id,
    phone_number,whatsapp_number,contact_verified_at,timezone,publication_status,enabled,sponsored,is_demo,archived_at)
  values(target,city,nullif(p_data->>'locality_id','')::uuid,trim(p_data->>'name'),p_data->>'slug',(p_data->>'listing_type')::public.listing_type,
    coalesce(p_data->>'short_description',''),coalesce(p_data->>'description',''),nullif(trim(p_data->>'address'),''),nullif(p_data->>'latitude','')::numeric,
    nullif(p_data->>'longitude','')::numeric,nullif(trim(p_data->>'maps_place_id'),''),nullif(trim(p_data->>'phone_number'),''),nullif(trim(p_data->>'whatsapp_number'),''),
    case when coalesce((p_data->>'contact_verified')::boolean,false) then case when previous.phone_number is not distinct from nullif(trim(p_data->>'phone_number'),'')
      and previous.whatsapp_number is not distinct from nullif(trim(p_data->>'whatsapp_number'),'') and previous.contact_verified_at is not null then previous.contact_verified_at else clock_timestamp() end else null end,
    coalesce(p_data->>'timezone','Asia/Kolkata'),(p_data->>'publication_status')::public.publication_status,(p_data->>'enabled')::boolean,
    (p_data->>'sponsored')::boolean,(p_data->>'is_demo')::boolean,case when p_data->>'publication_status'='archived' then coalesce(previous.archived_at,clock_timestamp()) else null end)
  on conflict(id) do update set locality_id=excluded.locality_id,name=excluded.name,slug=excluded.slug,listing_type=excluded.listing_type,
    short_description=excluded.short_description,description=excluded.description,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
    maps_place_id=excluded.maps_place_id,phone_number=excluded.phone_number,whatsapp_number=excluded.whatsapp_number,contact_verified_at=excluded.contact_verified_at,
    timezone=excluded.timezone,publication_status=excluded.publication_status,enabled=excluded.enabled,sponsored=excluded.sponsored,archived_at=excluded.archived_at;
  -- Diff assignments instead of deleting/reinserting unchanged featured memberships.
  delete from public.listing_attributes a where a.listing_id=target and exists(select 1 from public.category_attributes d where d.id=a.attribute_id and not(d.category_id=any(category_ids)));
  delete from public.listing_categories where listing_id=target and not(category_id=any(category_ids));
  update public.listing_categories set is_primary=false where listing_id=target and is_primary;
  insert into public.listing_categories(listing_id,category_id,is_primary) select target,c,c=primary_id from unnest(category_ids)c
    on conflict(listing_id,category_id) do update set is_primary=excluded.is_primary;
  perform private.admin_json(coalesce(p_data->'actions','{}'::jsonb),array['checkout_enabled','enquiries_while_closed','delivery_available','pickup_available','directions_enabled']);
  insert into public.listing_actions(listing_id,checkout_enabled,enquiries_while_closed,delivery_available,pickup_available,directions_enabled)
  values(target,coalesce((p_data->'actions'->>'checkout_enabled')::boolean,false),coalesce((p_data->'actions'->>'enquiries_while_closed')::boolean,false),
    coalesce((p_data->'actions'->>'delivery_available')::boolean,false),coalesce((p_data->'actions'->>'pickup_available')::boolean,true),coalesce((p_data->'actions'->>'directions_enabled')::boolean,true))
  on conflict(listing_id) do update set checkout_enabled=excluded.checkout_enabled,enquiries_while_closed=excluded.enquiries_while_closed,
    delivery_available=excluded.delivery_available,pickup_available=excluded.pickup_available,directions_enabled=excluded.directions_enabled;
  if jsonb_typeof(coalesce(p_data->'service_area_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_data->'service_area_ids','[]'::jsonb))>100 then
    raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  select coalesce(array_agg(v::uuid),'{}'::uuid[]) into areas from jsonb_array_elements_text(coalesce(p_data->'service_area_ids','[]'::jsonb))v;
  delete from public.listing_service_areas where listing_id=target and not(locality_id=any(areas));
  insert into public.listing_service_areas(listing_id,locality_id,city_id) select target,a,city from unnest(areas)a on conflict do nothing;
  if jsonb_typeof(coalesce(p_data->'attributes','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_data->'attributes','[]'::jsonb))>100 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  for entry in select * from jsonb_array_elements(coalesce(p_data->'attributes','[]'::jsonb)) loop
    perform private.admin_json(entry,array['attribute_id','value'],10000);
    select * into definition from public.category_attributes where id=(entry->>'attribute_id')::uuid and category_id=any(category_ids);
    value:=entry->'value';
    if definition.id is null or value is null or value='null'::jsonb or pg_column_size(value)>8192
      or (definition.value_type='text' and jsonb_typeof(value)<>'string') or (definition.value_type='number' and jsonb_typeof(value)<>'number')
      or (definition.value_type='boolean' and jsonb_typeof(value)<>'boolean') then raise exception 'ADMIN_INVALID_ATTRIBUTE' using errcode='22023';end if;
    if definition.value_type='options' then
      if jsonb_typeof(value)='string' then
        if not coalesce(definition.options @> jsonb_build_array(value),false) then raise exception 'ADMIN_INVALID_ATTRIBUTE' using errcode='22023';end if;
      elsif jsonb_typeof(value)='array' then
        if jsonb_array_length(value)>30 or exists(select 1 from jsonb_array_elements(value)v where not coalesce(definition.options @> jsonb_build_array(v),false)) then raise exception 'ADMIN_INVALID_ATTRIBUTE' using errcode='22023';end if;
      else raise exception 'ADMIN_INVALID_ATTRIBUTE' using errcode='22023';end if;
    end if;
    insert into public.listing_attributes(listing_id,attribute_id,value) values(target,definition.id,value)
      on conflict(listing_id,attribute_id) do update set value=excluded.value;
  end loop;
  delete from public.listing_attributes a where a.listing_id=target and not exists(
    select 1 from jsonb_array_elements(coalesce(p_data->'attributes','[]'::jsonb))e where (e->>'attribute_id')::uuid=a.attribute_id);
  if jsonb_typeof(coalesce(p_data->'offerings','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_data->'offerings','[]'::jsonb))>100 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  for entry in select * from jsonb_array_elements(coalesce(p_data->'offerings','[]'::jsonb)) loop
    perform private.admin_json(entry,array['id','kind','name','description','indicative_price_minor','price_unit','available','enabled','display_order','details'],12000);
    if exists(select 1 from public.offerings where id=(entry->>'id')::uuid and listing_id<>target) then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
    insert into public.offerings(id,listing_id,kind,name,description,indicative_price_minor,price_unit,available,enabled,display_order,details)
    values((entry->>'id')::uuid,target,entry->>'kind',trim(entry->>'name'),coalesce(entry->>'description',''),nullif(entry->>'indicative_price_minor','')::bigint,
      nullif(entry->>'price_unit',''),coalesce((entry->>'available')::boolean,true),coalesce((entry->>'enabled')::boolean,true),coalesce((entry->>'display_order')::integer,0),coalesce(entry->'details','{}'::jsonb))
    on conflict(id) do update set kind=excluded.kind,name=excluded.name,description=excluded.description,indicative_price_minor=excluded.indicative_price_minor,
      price_unit=excluded.price_unit,available=excluded.available,enabled=excluded.enabled,display_order=excluded.display_order,details=excluded.details;
  end loop;
  return public.admin_listing(target);
end;
$$;

create function public.admin_listing_state(p_id uuid,p_action text,p_expected timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_row public.listings;
begin
  perform private.require_admin();select * into current_row from public.listings where id=p_id for update;
  if current_row.id is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;
  perform private.admin_revision(p_expected,current_row.updated_at);
  if p_action='archive' then update public.listings set archived_at=clock_timestamp(),publication_status='archived',enabled=false where id=p_id;
  elsif p_action='restore' then update public.listings set archived_at=null,publication_status='draft',enabled=false where id=p_id;
  elsif p_action='publish' then update public.listings set publication_status='published',archived_at=null where id=p_id;
  elsif p_action='unpublish' then update public.listings set publication_status='draft' where id=p_id;
  elsif p_action='enable' then update public.listings set enabled=true where id=p_id;
  elsif p_action='disable' then update public.listings set enabled=false where id=p_id;
  else raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  return public.admin_listing(p_id);
end;
$$;

create function public.admin_save_taxonomy(p_kind text,p_data jsonb,p_expected timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid; previous jsonb; result jsonb;
begin
  perform private.require_admin();
  perform private.admin_json(p_data,array['id','city_id','name','slug','parent_id','short_name','description','icon_name','cover_image_path','display_order','enabled','state','country_code','timezone','is_default']);
  target:=(p_data->>'id')::uuid;if target is null then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  if p_kind='category' then
    select to_jsonb(c) into previous from public.categories c where id=target for update;
  elsif p_kind='locality' then
    select to_jsonb(l) into previous from public.localities l where id=target for update;
  elsif p_kind='city' then
    perform pg_advisory_xact_lock(hashtext('rawatbhata:admin-cities'));
    select to_jsonb(c) into previous from public.cities c where id=target for update;
  else raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  perform private.admin_revision(p_expected,(previous->>'updated_at')::timestamptz);
  if previous is not null and ((previous->>'slug') is distinct from (p_data->>'slug')
    or (p_kind='locality' and (previous->>'city_id') is distinct from (p_data->>'city_id'))) then raise exception 'ADMIN_FIXED_IDENTITY' using errcode='22023';end if;
  if p_kind='category' then
    insert into public.categories(id,parent_id,name,short_name,slug,description,icon_name,cover_image_path,display_order,enabled)
    values(target,nullif(p_data->>'parent_id','')::uuid,trim(p_data->>'name'),nullif(trim(p_data->>'short_name'),''),p_data->>'slug',coalesce(p_data->>'description',''),
      nullif(p_data->>'icon_name',''),nullif(p_data->>'cover_image_path',''),coalesce((p_data->>'display_order')::integer,0),(p_data->>'enabled')::boolean)
    on conflict(id) do update set parent_id=excluded.parent_id,name=excluded.name,short_name=excluded.short_name,description=excluded.description,
      icon_name=excluded.icon_name,cover_image_path=excluded.cover_image_path,display_order=excluded.display_order,enabled=excluded.enabled;
    select to_jsonb(c) into result from public.categories c where id=target;
  elsif p_kind='locality' then
    insert into public.localities(id,city_id,name,slug,enabled) values(target,(p_data->>'city_id')::uuid,trim(p_data->>'name'),p_data->>'slug',(p_data->>'enabled')::boolean)
    on conflict(id) do update set name=excluded.name,enabled=excluded.enabled;
    select to_jsonb(l) into result from public.localities l where id=target;
  else
    if coalesce((p_data->>'is_default')::boolean,false) then update public.cities set is_default=false where is_default and id<>target;end if;
    insert into public.cities(id,name,slug,state,country_code,timezone,enabled,is_default)
    values(target,trim(p_data->>'name'),p_data->>'slug',trim(p_data->>'state'),coalesce(p_data->>'country_code','IN'),coalesce(p_data->>'timezone','Asia/Kolkata'),
      (p_data->>'enabled')::boolean,coalesce((p_data->>'is_default')::boolean,false))
    on conflict(id) do update set name=excluded.name,state=excluded.state,country_code=excluded.country_code,timezone=excluded.timezone,enabled=excluded.enabled,is_default=excluded.is_default;
    select to_jsonb(c) into result from public.cities c where id=target;
  end if;
  return result;
end;
$$;
create function public.admin_delete_taxonomy(p_kind text,p_id uuid,p_expected timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
declare revision timestamptz;
begin
  perform private.require_admin();
  if p_kind='category' then select updated_at into revision from public.categories where id=p_id for update;
  elsif p_kind='locality' then select updated_at into revision from public.localities where id=p_id for update;
  elsif p_kind='city' then select updated_at into revision from public.cities where id=p_id for update;
  else raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  if revision is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;
  perform private.admin_revision(p_expected,revision);
  if p_kind='category' then delete from public.categories where id=p_id;
  elsif p_kind='locality' then delete from public.localities where id=p_id;
  else
    if exists(select 1 from public.cities where id=p_id and is_default) then raise exception 'ADMIN_DEFAULT_CITY' using errcode='22023';end if;
    delete from public.cities where id=p_id;
  end if;
  return true;
end;
$$;

create function public.admin_ads(p_city_id uuid,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  if p_offset is null or p_offset not between 0 and 10000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  return(with page as(select a.*,public.is_ad_public(a.id) as is_public from public.advertisements a where city_id=p_city_id order by priority,id limit p_limit offset p_offset)
    select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),
      'has_more',(select count(*) from public.advertisements where city_id=p_city_id)>p_offset+p_limit,'next_offset',p_offset+p_limit));
end;
$$;
create function public.admin_ad(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  return(select to_jsonb(a)||jsonb_build_object('is_public',public.is_ad_public(a.id)) from public.advertisements a where id=p_id);
end;
$$;
revoke all on function public.admin_ad(uuid) from public,anon,authenticated;
grant execute on function public.admin_ad(uuid) to authenticated;

create function public.admin_save_ad(p_data jsonb,p_expected timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.advertisements; target uuid; zone text; begins timestamptz; ends timestamptz;
begin
  perform private.require_admin();
  perform private.admin_json(p_data,array['id','city_id','listing_id','title','subtitle','cta_text','destination_url','alt_text','starts_local','ends_local','priority','enabled','sponsored','archive']);
  target:=(p_data->>'id')::uuid;select * into previous from public.advertisements where id=target for update;
  perform private.admin_revision(p_expected,previous.updated_at);
  if previous.id is not null and previous.city_id<>(p_data->>'city_id')::uuid then raise exception 'ADMIN_FIXED_IDENTITY' using errcode='22023';end if;
  select timezone into zone from public.cities where id=(p_data->>'city_id')::uuid;
  if zone is null then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  begins:=coalesce(nullif(p_data->>'starts_local','')::timestamp at time zone zone,clock_timestamp());
  ends:=nullif(p_data->>'ends_local','')::timestamp at time zone zone;
  insert into public.advertisements(id,city_id,listing_id,title,subtitle,cta_text,destination_url,alt_text,starts_at,ends_at,priority,enabled,sponsored,archived_at,
    desktop_image_path,mobile_image_path,demo_image_path,demo_mobile_image_path,is_demo)
  values(target,(p_data->>'city_id')::uuid,nullif(p_data->>'listing_id','')::uuid,trim(p_data->>'title'),coalesce(p_data->>'subtitle',''),nullif(p_data->>'cta_text',''),
    nullif(trim(p_data->>'destination_url'),''),trim(p_data->>'alt_text'),begins,ends,coalesce((p_data->>'priority')::integer,0),
    case when coalesce((p_data->>'archive')::boolean,false) then false else coalesce((p_data->>'enabled')::boolean,false) end,
    coalesce((p_data->>'sponsored')::boolean,true),case when coalesce((p_data->>'archive')::boolean,false) then coalesce(previous.archived_at,clock_timestamp()) else null end,
    previous.desktop_image_path,previous.mobile_image_path,previous.demo_image_path,previous.demo_mobile_image_path,coalesce(previous.is_demo,false))
  on conflict(id) do update set listing_id=excluded.listing_id,title=excluded.title,subtitle=excluded.subtitle,cta_text=excluded.cta_text,destination_url=excluded.destination_url,
    alt_text=excluded.alt_text,starts_at=excluded.starts_at,ends_at=excluded.ends_at,priority=excluded.priority,enabled=excluded.enabled,sponsored=excluded.sponsored,archived_at=excluded.archived_at;
  return(select to_jsonb(a)||jsonb_build_object('is_public',public.is_ad_public(a.id)) from public.advertisements a where id=target);
end;
$$;

create function public.admin_ranking(p_city_id uuid,p_category_id uuid,p_query text default '') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare selected_section uuid;
begin
  perform private.require_admin();
  if p_query is null or length(p_query)>100 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  select id into selected_section from public.homepage_sections where city_id=p_city_id and category_id=p_category_id;
  return jsonb_build_object(
    'section',(select to_jsonb(s) from public.homepage_sections s where id=selected_section),
    'sections',coalesce((select jsonb_agg(to_jsonb(s)) from(select id,category_id,title,display_order,enabled,updated_at from public.homepage_sections where city_id=p_city_id order by display_order,id limit 300)s),'[]'::jsonb),
    'placements',coalesce((select jsonb_agg(to_jsonb(f)) from(select f.listing_id,f.rank,f.enabled,l.name,l.slug,l.publication_status,l.enabled as listing_enabled,public.is_listing_public(l.id) as is_public
      from public.homepage_featured_listings f join public.listings l on l.id=f.listing_id where f.section_id=selected_section order by f.rank,l.id limit 100)f),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(to_jsonb(l)) from(select l.id,l.name,l.publication_status,l.enabled,public.is_listing_public(l.id) as is_public
      from public.listings l join public.listing_categories lc on lc.listing_id=l.id and lc.category_id=p_category_id where l.city_id=p_city_id and l.archived_at is null
      and (trim(p_query)='' or strpos(lower(l.name),lower(trim(p_query)))>0) order by l.name,l.id limit 30)l),'[]'::jsonb));
end;
$$;
create function public.admin_save_ranking(p_section jsonb,p_entries jsonb,p_expected timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.homepage_sections; target uuid; entry jsonb; position integer:=0;
begin
  perform private.require_admin();perform private.admin_json(p_section,array['id','city_id','category_id','title','display_order','enabled']);
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>100 or pg_column_size(p_entries)>16000 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  target:=(p_section->>'id')::uuid;select * into previous from public.homepage_sections where id=target for update;
  perform private.admin_revision(p_expected,previous.updated_at);
  if previous.id is not null and (previous.city_id<>(p_section->>'city_id')::uuid or previous.category_id<>(p_section->>'category_id')::uuid) then raise exception 'ADMIN_FIXED_IDENTITY' using errcode='22023';end if;
  if (select count(distinct e->>'listing_id') from jsonb_array_elements(p_entries)e)<>jsonb_array_length(p_entries) then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  insert into public.homepage_sections(id,city_id,category_id,title,display_order,enabled)
  values(target,(p_section->>'city_id')::uuid,(p_section->>'category_id')::uuid,nullif(trim(p_section->>'title'),''),coalesce((p_section->>'display_order')::integer,0),(p_section->>'enabled')::boolean)
  on conflict(id) do update set title=excluded.title,display_order=excluded.display_order,enabled=excluded.enabled;
  update public.homepage_featured_listings f set enabled=false where f.section_id=target and not exists(select 1 from jsonb_array_elements(p_entries)e where (e->>'listing_id')::uuid=f.listing_id);
  for entry in select * from jsonb_array_elements(p_entries) loop
    perform private.admin_json(entry,array['listing_id','enabled'],1000);position:=position+1;
    insert into public.homepage_featured_listings(section_id,listing_id,city_id,category_id,rank,enabled)
    values(target,(entry->>'listing_id')::uuid,(p_section->>'city_id')::uuid,(p_section->>'category_id')::uuid,position,(entry->>'enabled')::boolean)
    on conflict(section_id,listing_id) do update set rank=excluded.rank,enabled=excluded.enabled;
  end loop;
  return public.admin_ranking((p_section->>'city_id')::uuid,(p_section->>'category_id')::uuid);
end;
$$;

create function public.admin_hours(p_listing_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare merchant public.listings;
begin
  perform private.require_admin();select * into merchant from public.listings where id=p_listing_id;
  if merchant.id is null then return null;end if;
  return jsonb_build_object('listing_id',merchant.id,'name',merchant.name,'timezone',merchant.timezone,'revision',merchant.updated_at,'status',public.merchant_availability(merchant.id,clock_timestamp()),
    'weekly',coalesce((select jsonb_agg(jsonb_build_object('weekday',weekday,'opens_at',opens_at,'closes_at',closes_at,'ends_next_day',ends_next_day) order by weekday,opens_at) from public.business_hours where listing_id=merchant.id),'[]'::jsonb),
    'special',coalesce((select jsonb_agg(to_jsonb(s)) from(select h.id,h.on_date,h.closed,h.label,
      coalesce((select jsonb_agg(jsonb_build_object('opens_at',opens_at,'closes_at',closes_at,'ends_next_day',ends_next_day) order by opens_at) from public.special_hour_intervals where special_hours_id=h.id),'[]'::jsonb) as intervals
      from public.special_hours h where h.listing_id=merchant.id and h.on_date>=(now() at time zone merchant.timezone)::date-1 order by h.on_date limit 40)s),'[]'::jsonb),
    'override',(select to_jsonb(o) from public.temporary_status_overrides o where listing_id=merchant.id and revoked_at is null order by starts_at desc,id limit 1),
    'enquiries_while_closed',coalesce((select enquiries_while_closed from public.listing_actions where listing_id=merchant.id),false));
end;
$$;
create function public.admin_save_hours(p_listing_id uuid,p_weekly jsonb,p_special jsonb,p_removed uuid[],p_expected timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare merchant public.listings; entry jsonb; shift jsonb; special_id uuid; event_time timestamptz;
begin
  perform private.require_admin();select * into merchant from public.listings where id=p_listing_id for update;
  if merchant.id is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;
  perform private.admin_revision(p_expected,merchant.updated_at);
  if jsonb_typeof(p_weekly) is distinct from 'array' or jsonb_array_length(p_weekly)>35 or jsonb_typeof(p_special) is distinct from 'array'
    or jsonb_array_length(p_special)>40 or coalesce(cardinality(p_removed),0)>40 or pg_column_size(p_weekly)+pg_column_size(p_special)>65536 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  delete from public.business_hours where listing_id=p_listing_id;
  for shift in select * from jsonb_array_elements(p_weekly) loop
    perform private.admin_json(shift,array['weekday','opens_at','closes_at','ends_next_day'],1000);
    insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day) values(p_listing_id,(shift->>'weekday')::smallint,(shift->>'opens_at')::time,(shift->>'closes_at')::time,coalesce((shift->>'ends_next_day')::boolean,false));
  end loop;
  if exists(with shifts as(select id,weekday*86400+extract(epoch from opens_at) as begins,
    weekday*86400+extract(epoch from closes_at)+case when ends_next_day then 86400 else 0 end as ends
    from public.business_hours where listing_id=p_listing_id)
    select 1 from shifts a cross join shifts b where a.id<>b.id and (
      numrange(a.begins,a.ends,'[)') && numrange(b.begins,b.ends,'[)') or
      numrange(a.begins,a.ends,'[)') && numrange(b.begins+604800,b.ends+604800,'[)'))) then
    raise exception 'ADMIN_OVERLAPPING_HOURS' using errcode='22023';end if;
  delete from public.special_hours where listing_id=p_listing_id and id=any(coalesce(p_removed,'{}'::uuid[]));
  for entry in select * from jsonb_array_elements(p_special) loop
    perform private.admin_json(entry,array['id','on_date','closed','label','intervals'],16000);
    special_id:=(entry->>'id')::uuid;
    if special_id is null or exists(select 1 from public.special_hours where id=special_id and listing_id<>p_listing_id)
      or jsonb_typeof(entry->'intervals') is distinct from 'array' or jsonb_array_length(entry->'intervals')>5 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
    insert into public.special_hours(id,listing_id,on_date,closed,label) values(special_id,p_listing_id,(entry->>'on_date')::date,(entry->>'closed')::boolean,nullif(entry->>'label',''))
      on conflict(id) do update set on_date=excluded.on_date,closed=excluded.closed,label=excluded.label;
    delete from public.special_hour_intervals where special_hours_id=special_id;
    if not(entry->>'closed')::boolean then
      for shift in select * from jsonb_array_elements(entry->'intervals') loop
        perform private.admin_json(shift,array['opens_at','closes_at','ends_next_day'],1000);
        insert into public.special_hour_intervals(special_hours_id,opens_at,closes_at,ends_next_day) values(special_id,(shift->>'opens_at')::time,(shift->>'closes_at')::time,coalesce((shift->>'ends_next_day')::boolean,false));
      end loop;
    end if;
  end loop;
  update public.listings set updated_at=clock_timestamp() where id=p_listing_id;
  if exists(with shifts as(select i.id,h.on_date,i.opens_at,i.closes_at,i.ends_next_day,
      h.on_date+i.opens_at as begins,h.on_date+i.closes_at+case when i.ends_next_day then interval '1 day' else interval '0' end as ends
      from public.special_hours h join public.special_hour_intervals i on i.special_hours_id=h.id where h.listing_id=p_listing_id and not h.closed)
    select 1 from shifts a cross join shifts b where a.id<>b.id and tsrange(a.begins,a.ends,'[)') && tsrange(b.begins,b.ends,'[)')) then
    raise exception 'ADMIN_OVERLAPPING_HOURS' using errcode='22023';end if;
  return public.admin_hours(p_listing_id);
end;
$$;
create function public.admin_set_override(p_listing_id uuid,p_data jsonb,p_expected timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare merchant public.listings; event_time timestamptz; begins timestamptz; ends timestamptz;
begin
  perform private.require_admin();perform private.admin_json(p_data,array['status','reason','starts_local','expires_local','enquiries_while_closed'],3000);
  select * into merchant from public.listings where id=p_listing_id for update;
  if merchant.id is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;
  perform private.admin_revision(p_expected,merchant.updated_at);
  perform 1 from public.temporary_status_overrides where listing_id=p_listing_id and revoked_at is null for update;
  event_time:=clock_timestamp();
  if p_data->>'status' is null or p_data->>'status' not in ('open','closed','schedule') then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  -- Explicit cancellation of a not-yet-effective override; audit metadata preserves the real action time.
  delete from public.temporary_status_overrides where listing_id=p_listing_id and revoked_at is null and starts_at>event_time;
  update public.temporary_status_overrides set revoked_at=event_time where listing_id=p_listing_id and revoked_at is null and starts_at<=event_time;
  if p_data->>'status'<>'schedule' then
    begins:=coalesce(nullif(p_data->>'starts_local','')::timestamp at time zone merchant.timezone,event_time);
    ends:=nullif(p_data->>'expires_local','')::timestamp at time zone merchant.timezone;
    insert into public.temporary_status_overrides(listing_id,status,reason,starts_at,expires_at) values(p_listing_id,p_data->>'status',nullif(trim(p_data->>'reason'),''),begins,ends);
  end if;
  insert into public.listing_actions(listing_id,enquiries_while_closed) values(p_listing_id,coalesce((p_data->>'enquiries_while_closed')::boolean,false))
    on conflict(listing_id) do update set enquiries_while_closed=excluded.enquiries_while_closed;
  update public.listings set updated_at=event_time where id=p_listing_id;
  return public.admin_hours(p_listing_id);
end;
$$;

create function public.admin_attach_media(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid; result jsonb; parent public.listings; ad public.advertisements;
begin
  perform private.require_admin();perform private.admin_json(p_data,array['entity','entity_id','object_path','alt_text','role','expected'],3000);
  target:=(p_data->>'entity_id')::uuid;
  if p_data->>'entity'='listing' then
    select * into parent from public.listings where id=target for update;
    if parent.id is null or p_data->>'role' not in ('banner','logo','gallery') then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
    perform private.admin_revision((p_data->>'expected')::timestamptz,parent.updated_at);
    if (select count(*) from public.listing_media where listing_id=target)>=100 then raise exception 'ADMIN_MEDIA_LIMIT' using errcode='22023';end if;
    if p_data->>'role' in ('banner','logo') then update public.listing_media set media_role='gallery' where listing_id=target and media_role=p_data->>'role';end if;
    insert into public.listing_media(listing_id,object_path,alt_text,media_role) values(target,p_data->>'object_path',trim(p_data->>'alt_text'),p_data->>'role');
    update public.listings set demo_image_path=case when p_data->>'role'='banner' then null else demo_image_path end,updated_at=clock_timestamp() where id=target;
    return public.admin_listing(target);
  elsif p_data->>'entity'='advertisement' then
    select * into ad from public.advertisements where id=target for update;
    if ad.id is null or p_data->>'role' not in ('desktop','mobile') then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
    perform private.admin_revision((p_data->>'expected')::timestamptz,ad.updated_at);
    if p_data->>'role'='desktop' then update public.advertisements set desktop_image_path=p_data->>'object_path',demo_image_path=null,
      demo_mobile_image_path=null,alt_text=trim(p_data->>'alt_text') where id=target;
    else update public.advertisements set mobile_image_path=p_data->>'object_path',demo_mobile_image_path=null,alt_text=trim(p_data->>'alt_text') where id=target;end if;
    return(select to_jsonb(a) from public.advertisements a where id=target);
  else raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
end;
$$;
create function public.admin_update_media(p_id uuid,p_alt_text text,p_role text,p_enabled boolean,p_order integer,p_expected timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item public.listing_media; revision timestamptz;
begin
  perform private.require_admin();select * into item from public.listing_media where id=p_id;
  if item.id is null or p_role not in ('banner','gallery','logo') then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  select updated_at into revision from public.listings where id=item.listing_id for update;
  perform private.admin_revision(p_expected,revision);
  if p_enabled and p_role in ('banner','logo') then update public.listing_media set media_role='gallery' where listing_id=item.listing_id and id<>p_id and media_role=p_role;end if;
  update public.listing_media set alt_text=trim(p_alt_text),media_role=p_role,enabled=p_enabled,display_order=p_order where id=p_id;
  update public.listings set demo_image_path=case when p_enabled and p_role='banner' then null else demo_image_path end,updated_at=clock_timestamp() where id=item.listing_id;
  return public.admin_listing(item.listing_id);
end;
$$;
create function public.admin_remove_media(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item public.listing_media; ad public.advertisements; target uuid; path text; revision timestamptz;
begin
  perform private.require_admin();perform private.admin_json(p_data,array['entity','entity_id','media_id','role','expected'],2000);
  target:=(p_data->>'entity_id')::uuid;
  if p_data->>'entity'='listing' then
    select updated_at into revision from public.listings where id=target for update;
    perform private.admin_revision((p_data->>'expected')::timestamptz,revision);
    select * into item from public.listing_media where id=(p_data->>'media_id')::uuid and listing_id=target for update;
    if item.id is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;
    if exists(select 1 from public.products where image_media_id=item.id) then raise exception 'ADMIN_MEDIA_IN_USE' using errcode='22023';end if;
    delete from public.listing_media where id=item.id;update public.listings set updated_at=clock_timestamp() where id=target;
    return jsonb_build_object('bucket','listing-media','path',item.object_path,'record',public.admin_listing(target));
  elsif p_data->>'entity'='advertisement' then
    select * into ad from public.advertisements where id=target for update;
    if ad.id is null or p_data->>'role' not in ('desktop','mobile') then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
    perform private.admin_revision((p_data->>'expected')::timestamptz,ad.updated_at);
    if ad.enabled then raise exception 'ADMIN_PAUSE_AD_FIRST' using errcode='22023';end if;
    if p_data->>'role'='desktop' then path:=ad.desktop_image_path;update public.advertisements set desktop_image_path=null where id=target;
    else path:=ad.mobile_image_path;update public.advertisements set mobile_image_path=null where id=target;end if;
    return jsonb_build_object('bucket','promotional-media','path',path,'record',public.admin_ad(target));
  else raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
end;
$$;

-- Forward replacement preserves the existing public contract and adds the bounded, RLS-filtered logo.
create or replace function public.merchant_detail(p_city_slug text,p_category_slug text,p_listing_slug text) returns jsonb
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
    'logo',(select jsonb_build_object('bucket_id',m.bucket_id,'object_path',m.object_path,'alt_text',m.alt_text) from public.listing_media m where m.listing_id=l.id and m.enabled and m.media_role='logo' order by m.display_order,m.id limit 1),
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

-- Explicit grant lists only; no existing policy, bucket, administrator or business row is changed here.
revoke all on function private.require_admin(),private.admin_json(jsonb,text[],integer),private.admin_revision(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function private.require_admin(),private.admin_json(jsonb,text[],integer),private.admin_revision(timestamptz,timestamptz) to authenticated;
revoke all on function public.admin_context(uuid),public.admin_overview(uuid),public.admin_listings(uuid,text,text,integer,integer),public.admin_listing(uuid),
  public.admin_save_listing(jsonb,timestamptz),public.admin_listing_state(uuid,text,timestamptz),public.admin_save_taxonomy(text,jsonb,timestamptz),public.admin_delete_taxonomy(text,uuid,timestamptz),
  public.admin_ads(uuid,integer,integer),public.admin_save_ad(jsonb,timestamptz),public.admin_ranking(uuid,uuid,text),public.admin_save_ranking(jsonb,jsonb,timestamptz),
  public.admin_hours(uuid),public.admin_save_hours(uuid,jsonb,jsonb,uuid[],timestamptz),public.admin_set_override(uuid,jsonb,timestamptz),public.admin_attach_media(jsonb),
  public.admin_update_media(uuid,text,text,boolean,integer,timestamptz),public.admin_remove_media(jsonb) from public,anon,authenticated;
grant execute on function public.admin_context(uuid),public.admin_overview(uuid),public.admin_listings(uuid,text,text,integer,integer),public.admin_listing(uuid),
  public.admin_save_listing(jsonb,timestamptz),public.admin_listing_state(uuid,text,timestamptz),public.admin_save_taxonomy(text,jsonb,timestamptz),public.admin_delete_taxonomy(text,uuid,timestamptz),
  public.admin_ads(uuid,integer,integer),public.admin_save_ad(jsonb,timestamptz),public.admin_ranking(uuid,uuid,text),public.admin_save_ranking(jsonb,jsonb,timestamptz),
  public.admin_hours(uuid),public.admin_save_hours(uuid,jsonb,jsonb,uuid[],timestamptz),public.admin_set_override(uuid,jsonb,timestamptz),public.admin_attach_media(jsonb),
  public.admin_update_media(uuid,text,text,boolean,integer,timestamptz),public.admin_remove_media(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
