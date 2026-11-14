import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createTestDatabase, asRole, CITY_ID, ADMIN_ID } from '../helpers/database.js';

let db, context;
const rpc = async (name, args=[], role='anon', uid=null) => (await asRole(db,role,uid,tx=>tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args))).rows[0].result;
const listings = (options={}) => rpc('discovery_listings',[CITY_ID,options.categoryId||null,options.localityId||null,options.query||'',options.sort||'recommended',options.offset??0,options.limit??12,options.facets||{}]);
before(async()=>{
  db=await createTestDatabase();
  await db.exec(await readFile('supabase/seeds/demo.sql','utf8'));
  await db.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));
  await db.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));
  context=await rpc('discovery_context',[null]);
});
after(async()=>{if(db)await db.close();});

test('discovery seed is repeatable, complete, fictional and backed by local licensed assets',async()=>{
  assert.equal(context.city.id,CITY_ID);
  assert.equal(context.categories.length,15);
  assert.equal(context.localities.length,3);
  assert.equal(context.advertisements.length,3);
  assert.equal(context.has_demo_content,true);
  const rows=(await db.query('select * from public.listings')).rows;
  assert.equal(rows.length,33);
  assert.ok(rows.every(l=>l.is_demo&&l.name.startsWith('Demo ')&&!l.phone_number&&!l.whatsapp_number&&!l.address&&!l.latitude));
  assert.equal((await db.query('select count(*)::int total from public.listing_actions where checkout_enabled')).rows[0].total,0);
  for(const image of [...rows.map(l=>l.demo_image_path),...context.categories.map(c=>c.cover_image_path),...context.advertisements.map(a=>a.demo_image_path)])await access('public'+image);
  assert.equal((await rpc('discovery_context',['missing-town'])).city,null);
});

test('public discovery view and RPCs preserve caller RLS and expose only read operations',async()=>{
  const options=(await db.query("select reloptions from pg_class where oid='public.discovery_listing_cards'::regclass")).rows[0].reloptions;
  assert.ok(options.includes('security_invoker=true'));
  const functions=(await db.query("select proname,prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'discovery_%'")).rows;
  assert.equal(functions.length,4);
  assert.ok(functions.every(fn=>!fn.prosecdef));
  const permissions=(await db.query("select has_table_privilege('anon','public.discovery_listing_cards','INSERT,UPDATE,DELETE,TRUNCATE') writable")).rows[0];
  assert.equal(permissions.writable,false);
});

test('homepage sections page incrementally and return at most four ranked listings each',async()=>{
  const first=await rpc('discovery_home',[CITY_ID,null,0,4]);
  assert.equal(first.sections.length,4);assert.ok(first.has_more);
  assert.ok(first.sections.every(s=>s.items.length===4));
  const second=await rpc('discovery_home',[CITY_ID,null,first.next_offset,6]);
  const third=await rpc('discovery_home',[CITY_ID,null,second.next_offset,6]);
  const all=[...first.sections,...second.sections,...third.sections];
  assert.equal(new Set(all.map(s=>s.id)).size,15);
  assert.equal(third.has_more,false);
  assert.ok(all.every(s=>s.items.length<=4));
});

test('homepage ranking has deterministic ties and does not invent replacements for hidden listings',async()=>{
  const section=(await rpc('discovery_home',[CITY_ID,null,0,1])).sections[0];
  const original=(await db.query('select listing_id,rank from public.homepage_featured_listings where section_id=$1',[section.id])).rows;
  try{
    await db.query('update public.homepage_featured_listings set rank=1 where section_id=$1',[section.id]);
    const tied=(await rpc('discovery_home',[CITY_ID,null,0,1])).sections[0].items;
    assert.deepEqual(tied.map(l=>l.id),[...tied.map(l=>l.id)].sort());
    await db.query('update public.listings set enabled=false where id=$1',[tied[0].id]);
    assert.equal((await rpc('discovery_home',[CITY_ID,null,0,1])).sections[0].items.length,3);
    assert.equal(await rpc('discovery_preview',[tied[0].id]),null);
  }finally{
    await db.query('update public.listings set enabled=true where id=any($1::uuid[])',[original.map(r=>r.listing_id)]);
    for(const row of original)await db.query('update public.homepage_featured_listings set rank=$1 where section_id=$2 and listing_id=$3',[row.rank,section.id,row.listing_id]);
  }
});

test('server search matches products, business names, categories, localities and service offerings',async()=>{
  const product=await listings({query:'  kAjU   Katli  '});
  assert.equal(product.total,1);
  assert.equal(product.items[0].matched_product,'Sample Kaju Katli');
  assert.match(product.items[0].name,/Mishri/);
  assert.equal((await listings({query:'hotels & stays'})).total,4);
  assert.equal((await listings({query:'Demo HandyHome'})).total,1);
  assert.ok((await listings({query:'Demo Lakeside'})).total>0);
  assert.equal((await listings({query:'Sample visiting information'})).total,4);
  assert.equal((await listings({query:'%'})).total,0);
  assert.equal((await listings({query:'nothing-matches-this-query'})).total,0);
});

test('locality and category facets filter in PostgreSQL, including provider service areas',async()=>{
  const food=context.categories.find(c=>c.slug==='food');
  const stays=context.categories.find(c=>c.slug==='hotels');
  const services=context.categories.find(c=>c.slug==='home-services');
  const lake=context.localities.find(p=>p.slug==='demo-lakeside');
  assert.equal((await listings({categoryId:food.id,localityId:lake.id})).total,1);
  assert.equal((await listings({categoryId:services.id,localityId:lake.id})).total,4);
  assert.equal((await listings({categoryId:food.id,facets:{diet:'Vegetarian'}})).total,3);
  assert.equal((await listings({categoryId:stays.id,facets:{amenities:'Wi-Fi'}})).total,4);
  assert.equal((await listings({categoryId:stays.id,facets:{amenities:'Parking'}})).total,2);
  assert.equal((await listings({categoryId:food.id,facets:{unknown:'anything'}})).total,0);
});

test('pagination and sorting are bounded and stable with no duplicated results',async()=>{
  const first=await listings({sort:'name'}),second=await listings({sort:'name',offset:12}),third=await listings({sort:'name',offset:24});
  assert.equal(first.total,33);assert.equal(first.items.length,12);
  assert.equal(second.items.length,12);assert.equal(third.items.length,9);assert.equal(third.has_more,false);
  const all=[...first.items,...second.items,...third.items];
  assert.equal(new Set(all.map(l=>l.id)).size,33);
  const asc=(await listings({sort:'price_asc',limit:24})).items.map(l=>l.price_minor).filter(p=>p!==null);
  assert.deepEqual(asc,[...asc].sort((a,b)=>a-b));
  const desc=(await listings({sort:'price_desc',limit:24})).items.map(l=>l.price_minor).filter(p=>p!==null);
  assert.deepEqual(desc,[...desc].sort((a,b)=>b-a));
});

test('draft merchants and inactive products cannot leak through any discovery read, including admin RPC calls',async()=>{
  const result=await listings({query:'Kaju'});
  const merchant=result.items[0],product=(await db.query("select id from public.products where merchant_id=$1 and sku='DEMO-001'",[merchant.id])).rows[0];
  try{
    await db.query('update public.products set active=false where id=$1',[product.id]);
    assert.equal((await listings({query:'Kaju'})).total,0);
    await db.query("update public.listings set publication_status='draft' where id=$1",[merchant.id]);
    assert.equal(await rpc('discovery_preview',[merchant.id]),null);
    assert.equal(await rpc('discovery_preview',[merchant.id],'authenticated',ADMIN_ID),null);
    assert.equal((await listings({query:merchant.name})).total,0);
    const home=await rpc('discovery_home',[CITY_ID,null,0,4]);
    assert.ok(home.sections.every(s=>s.items.every(l=>l.id!==merchant.id)));
  }finally{
    await db.query('update public.products set active=true where id=$1',[product.id]);
    await db.query("update public.listings set publication_status='published' where id=$1",[merchant.id]);
  }
});

test('temporarily closed businesses remain discoverable and active promotions obey scheduling',async()=>{
  const fitness=await listings({categoryId:context.categories.find(c=>c.slug==='fitness').id});
  assert.equal(fitness.total,4);
  assert.equal(fitness.items.filter(l=>l.availability==='temporarily_closed').length,1);
  const ad=context.advertisements[0];
  try{
    await db.query("update public.advertisements set starts_at=now()+interval '1 day' where id=$1",[ad.id]);
    const data=await rpc('discovery_context',[null]);
    assert.equal(data.advertisements.length,2);
    assert.ok(!data.advertisements.some(a=>a.id===ad.id));
  }finally{await db.query("update public.advertisements set starts_at=now()-interval '1 day' where id=$1",[ad.id]);}
});

test('discovery RPCs reject unbounded and malformed public inputs',async()=>{
  const bad=[()=>rpc('discovery_home',[CITY_ID,null,0,7]),()=>rpc('discovery_home',[CITY_ID,null,null,4]),
    ()=>listings({limit:25}),()=>listings({offset:10001}),()=>listings({query:'x'.repeat(101)}),
    ()=>listings({sort:'arbitrary_sql'}),()=>listings({facets:{diet:42}}),
    ()=>listings({facets:Object.fromEntries(Array.from({length:7},(_,i)=>['key-'+i,'value']))}),
    ()=>rpc('discovery_context',['../outside'])];
  for(const run of bad)await assert.rejects(run(),error=>error.code==='22023');
});

test('discovery demo cleanup removes the expanded dataset and preserves platform and admin records',async()=>{
  const disposable=await createTestDatabase();
  try{
    await disposable.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));
    assert.equal((await disposable.query('select count(*)::int total from public.listings')).rows[0].total,33);
    await disposable.exec(await readFile('supabase/seeds/remove-demo.sql','utf8'));
    for(const table of ['listings','categories','localities','products','offerings','advertisements','homepage_sections','homepage_featured_listings','listing_service_areas','listing_attributes','temporary_status_overrides']){
      assert.equal((await disposable.query('select count(*)::int total from public.'+table)).rows[0].total,0,table);
    }
    assert.equal((await disposable.query('select count(*)::int total from public.cities')).rows[0].total,1);
    assert.equal((await disposable.query('select count(*)::int total from public.platform_settings')).rows[0].total,1);
    assert.equal((await disposable.query('select count(*)::int total from private.admin_users')).rows[0].total,1);
  }finally{await disposable.close();}
});

