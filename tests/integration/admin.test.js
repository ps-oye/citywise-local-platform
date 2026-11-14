import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createTestDatabase,asRole,CITY_ID,ADMIN_ID,OTHER_ID} from '../helpers/database.js';
let db,context;
const rpc=async(name,args=[],uid=ADMIN_ID,role='authenticated')=>(await asRole(db,role,uid,tx=>tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args))).rows[0].result;
const merchantData=(changes={})=>({id:randomUUID(),city_id:CITY_ID,locality_id:null,name:'QA Admin Merchant',slug:'qa-admin-'+randomUUID().slice(0,8),listing_type:'RESTAURANT',
  short_description:'An isolated admin fixture',description:'Not a hosted demo',address:'',latitude:'',longitude:'',maps_place_id:'',phone_number:'',whatsapp_number:'',contact_verified:false,
  timezone:'Asia/Kolkata',publication_status:'draft',enabled:true,sponsored:false,is_demo:false,category_ids:[context.categories.find(c=>c.slug==='food').id],
  primary_category_id:context.categories.find(c=>c.slug==='food').id,service_area_ids:[],attributes:[],offerings:[],actions:{checkout_enabled:false,pickup_available:true,directions_enabled:false},...changes});
before(async()=>{db=await createTestDatabase();await db.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));await db.exec(await readFile('supabase/seeds/merchant-demo.sql','utf8'));context=await rpc('admin_context',[CITY_ID]);});
after(async()=>{if(db)await db.close();});

test('admin RPCs require the allowlisted UID, keep invoker RLS and never grant anonymous execution',async()=>{
  for(const name of ['admin_context','admin_overview','admin_listings']){
    const args=name==='admin_context'?[]:[CITY_ID];
    await assert.rejects(rpc(name,args,null,'anon'),error=>error.code==='42501');
    await assert.rejects(rpc(name,args,OTHER_ID),error=>error.code==='42501');
  }
  const rows=(await db.query("select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin_%'")).rows;
  assert.ok(rows.length>=19);assert.ok(rows.every(row=>!row.prosecdef));
  const overview=await rpc('admin_overview',[CITY_ID]);assert.equal(overview.listings,33);assert.equal(overview.products,110);
});
test('merchant create/edit/publication/archive is transactional, audited and immediately affects public routes',async()=>{
  const data=merchantData();let saved=await rpc('admin_save_listing',[data,null]);assert.equal(saved.publication_status,'draft');
  assert.equal(await rpc('merchant_detail',['rawatbhata','food',data.slug],null,'anon'),null);
  saved=await rpc('admin_listing_state',[saved.id,'publish',saved.updated_at]);assert.equal(saved.is_public,true);
  assert.equal((await rpc('merchant_detail',['rawatbhata','food',data.slug],null,'anon')).id,saved.id);
  saved=await rpc('admin_save_listing',[{...data,name:'Updated QA Merchant',publication_status:'published'},saved.updated_at]);assert.equal(saved.name,'Updated QA Merchant');
  await assert.rejects(rpc('admin_save_listing',[{...data,name:'Stale'},data.updated_at||null]),error=>error.code==='40001');
  saved=await rpc('admin_listing_state',[saved.id,'archive',saved.updated_at]);assert.ok(saved.archived_at);assert.equal(saved.is_public,false);
  assert.ok((await db.query('select count(*)::int total from private.admin_audit_logs where record_id=$1',[saved.id])).rows[0].total>=3);
  saved=await rpc('admin_listing_state',[saved.id,'restore',saved.updated_at]);assert.equal(saved.publication_status,'draft');assert.equal(saved.enabled,false);
});
test('failed relational changes roll back the whole merchant save and clearing contact disables checkout first',async()=>{
  const data=merchantData({whatsapp_number:'+12025550123',contact_verified:true,actions:{checkout_enabled:true,pickup_available:true}});
  let saved=await rpc('admin_save_listing',[data,null]);assert.equal(saved.actions.checkout_enabled,true);
  await assert.rejects(rpc('admin_save_listing',[{...data,name:'Should roll back',locality_id:randomUUID()},saved.updated_at]),error=>error.code==='23503');
  assert.equal((await rpc('admin_listing',[saved.id])).name,data.name);
  saved=await rpc('admin_save_listing',[{...data,whatsapp_number:'',contact_verified:false,actions:{checkout_enabled:false}},saved.updated_at]);
  assert.equal(saved.contact_verified_at,null);assert.equal(saved.actions.checkout_enabled,false);
});
test('saving an existing featured merchant preserves ranks and blocks removal of its active featured category',async()=>{
  const existing=(await rpc('admin_listings',[CITY_ID,'Gulmohar'])).items[0];const record=await rpc('admin_listing',[existing.id]);
  const data=merchantData({...record,category_ids:record.categories.map(c=>c.category_id),primary_category_id:record.categories.find(c=>c.is_primary).category_id,
    service_area_ids:record.service_area_ids,attributes:record.attributes.map(a=>({attribute_id:a.attribute_id,value:a.value})),offerings:[],contact_verified:false});
  for(const key of ['categories','media','featured_category_ids','is_public','updated_at','created_at','archived_at','verified_at','demo_image_path','contact_verified_at'])delete data[key];
  data.actions={checkout_enabled:false,pickup_available:true,directions_enabled:false};
  await rpc('admin_save_listing',[data,record.updated_at]);
  assert.equal((await db.query('select count(*)::int total from public.homepage_featured_listings where listing_id=$1 and enabled',[record.id])).rows[0].total,1);
  const updated=await rpc('admin_listing',[record.id]);const other=context.categories.find(c=>c.slug==='sweets').id;
  await assert.rejects(rpc('admin_save_listing',[{...data,category_ids:[other],primary_category_id:other},updated.updated_at]),error=>error.message==='ADMIN_UNFEATURE_FIRST');
});
test('category/locality/city CRUD is authorized, constrained and protects referenced records',async()=>{
  let category=await rpc('admin_save_taxonomy',['category',{id:randomUUID(),name:'QA Category',slug:'qa-category',enabled:true,display_order:99},null]);
  category=await rpc('admin_save_taxonomy',['category',{...pick(category,['id','name','slug','parent_id','description','display_order','enabled']),name:'Updated QA Category'},category.updated_at]);
  assert.equal(category.name,'Updated QA Category');
  await assert.rejects(rpc('admin_save_taxonomy',['category',{...pick(category,['id','name','slug','parent_id','description','display_order','enabled']),parent_id:category.id},category.updated_at]),error=>error.code==='23514');
  assert.equal(await rpc('admin_delete_taxonomy',['category',category.id,category.updated_at]),true);
  let city=await rpc('admin_save_taxonomy',['city',{id:randomUUID(),name:'QA City',slug:'qa-city',state:'Test',country_code:'IN',timezone:'Asia/Kolkata',enabled:true,is_default:false},null]);
  let locality=await rpc('admin_save_taxonomy',['locality',{id:randomUUID(),city_id:city.id,name:'QA Locality',slug:'qa-locality',enabled:true},null]);
  assert.equal(await rpc('admin_delete_taxonomy',['locality',locality.id,locality.updated_at]),true);
  assert.equal(await rpc('admin_delete_taxonomy',['city',city.id,city.updated_at]),true);
  await assert.rejects(rpc('admin_delete_taxonomy',['category',context.categories[0].id,context.categories[0].updated_at]),error=>['23503','23001'].includes(error.code));
});
function pick(value,keys){return Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));}
test('advertisements save paused, preserve existing images and use city-local scheduling',async()=>{
  const data={id:randomUUID(),city_id:CITY_ID,title:'QA promotion',alt_text:'QA banner',starts_local:'2026-11-12T09:00',ends_local:'2026-11-13T09:00',priority:2,enabled:false,sponsored:true};
  let saved=await rpc('admin_save_ad',[data,null]);assert.equal(saved.starts_at,'2026-11-12T03:30:00+00:00');
  await assert.rejects(rpc('admin_save_ad',[{...data,enabled:true},saved.updated_at]),error=>error.code==='23514');
  saved=await rpc('admin_attach_media',[{entity:'advertisement',entity_id:saved.id,expected:saved.updated_at,object_path:saved.id+'/banner.webp',alt_text:'QA banner',role:'desktop'}]);
  saved=await rpc('admin_save_ad',[{...data,enabled:true},saved.updated_at]);assert.equal(saved.desktop_image_path,data.id+'/banner.webp');
  const demo=(await rpc('admin_ads',[CITY_ID])).items.find(ad=>ad.is_demo);
  const demoEdit=await rpc('admin_save_ad',[{...data,id:demo.id,title:'Updated demo promotion',enabled:true,starts_local:'2026-11-12T09:00',ends_local:'2027-11-12T09:00'},demo.updated_at]);assert.ok(demoEdit.demo_image_path);assert.ok(demoEdit.is_demo);
});
test('homepage reordering/visibility is atomic, capped publicly and rejects stale or cross-city placements',async()=>{
  const category=context.categories.find(c=>c.slug==='food').id;
  let ranking=await rpc('admin_ranking',[CITY_ID,category]);const section=ranking.section;
  const entries=ranking.placements.map(p=>({listing_id:p.listing_id,enabled:p.enabled})).reverse();
  ranking=await rpc('admin_save_ranking',[pick(section,['id','city_id','category_id','title','display_order','enabled']),entries,section.updated_at]);
  const publicHome=await rpc('discovery_home',[CITY_ID,null,0,1],null,'anon');assert.equal(publicHome.sections[0].items.length,4);assert.equal(publicHome.sections[0].items[0].id,entries[0].listing_id);
  await assert.rejects(rpc('admin_save_ranking',[pick(section,['id','city_id','category_id','title','display_order','enabled']),entries,section.updated_at]),error=>error.code==='40001');
  const invalid=[...entries,{listing_id:randomUUID(),enabled:true}];
  await assert.rejects(rpc('admin_save_ranking',[pick(ranking.section,['id','city_id','category_id','title','display_order','enabled']),invalid,ranking.section.updated_at]),error=>error.code==='23503');
  assert.equal((await rpc('admin_ranking',[CITY_ID,category])).placements.length,4);
});
test('weekly and special-date changes are atomic and preserve exceptions not explicitly removed',async()=>{
  const saved=await rpc('admin_save_listing',[merchantData(),null]);let hours=await rpc('admin_hours',[saved.id]);
  const first={id:randomUUID(),on_date:'2027-01-01',closed:true,label:'Holiday',intervals:[]};
  hours=await rpc('admin_save_hours',[saved.id,[{weekday:1,opens_at:'09:00',closes_at:'13:00',ends_next_day:false},{weekday:1,opens_at:'17:00',closes_at:'22:00',ends_next_day:false}],[first],[],hours.revision]);
  const second={id:randomUUID(),on_date:'2027-01-02',closed:false,label:'Short day',intervals:[{opens_at:'10:00',closes_at:'12:00',ends_next_day:false}]};
  hours=await rpc('admin_save_hours',[saved.id,hours.weekly,[second],[],hours.revision]);assert.equal(hours.special.length,2);
  await assert.rejects(rpc('admin_save_hours',[saved.id,[{weekday:1,opens_at:'18:00',closes_at:'09:00',ends_next_day:false}],[],[],hours.revision]),error=>error.code==='23514');
  assert.equal((await rpc('admin_hours',[saved.id])).weekly.length,2);
  hours=await rpc('admin_save_hours',[saved.id,hours.weekly,[],[first.id],hours.revision]);assert.equal(hours.special.length,1);
});
test('manual closures/reopening and cancelling future overrides retain real timestamps and audit history',async()=>{
  let saved=await rpc('admin_save_listing',[merchantData({publication_status:'published'}),null]);let hours=await rpc('admin_hours',[saved.id]);
  hours=await rpc('admin_set_override',[saved.id,{status:'closed',reason:'QA closure',starts_local:'',expires_local:'',enquiries_while_closed:false},hours.revision]);assert.equal(hours.status.state,'temporarily_closed');
  hours=await rpc('admin_set_override',[saved.id,{status:'schedule',enquiries_while_closed:false},hours.revision]);assert.equal(hours.override,null);
  hours=await rpc('admin_set_override',[saved.id,{status:'closed',starts_local:'2099-01-01T09:00',expires_local:'2099-01-02T09:00'},hours.revision]);const id=hours.override.id;
  hours=await rpc('admin_set_override',[saved.id,{status:'schedule'},hours.revision]);assert.equal(hours.override,null);
  assert.equal((await db.query("select count(*)::int total from private.admin_audit_logs where record_id=$1 and operation='DELETE'",[id])).rows[0].total,1);
});
test('overlapping weekly, week-boundary overnight and special-date intervals roll back atomically',async()=>{
  const saved=await rpc('admin_save_listing',[merchantData(),null]);const hours=await rpc('admin_hours',[saved.id]);
  const overlaps=[
    [{weekday:1,opens_at:'09:00',closes_at:'13:00'},{weekday:1,opens_at:'12:00',closes_at:'15:00'}],
    [{weekday:6,opens_at:'23:00',closes_at:'02:00',ends_next_day:true},{weekday:0,opens_at:'01:00',closes_at:'03:00'}],
  ];
  for(const shifts of overlaps)await assert.rejects(rpc('admin_save_hours',[saved.id,shifts,[],[],hours.revision]),error=>error.message==='ADMIN_OVERLAPPING_HOURS');
  const special=[{id:randomUUID(),on_date:'2027-03-01',closed:false,intervals:[{opens_at:'09:00',closes_at:'13:00'},{opens_at:'12:00',closes_at:'14:00'}]}];
  await assert.rejects(rpc('admin_save_hours',[saved.id,[],special,[],hours.revision]),error=>error.message==='ADMIN_OVERLAPPING_HOURS');
  assert.equal((await rpc('admin_hours',[saved.id])).special.length,0);
});
test('media primary replacement, metadata edits and removals protect referenced products and live advertisements',async()=>{
  let saved=await rpc('admin_save_listing',[merchantData(),null]);
  saved=await rpc('admin_attach_media',[{entity:'listing',entity_id:saved.id,expected:saved.updated_at,object_path:saved.id+'/one.webp',alt_text:'First banner',role:'banner'}]);
  saved=await rpc('admin_attach_media',[{entity:'listing',entity_id:saved.id,expected:saved.updated_at,object_path:saved.id+'/two.webp',alt_text:'Second banner',role:'banner'}]);
  assert.equal(saved.media.filter(m=>m.media_role==='banner').length,1);assert.equal(saved.media.filter(m=>m.media_role==='gallery').length,1);
  const image=saved.media[0];saved=await rpc('admin_update_media',[image.id,'Updated alt text','gallery',false,3,saved.updated_at]);assert.equal(saved.media.find(m=>m.id===image.id).enabled,false);
  await db.query("insert into public.products(merchant_id,sku,name,price_minor,image_media_id) values($1,'MEDIA-QA','QA Product',100,$2)",[saved.id,image.id]);
  await assert.rejects(rpc('admin_remove_media',[{entity:'listing',entity_id:saved.id,media_id:image.id,expected:saved.updated_at}]),error=>error.message==='ADMIN_MEDIA_IN_USE');
});
test('admin allowlist revocation blocks existing authenticated sessions and forged metadata gives no privileges',async()=>{
  await db.query('update private.admin_users set active=false');
  try{await assert.rejects(rpc('admin_context'),error=>error.code==='42501');await assert.rejects(rpc('admin_save_listing',[merchantData(),null]),error=>error.code==='42501');}
  finally{await db.query('update private.admin_users set active=true');}
});
test('media mutations reject stale parent revisions and cannot mask another tab’s edits',async()=>{
  const data={id:randomUUID(),city_id:CITY_ID,title:'Original title',alt_text:'QA banner',priority:0,enabled:false,sponsored:true};
  const original=await rpc('admin_save_ad',[data,null]);const updated=await rpc('admin_save_ad',[{...data,title:'Other tab title'},original.updated_at]);
  await assert.rejects(rpc('admin_attach_media',[{entity:'advertisement',entity_id:original.id,expected:original.updated_at,object_path:original.id+'/stale.webp',alt_text:'Stale banner',role:'desktop'}]),error=>error.code==='40001');
  assert.equal((await rpc('admin_ad',[updated.id])).title,'Other tab title');assert.equal((await rpc('admin_ad',[updated.id])).desktop_image_path,null);
  const merchant=await rpc('admin_save_listing',[merchantData(),null]);const attached=await rpc('admin_attach_media',[{entity:'listing',entity_id:merchant.id,expected:merchant.updated_at,object_path:merchant.id+'/fresh.webp',alt_text:'QA image',role:'banner'}]);
  await assert.rejects(rpc('admin_update_media',[attached.media[0].id,'Stale image details','gallery',true,0,merchant.updated_at]),error=>error.code==='40001');
  await assert.rejects(rpc('admin_remove_media',[{entity:'listing',entity_id:merchant.id,media_id:attached.media[0].id,expected:merchant.updated_at}]),error=>error.code==='40001');
});
