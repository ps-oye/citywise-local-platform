-- MANUAL REVIEW ONLY. Use with a reviewed compatible application rollback.
-- Keeps all rows, indexes, added columns, SO/RB references and historical tracking.
-- Restores the previous quote/initiation behavior; removes no data or RLS policies.
begin;
set local lock_timeout='5s';

create or replace function public.merchant_cart_quote(p_merchant_id uuid,p_items jsonb,p_fulfilment text default 'enquiry') returns jsonb
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

create or replace function public.checkout_initiate(
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

notify pgrst,'reload schema';
commit;
