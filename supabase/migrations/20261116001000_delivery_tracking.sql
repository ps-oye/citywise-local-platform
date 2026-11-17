-- Reviewed local artifact: food delivery and merchant-wise initiation tracking.
-- No business/history rows are deleted; no seeds are replayed. Apply only after backup/review.
begin;
set local lock_timeout='5s';

alter table public.categories add column food_catalog boolean not null default false;
-- Capability metadata only: existing category identities, names and content are preserved.
update public.categories set food_catalog=true where slug in ('food','sweets');
alter table private.checkout_intents add column delivery_fingerprint text
  check (delivery_fingerprint is null or delivery_fingerprint ~ '^[a-f0-9]{64}$');
-- Replace a validation CHECK, not the table/data: accept new SO and historical RB references.
alter table private.checkout_intents drop constraint checkout_intents_reference_check;
alter table private.checkout_intents add constraint checkout_intents_reference_check
  check (reference ~ '^(RB|SO)-[A-Z0-9]{8,20}$');
create index checkout_intents_created_page on private.checkout_intents(created_at desc,id);
create index checkout_intents_state_time on private.checkout_intents(state,created_at desc,id);

create function public.merchant_is_food(p_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.listings l where l.id=p_id and
    (l.listing_type='RESTAURANT' or exists(
      with recursive ancestry as (
        select c.id,c.parent_id,c.food_catalog,array[c.id] as visited
        from public.listing_categories lc join public.categories c on c.id=lc.category_id where lc.listing_id=l.id
        union all
        select c.id,c.parent_id,c.food_catalog,a.visited||c.id from ancestry a
        join public.categories c on c.id=a.parent_id where not c.id=any(a.visited)
      ) select 1 from ancestry where food_catalog)));
$$;

create function public.merchant_detail_checkout(p_city_slug text,p_category_slug text,p_listing_slug text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  result:=public.merchant_detail(p_city_slug,p_category_slug,p_listing_slug);
  if result is null then return null;end if;
  return result||jsonb_build_object('food_delivery',public.merchant_is_food((result->>'id')::uuid),
    'has_multiple_cities',(select count(*)>1 from(select id from public.cities where enabled limit 2)c));
end;
$$;

create function public.admin_context_checkout(p_city_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  result:=public.admin_context(p_city_id);
  return result||jsonb_build_object('categories',coalesce((select jsonb_agg(item||jsonb_build_object('food_catalog',c.food_catalog) order by position)
    from jsonb_array_elements(result->'categories') with ordinality a(item,position)
    join public.categories c on c.id=(item->>'id')::uuid),'[]'::jsonb));
end;
$$;

create function public.admin_save_taxonomy_checkout(p_kind text,p_data jsonb,p_expected timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  perform private.require_admin();
  if p_data ? 'food_catalog' and (p_kind is distinct from 'category' or jsonb_typeof(p_data->'food_catalog') is distinct from 'boolean') then
    raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  result:=public.admin_save_taxonomy(p_kind,p_data-'food_catalog',p_expected);
  if p_kind='category' then
    if p_data ? 'food_catalog' then update public.categories set food_catalog=(p_data->>'food_catalog')::boolean where id=(result->>'id')::uuid;end if;
    select to_jsonb(c) into result from public.categories c where id=(result->>'id')::uuid;
  end if;
  return result;
end;
$$;

create or replace function public.merchant_cart_quote(p_merchant_id uuid,p_items jsonb,p_fulfilment text default 'enquiry') returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare merchant record; action record; lines jsonb; subtotal bigint; missing boolean; operating jsonb; reason text; token text; food boolean;
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
  food:=public.merchant_is_food(p_merchant_id);
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
    when food and p_fulfilment<>'delivery' then 'fulfilment_unavailable'
    when not food and ((p_fulfilment='pickup' and not coalesce(action.pickup_available,false)) or (p_fulfilment='delivery' and not coalesce(action.delivery_available,false))) then 'fulfilment_unavailable'
    when operating->>'state' in ('closed','temporarily_closed') and not coalesce(action.enquiries_while_closed,false) then 'closed'
    else null end;
  token:=md5((jsonb_build_object('merchant',merchant.id,'phone',merchant.whatsapp_number,'items',lines,'fulfilment',p_fulfilment,
    'reason',reason,'operating',operating->>'state','merchant_name',merchant.name)||case when food then jsonb_build_object('food_delivery',true) else '{}'::jsonb end)::text);
  return jsonb_build_object('merchant_id',merchant.id,'merchant_name',merchant.name,'is_demo',merchant.is_demo,'items',lines,
    'food_delivery',food,'total_minor',subtotal,'currency','INR','fulfilment',p_fulfilment,'can_checkout',reason is null,'reason',reason,
    'quote_token',token,'status',operating,'enquiry_while_closed',operating->>'state' in ('closed','temporarily_closed'));
end;
$$;

create function private.checkout_initiate_core(
  p_merchant_id uuid,p_items jsonb,p_fulfilment text,p_instructions text,p_quote_token text,p_idempotency_key uuid,p_delivery_fingerprint text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare quote jsonb; canonical_items jsonb; request_hash text; intent record; merchant record; receipt jsonb; request_payload jsonb;
begin
  if p_idempotency_key is null or p_quote_token is null or p_quote_token !~ '^[a-f0-9]{32}$'
    or p_instructions is null or length(p_instructions)>500 or p_instructions ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' then
    raise exception 'Invalid checkout request' using errcode='22023'; end if;
  if p_delivery_fingerprint is not null and (p_delivery_fingerprint !~ '^[a-f0-9]{64}$' or p_fulfilment<>'delivery' or p_instructions<>'') then
    raise exception 'Invalid delivery fingerprint' using errcode='22023';end if;
  -- Validate the entire cart even on retries; private records are never enumerated by malformed keys.
  quote:=public.merchant_cart_quote(p_merchant_id,p_items,p_fulfilment);
  select jsonb_agg(i order by i->>'product_id') into canonical_items from jsonb_array_elements(p_items) i;
  request_payload:=jsonb_build_object('merchant',p_merchant_id,'items',canonical_items,'fulfilment',p_fulfilment,
    'instructions',trim(p_instructions),'quote',p_quote_token);
  if p_delivery_fingerprint is not null then request_payload:=request_payload||jsonb_build_object('delivery_fingerprint',p_delivery_fingerprint);end if;
  request_hash:=encode(sha256(convert_to(request_payload::text,'UTF8')),'hex');
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
  if coalesce((quote->>'food_delivery')::boolean,false) and (p_fulfilment<>'delivery' or p_delivery_fingerprint is null) then
    return jsonb_build_object('status','blocked','quote',quote||jsonb_build_object('can_checkout',false,'reason','delivery_address_required'));end if;
  select * into intent from private.checkout_intents where idempotency_key=p_idempotency_key;
  if intent.id is not null then
    if intent.request_hash is distinct from request_hash then return jsonb_build_object('status','conflict'); end if;
    if merchant.whatsapp_number is distinct from intent.whatsapp_number or not coalesce((quote->>'can_checkout')::boolean,false) then
      return jsonb_build_object('status','blocked','quote',quote); end if;
    if quote->>'quote_token'<>p_quote_token then return jsonb_build_object('status','changed','quote',quote); end if;
  else
    if not coalesce((quote->>'can_checkout')::boolean,false) then return jsonb_build_object('status','blocked','quote',quote); end if;
    if quote->>'quote_token'<>p_quote_token then return jsonb_build_object('status','changed','quote',quote); end if;
    insert into private.checkout_intents(merchant_id,reference,idempotency_key,total_minor,fulfilment,instructions,request_hash,merchant_name,whatsapp_number,delivery_fingerprint)
      values(p_merchant_id,'SO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),p_idempotency_key,
        (quote->>'total_minor')::bigint,p_fulfilment,nullif(trim(p_instructions),''),request_hash,merchant.name,merchant.whatsapp_number,p_delivery_fingerprint)
      returning * into intent;
    insert into private.checkout_intent_items(intent_id,merchant_id,product_id,product_name,quantity,unit_price_minor,line_total_minor,unit)
      select intent.id,p_merchant_id,(i->>'product_id')::uuid,i->>'name',(i->>'quantity')::integer,
        (i->>'price_minor')::bigint,(i->>'line_total_minor')::bigint,i->>'unit' from jsonb_array_elements(quote->'items') i;
  end if;
  select jsonb_build_object('reference',intent.reference,'merchant_name',intent.merchant_name,'whatsapp_number',intent.whatsapp_number,
    'food_delivery',coalesce((quote->>'food_delivery')::boolean,false),'total_minor',intent.total_minor,'currency',intent.currency,'fulfilment',intent.fulfilment,'instructions',intent.instructions,
    'items',coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',i.product_name,'unit',i.unit,'quantity',i.quantity,
      'price_minor',i.unit_price_minor,'line_total_minor',i.line_total_minor) order by i.product_id),'[]'::jsonb))
    into receipt from private.checkout_intent_items i where i.intent_id=intent.id;
  return jsonb_build_object('status','initiated','receipt',receipt,'request_hash',request_hash);
end;
$$;

create or replace function public.checkout_initiate(
  p_merchant_id uuid,p_items jsonb,p_fulfilment text,p_instructions text,p_quote_token text,p_idempotency_key uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select private.checkout_initiate_core(p_merchant_id,p_items,p_fulfilment,p_instructions,p_quote_token,p_idempotency_key,null);
$$;

-- Only this service RPC accepts the server HMAC, never plaintext delivery details.
create function public.checkout_initiate_delivery(
  p_merchant_id uuid,p_items jsonb,p_quote_token text,p_idempotency_key uuid,p_delivery_fingerprint text
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_delivery_fingerprint is null or p_delivery_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Delivery validation required' using errcode='22023';end if;
  return private.checkout_initiate_core(p_merchant_id,p_items,'delivery','',p_quote_token,p_idempotency_key,p_delivery_fingerprint);
end;
$$;
revoke all on function private.checkout_initiate_core(uuid,jsonb,text,text,text,uuid,text),
  public.checkout_initiate_delivery(uuid,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function private.checkout_initiate_core(uuid,jsonb,text,text,text,uuid,text),
  public.checkout_initiate_delivery(uuid,jsonb,text,uuid,text) to service_role;

create function public.admin_checkout_merchants(p_city_id uuid,p_query text default '',p_offset integer default 0,p_limit integer default 40) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  perform private.require_admin();
  if p_city_id is null or p_query is null or length(p_query)>100 or p_offset is null or p_offset not between 0 and 10000
    or p_limit is null or p_limit not between 1 and 50 then raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  return(with eligible as (
    select l.id,l.name,l.enabled,l.publication_status,l.archived_at from public.listings l where l.city_id=p_city_id
      and (l.listing_type in ('COMMERCE','RESTAURANT') or exists(select 1 from private.checkout_intents i where i.merchant_id=l.id))
      and (trim(p_query)='' or strpos(lower(l.name||' '||l.slug),lower(trim(p_query)))>0)
  ),page as(select * from eligible order by lower(name),id limit p_limit offset p_offset)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by lower(name),id) from page p),'[]'::jsonb),
    'has_more',(select count(*) from eligible)>p_offset+p_limit,'next_offset',p_offset+p_limit));
end;
$$;

create function public.admin_checkout_tracking(
  p_city_id uuid,p_from date,p_to date,p_merchant_id uuid default null,p_sort text default 'count',
  p_activity_offset integer default 0,p_summary_offset integer default 0,p_limit integer default 20,p_include_demo boolean default false
) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare zone text; start_time timestamptz; end_time timestamptz;
begin
  perform private.require_admin();
  if p_city_id is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>89 or p_include_demo is null
    or p_sort is null or p_sort not in ('count','value') or p_limit is null or p_limit not between 1 and 50
    or p_activity_offset is null or p_activity_offset not between 0 and 10000
    or p_summary_offset is null or p_summary_offset not between 0 and 10000 then
    raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  select timezone into zone from public.cities where id=p_city_id;
  if zone is null or (p_merchant_id is not null and not exists(select 1 from public.listings where id=p_merchant_id and city_id=p_city_id)) then
    raise exception 'ADMIN_INVALID_INPUT' using errcode='22023';end if;
  start_time:=p_from::timestamp at time zone zone;end_time:=(p_to+1)::timestamp at time zone zone;
  return(with filtered as materialized (
    select i.id,i.merchant_id,l.name as merchant_name,i.merchant_name as merchant_name_snapshot,i.reference,i.created_at,i.state,i.total_minor
    from private.checkout_intents i join public.listings l on l.id=i.merchant_id
    where l.city_id=p_city_id and i.created_at>=start_time and i.created_at<end_time
      and (p_include_demo or not l.is_demo) and (p_merchant_id is null or i.merchant_id=p_merchant_id)
  ),groups as (
    select merchant_id,merchant_name,count(*) as initiations,sum(total_minor::numeric) as estimated_minor from filtered group by merchant_id,merchant_name
  ),summaries as (
    select * from groups order by case when p_sort='count' then initiations end desc,
      case when p_sort='value' then estimated_minor end desc,lower(merchant_name),merchant_id limit p_limit offset p_summary_offset
  ),recent as (select * from filtered order by created_at desc,id limit p_limit offset p_activity_offset)
  select jsonb_build_object('from',p_from,'to',p_to,'timezone',zone,'merchant_id',p_merchant_id,'include_demo',p_include_demo,
    'totals',jsonb_build_object('initiations',(select count(*) from filtered),
      'estimated_minor',(select coalesce(sum(total_minor::numeric),0)::text from filtered),
      'average_minor',(select coalesce(round(avg(total_minor::numeric)),0)::text from filtered)),
    'merchants',coalesce((select jsonb_agg(jsonb_build_object('merchant_id',merchant_id,'merchant_name',merchant_name,
      'initiations',initiations,'estimated_minor',estimated_minor::text) order by case when p_sort='count' then initiations end desc,
      case when p_sort='value' then estimated_minor end desc,lower(merchant_name),merchant_id) from summaries),'[]'::jsonb),
    'summary_has_more',(select count(*) from groups)>p_summary_offset+p_limit,'summary_next_offset',p_summary_offset+p_limit,
    'activity',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'name',i.product_name,'quantity',i.quantity,'unit',i.unit,'price_minor',i.unit_price_minor,'line_total_minor',i.line_total_minor) order by i.product_id)
      from private.checkout_intent_items i where i.intent_id=r.id),'[]'::jsonb)) order by r.created_at desc,r.id) from recent r),'[]'::jsonb),
    'activity_has_more',(select count(*) from filtered)>p_activity_offset+p_limit,'activity_next_offset',p_activity_offset+p_limit));
end;
$$;

revoke all on function public.merchant_is_food(uuid),public.merchant_detail_checkout(text,text,text),
  public.admin_context_checkout(uuid),public.admin_save_taxonomy_checkout(text,jsonb,timestamptz),
  public.admin_checkout_merchants(uuid,text,integer,integer),public.admin_checkout_tracking(uuid,date,date,uuid,text,integer,integer,integer,boolean)
  from public,anon,authenticated;
grant execute on function public.merchant_is_food(uuid),public.merchant_detail_checkout(text,text,text) to anon,authenticated,service_role;
grant execute on function public.admin_context_checkout(uuid),public.admin_save_taxonomy_checkout(text,jsonb,timestamptz),
  public.admin_checkout_merchants(uuid,text,integer,integer),public.admin_checkout_tracking(uuid,date,date,uuid,text,integer,integer,integer,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
