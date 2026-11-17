import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createTestDatabase,createSystemDatabase,applyMigration,asRole,ADMIN_ID,OTHER_ID} from '../helpers/database.js';
let db;
const city='70000000-0000-4000-8000-000000000090',merchant='70000000-0000-4000-8000-000000000001',other='70000000-0000-4000-8000-000000000002';
const product='71000000-0000-4000-8000-000000000001',items=[{product_id:product,quantity:2}];
const rpc=async(name,args=[],role='anon',uid=null,database=db)=>(await asRole(database,role,uid,tx=>tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args))).rows[0].result;
const quote=(id=merchant,lines=items,fulfilment='delivery')=>rpc('merchant_cart_quote',[id,lines,fulfilment]);
async function initiate(id=merchant,lines=items,key=randomUUID(),fingerprint='a'.repeat(64),token){return rpc('checkout_initiate_delivery',[id,lines,token||(await quote(id,lines)).quote_token||'0'.repeat(32),key,fingerprint],'service_role');}
before(async()=>{db=await createTestDatabase();await db.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));await db.exec(await readFile('tests/fixtures/merchant-checkout.sql','utf8'));});
after(async()=>{await db?.close();});

test('new delivery and tracking functions retain invoker RLS, narrow grants and private core isolation',async()=>{
  const names=['checkout_initiate_delivery','admin_checkout_merchants','admin_checkout_tracking','merchant_detail_checkout'];
  const rows=(await db.query("select proname,prosecdef,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=any($1)",[names])).rows;
  assert.equal(rows.length,4);assert.ok(rows.every(row=>!row.prosecdef&&row.proconfig.includes('search_path=""')));
  for(const [role,uid] of [['anon',null],['authenticated',OTHER_ID]]){
    await assert.rejects(rpc('admin_checkout_merchants',[city],role,uid),error=>error.code==='42501');
    await assert.rejects(rpc('admin_checkout_tracking',[city,'2026-11-01','2026-11-30'],role,uid),error=>error.code==='42501');
    await assert.rejects(rpc('checkout_initiate_delivery',[merchant,items,'a'.repeat(32),randomUUID(),'a'.repeat(64)],role,uid),error=>error.code==='42501');
  }
});

test('food delivery quotes ignore obsolete pickup defaults, enforce available items and preserve closure rules',async()=>{
  assert.equal((await quote()).can_checkout,true);
  assert.equal((await quote(merchant,items,'pickup')).reason,'fulfilment_unavailable');assert.equal((await quote(merchant,items,'enquiry')).can_checkout,false);
  const detail=await rpc('merchant_detail_checkout',['qa-town','food','qa-test-kitchen']);assert.equal(detail.food_delivery,true);
  const key=randomUUID();const blocked=await rpc('checkout_initiate',[merchant,items,'delivery','',(await quote()).quote_token,key],'service_role');assert.equal(blocked.status,'blocked');assert.equal(blocked.quote.reason,'delivery_address_required');
  assert.equal((await db.query('select count(*)::int n from private.checkout_intents where idempotency_key=$1',[key])).rows[0].n,0);
  try{
    await db.query('update public.listing_actions set delivery_available=false where listing_id=$1',[merchant]);assert.equal((await quote()).can_checkout,true);
    await db.query("insert into public.temporary_status_overrides(listing_id,status,reason,starts_at) values($1,'closed','Isolated closure',now()-interval '1 minute')",[merchant]);
    assert.equal((await quote()).reason,'closed');await db.query('update public.listing_actions set enquiries_while_closed=true where listing_id=$1',[merchant]);assert.equal((await quote()).can_checkout,true);
  }finally{await db.query('delete from public.temporary_status_overrides where listing_id=$1',[merchant]);await db.query('update public.listing_actions set delivery_available=true,enquiries_while_closed=false where listing_id=$1',[merchant]);}
});

test('authoritative delivery initiation preserves snapshots, stores no customer text and retries once per key',async()=>{
  const key=randomUUID(),lines=[...items,{product_id:'71000000-0000-4000-8000-000000000002',quantity:3}],result=await initiate(merchant,lines,key);
  assert.equal(result.status,'initiated');assert.equal(result.receipt.total_minor,8000);assert.match(result.receipt.reference,/^SO-[A-Z0-9]{16}$/);
  assert.equal((await initiate(merchant,lines,key)).receipt.reference,result.receipt.reference);
  assert.equal((await initiate(merchant,lines,key,'b'.repeat(64))).status,'conflict');
  const saved=(await db.query('select * from private.checkout_intents where idempotency_key=$1',[key])).rows[0];assert.equal(saved.instructions,null);assert.equal(saved.delivery_fingerprint,'a'.repeat(64));assert.equal(saved.total_minor,8000);
  assert.equal((await db.query('select count(*)::int n from private.checkout_intents where idempotency_key=$1',[key])).rows[0].n,1);
});

test('withdrawn products, changed prices and disabled merchants cannot produce an unchecked delivery initiation',async()=>{
  const token=(await quote()).quote_token;
  try{
    await db.query('update public.products set price_minor=1200,original_price_minor=null where id=$1',[product]);assert.equal((await initiate(merchant,items,randomUUID(),'a'.repeat(64),token)).status,'changed');
    await db.query('update public.products set available=false where id=$1',[product]);assert.equal((await initiate()).status,'blocked');
    await db.query('update public.products set available=true where id=$1',[product]);await db.query('update public.listings set enabled=false where id=$1',[merchant]);assert.equal((await initiate()).status,'blocked');
  }finally{await db.query('update public.listings set enabled=true where id=$1',[merchant]);await db.query('update public.products set price_minor=1000,original_price_minor=1500,available=true where id=$1',[product]);}
});

test('merchant tracking totals do not multiply multi-item carts and retain renamed, disabled and archived history',async()=>{
  const first=await initiate(),second=await initiate(other,[{product_id:'71000000-0000-4000-8000-000000000090',quantity:1}]);
  const date=(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text as local_day")).rows[0].local_day;
  const report=(id=null,sort='count')=>rpc('admin_checkout_tracking',[city,date,date,id,sort,0,0,20,false],'authenticated',ADMIN_ID);
  const own=await report(merchant);assert.ok(own.totals.initiations>=2);assert.ok(own.activity.every(row=>row.merchant_id===merchant));
  const expected=(await db.query('select count(*)::int n,sum(total_minor)::text amount from private.checkout_intents where merchant_id=$1',[merchant])).rows[0];
  assert.equal(own.totals.initiations,expected.n);assert.equal(own.totals.estimated_minor,expected.amount);
  try{
    await db.query("update public.listings set name='Renamed historical shop',enabled=false,publication_status='archived',archived_at=now() where id=$1",[merchant]);
    const history=await report(merchant);assert.equal(history.totals.initiations,expected.n);assert.ok(history.activity.every(row=>row.merchant_name==='Renamed historical shop'));
    assert.ok(history.activity.some(row=>row.merchant_name_snapshot==='QA Test Kitchen'));
    const choices=await rpc('admin_checkout_merchants',[city],'authenticated',ADMIN_ID);assert.ok(choices.items.some(row=>row.id===merchant&&row.archived_at));
    const encoded=JSON.stringify(history);for(const field of ['instructions','delivery_address','delivery_fingerprint','whatsapp_number','request_hash','idempotency_key'])assert.ok(!encoded.includes('"'+field+'"'));
    const all=await report(null,'value');assert.ok(all.merchants.length>=2);assert.ok(all.activity.some(row=>row.reference===second.receipt.reference));
    const outside=await rpc('admin_checkout_tracking',[city,'2000-01-01','2000-01-02',merchant],'authenticated',ADMIN_ID);assert.equal(outside.totals.initiations,0);assert.equal(outside.totals.estimated_minor,'0');
    await assert.rejects(rpc('admin_checkout_tracking',[city,date,date,'10000000-0000-4000-8000-000000000001'],'authenticated',ADMIN_ID),error=>error.code==='22023');
  }finally{await db.query("update public.listings set name='QA Test Kitchen',enabled=true,publication_status='published',archived_at=null where id=$1",[merchant]);}
  assert.match(first.receipt.reference,/^SO-/);
});

test('forward migration preserves populated RB history, legacy non-food retries, merchant/product data and capability metadata',async()=>{
  const legacy=await createSystemDatabase();
  try{
    const files=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort(),latest=files.pop();
    for(const file of files)await applyMigration(legacy,file);
    await legacy.exec(await readFile('supabase/seed.sql','utf8'));await legacy.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));await legacy.exec(await readFile('tests/fixtures/merchant-checkout.sql','utf8'));
    await legacy.query("update public.listing_actions set checkout_enabled=false where listing_id=$1",[merchant]);await legacy.query("update public.listings set listing_type='COMMERCE' where id=$1",[merchant]);await legacy.query('update public.listing_actions set checkout_enabled=true where listing_id=$1',[merchant]);
    const key=randomUUID(),oldQuote=await rpc('merchant_cart_quote',[merchant,items,'pickup'],'anon',null,legacy);
    const old=await rpc('checkout_initiate',[merchant,items,'pickup','',oldQuote.quote_token,key],'service_role',null,legacy);assert.match(old.receipt.reference,/^RB-/);
    // Keep this catalog non-food for the legacy retry compatibility assertion.
    const shopping=(await legacy.query("select id from public.categories where slug='shopping'")).rows[0].id;
    await legacy.query('update public.listing_categories set category_id=$2 where listing_id=$1',[merchant,shopping]);
    const before=(await legacy.query('select count(*)::int n from public.products')).rows[0].n;
    await applyMigration(legacy,latest);
    assert.equal((await legacy.query('select count(*)::int n from public.products')).rows[0].n,before);
    const nextQuote=await rpc('merchant_cart_quote',[merchant,items,'pickup'],'anon',null,legacy);assert.equal(nextQuote.quote_token,oldQuote.quote_token);
    const retry=await rpc('checkout_initiate',[merchant,items,'pickup','',oldQuote.quote_token,key],'service_role',null,legacy);assert.equal(retry.receipt.reference,old.receipt.reference);
    assert.equal((await legacy.query('select count(*)::int n from private.checkout_intents')).rows[0].n,1);
    assert.equal((await legacy.query("select food_catalog from public.categories where slug='sweets'")).rows[0].food_catalog,true);
    const newKey=randomUUID(),newReceipt=await rpc('checkout_initiate',[merchant,items,'pickup','',nextQuote.quote_token,newKey],'service_role',null,legacy);assert.match(newReceipt.receipt.reference,/^SO-/);
    await legacy.exec(await readFile('supabase/rollback/20261116001000_restore_checkout.sql','utf8'));
    assert.equal((await legacy.query('select count(*)::int n from private.checkout_intents')).rows[0].n,2);
    const retained=await rpc('checkout_initiate',[merchant,items,'pickup','',nextQuote.quote_token,newKey],'service_role',null,legacy);assert.equal(retained.receipt.reference,newReceipt.receipt.reference);
  }finally{await legacy.close();}
});

test('admin food capability updates preserve revisions and classify commerce shops without changing their catalog',async()=>{
  const category=(await db.query("select * from public.categories where slug='shopping'")).rows[0],store='70000000-0000-4000-8000-000000000003';
  const data=Object.fromEntries(['id','name','slug','parent_id','short_name','description','icon_name','cover_image_path','display_order','enabled'].map(key=>[key,category[key]]));
  assert.equal(await rpc('merchant_is_food',[store]),false);
  try{
    const saved=await rpc('admin_save_taxonomy_checkout',['category',{...data,food_catalog:true},category.updated_at],'authenticated',ADMIN_ID);
    assert.equal(saved.food_catalog,true);assert.equal(saved.description,category.description);assert.ok(saved.updated_at);
    assert.equal(await rpc('merchant_is_food',[store]),true);
    const lines=[{product_id:'71000000-0000-4000-8000-000000000091',quantity:1}];assert.equal((await quote(store,lines)).can_checkout,true);assert.equal((await quote(store,lines,'pickup')).can_checkout,false);
    await assert.rejects(rpc('admin_save_taxonomy_checkout',['category',{...data,food_catalog:'yes'},saved.updated_at],'authenticated',ADMIN_ID),error=>error.code==='22023');
    await assert.rejects(rpc('admin_save_taxonomy_checkout',['category',{...data,food_catalog:false},saved.updated_at],'authenticated',OTHER_ID),error=>error.code==='42501');
    const current=await rpc('admin_context_checkout',[city],'authenticated',ADMIN_ID);assert.equal(current.categories.find(row=>row.id===category.id).food_catalog,true);
  }finally{await db.query('update public.categories set food_catalog=$2 where id=$1',[category.id,category.food_catalog]);}
});

test('tracking uses city-midnight boundaries, deterministic pages and sortable merchant totals',async()=>{
  await db.query("insert into private.checkout_intents(merchant_id,reference,idempotency_key,total_minor,state,created_at) values($1,'RB-BOUNDARY0001',$3,1000,'initiated','2026-11-12T18:29:59Z'),($2,'RB-BOUNDARY0002',$4,2000,'initiated','2026-11-12T18:30:00Z')",[merchant,other,randomUUID(),randomUUID()]);
  const date=await rpc('admin_checkout_tracking',[city,'2026-11-13','2026-11-13'],'authenticated',ADMIN_ID);assert.equal(date.totals.initiations,1);assert.equal(date.totals.estimated_minor,'2000');
  await db.query("insert into private.checkout_intents(merchant_id,reference,idempotency_key,total_minor,state,created_at) select case when n%2=0 then $1::uuid else $2::uuid end,'SO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),gen_random_uuid(),case when n%2=0 then 1000 else 3000 end,'initiated','2001-01-01T12:00:00Z' from generate_series(1,25)n",[merchant,other]);
  const first=await rpc('admin_checkout_tracking',[city,'2001-01-01','2001-01-01',null,'value',0,0,20,false],'authenticated',ADMIN_ID);
  const next=await rpc('admin_checkout_tracking',[city,'2001-01-01','2001-01-01',null,'value',20,0,20,false],'authenticated',ADMIN_ID);
  assert.equal(first.activity.length,20);assert.equal(next.activity.length,5);assert.equal(first.totals.initiations,25);assert.equal(first.merchants[0].merchant_id,other);
  assert.equal(new Set([...first.activity,...next.activity].map(row=>row.id)).size,25);
});
