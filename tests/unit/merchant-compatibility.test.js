import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMerchantDetail} from '../../src/data/merchant-detail.js';
import {createMerchantRepository} from '../../src/data/merchant-repository.js';
import {publicCatalog} from '../../src/server/public-catalog.js';
import {serveMerchantPage} from '../../src/server/merchant-page.js';
import {handleCheckout} from '../../src/server/checkout-handler.js';

const id='70000000-0000-4000-8000-000000000001',product='71000000-0000-4000-8000-000000000001';
const args={p_city_slug:'town',p_category_slug:'food',p_listing_slug:'kitchen'};
const city={id:'70000000-0000-4000-8000-000000000090',name:'Town',slug:'town'};
const merchant={id,name:'Existing Kitchen',slug:'kitchen',canonical_path:'/town/food/kitchen',listing_type:'RESTAURANT',city,
  category_slug:'food',category_name:'Food',description:'Existing catalog',short_description:'Existing shop',product_categories:[],
  gallery:[],offerings:[],weekly_hours:[],special_hours:[],service_areas:[],timezone:'Asia/Kolkata',status:{state:'open',checked_at:'2026-11-17T06:00:00Z'}};
const missing=()=>Object.assign(new Error('Public catalog unavailable'),{rpcCode:'PGRST202'});
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',ASSETS:{fetch:async()=>new Response('<html><head><title>Shell</title></head><body><main></main></body></html>')}};
const route={citySlug:'town',categorySlug:'food',listingSlug:'kitchen'};

test('merchant reads fall back only for a missing delivery RPC and retain city navigation capabilities',async()=>{
  const calls=[],rpc=async(name,input)=>{calls.push({name,input});if(name==='merchant_detail_checkout')throw missing();return name==='merchant_detail'?merchant:{city,cities:[city]};};
  const result=await loadMerchantDetail(rpc,args);assert.equal(result.id,id);assert.equal(result.checkout_ready,false);assert.equal(result.has_multiple_cities,false);
  assert.deepEqual(calls.map(row=>row.name),['merchant_detail_checkout','merchant_detail','discovery_context']);assert.deepEqual(calls[0].input,calls[1].input);
  const multi=await loadMerchantDetail(async name=>{if(name==='merchant_detail_checkout')throw missing();return name==='merchant_detail'?merchant:{city,cities:[city,{id:'another'}]};},args);
  assert.equal(multi.has_multiple_cities,true);
});

test('migrated, hidden, denied and cancelled merchant reads cannot downgrade public access checks',async()=>{
  let calls=0;const current=await loadMerchantDetail(async()=>{calls++;return {...merchant,food_delivery:true};},args);assert.equal(current.checkout_ready,true);assert.equal(calls,1);
  assert.equal(await loadMerchantDetail(async()=>null,args),null);
  for(const rpcCode of ['42501','08006','42883',undefined]){
    const seen=[];await assert.rejects(loadMerchantDetail(async name=>{seen.push(name);throw Object.assign(new Error('Denied'),{rpcCode});},args));assert.deepEqual(seen,['merchant_detail_checkout']);
  }
  const seen=[];await assert.rejects(loadMerchantDetail(async name=>{seen.push(name);throw new DOMException('Cancelled','AbortError');},args),{name:'AbortError'});assert.equal(seen.length,1);
});

test('browser repository preserves the missing-RPC signal without weakening its error classification',async()=>{
  const calls=[],client={rpc:(name,input)=>({abortSignal:async()=>{calls.push(name);if(name==='merchant_detail_checkout')return {error:{code:'PGRST202'}};return {data:name==='merchant_detail'?merchant:{city,cities:[city]}};}})};
  const result=await createMerchantRepository(client).detail(route);assert.equal(result.checkout_ready,false);assert.equal(calls.length,3);
  const denied=createMerchantRepository({rpc:()=>({abortSignal:async()=>({error:{code:'42501'}})})});await assert.rejects(denied.detail(route),error=>error.code==='unavailable');
});

test('public transport bounds failure bodies and exposes only the specific missing-function code',async()=>{
  const client=publicCatalog(env,async()=>new Response(JSON.stringify({code:'PGRST202',message:'Private backend detail'}),{status:404}));
  await assert.rejects(client.rpc('merchant_detail_checkout'),error=>error.rpcCode==='PGRST202'&&!error.message.includes('Private'));
  const denied=publicCatalog(env,async()=>new Response(JSON.stringify({code:'42501',message:'Private table detail'}),{status:403}));
  await assert.rejects(denied.rpc('merchant_detail_checkout'),error=>!error.rpcCode&&!error.message.includes('Private'));
  const invalid=publicCatalog(env,async()=>new Response('<html>Private backend detail</html>',{status:404}));await assert.rejects(invalid.rpc('merchant_detail_checkout'),error=>error.message==='Public catalog unavailable'&&!error.rpcCode);
  const oversized=publicCatalog(env,async()=>new Response('x'.repeat(16385),{status:404}));await assert.rejects(oversized.rpc('merchant_detail_checkout'),/too large/);
});

test('legacy merchant HTML retains catalog, safe unavailable ordering, canonical redirects and genuine 404s',async()=>{
  const fetcher=async url=>new Response(JSON.stringify(url.endsWith('merchant_detail_checkout')?{code:'PGRST202'}:url.endsWith('merchant_detail')?merchant:url.endsWith('discovery_context')?{city,cities:[city]}:{items:[],total:0,has_more:false,next_offset:12}),{status:url.endsWith('merchant_detail_checkout')?404:200});
  const context={request:new Request('https://example.com/town/food/kitchen'),env};
  const response=await serveMerchantPage(context,route,{fetcher}),html=await response.text();assert.equal(response.status,200);assert.match(html,/<h1>Existing Kitchen<\/h1>/);assert.match(html,/Contact & visiting information/);assert.match(html,/data-ordering-unavailable/);
  const bootstrap=JSON.parse(html.match(/id="merchant-bootstrap">([\s\S]*?)<\/script>/)[1]);assert.equal(bootstrap.merchant.checkout_ready,false);
  const moved=await serveMerchantPage({...context,request:new Request('https://example.com/town/food/previous')},route,{fetcher});assert.equal(moved.status,308);assert.equal(moved.headers.get('Location'),merchant.canonical_path);
  const hidden=await serveMerchantPage(context,route,{fetcher:async url=>url.endsWith('merchant_detail_checkout')?new Response('{"code":"PGRST202"}',{status:404}):new Response('null')});assert.equal(hidden.status,404);
});

test('checkout cannot use legacy food paths or write anything while the delivery schema is unavailable',async()=>{
  const input={merchant_id:id,items:[{product_id:product,quantity:1}],fulfilment:'pickup',instructions:'',quote_token:'a'.repeat(32),idempotency_key:'74000000-0000-4000-8000-000000000001'};
  const request=body=>new Request('https://example.com/api/checkout',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(body)});
  for(const response of [{error:{code:'PGRST202'}},{data:undefined},{data:{status:'unknown'}}]){
    const calls=[],result=await handleCheckout(request(input),{identity:'127.0.0.1',secret:'s'.repeat(40),client:{rpc:async name=>{calls.push(name);return response;}}});
    assert.equal(result.status,503);assert.equal((await result.json()).code,'checkout_unconfigured');assert.deepEqual(calls,['merchant_is_food']);
  }
  const calls=[],blocked=await handleCheckout(request(input),{identity:'127.0.0.1',secret:'s'.repeat(40),client:{rpc:async name=>{calls.push(name);return {data:true};}}});assert.equal(blocked.status,400);assert.equal((await blocked.json()).code,'delivery_address_required');assert.deepEqual(calls,['merchant_is_food']);
});
