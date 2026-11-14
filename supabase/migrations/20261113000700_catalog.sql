-- Phase 5: bounded catalog editing and immutable import previews. No catalog rows are changed on installation.
begin;

create table private.catalog_import_previews (
  job_id uuid primary key,
  merchant_id uuid not null,
  request_digest text not null check(length(request_digest)=64),
  snapshot text not null check(length(snapshot)=64),
  source jsonb not null check(jsonb_typeof(source)='object' and pg_column_size(source)<=2048),
  payload jsonb not null check(jsonb_typeof(payload)='array' and jsonb_array_length(payload) between 1 and 1000 and pg_column_size(payload)<=1048576),
  plan jsonb not null check(jsonb_typeof(plan)='array' and pg_column_size(plan)<=7340032),
  summary jsonb not null check(jsonb_typeof(summary)='object' and pg_column_size(summary)<=8192),
  expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(job_id,merchant_id) references private.product_import_jobs(id,merchant_id) on delete cascade
);
alter table private.catalog_import_previews enable row level security;
revoke all on private.catalog_import_previews from public,anon,authenticated;
grant select on private.catalog_import_previews to authenticated;
grant all on private.catalog_import_previews to service_role;
create policy admin_read on private.catalog_import_previews for select to authenticated using((select public.is_admin()));
create trigger catalog_import_previews_updated before update on private.catalog_import_previews for each row execute function private.touch_updated_at();
create index products_admin_catalog on public.products(merchant_id,updated_at desc,id);

create function private.catalog_problem(p_column text,p_code text,p_message text) returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
  raise exception 'CATALOG_ROW_INVALID' using errcode='22023',detail=jsonb_build_object('column_name',p_column,'error_code',p_code,'message',p_message)::text;
end;
$$;
create function private.catalog_money(p_value jsonb,p_column text,p_required boolean default true) returns bigint
language plpgsql immutable security invoker set search_path='' as $$
declare value text; result numeric;
begin
  if p_value is null or p_value='null'::jsonb or p_value='""'::jsonb then
    if p_required then perform private.catalog_problem(p_column,'required','A price is required.');end if;return null;
  end if;
  if jsonb_typeof(p_value) not in ('string','number') then perform private.catalog_problem(p_column,'invalid_price','Use a non-negative amount with at most two decimal places.');end if;
  value:=trim(p_value #>> '{}');
  if value!~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then perform private.catalog_problem(p_column,'invalid_price','Use a non-negative amount with at most two decimal places, without currency symbols or separators.');end if;
  result:=value::numeric*100;
  if result>99999999999 then perform private.catalog_problem(p_column,'price_limit','The price exceeds the supported maximum.');end if;
  return result::bigint;
end;
$$;
create function private.catalog_boolean(p_value jsonb,p_column text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare value text:=lower(trim(p_value #>> '{}'));
begin
  if value in ('true','yes','1') then return true;elsif value in ('false','no','0') then return false;end if;
  perform private.catalog_problem(p_column,'invalid_boolean','Use true/false, yes/no or 1/0.');return null;
end;
$$;
create function private.catalog_values(p_merchant uuid,p_data jsonb,p_current public.products,p_mode text,p_spreadsheet boolean default true) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare value jsonb; key text; result jsonb; sku text; name text; text_value text; category uuid; media uuid; amount bigint; original bigint; matches integer;
begin
  perform private.require_admin();
  perform private.admin_json(p_data,case when p_mode='price_only' then array['sku','price','original_price'] else array['sku','name','description','category','price','original_price','unit','dietary_type','available','active','display_order','image_reference'] end,16384);
  for key,value in select * from jsonb_each(p_data) loop
    if jsonb_typeof(value) not in ('string','number','boolean','null') then perform private.catalog_problem(key,'invalid_cell','Use a plain text, number or boolean cell. Dates and spreadsheet errors are not catalog values.');end if;
    if p_spreadsheet and jsonb_typeof(value)='string' and (value #>> '{}')~ '^[[:space:]]*[=+@-]' then perform private.catalog_problem(key,'formula','Formula-like cells are not imported. Replace formulas with literal values.');end if;
    if jsonb_typeof(value)='string' and (value #>> '{}')~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' then perform private.catalog_problem(key,'control_character','Remove unsupported control characters.');end if;
  end loop;
  sku:=trim(p_data->>'sku');
  if jsonb_typeof(p_data->'sku') is distinct from 'string' or sku is null or length(sku) not between 1 and 80 then perform private.catalog_problem('sku','invalid_sku','SKU must be text containing 1–80 characters. Format Excel SKU cells as Text.');end if;
  if p_current.archived_at is not null then perform private.catalog_problem('sku','archived_sku','This SKU is archived. Restore it in the catalog before importing updates.');end if;
  if p_mode='price_only' and p_current.id is null then perform private.catalog_problem('sku','unknown_sku','Price-only updates require an existing SKU in this merchant.');end if;
  amount:=private.catalog_money(p_data->'price','price');
  original:=case when p_data ? 'original_price' then private.catalog_money(p_data->'original_price','original_price',false) else p_current.original_price_minor end;
  if original<amount then perform private.catalog_problem('original_price','original_below_price','Original price must be at least the current price. Include Original Price to raise or clear an existing value.');end if;
  if p_mode='price_only' then return jsonb_build_object('sku',sku,'price_minor',amount,'original_price_minor',original);end if;
  name:=trim(p_data->>'name');
  if jsonb_typeof(p_data->'name') is distinct from 'string' or name is null or length(name) not between 1 and 180 then perform private.catalog_problem('name','invalid_name','Product name must contain 1–180 characters.');end if;
  result:=jsonb_build_object('sku',sku,'name',name,'price_minor',amount,'original_price_minor',original,
    'description',coalesce(p_current.description,''),'unit',coalesce(p_current.unit,'item'),'dietary_type',coalesce(p_current.dietary_type,'not_applicable'),
    'available',coalesce(p_current.available,true),'active',coalesce(p_current.active,true),'display_order',coalesce(p_current.display_order,0),
    'product_category_id',p_current.product_category_id,'image_media_id',p_current.image_media_id);
  if p_data ? 'description' then
    if jsonb_typeof(p_data->'description') not in ('string','null') or length(coalesce(p_data->>'description',''))>5000 then perform private.catalog_problem('description','invalid_description','Description must be plain text up to 5,000 characters.');end if;
    result:=result||jsonb_build_object('description',trim(coalesce(p_data->>'description','')));
  end if;
  if p_data ? 'unit' then
    text_value:=coalesce(nullif(trim(p_data->>'unit'),''),'item');
    if jsonb_typeof(p_data->'unit') not in ('string','null') or length(text_value)>80 then perform private.catalog_problem('unit','invalid_unit','Unit must contain 1–80 characters, such as item, kg or box.');end if;
    result:=result||jsonb_build_object('unit',text_value);
  end if;
  if p_data ? 'dietary_type' then
    text_value:=coalesce(nullif(replace(replace(lower(trim(coalesce(p_data->>'dietary_type',''))),'-','_'),' ','_'),''),'not_applicable');
    if text_value not in ('vegetarian','non_vegetarian','egg','not_applicable') then perform private.catalog_problem('dietary_type','invalid_dietary','Use vegetarian, non_vegetarian, egg or not_applicable.');end if;
    result:=result||jsonb_build_object('dietary_type',text_value);
  end if;
  foreach key in array array['available','active'] loop
    if p_data ? key then result:=result||jsonb_build_object(key,case when p_data->key in ('null'::jsonb,'""'::jsonb) then true else private.catalog_boolean(p_data->key,key) end);end if;
  end loop;
  if p_data ? 'display_order' then
    text_value:=coalesce(nullif(trim(p_data->>'display_order'),''),'0');
    if text_value is null or text_value!~ '^[0-9]{1,7}$' or text_value::integer>1000000 then perform private.catalog_problem('display_order','invalid_order','Display order must be an integer from 0 to 1,000,000.');end if;
    result:=result||jsonb_build_object('display_order',text_value::integer);
  end if;
  if p_data ? 'category' then
    text_value:=trim(coalesce(p_data->>'category',''));
    if text_value<>'' then
      select id into category from public.product_categories where merchant_id=p_merchant and slug=text_value;
      if category is null then
        select count(*) into matches from public.product_categories where merchant_id=p_merchant and lower(name)=lower(text_value);
        if matches=1 then select id into category from public.product_categories where merchant_id=p_merchant and lower(name)=lower(text_value);end if;
      end if;
      if category is null then perform private.catalog_problem('category','unknown_category','Choose an existing, unambiguous product-category name or slug in this merchant.');end if;
    end if;
    result:=result||jsonb_build_object('product_category_id',category);
  end if;
  if p_data ? 'image_reference' then
    text_value:=trim(coalesce(p_data->>'image_reference',''));
    if text_value<>'' then
      if text_value!~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then perform private.catalog_problem('image_reference','invalid_image','Use a media UUID from this merchant, not an external image URL.');end if;
      select id into media from public.listing_media where id=text_value::uuid and listing_id=p_merchant and enabled;
      if media is null then perform private.catalog_problem('image_reference','foreign_image','The selected image must be enabled and belong to this merchant.');end if;
    end if;
    result:=result||jsonb_build_object('image_media_id',media);
  end if;
  return result;
end;
$$;

create function private.catalog_snapshot(p_merchant uuid,p_rows jsonb) returns text
language sql stable security invoker set search_path='' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'merchant',(select jsonb_build_object('id',id,'updated_at',updated_at,'listing_type',listing_type,'archived_at',archived_at) from public.listings where id=p_merchant),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.sku) from public.products p where p.merchant_id=p_merchant and p.sku in(select trim(e->>'sku') from jsonb_array_elements(p_rows)e)),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.product_categories c where c.merchant_id=p_merchant),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',id,'enabled',enabled,'updated_at',updated_at) order by id) from public.listing_media where listing_id=p_merchant),'[]'::jsonb)
  )::text,'UTF8')),'hex');
$$;
create function private.catalog_version(p_merchant uuid,p_job uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare next_version integer;
begin
  perform private.require_admin();perform 1 from public.listings where id=p_merchant for update;
  select coalesce(max(version),0)+1 into next_version from private.catalog_versions where merchant_id=p_merchant;
  insert into private.catalog_versions(merchant_id,import_job_id,version) values(p_merchant,p_job,next_version);return next_version;
end;
$$;

create function public.admin_catalog_context(p_merchant_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare merchant public.listings;
begin
  perform private.require_admin();select * into merchant from public.listings where id=p_merchant_id;
  if merchant.id is null or merchant.listing_type not in ('COMMERCE','RESTAURANT') then raise exception 'CATALOG_MERCHANT_REQUIRED' using errcode='22023';end if;
  return jsonb_build_object('merchant',jsonb_build_object('id',merchant.id,'name',merchant.name,'city_id',merchant.city_id,'listing_type',merchant.listing_type,'archived_at',merchant.archived_at,'is_demo',merchant.is_demo),
    'categories',coalesce((select jsonb_agg(to_jsonb(c)) from(select * from public.product_categories where merchant_id=merchant.id order by display_order,name,id limit 300)c),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(to_jsonb(m)) from(select id,object_path,bucket_id,alt_text,enabled from public.listing_media where listing_id=merchant.id order by display_order,id limit 100)m),'[]'::jsonb),
    'version',(select coalesce(max(version),0) from private.catalog_versions where merchant_id=merchant.id));
end;
$$;
create function public.admin_catalog_merchants(p_city_id uuid,p_query text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  if p_query is null or length(p_query)>100 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  return(with eligible as(select l.id,l.name,l.listing_type,l.publication_status,l.enabled from public.listings l where l.city_id=p_city_id and l.archived_at is null
    and l.listing_type in ('COMMERCE','RESTAURANT') and (trim(p_query)='' or strpos(lower(l.name||' '||l.slug),lower(trim(p_query)))>0)),
    page as(select * from eligible order by name,id limit 20 offset p_offset)
    select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'has_more',(select count(*) from eligible)>p_offset+20));
end;
$$;
create function public.admin_catalog_products(p_merchant_id uuid,p_query text default '',p_status text default 'all',p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  if p_query is null or length(p_query)>100 or p_status not in ('all','active','inactive','unavailable','archived') or p_status is null or p_offset is null or p_offset not between 0 and 100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  return(with eligible as(select p.*,c.name as category_name,c.slug as category_slug from public.products p left join public.product_categories c on c.id=p.product_category_id
    where p.merchant_id=p_merchant_id and (trim(p_query)='' or strpos(lower(p.name||' '||p.sku),lower(trim(p_query)))>0)
    and case p_status when 'archived' then p.archived_at is not null when 'active' then p.active and p.archived_at is null when 'inactive' then not p.active and p.archived_at is null when 'unavailable' then not p.available and p.archived_at is null else p.archived_at is null end),
    page as(select * from eligible order by display_order,lower(name),id limit p_limit offset p_offset)
    select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'total',(select count(*) from eligible),'has_more',(select count(*) from eligible)>p_offset+p_limit));
end;
$$;
create function public.admin_catalog_product(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();return(select to_jsonb(p)||jsonb_build_object('category',c.slug) from public.products p left join public.product_categories c on c.id=p.product_category_id where p.id=p_id);
end;
$$;
create function public.admin_save_product(p_merchant_id uuid,p_data jsonb,p_expected timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare merchant public.listings; previous public.products; target uuid; data jsonb; result jsonb;
begin
  perform private.require_admin();select * into merchant from public.listings where id=p_merchant_id for update;
  if merchant.id is null or merchant.archived_at is not null or merchant.listing_type not in ('COMMERCE','RESTAURANT') then raise exception 'CATALOG_MERCHANT_REQUIRED' using errcode='22023';end if;
  target:=(p_data->>'id')::uuid;select * into previous from public.products where id=target for update;
  if target is null or previous.id is not null and previous.merchant_id<>p_merchant_id then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  perform private.admin_revision(p_expected,previous.updated_at);
  data:=private.catalog_values(p_merchant_id,p_data-'id',previous,'upsert',false);
  insert into public.products(id,merchant_id,sku,name,description,price_minor,original_price_minor,unit,dietary_type,product_category_id,image_media_id,available,active,display_order)
  values(target,p_merchant_id,data->>'sku',data->>'name',data->>'description',(data->>'price_minor')::bigint,(data->>'original_price_minor')::bigint,data->>'unit',data->>'dietary_type',
    (data->>'product_category_id')::uuid,(data->>'image_media_id')::uuid,(data->>'available')::boolean,(data->>'active')::boolean,(data->>'display_order')::integer)
  on conflict(id) do update set sku=excluded.sku,name=excluded.name,description=excluded.description,price_minor=excluded.price_minor,original_price_minor=excluded.original_price_minor,unit=excluded.unit,
    dietary_type=excluded.dietary_type,product_category_id=excluded.product_category_id,image_media_id=excluded.image_media_id,available=excluded.available,active=excluded.active,display_order=excluded.display_order;
  perform private.catalog_version(p_merchant_id);return public.admin_catalog_product(target);
end;
$$;
create function public.admin_product_state(p_id uuid,p_action text,p_expected timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item public.products; merchant_id uuid;
begin
  perform private.require_admin();select p.merchant_id into merchant_id from public.products p where p.id=p_id;
  perform 1 from public.listings where id=merchant_id for update;select * into item from public.products where id=p_id for update;
  if item.id is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;perform private.admin_revision(p_expected,item.updated_at);
  if p_action='archive' then update public.products set archived_at=clock_timestamp(),active=false where id=p_id;
  elsif p_action='restore' then update public.products set archived_at=null,active=false where id=p_id;
  else raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  perform private.catalog_version(merchant_id);return public.admin_catalog_product(p_id);
end;
$$;
create function public.admin_save_product_category(p_merchant_id uuid,p_data jsonb,p_expected timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare merchant public.listings; previous public.product_categories; target uuid;
begin
  perform private.require_admin();perform private.admin_json(p_data,array['id','name','slug','enabled','display_order'],3000);
  select * into merchant from public.listings where id=p_merchant_id for update;
  if merchant.id is null or merchant.archived_at is not null or merchant.listing_type not in ('COMMERCE','RESTAURANT') then raise exception 'CATALOG_MERCHANT_REQUIRED' using errcode='22023';end if;
  target:=(p_data->>'id')::uuid;select * into previous from public.product_categories where id=target for update;
  if target is null or previous.id is not null and previous.merchant_id<>p_merchant_id then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  perform private.admin_revision(p_expected,previous.updated_at);
  insert into public.product_categories(id,merchant_id,name,slug,enabled,display_order) values(target,p_merchant_id,trim(p_data->>'name'),p_data->>'slug',(p_data->>'enabled')::boolean,(p_data->>'display_order')::integer)
    on conflict(id) do update set name=excluded.name,slug=excluded.slug,enabled=excluded.enabled,display_order=excluded.display_order;
  perform private.catalog_version(p_merchant_id);return public.admin_catalog_context(p_merchant_id);
end;
$$;

create function private.prepare_catalog_import(p_merchant_id uuid,p_mode text,p_rows jsonb,p_source jsonb,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare merchant public.listings; job private.product_import_jobs; digest text; plan jsonb:='[]'::jsonb; entry jsonb; data jsonb; previous public.products; changes jsonb;
  action text; error_detail text; problem jsonb; row_number integer; source_sku text; duplicate_skus text[]; base_snapshot text; total integer:=0; added integer:=0; changed integer:=0; unchanged integer:=0; invalid integer:=0;
begin
  perform private.require_admin();
  if p_mode is null or p_mode not in ('upsert','price_only') or p_request_id is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or pg_column_size(p_rows)>1048576 then raise exception 'CATALOG_IMPORT_LIMIT' using errcode='22023';end if;
  perform private.admin_json(p_source,array['name','size','sheet','type'],2048);
  if length(coalesce(p_source->>'name','')) not between 1 and 180 or coalesce((p_source->>'size')::bigint,0) not between 1 and 5242880 or p_source->>'type' is null or p_source->>'type' not in ('csv','xlsx') or length(coalesce(p_source->>'sheet',''))>100 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  digest:=encode(sha256(convert_to(jsonb_build_object('merchant',p_merchant_id,'mode',p_mode,'rows',p_rows,'source',p_source)::text,'UTF8')),'hex');
  select * into merchant from public.listings where id=p_merchant_id for update;
  if merchant.id is null or merchant.archived_at is not null or merchant.listing_type not in ('COMMERCE','RESTAURANT') then raise exception 'CATALOG_MERCHANT_REQUIRED' using errcode='22023';end if;
  select * into job from private.product_import_jobs where id=p_request_id for update;
  if job.id is not null then
    if job.actor_id is distinct from auth.uid() or job.merchant_id<>p_merchant_id or not exists(select 1 from private.catalog_import_previews where job_id=job.id and request_digest=digest) then raise exception 'CATALOG_REQUEST_CONFLICT' using errcode='22023';end if;
    return job.id;
  end if;
  perform 1 from public.products where merchant_id=p_merchant_id and sku in(select trim(e->>'sku') from jsonb_array_elements(p_rows)e) order by id for share;
  base_snapshot:=private.catalog_snapshot(p_merchant_id,p_rows);
  insert into private.product_import_jobs(id,merchant_id,actor_id,mode,row_count) values(p_request_id,p_merchant_id,auth.uid(),p_mode,jsonb_array_length(p_rows));
  select coalesce(array_agg(sku),'{}'::text[]) into duplicate_skus from(select trim(e->>'sku') as sku from jsonb_array_elements(p_rows)e group by trim(e->>'sku') having count(*)>1)d;
  for entry in select * from jsonb_array_elements(p_rows) loop
    total:=total+1;row_number:=total+1;data:=null;problem:=null;changes:='[]'::jsonb;previous:=null;source_sku:=trim(entry->>'sku');
    begin
      if jsonb_typeof(entry) is distinct from 'object' or coalesce(entry->>'row_number','')!~ '^[0-9]{1,4}$' or (entry->>'row_number')::integer not between 2 and 1001 then perform private.catalog_problem('row_number','invalid_row','The source row number is invalid.');end if;
      row_number:=(entry->>'row_number')::integer;
      if source_sku=any(duplicate_skus) then perform private.catalog_problem('sku','duplicate_sku','Duplicate SKU in this file. Remove every duplicate before confirming.');end if;
      select * into previous from public.products where merchant_id=p_merchant_id and public.products.sku=source_sku;
      data:=private.catalog_values(p_merchant_id,entry-'row_number',previous,p_mode,true);
      select coalesce(jsonb_agg(jsonb_build_object('field',v.key,'before',to_jsonb(previous)->v.key,'after',v.value) order by v.key),'[]'::jsonb) into changes
        from jsonb_each(data)v where to_jsonb(previous)->v.key is distinct from v.value;
      action:=case when previous.id is null then 'new' when jsonb_array_length(changes)>0 then 'updated' else 'unchanged' end;
    exception when others then
      get stacked diagnostics error_detail=pg_exception_detail;
      if sqlerrm='CATALOG_ROW_INVALID' then problem:=error_detail::jsonb;else problem:=jsonb_build_object('column_name',null,'error_code','invalid_row','message','Check the row fields and supported columns.');end if;
      action:='invalid';data:=null;changes:='[]'::jsonb;
    end;
    if action='new' then added:=added+1;elsif action='updated' then changed:=changed+1;elsif action='unchanged' then unchanged:=unchanged+1;else
      invalid:=invalid+1;insert into private.product_import_errors(job_id,row_number,column_name,error_code,message) values(p_request_id,row_number,problem->>'column_name',problem->>'error_code',problem->>'message');end if;
    plan:=plan||jsonb_build_array(jsonb_build_object('row_number',row_number,'sku',left(coalesce(source_sku,''),80),'name',left(coalesce(data->>'name',previous.name,''),180),'action',action,'changes',changes,'error',problem,'product_id',previous.id,'product_revision',previous.updated_at));
  end loop;
  if private.catalog_snapshot(p_merchant_id,p_rows)<>base_snapshot then raise exception 'CATALOG_STALE_PREVIEW' using errcode='40001';end if;
  insert into private.catalog_import_previews(job_id,merchant_id,request_digest,snapshot,source,payload,plan,summary)
  values(p_request_id,p_merchant_id,digest,base_snapshot,p_source,p_rows,plan,jsonb_build_object('new',added,'updated',changed,'unchanged',unchanged,'invalid',invalid,'total',total));
  if invalid>0 then update private.product_import_jobs set status='failed' where id=p_request_id;end if;
  return p_request_id;
end;
$$;
create function private.lock_catalog_import(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.product_import_jobs;
begin
  perform private.require_admin();select * into job from private.product_import_jobs where id=p_job_id for update;
  if job.id is null or job.actor_id is distinct from auth.uid() then raise exception 'CATALOG_JOB_ACCESS' using errcode='42501';end if;
  return to_jsonb(job);
end;
$$;
create function private.finish_catalog_import(p_job_id uuid,p_status text,p_count integer,p_summary jsonb,p_problem jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare job private.product_import_jobs;
begin
  perform private.require_admin();select * into job from private.product_import_jobs where id=p_job_id for update;
  if job.actor_id is distinct from auth.uid() or job.status<>'pending' or p_status not in ('applied','failed') then raise exception 'CATALOG_JOB_ACCESS' using errcode='42501';end if;
  update private.product_import_jobs set status=p_status,applied_count=p_count where id=p_job_id;
  update private.catalog_import_previews set summary=summary||p_summary where job_id=p_job_id;
  if p_problem is not null then insert into private.product_import_errors(job_id,row_number,column_name,error_code,message) values(p_job_id,coalesce((p_problem->>'row_number')::integer,1),p_problem->>'column_name',p_problem->>'error_code',p_problem->>'message');end if;
end;
$$;

create function public.admin_import_report(p_job_id uuid,p_offset integer default 0,p_limit integer default 25,p_filter text default 'all') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare job private.product_import_jobs; preview private.catalog_import_previews; items jsonb; total integer;
begin
  perform private.require_admin();
  if p_offset is null or p_offset not between 0 and 1000 or p_limit is null or p_limit not between 1 and 1000 or p_filter is null or p_filter not in ('all','new','updated','unchanged','invalid') then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  select * into job from private.product_import_jobs where id=p_job_id;select * into preview from private.catalog_import_previews where job_id=p_job_id;
  if job.id is null or preview.job_id is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;
  select count(*) into total from jsonb_array_elements(preview.plan)e where p_filter='all' or e->>'action'=p_filter;
  select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb) into items from(select value,ordinality from jsonb_array_elements(preview.plan) with ordinality where p_filter='all' or value->>'action'=p_filter order by ordinality limit p_limit offset p_offset)e;
  return jsonb_build_object('job',to_jsonb(job),'source',preview.source,'summary',preview.summary,'expires_at',preview.expires_at,'expired',preview.expires_at<clock_timestamp(),
    'items',items,'total',total,'has_more',total>p_offset+p_limit,'errors',coalesce((select jsonb_agg(to_jsonb(e)) from(select row_number,column_name,error_code,message from private.product_import_errors where job_id=p_job_id order by row_number,id limit 1000)e),'[]'::jsonb));
end;
$$;
create function public.admin_prepare_import(p_merchant_id uuid,p_mode text,p_rows jsonb,p_source jsonb,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform private.require_admin();perform private.prepare_catalog_import(p_merchant_id,p_mode,p_rows,p_source,p_request_id);
  return public.admin_import_report(p_request_id);
end;
$$;
create function public.admin_import_history(p_merchant_id uuid,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  if p_offset is null or p_offset not between 0 and 100000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  return(with page as(select j.*,p.source,p.summary,p.expires_at from private.product_import_jobs j join private.catalog_import_previews p on p.job_id=j.id where j.merchant_id=p_merchant_id order by j.created_at desc,j.id limit p_limit offset p_offset)
    select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'::jsonb),'has_more',(select count(*) from private.product_import_jobs where merchant_id=p_merchant_id)>p_offset+p_limit));
end;
$$;
create function public.admin_apply_import(p_job_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare merchant uuid; job jsonb; preview private.catalog_import_previews; entry jsonb; data jsonb; expected jsonb; ordinal bigint; previous public.products; changed integer:=0; version integer; problem jsonb; source_row integer;
begin
  perform private.require_admin();select merchant_id into merchant from private.product_import_jobs where id=p_job_id;
  if merchant is null then raise exception 'ADMIN_NOT_FOUND' using errcode='22023';end if;
  perform 1 from public.listings where id=merchant for update;job:=private.lock_catalog_import(p_job_id);
  if job->>'status'<>'pending' then return public.admin_import_report(p_job_id);end if;
  select * into preview from private.catalog_import_previews where job_id=p_job_id;
  begin
    if preview.expires_at<clock_timestamp() then raise exception 'CATALOG_PREVIEW_EXPIRED' using errcode='22023';end if;
    perform 1 from public.products where merchant_id=merchant and sku in(select trim(e->>'sku') from jsonb_array_elements(preview.payload)e) order by id for update;
    perform 1 from public.product_categories where merchant_id=merchant order by id for share;
    perform 1 from public.listing_media where listing_id=merchant order by id for share;
    if private.catalog_snapshot(merchant,preview.payload)<>preview.snapshot then raise exception 'CATALOG_STALE_PREVIEW' using errcode='40001';end if;
    if not exists(select 1 from public.listings where id=merchant and listing_type in ('COMMERCE','RESTAURANT') and archived_at is null) then raise exception 'CATALOG_MERCHANT_REQUIRED' using errcode='22023';end if;
    for entry,ordinal in select value,ordinality from jsonb_array_elements(preview.payload) with ordinality loop
      source_row:=(entry->>'row_number')::integer;
      expected:=preview.plan->(ordinal::integer-1);
      select * into previous from public.products where merchant_id=merchant and sku=trim(entry->>'sku');
      if previous.id is distinct from (expected->>'product_id')::uuid or previous.updated_at is distinct from (expected->>'product_revision')::timestamptz then raise exception 'CATALOG_STALE_PREVIEW' using errcode='40001';end if;
      data:=private.catalog_values(merchant,entry-'row_number',previous,job->>'mode',true);
      if not exists(select 1 from jsonb_each(data)v where to_jsonb(previous)->v.key is distinct from v.value) then continue;end if;
      if job->>'mode'='price_only' then
        update public.products set price_minor=(data->>'price_minor')::bigint,original_price_minor=(data->>'original_price_minor')::bigint where id=previous.id;
      else
        insert into public.products as current_product(merchant_id,sku,name,description,price_minor,original_price_minor,unit,dietary_type,product_category_id,image_media_id,available,active,display_order)
        values(merchant,data->>'sku',data->>'name',data->>'description',(data->>'price_minor')::bigint,(data->>'original_price_minor')::bigint,data->>'unit',data->>'dietary_type',
          (data->>'product_category_id')::uuid,(data->>'image_media_id')::uuid,(data->>'available')::boolean,(data->>'active')::boolean,(data->>'display_order')::integer)
        on conflict(merchant_id,sku) do update set name=excluded.name,description=excluded.description,price_minor=excluded.price_minor,original_price_minor=excluded.original_price_minor,unit=excluded.unit,
          dietary_type=excluded.dietary_type,product_category_id=excluded.product_category_id,image_media_id=excluded.image_media_id,available=excluded.available,active=excluded.active,display_order=excluded.display_order
          where current_product.id=previous.id and current_product.updated_at=previous.updated_at;
        if not found then raise exception 'CATALOG_STALE_PREVIEW' using errcode='40001';end if;
      end if;
      changed:=changed+1;
    end loop;
    if changed>0 then version:=private.catalog_version(merchant,p_job_id);end if;
    perform private.finish_catalog_import(p_job_id,'applied',changed,jsonb_build_object('applied',changed,'version',version,'message',case when changed=0 then 'No catalog changes were needed.' else 'The confirmed catalog changes were applied.' end));
  exception when others then
    problem:=jsonb_build_object('row_number',coalesce(source_row,1),'column_name',null,'error_code',case when sqlerrm in ('CATALOG_STALE_PREVIEW','CATALOG_PREVIEW_EXPIRED','CATALOG_MERCHANT_REQUIRED') then sqlerrm else 'CATALOG_APPLY_FAILED' end,
      'message',case sqlerrm when 'CATALOG_STALE_PREVIEW' then 'The catalog changed after preview. Prepare and review a new preview.' when 'CATALOG_PREVIEW_EXPIRED' then 'This preview expired. Prepare a new preview before confirming.' when 'CATALOG_MERCHANT_REQUIRED' then 'The merchant is archived or no longer has a commerce catalog.' else 'The import could not be applied. All product changes were rolled back. Prepare a new preview after checking the row.' end);
    perform private.finish_catalog_import(p_job_id,'failed',0,jsonb_build_object('applied',0,'message',problem->>'message'),problem);
  end;
  return public.admin_import_report(p_job_id);
end;
$$;

revoke all on function private.catalog_problem(text,text,text),private.catalog_money(jsonb,text,boolean),private.catalog_boolean(jsonb,text),
  private.catalog_values(uuid,jsonb,public.products,text,boolean),private.catalog_snapshot(uuid,jsonb),private.catalog_version(uuid,uuid),
  private.prepare_catalog_import(uuid,text,jsonb,jsonb,uuid),private.lock_catalog_import(uuid),private.finish_catalog_import(uuid,text,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.catalog_problem(text,text,text),private.catalog_money(jsonb,text,boolean),private.catalog_boolean(jsonb,text),
  private.catalog_values(uuid,jsonb,public.products,text,boolean),private.catalog_snapshot(uuid,jsonb),private.catalog_version(uuid,uuid),
  private.prepare_catalog_import(uuid,text,jsonb,jsonb,uuid),private.lock_catalog_import(uuid),private.finish_catalog_import(uuid,text,integer,jsonb,jsonb) to authenticated;
revoke all on function public.admin_catalog_merchants(uuid,text,integer),public.admin_catalog_context(uuid),public.admin_catalog_products(uuid,text,text,integer,integer),public.admin_catalog_product(uuid),
  public.admin_save_product(uuid,jsonb,timestamptz),public.admin_product_state(uuid,text,timestamptz),public.admin_save_product_category(uuid,jsonb,timestamptz),
  public.admin_import_report(uuid,integer,integer,text),public.admin_prepare_import(uuid,text,jsonb,jsonb,uuid),public.admin_import_history(uuid,integer,integer),public.admin_apply_import(uuid) from public,anon,authenticated;
grant execute on function public.admin_catalog_merchants(uuid,text,integer),public.admin_catalog_context(uuid),public.admin_catalog_products(uuid,text,text,integer,integer),public.admin_catalog_product(uuid),
  public.admin_save_product(uuid,jsonb,timestamptz),public.admin_product_state(uuid,text,timestamptz),public.admin_save_product_category(uuid,jsonb,timestamptz),
  public.admin_import_report(uuid,integer,integer,text),public.admin_prepare_import(uuid,text,jsonb,jsonb,uuid),public.admin_import_history(uuid,integer,integer),public.admin_apply_import(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
