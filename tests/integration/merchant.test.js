import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createTestDatabase,asRole,ADMIN_ID} from '../helpers/database.js';
let db;
const MERCHANT='70000000-0000-4000-8000-000000000001';
const product=n=>'71000000-0000-4000-8000-'+String(n).padStart(12,'0');
const lines=[{product_id:product(1),quantity:2},{product_id:product(2),quantity:1}];
const rpc=async(name,args=[],role='anon',uid=null)=>(await asRole(db,role,uid,tx=>tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args))).rows[0].result;
const quote=(items=lines,fulfilment='pickup')=>rpc('merchant_cart_quote',[MERCHANT,items,fulfilment]);
const initiate=async({items=lines,token,key=randomUUID(),instructions='',fulfilment='pickup'}={})=>rpc('checkout_initiate',[MERCHANT,items,fulfilment,instructions,token||(await quote(items,fulfilment)).quote_token,key],'service_role');
before(async()=>{db=await createTestDatabase();await db.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));await db.exec(await readFile('tests/fixtures/merchant-checkout.sql','utf8'));});
after(async()=>{if(db)await db.close();});

test('merchant routes resolve public current and historical slugs and use the primary category canonically',async()=>{
  const detail=await rpc('merchant_detail',['qa-town','food','qa-test-kitchen']);
  assert.equal(detail.id,MERCHANT);assert.equal(detail.canonical_path,'/qa-town/food/qa-test-kitchen');assert.equal(detail.product_categories.length,2);assert.equal(detail.status.state,'open');
  await db.query("insert into public.listing_slug_history(listing_id,city_id,old_slug) values($1,$2,'old-kitchen')",[MERCHANT,detail.city.id]);
  assert.equal((await rpc('merchant_detail',['qa-town','food','old-kitchen'])).canonical_path,detail.canonical_path);
  assert.equal(await rpc('merchant_detail',['qa-town','hotels','qa-test-kitchen']),null);
  assert.equal(await rpc('merchant_detail',['rawatbhata','food','qa-test-kitchen']),null);
});
test('slug edits reserve the old URL, redirect it to the current merchant and prevent another listing from taking it',async()=>{
  try{
    await db.query("update public.listings set slug='qa-renamed-kitchen' where id=$1",[MERCHANT]);
    assert.equal((await rpc('merchant_detail',['qa-town','food','qa-test-kitchen'])).canonical_path,'/qa-town/food/qa-renamed-kitchen');
    await assert.rejects(db.query("update public.listings set slug='qa-test-kitchen' where id='70000000-0000-4000-8000-000000000002'"),error=>error.code==='23514');
  }finally{await db.query("update public.listings set slug='qa-test-kitchen' where id=$1",[MERCHANT]);}
});
test('catalog filtering, sorting and pagination preserve unavailable items and hide inactive categories',async()=>{
  const catalog=(query='',category=null,dietary='',available=false,sort='featured',offset=0)=>rpc('merchant_products',[MERCHANT,query,category,dietary,available,sort,offset,12]);
  const first=await catalog(),second=await catalog('',null,'',false,'featured',12);
  assert.equal(first.total,17);assert.equal(first.items.length,12);assert.equal(second.items.length,5);assert.equal(second.has_more,false);
  assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,17);
  assert.equal((await catalog('vegetable')).total,1);assert.equal((await catalog('',null,'egg')).total,1);
  assert.equal((await catalog('',null,'',true)).total,16);
  assert.equal((await catalog('',null,'',false,'price_desc')).items[0].price_minor,17000);
  const category=first.items[0].product_category_id;
  try{await db.query('update public.product_categories set enabled=false where id=$1',[category]);assert.equal((await catalog()).total,8);assert.equal((await quote()).can_checkout,false);}
  finally{await db.query('update public.product_categories set enabled=true where id=$1',[category]);}
});
test('merchant, catalog and quotes never expose a draft even to the public RPC administrator caller',async()=>{
  try{
    await db.query("update public.listings set publication_status='draft' where id=$1",[MERCHANT]);
    for(const [role,uid] of [['anon',null],['authenticated',ADMIN_ID]]){
      assert.equal(await rpc('merchant_detail',['qa-town','food','qa-test-kitchen'],role,uid),null);
      assert.equal((await rpc('merchant_products',[MERCHANT],role,uid)).total,0);
      assert.equal((await rpc('merchant_cart_quote',[MERCHANT,lines,'pickup'],role,uid)).can_checkout,false);
    }
  }finally{await db.query("update public.listings set publication_status='published' where id=$1",[MERCHANT]);}
});
test('cart quotes use current prices and reject foreign, unavailable, duplicate and malformed items',async()=>{
  const result=await quote();assert.equal(result.total_minor,4000);assert.equal(result.can_checkout,true);assert.equal(result.items[0].quantity,2);
  assert.equal((await quote([{product_id:product(90),quantity:1}])).can_checkout,false);
  assert.equal((await quote([{product_id:product(4),quantity:1}])).reason,'items_unavailable');
  for(const invalid of [[...lines,lines[0]],[{product_id:product(1),quantity:0}],[{product_id:product(1),quantity:1.5}],[{product_id:product(1),quantity:100}],[{product_id:product(1),quantity:1,price_minor:1}]])await assert.rejects(quote(invalid),error=>error.code==='22023');
});
test('service checkout snapshots authoritative amounts and units, prepares handoff and retries idempotently',async()=>{
  const key=randomUUID(),token=(await quote()).quote_token;
  const result=await initiate({key,token});assert.equal(result.status,'initiated');assert.match(result.receipt.reference,/^RB-[A-Z0-9]{16}$/);assert.equal(result.receipt.total_minor,4000);
  const again=await initiate({key,token});assert.equal(again.receipt.reference,result.receipt.reference);
  assert.equal((await db.query('select count(*)::int total from private.checkout_intents where idempotency_key=$1',[key])).rows[0].total,1);
  assert.equal(await rpc('checkout_mark_handoff',[key,result.request_hash],'service_role'),true);
  const record=(await db.query('select * from private.checkout_intents where idempotency_key=$1',[key])).rows[0];assert.equal(record.state,'handoff_created');assert.ok(record.handoff_created_at);
  const conflict=await initiate({key,token,instructions:'different request'});assert.equal(conflict.status,'conflict');
  assert.equal(result.receipt.items[0].unit,'plate');
});
test('a price change requires another confirmation and cannot record an old browser total',async()=>{
  const token=(await quote()).quote_token,key=randomUUID();
  try{
    await db.query('update public.products set price_minor=1200 where id=$1',[product(1)]);
    const changed=await initiate({token,key});assert.equal(changed.status,'changed');assert.equal(changed.quote.total_minor,4400);
    assert.equal((await db.query('select count(*)::int total from private.checkout_intents where idempotency_key=$1',[key])).rows[0].total,0);
    const accepted=await initiate({token:changed.quote.quote_token,key});assert.equal(accepted.receipt.total_minor,4400);
  }finally{await db.query('update public.products set price_minor=1000 where id=$1',[product(1)]);}
});
test('retries revalidate current eligibility and require review when a recorded quote has changed',async()=>{
  const token=(await quote()).quote_token,key=randomUUID();await initiate({key,token});
  try{
    await db.query('update public.products set price_minor=1200 where id=$1',[product(1)]);
    assert.equal((await initiate({key,token})).status,'changed');
    await db.query('update public.listing_actions set checkout_enabled=false where listing_id=$1',[MERCHANT]);
    assert.equal((await initiate({key,token})).status,'blocked');
  }finally{await db.query('update public.products set price_minor=1000 where id=$1',[product(1)]);await db.query('update public.listing_actions set checkout_enabled=true where listing_id=$1',[MERCHANT]);}
});
test('stock changes block checkout and totals cannot exceed the database money domain',async()=>{
  const token=(await quote()).quote_token;
  try{
    await db.query('update public.products set available=false where id=$1',[product(1)]);
    assert.equal((await initiate({token})).status,'blocked');
    await db.query('update public.products set available=true,original_price_minor=null,price_minor=99999999999 where id=$1',[product(1)]);
    assert.equal((await quote()).reason,'total_limit');assert.equal((await initiate()).status,'blocked');
  }finally{await db.query('update public.products set available=true,price_minor=1000,original_price_minor=1500 where id=$1',[product(1)]);}
});
test('all demo checkouts and unauthorized direct RPC calls remain blocked',async()=>{
  const demo=(await db.query("select id from public.listings where slug='demo-food'")).rows[0].id;
  assert.equal((await rpc('merchant_cart_quote',[demo,[],'enquiry'])).can_checkout,false);
  for(const role of ['anon','authenticated']){
    await assert.rejects(rpc('checkout_initiate',[MERCHANT,lines,'pickup','',(await quote()).quote_token,randomUUID()],role,role==='authenticated'?ADMIN_ID:null),error=>error.code==='42501');
    await assert.rejects(rpc('checkout_consume_limit',['a'.repeat(64),MERCHANT],role),error=>error.code==='42501');
    await assert.rejects(rpc('checkout_mark_handoff',[randomUUID(),'a'.repeat(32)],role),error=>error.code==='42501');
  }
});
test('persistent request limits count independently of failed business requests',async()=>{
  const hash='b'.repeat(64);
  for(let i=0;i<12;i++)assert.equal((await rpc('checkout_consume_limit',[hash,MERCHANT],'service_role')).allowed,true);
  assert.equal((await rpc('checkout_consume_limit',[hash,MERCHANT],'service_role')).allowed,false);
  assert.equal((await db.query("select request_count from private.checkout_rate_limits where scope=$1 and window_seconds=60",['client:'+hash])).rows[0].request_count,13);
  assert.equal((await db.query("select request_count from private.checkout_rate_limits where scope='global' and window_seconds=60")).rows[0].request_count,12);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.checkout_rate_limits'::regclass")).rows[0].relrowsecurity,true);
});
test('split hours, holidays, overnight spills, overlapping shifts and manual overrides use the listing timezone',async()=>{
  const hours=(at)=>rpc('merchant_availability',[MERCHANT,at]);
  await db.query('delete from public.business_hours where listing_id=$1',[MERCHANT]);
  try{
    assert.equal((await hours('2026-11-16T05:00:00Z')).state,'hours_unavailable');
    await db.query("insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day) values($1,1,'09:00','12:00',false),($1,1,'17:00','22:00',false),($1,2,'22:00','02:00',true)",[MERCHANT]);
    assert.equal((await hours('2026-11-16T04:00:00Z')).state,'open');
    const lunch=await hours('2026-11-16T09:00:00Z');assert.equal(lunch.state,'closed');assert.equal(lunch.next_open_at,'2026-11-16T11:30:00+00:00');
    assert.equal((await hours('2026-11-17T19:00:00Z')).state,'open');
    const special=(await db.query("insert into public.special_hours(listing_id,on_date,closed,label) values($1,'2026-11-18',true,'Holiday') returning id",[MERCHANT])).rows[0];
    assert.equal((await hours('2026-11-17T19:00:00Z')).state,'closed');
    await db.query('delete from public.special_hours where id=$1',[special.id]);
    await db.query("insert into public.business_hours(listing_id,weekday,opens_at,closes_at) values($1,1,'11:00','15:00')",[MERCHANT]);
    assert.equal((await hours('2026-11-16T04:00:00Z')).next_change_at,'2026-11-16T09:30:00+00:00');
    await db.query("insert into public.temporary_status_overrides(listing_id,status,starts_at,expires_at) values($1,'closed','2026-11-16T00:00:00Z','2026-11-16T12:00:00Z')",[MERCHANT]);
    assert.equal((await hours('2026-11-16T04:00:00Z')).state,'temporarily_closed');
    await db.query("update public.temporary_status_overrides set status='open' where listing_id=$1",[MERCHANT]);
    assert.equal((await hours('2026-11-16T09:00:00Z')).source,'manual');
    assert.equal((await hours('2026-11-16T13:00:00Z')).source,'weekly');
  }finally{
    await db.query('delete from public.temporary_status_overrides where listing_id=$1',[MERCHANT]);
    await db.query('delete from public.business_hours where listing_id=$1',[MERCHANT]);
    await db.query("insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day) select $1,d,'00:00','00:00',true from generate_series(0,6) d",[MERCHANT]);
  }
});
test('special-date opening intervals, scheduled closures and daylight-saving overnight hours remain accurate',async()=>{
  const hours=at=>rpc('merchant_availability',[MERCHANT,at]);
  await db.query('delete from public.business_hours where listing_id=$1',[MERCHANT]);
  try{
    const special=(await db.query("insert into public.special_hours(listing_id,on_date,label) values($1,'2026-11-16','Short day') returning id",[MERCHANT])).rows[0];
    await db.query("insert into public.special_hour_intervals(special_hours_id,opens_at,closes_at) values($1,'10:00','12:00')",[special.id]);
    assert.equal((await hours('2026-11-15T05:00:00Z')).state,'hours_unavailable');
    assert.equal((await hours('2026-11-16T05:00:00Z')).state,'open');
    assert.equal((await hours('2026-11-16T07:00:00Z')).state,'closed');
    await db.query('delete from public.special_hours where id=$1',[special.id]);
    await db.query("insert into public.business_hours(listing_id,weekday,opens_at,closes_at) values($1,1,'09:00','17:00')",[MERCHANT]);
    await db.query("insert into public.temporary_status_overrides(listing_id,status,starts_at,expires_at) values($1,'closed','2026-11-16T05:30:00Z','2026-11-16T12:00:00Z')",[MERCHANT]);
    assert.equal((await hours('2026-11-16T04:00:00Z')).next_change_at,'2026-11-16T05:30:00+00:00');
    await db.query('delete from public.temporary_status_overrides where listing_id=$1',[MERCHANT]);
    await db.query('delete from public.business_hours where listing_id=$1',[MERCHANT]);
    await db.query("update public.listings set timezone='America/New_York' where id=$1",[MERCHANT]);
    await db.query("insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day) values($1,6,'22:00','06:00',true)",[MERCHANT]);
    const spring=await hours('2026-03-08T05:30:00Z');assert.equal(spring.state,'open');assert.equal(spring.next_change_at,'2026-03-08T10:00:00+00:00');
    assert.equal((await hours('2026-03-08T10:00:00Z')).state,'closed');
  }finally{
    await db.query('delete from public.special_hours where listing_id=$1',[MERCHANT]);await db.query('delete from public.temporary_status_overrides where listing_id=$1',[MERCHANT]);
    await db.query("update public.listings set timezone='Asia/Kolkata' where id=$1",[MERCHANT]);await db.query('delete from public.business_hours where listing_id=$1',[MERCHANT]);
    await db.query("insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day) select $1,d,'00:00','00:00',true from generate_series(0,6) d",[MERCHANT]);
  }
});
test('merchant demo enrichment is repeatable, uses local images and remains removable without private data loss',async()=>{
  const disposable=await createTestDatabase();
  try{
    await disposable.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));const seed=await readFile('supabase/seeds/merchant-demo.sql','utf8');
    await disposable.exec(seed);await disposable.exec(seed);
    const products=(await disposable.query('select demo_image_path from public.products')).rows;assert.equal(products.length,110);
    for(const row of products)await access('public'+row.demo_image_path);
    assert.equal((await disposable.query('select count(*)::int total from public.listings where phone_number is not null or whatsapp_number is not null')).rows[0].total,0);
    assert.equal((await disposable.query('select count(*)::int total from public.listing_actions where checkout_enabled')).rows[0].total,0);
    await disposable.exec(await readFile('supabase/seeds/remove-demo.sql','utf8'));assert.equal((await disposable.query('select count(*)::int total from public.products')).rows[0].total,0);
    assert.equal((await disposable.query('select count(*)::int total from private.admin_users')).rows[0].total,1);
  }finally{await disposable.close();}
});
