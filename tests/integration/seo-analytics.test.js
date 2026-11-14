import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createTestDatabase,asRole,ADMIN_ID,OTHER_ID} from '../helpers/database.js';
let db;const merchant='70000000-0000-4000-8000-000000000001',other='70000000-0000-4000-8000-000000000002',city='70000000-0000-4000-8000-000000000090';
const rpc=async(name,args=[],role='anon',uid=null)=>(await asRole(db,role,uid,tx=>tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args))).rows[0].result;
const event=(type='listing_view',id=merchant,key=randomUUID())=>({event_key:key,event_type:type,[type.startsWith('ad_')?'advertisement_id':'listing_id']:id});
const record=events=>rpc('analytics_record_events',[events],'service_role');
before(async()=>{db=await createTestDatabase();await db.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));await db.exec(await readFile('tests/fixtures/merchant-checkout.sql','utf8'));});
beforeEach(async()=>{await db.exec('delete from private.analytics_events; delete from private.analytics_rate_limits;');});
after(async()=>{await db?.close();});

test('SEO reads preserve invoker visibility and event writes/admin reports have narrow grants',async()=>{
  const names=['seo_public_paths','seo_sitemap_index','seo_sitemap_page','public_media','analytics_consume_limit','analytics_record_events','admin_analytics'];
  const functions=(await db.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1)",[names])).rows;
  assert.equal(functions.length,7);for(const fn of functions){assert.equal(fn.prosecdef,false);assert.ok(fn.proconfig.includes('search_path=""'));assert.equal(fn.anon,fn.proname.startsWith('seo_')||fn.proname==='public_media');}
  for(const [role,uid] of [['anon',null],['authenticated',OTHER_ID],['authenticated',ADMIN_ID]]){
    await assert.rejects(rpc('analytics_record_events',[[event()]],role,uid),e=>e.code==='42501');
    await assert.rejects(asRole(db,role,uid,tx=>tx.query('insert into private.analytics_rate_limits(scope,window_seconds,window_start,event_count) values($1,60,now(),1)',['global'])),e=>e.code==='42501');
  }
  for(const [role,uid] of [['anon',null],['authenticated',OTHER_ID]])await assert.rejects(rpc('admin_analytics',[city,'2026-11-01','2026-11-13',false],role,uid),e=>e.code==='42501');
});

test('sitemaps include canonical real public routes, exclude demos and react to publication/category changes',async()=>{
  const index=await rpc('seo_sitemap_index'),paths=await rpc('seo_sitemap_page',[0]);
  assert.equal(index.pages,1);assert.ok(paths.includes('/qa-town/food/qa-test-kitchen'));assert.ok(paths.includes('/qa-town'));assert.ok(!paths.some(path=>path.includes('demo')));assert.deepEqual(await rpc('seo_sitemap_page',[1]),[]);
  await assert.rejects(rpc('seo_sitemap_page',[-1]),e=>e.code==='22023');
  try{await db.query('update public.listings set enabled=false where id=$1',[merchant]);assert.ok(!(await rpc('seo_sitemap_page',[0])).includes('/qa-town/food/qa-test-kitchen'));}
  finally{await db.query('update public.listings set enabled=true where id=$1',[merchant]);}
  const food=(await db.query("select id from public.categories where slug='food'")).rows[0].id,sweets=(await db.query("select id from public.categories where slug='sweets'")).rows[0].id;
  try{
    await db.query('insert into public.listing_categories(listing_id,category_id) values($1,$2)',[merchant,sweets]);await db.query('update public.categories set enabled=false where id=$1',[food]);
    const detail=await rpc('merchant_detail',['qa-town','sweets','qa-test-kitchen']);assert.equal(detail.canonical_path,'/qa-town/sweets/qa-test-kitchen');assert.ok((await rpc('seo_sitemap_page',[0])).includes(detail.canonical_path));
  }finally{await db.query('update public.categories set enabled=true where id=$1',[food]);await db.query('delete from public.listing_categories where listing_id=$1 and category_id=$2',[merchant,sweets]);}
});

test('stable media reads reject disabled references and hidden parents even for admin callers',async()=>{
  const id=randomUUID();await db.query("insert into public.listing_media(id,listing_id,bucket_id,object_path,alt_text,media_role) values($1,$2,'listing-media',$3,'Fixture image','gallery')",[id,merchant,merchant+'/seo-fixture.webp']);
  try{
    assert.equal((await rpc('public_media',[id])).object_path,merchant+'/seo-fixture.webp');await db.query('update public.listing_media set enabled=false where id=$1',[id]);assert.equal(await rpc('public_media',[id],'authenticated',ADMIN_ID),null);
    await db.query('update public.listing_media set enabled=true where id=$1',[id]);await db.query('update public.listings set enabled=false where id=$1',[merchant]);assert.equal(await rpc('public_media',[id],'authenticated',ADMIN_ID),null);
  }finally{await db.query('update public.listings set enabled=true where id=$1',[merchant]);await db.query('delete from public.listing_media where id=$1',[id]);}
});

test('event recording derives target city, retries once and rejects event-key substitution atomically',async()=>{
  const first=event(),second=event('phone_click');assert.equal((await record([first,second])).accepted,2);assert.equal((await record([first])).duplicates,1);
  const saved=(await db.query('select * from private.analytics_events where event_key=$1',[first.event_key])).rows[0];assert.equal(saved.city_id,city);assert.equal(saved.listing_id,merchant);assert.equal(saved.advertisement_id,null);
  await assert.rejects(record([event(),event('listing_view',other,first.event_key)]),e=>e.code==='22023');assert.equal((await db.query('select count(*)::int count from private.analytics_events')).rows[0].count,2);
  for(const invalid of [{...event(),city_id:city},{...event(),created_at:'2000-01-01'},event('checkout_completed'),{...event(),event_key:'bad'}])await assert.rejects(record([invalid]),e=>e.code==='22023');
});

test('hidden listings, unavailable contact actions and expired ads never produce eligible events',async()=>{
  assert.equal((await record([event('phone_click',other),event('directions_click',other)])).accepted,0);
  try{await db.query("update public.listings set publication_status='draft' where id=$1",[merchant]);assert.equal((await record([event()])).accepted,0);}
  finally{await db.query("update public.listings set publication_status='published' where id=$1",[merchant]);}
  const ad=(await db.query('select id,city_id,starts_at,ends_at from public.advertisements order by id limit 1')).rows[0];assert.equal((await record([event('ad_visible_impression',ad.id),event('ad_click',ad.id)])).accepted,2);
  assert.equal((await db.query('select city_id from private.analytics_events where advertisement_id=$1 limit 1',[ad.id])).rows[0].city_id,ad.city_id);
  try{await db.query("update public.advertisements set starts_at='2020-01-01',ends_at='2021-01-01' where id=$1",[ad.id]);assert.equal((await record([event('ad_click',ad.id)])).accepted,0);}
  finally{await db.query('update public.advertisements set starts_at=$2,ends_at=$3 where id=$1',[ad.id,ad.starts_at,ad.ends_at]);}
});

test('event budgets charge batch cost independently from checkout and stay committed after a failed intake',async()=>{
  const hash='a'.repeat(64),before=(await db.query('select count(*)::int count from private.checkout_rate_limits')).rows[0].count;
  for(let i=0;i<6;i++)assert.equal((await rpc('analytics_consume_limit',[hash,20],'service_role')).allowed,true);
  assert.equal((await rpc('analytics_consume_limit',[hash,1],'service_role')).allowed,false);
  await assert.rejects(record([{...event(),visitor_id:'forbidden'}]));
  assert.equal((await db.query('select event_count from private.analytics_rate_limits where scope=$1 and window_seconds=60',['client:'+hash])).rows[0].event_count,121);
  assert.equal((await db.query('select count(*)::int count from private.checkout_rate_limits')).rows[0].count,before);
});

test('analytics uses city-midnight boundaries, zero-filled days, explicit demo filters and separate enquiry aggregates',async()=>{
  const demo=(await db.query("insert into public.listings(city_id,name,slug,listing_type,is_demo,description,publication_status) values($1,'Demo Analytics Fixture','demo-analytics-fixture','GENERAL_BUSINESS',true,'Fictional test-only content','published') returning id",[city])).rows[0].id;
  try{
    for(const [id,time] of [[merchant,'2026-11-12T18:29:59Z'],[merchant,'2026-11-12T18:30:00Z'],[demo,'2026-11-12T18:30:01Z']])await db.query("insert into private.analytics_events(city_id,listing_id,event_type,event_key,created_at) values($1,$2,'listing_view',$3,$4)",[city,id,randomUUID(),time]);
    const data=await rpc('admin_analytics',[city,'2026-11-13','2026-11-14',false],'authenticated',ADMIN_ID);assert.equal(data.totals.listing_views,1);assert.equal(data.daily.length,2);assert.equal(data.daily[1].views,0);assert.equal(data.timezone,'Asia/Kolkata');assert.equal(data.totals.checkout_initiations,0);assert.ok(!JSON.stringify(data).includes('instructions'));
    assert.equal((await rpc('admin_analytics',[city,'2026-11-13','2026-11-14',true],'authenticated',ADMIN_ID)).totals.listing_views,2);
    await assert.rejects(rpc('admin_analytics',[city,'2026-01-01','2026-12-31',false],'authenticated',ADMIN_ID),e=>e.code==='22023');
    await db.query('update private.admin_users set active=false where user_id=$1',[ADMIN_ID]);await assert.rejects(rpc('admin_analytics',[city,'2026-11-13','2026-11-14',false],'authenticated',ADMIN_ID),e=>e.code==='42501');
  }finally{await db.query('update private.admin_users set active=true where user_id=$1',[ADMIN_ID]);await db.query('delete from private.analytics_events where listing_id=$1',[demo]);await db.query('delete from public.listings where id=$1',[demo]);}
});

test('trusted initiations and handoffs use their own dates without multiplying by browser events',async()=>{
  const enquiry=randomUUID();
  try{
    await db.query("insert into private.checkout_intents(id,merchant_id,reference,idempotency_key,total_minor,state,created_at,handoff_created_at,instructions) values($1,$2,'RB-ANALYTICS001',$3,1000,'handoff_created','2026-11-12T18:29:00Z','2026-11-12T18:31:00Z','Private fixture note never included in analytics')",[enquiry,merchant,randomUUID()]);
    for(let i=0;i<3;i++)await db.query("insert into private.analytics_events(city_id,listing_id,event_type,event_key,created_at) values($1,$2,'listing_view',$3,'2026-11-12T18:29:30Z')",[city,merchant,randomUUID()]);
    const first=await rpc('admin_analytics',[city,'2026-11-12','2026-11-12',false],'authenticated',ADMIN_ID),second=await rpc('admin_analytics',[city,'2026-11-13','2026-11-13',false],'authenticated',ADMIN_ID);
    assert.equal(first.totals.listing_views,3);assert.equal(first.totals.checkout_initiations,1);assert.equal(first.totals.handoffs_prepared,0);assert.equal(second.totals.checkout_initiations,0);assert.equal(second.totals.handoffs_prepared,1);assert.ok(!JSON.stringify(first).includes('Private fixture note'));
  }finally{await db.query('delete from private.checkout_intents where id=$1',[enquiry]);}
});
