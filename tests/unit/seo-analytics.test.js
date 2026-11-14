import test from 'node:test';
import assert from 'node:assert/strict';
import {pageMetadata,deploymentSettings,jsonForHtml,pageNumber} from '../../src/domain/seo.js';
import {dateRange,clickThroughRate} from '../../src/domain/analytics.js';
import {serveDiscoveryPage} from '../../src/server/discovery-page.js';
import {serveSeoEndpoint} from '../../src/server/seo-endpoints.js';
import {publicCatalog} from '../../src/server/public-catalog.js';
import {handleEvents} from '../../src/server/events-handler.js';
import {createAnalytics,analyticsAllowed,qualifiesAd} from '../../src/services/analytics.js';
const id='70000000-0000-4000-8000-000000000001',city={id:'70000000-0000-4000-8000-000000000090',slug:'town',name:'Town',state:'State'},category={id:'60000000-0000-4000-8000-000000000001',slug:'food',name:'Food',description:'Places for a meal',parent_id:null};
const context={city,cities:[city],categories:[category],localities:[],advertisements:[],has_demo_content:false};
const item={id,name:'Fictional QA Kitchen',slug:'kitchen',category_slug:'food',is_demo:false,description:'A test-only kitchen',short_description:'A test-only kitchen',city,category_name:'Food',listing_type:'RESTAURANT',canonical_path:'/town/food/kitchen',product_categories:[],weekly_hours:[],gallery:[]};
const result={items:[item],total:1,has_more:false,next_offset:12};
const shell='<!doctype html><html lang="en-IN"><head><title>Shell</title><meta name="description" content="Shell"><meta name="robots" content="noindex, nofollow"></head><body><main>Loading</main></body></html>';
const env={VITE_SUPABASE_URL:'https://project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const makeContext=(path,extra={})=>({request:new Request('https://example.com'+path),env:{...env,...extra,ASSETS:{fetch:async()=>new Response(shell)}}});

test('production indexing requires an explicit canonical origin and the matching deployment environment',()=>{
  const configured={SITE_URL:'https://example.com',SITE_INDEXING_ENABLED:'true',DEPLOYMENT_ENV:'production'};
  assert.equal(deploymentSettings(configured,'https://example.com/town').indexable,true);
  for(const altered of [{...configured,DEPLOYMENT_ENV:'preview'},{...configured,SITE_URL:''},{...configured,SITE_URL:'javascript:alert(1)'},{...configured,SITE_INDEXING_ENABLED:'false'}])assert.equal(deploymentSettings(altered,'https://example.com/town').indexable,false);
  assert.equal(deploymentSettings(configured,'https://branch.pages.dev/town').indexable,false);
});
test('metadata has canonical social fields and truthful schema without fictional reviews or offers',()=>{
  const meta=pageMetadata({url:new URL('https://example.com/town/food/kitchen'),route:{kind:'merchant'},merchant:item,origin:'https://example.com',indexable:true});
  assert.equal(meta.canonical,'https://example.com/town/food/kitchen');assert.match(meta.robots,/^index/);assert.equal(meta.image,'https://example.com/images/share-card.png');
  assert.ok(meta.structuredData['@graph'].some(entity=>entity['@type']==='Restaurant'));
  for(const word of ['aggregateRating','reviewCount','offers','priceRange','GeoCoordinates'])assert.ok(!JSON.stringify(meta.structuredData).includes(word));
  const encoded=jsonForHtml({description:'</script><img src=x> & \u2028'});assert.ok(!encoded.includes('<'));assert.equal(JSON.parse(encoded).description,'</script><img src=x> & \u2028');
});
test('demo, preview, search and filter URLs stay noindex while pagination is bounded and canonical',()=>{
  const base={route:{kind:'merchant'},merchant:item,origin:'https://example.com',indexable:true};
  assert.match(pageMetadata({...base,url:new URL('https://example.com/town/food/kitchen?q=private')}).robots,/noindex/);
  const demo=pageMetadata({...base,url:new URL('https://example.com/town/food/kitchen'),merchant:{...item,is_demo:true}});assert.match(demo.robots,/noindex/);assert.ok(!JSON.stringify(demo.structuredData).includes('"@type":"Restaurant"'));
  const meta=pageMetadata({url:new URL('https://example.com/town/food?page=2'),route:{kind:'category',categorySlug:'food'},context,items:[item],origin:'https://example.com',indexable:true,page:2});assert.equal(meta.canonical,'https://example.com/town/food?page=2');assert.match(meta.title,/Page 2/);
  for(const page of ['0','-1','835','999999','NaN'])assert.equal(pageNumber(new URL('https://example.com/?page='+page)),1);
});
test('structured hours omit active manual/special overrides and represent all-day schedules correctly',()=>{
  const options={url:new URL('https://example.com/town/food/kitchen'),route:{kind:'merchant'},origin:'https://example.com',indexable:true};
  const business={...item,weekly_hours:[{weekday:1,opens_at:'00:00:00',closes_at:'00:00:00',ends_next_day:true}]};
  for(const source of ['manual','special','none'])assert.ok(!JSON.stringify(pageMetadata({...options,merchant:{...business,status:{state:'open',source}}}).structuredData).includes('openingHoursSpecification'));
  const weekly=pageMetadata({...options,merchant:{...business,status:{state:'open',source:'weekly'}}}).structuredData['@graph'].find(entity=>entity['@type']==='Restaurant');assert.equal(weekly.openingHoursSpecification[0].closes,'23:59');
  assert.ok(!JSON.stringify(pageMetadata({...options,merchant:{...business,status:{source:'weekly'},weekly_hours:[{weekday:1,opens_at:'07:00:00',closes_at:'07:00:00',ends_next_day:true}]}}).structuredData).includes('openingHoursSpecification'));
});
test('discovery HTML contains public cards, native search and safe metadata before JavaScript',async()=>{
  const fetcher=async url=>new Response(JSON.stringify(url.endsWith('discovery_context')?context:result));
  const response=await serveDiscoveryPage(makeContext('/town/food'),{kind:'category',citySlug:'town',categorySlug:'food'},{fetcher});const html=await response.text();
  assert.equal(response.status,200);assert.match(html,/<h1>Food<\/h1>/);assert.match(html,/href="\/town\/food\/kitchen"/);assert.match(html,/method="get"/);assert.match(html,/og:title/);assert.match(html,/id="discovery-bootstrap"/);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  const hidden=await serveDiscoveryPage(makeContext('/town/hidden'),{kind:'category',citySlug:'town',categorySlug:'hidden'},{fetcher});assert.equal(hidden.status,404);
  const more=await serveDiscoveryPage(makeContext('/town/food?page=3'),{kind:'category',citySlug:'town',categorySlug:'food'},{fetcher:async url=>new Response(JSON.stringify(url.endsWith('discovery_context')?context:{...result,items:[]}))});assert.equal(more.status,404);
});
test('sitemap/robots endpoints gate indexing, escape URLs and fail closed on malformed paths',async()=>{
  const prod={SITE_URL:'https://example.com',DEPLOYMENT_ENV:'production',SITE_INDEXING_ENABLED:'true'};
  const fetcher=async url=>new Response(JSON.stringify(url.endsWith('seo_sitemap_index')?{pages:1}:['/town','/town/food/kitchen']));
  const index=await serveSeoEndpoint(makeContext('/sitemap.xml',prod),{fetcher});assert.match(await index.text(),/https:\/\/example.com\/sitemaps\/0.xml/);
  const page=await serveSeoEndpoint(makeContext('/sitemaps/0.xml',prod),{fetcher});assert.match(await page.text(),/\/town\/food\/kitchen/);
  const preview=await serveSeoEndpoint(makeContext('/sitemap.xml'),{fetcher});assert.ok(!(await preview.text()).includes('<loc>'));
  const robots=await serveSeoEndpoint(makeContext('/robots.txt',prod),{fetcher});assert.match(await robots.text(),/Sitemap: https:\/\/example.com\/sitemap.xml/);
  const invalid=await serveSeoEndpoint(makeContext('/sitemaps/0.xml',prod),{fetcher:async()=>new Response('["https://evil.example/path"]')});assert.equal(invalid.status,503);
});
test('public HTML fetches never accept privileged keys and enforce streamed response limits',async()=>{
  assert.throws(()=>publicCatalog({...env,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_forbidden'}));
  const client=publicCatalog(env,async()=>new Response('x'.repeat(1048577)));await assert.rejects(client.rpc('discovery_context'),/too large/);
});
test('stable public image delivery rechecks visibility and uses no privileged credential',async()=>{
  const calls=[],prod={SITE_URL:'https://example.com',DEPLOYMENT_ENV:'production',SITE_INDEXING_ENABLED:'true',SUPABASE_SECRET_KEY:'sb_secret_never_forwarded'};
  const fetcher=async(input,init={})=>{const url=typeof input==='string'?input:input.url;calls.push({url,headers:new Headers(init.headers)});return url.endsWith('public_media')?new Response(JSON.stringify({bucket_id:'listing-media',object_path:id+'/image.webp',is_demo:false})):new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/webp'}});};
  const response=await serveSeoEndpoint(makeContext('/media/'+id,prod),{fetcher});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/^index/);assert.equal(response.headers.get('Content-Type'),'image/webp');
  for(const call of calls)assert.ok(!JSON.stringify([...call.headers]).includes(prod.SUPABASE_SECRET_KEY));
  const hidden=await serveSeoEndpoint(makeContext('/media/'+id,prod),{fetcher:async()=>new Response('null')});assert.equal(hidden.status,404);
});
const request=(body,headers={})=>new Request('https://example.com/api/events',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const body={events:[{event_key:'80000000-0000-4000-8000-000000000001',event_type:'listing_view',listing_id:id}]},trusted={identity:'127.0.0.1',secret:'a'.repeat(40)};
test('event HTTP boundary rejects origins, fields, weak configuration and oversized streamed payloads',async()=>{
  const client={rpc(){throw new Error('Must not be called');}};
  assert.equal((await handleEvents(request(body,{Origin:'https://evil.example'}),{client,...trusted})).status,403);
  assert.equal((await handleEvents(request({events:[{...body.events[0],city_id:city.id}]}),{client,...trusted})).status,400);
  assert.equal((await handleEvents(request({events:[...Array(21)].map(()=>body.events[0])}),{client,...trusted})).status,400);
  assert.equal((await handleEvents(request({events:['x'.repeat(9000)]}),{client,...trusted})).status,413);
  assert.equal((await handleEvents(request(body),{client,...trusted,secret:'short'})).status,503);
  assert.equal((await handleEvents(request(body),{client,secret:trusted.secret})).status,503);
});
test('event intake commits an independent quota first, uses only narrow arguments and hides database errors',async()=>{
  const calls=[],client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='analytics_consume_limit'?{allowed:true}:{accepted:1}};}};
  const response=await handleEvents(request(body),{client,...trusted});assert.equal(response.status,202);assert.deepEqual(calls.map(call=>call.name),['analytics_consume_limit','analytics_record_events']);assert.equal(calls[0].args.p_count,1);assert.match(calls[0].args.p_client_hash,/^[a-f0-9]{64}$/);assert.deepEqual(calls[1].args,{p_events:body.events});
  const limited=await handleEvents(request(body),{...trusted,client:{rpc:async()=>({data:{allowed:false,retry_after:60}})}});assert.equal(limited.status,429);
  const failed=await handleEvents(request(body),{...trusted,client:{rpc:async()=>({error:{message:'private schema details'}})}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('schema'));
});
test('privacy signals suppress optional analytics and ad qualification requires visible loaded active content',async()=>{
  for(const headers of [{DNT:'1'},{'Sec-GPC':'1'},{'User-Agent':'Googlebot'}])assert.equal((await handleEvents(request(body,headers),trusted)).status,204);
  assert.equal(analyticsAllowed({navigator:{globalPrivacyControl:true}}),false);assert.equal(analyticsAllowed({navigator:{doNotTrack:'1'}}),false);assert.equal(analyticsAllowed({optOut:true}),false);
  const ready={ratio:.5,visible:true,active:true,loaded:true};assert.equal(qualifiesAd(ready),true);
  for(const state of [{ratio:.49},{visible:false},{active:false},{loaded:false},{covered:true}])assert.equal(qualifiesAd({...ready,...state}),false);
});
test('memory-only analytics retries retain event identities and opt-out clears queued activity',async()=>{
  const requests=[],doc={hidden:false,querySelector:()=>null,addEventListener(){}};let failed=true;
  const service=createAnalytics({nav:{},doc,storage:{getItem(){return null;},setItem(){}},fetcher:async(_url,init)=>{requests.push(init);if(failed){failed=false;throw new Error('Lost response');}return new Response(null,{status:202});}});
  try{service.track('listing_view',id);await service.flush();await service.flush();assert.equal(requests.length,2);assert.equal(requests[0].credentials,'omit');assert.equal(requests[0].body,requests[1].body);const sent=JSON.parse(requests[0].body).events[0];assert.deepEqual(Object.keys(sent).sort(),['event_key','event_type','listing_id']);service.track('phone_click',id);service.setOptOut(true);await service.flush();assert.equal(requests.length,2);}
  finally{service.destroy();}
});

test('opting back in cannot retry activity discarded by an earlier privacy choice',async()=>{
  let rejectPending,calls=0;
  const doc={hidden:false,querySelector:()=>null,addEventListener(){}};
  const service=createAnalytics({nav:{},doc,storage:{getItem:()=>null,setItem(){}},fetcher:()=>{calls++;return new Promise((_resolve,reject)=>{rejectPending=reject;});}});
  try{
    service.track('listing_view',id);const pending=service.flush();
    service.setOptOut(true);service.setOptOut(false);rejectPending(new Error('Aborted after preference changed'));
    await pending;await service.flush();assert.equal(calls,1);
  }finally{service.destroy();}
});
test('city-local report dates and CTR keep midnight and repeated-click semantics',()=>{
  assert.deepEqual(dateRange(7,new Date('2026-11-12T18:30:00Z'),'Asia/Kolkata'),{from:'2026-11-07',to:'2026-11-13'});assert.equal(clickThroughRate(2,1),'200.0%');assert.equal(clickThroughRate(3,0),'—');
});
