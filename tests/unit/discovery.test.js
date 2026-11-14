import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicPath } from '../../src/config/public-routes.js';
import { normalizeSearch, readDiscoveryFilters, updateUrl, topFeatured, isActiveAdvertisement, demoImagePath, availabilityLabel } from '../../src/domain/discovery.js';
import { shouldRotate } from '../../src/components/promotion-carousel.js';
import { createDiscoveryRepository } from '../../src/data/discovery-repository.js';
import { onRequest } from '../../functions/[[path]].js';

test('public routes accept descriptive city/category paths and keep admin, APIs and assets separate',()=>{
  assert.equal(parsePublicPath('/').kind,'home');
  assert.equal(parsePublicPath('/rawatbhata').kind,'home');
  assert.equal(parsePublicPath('/rawatbhata/food').kind,'category');
  assert.equal(parsePublicPath('/rawatbhata/search').kind,'search');
  assert.equal(parsePublicPath('/rawatbhata/food/merchant').kind,'merchant');
  for(const path of ['/admin/','/api/checkout','/assets/app.js','/images/demo/food.webp','/src/app.js','/rawatbhata/food/merchant/extra','/rawatbhata/search/merchant','/bad%20city'])assert.equal(parsePublicPath(path),null);
});

test('search and URL state normalize text, bound inputs and preserve independent filters',()=>{
  assert.equal(normalizeSearch('  Kaju   KATLI  '),'Kaju KATLI');
  assert.equal(normalizeSearch('x'.repeat(200)).length,100);
  const url=new URL('https://example.com/rawatbhata/food?q=tea&locality=demo-lakeside&sort=name&f.diet=Vegetarian&listing=bad');
  const state=readDiscoveryFilters(url);
  assert.equal(state.sort,'name');assert.equal(state.listingId,null);assert.equal(state.facets.diet,'Vegetarian');
  const changed=new URL(updateUrl(url,{locality:null,'f.diet':null,sort:'recommended'}),url.origin);
  assert.equal(changed.searchParams.get('q'),'tea');assert.equal(changed.searchParams.has('locality'),false);
  assert.equal(readDiscoveryFilters(new URL('https://example.com/?sort=unknown')).sort,'recommended');
});

test('featured selection is deterministic, capped at four and does not hide operating closures',()=>{
  const items=[{id:'d',rank:2},{id:'b',rank:1},{id:'a',rank:1},{id:'c',rank:1,availability:'temporarily_closed'},{id:'e',rank:3},{id:'f',rank:0,enabled:false}];
  assert.deepEqual(topFeatured(items).map(l=>l.id),['a','b','c','d']);
  assert.equal(availabilityLabel('temporarily_closed'),'Temporarily closed');
  assert.equal(availabilityLabel('unknown'),'Hours not verified');
});

test('advertisement eligibility and rotation respect dates, reduced motion, focus, hover and visibility',()=>{
  const now=Date.parse('2026-11-12T12:00:00Z');
  assert.ok(isActiveAdvertisement({starts_at:'2026-11-11',ends_at:'2026-11-13'},now));
  assert.equal(isActiveAdvertisement({ends_at:'2026-11-12T12:00:00Z'},now),false);
  assert.equal(isActiveAdvertisement({enabled:false},now),false);
  const state={count:3,paused:false,hovered:false,focused:false,visible:true,reduced:false,hidden:false};
  assert.ok(shouldRotate(state));
  for(const field of ['paused','hovered','focused','reduced','hidden'])assert.equal(shouldRotate({...state,[field]:true}),false);
  assert.equal(shouldRotate({...state,visible:false}),false);assert.equal(shouldRotate({...state,count:1}),false);
});

test('demo image paths cannot escape the controlled asset directory',()=>{
  assert.equal(demoImagePath('/images/demo/food-2.webp'),'/images/demo/food-2.webp');
  for(const value of ['https://example.com/photo.webp','/images/demo/../private.webp','/images/demo/payload.svg','javascript:alert(1)'])assert.equal(demoImagePath(value),null);
});

test('repository requests use bounded RPC arguments and do not expose backend error details',async()=>{
  const calls=[];
  const client={rpc:(name,args)=>({abortSignal:async()=>{calls.push({name,args});return{data:{items:[],total:0},error:null};}})};
  const repo=createDiscoveryRepository(client);
  await repo.listings({cityId:'fixture',query:'tea'});
  assert.equal(calls[0].name,'discovery_listings');
  assert.equal(calls[0].args.p_limit,12);assert.equal(calls[0].args.p_offset,0);
  const broken=createDiscoveryRepository({rpc:()=>({abortSignal:async()=>({error:{code:'PGRST202',message:'private detail'}})})});
  await assert.rejects(broken.context(null),error=>error.code==='setup_required'&&!error.message.includes('private detail'));
});

test('Pages Function returns a secure setup response without credentials and forwards unrelated paths',async()=>{
  const context={request:new Request('https://example.com/rawatbhata/food?q=tea'),env:{ASSETS:{fetch:async request=>{assert.equal(new URL(request.url).pathname,'/index.html');return new Response('<html>Discovery shell</html>',{headers:{'Content-Type':'text/html'}});}}},next:async()=>new Response('Forwarded')};
  const response=await onRequest(context);assert.equal(response.status,503);assert.equal(response.headers.get('X-Frame-Options'),'DENY');assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  const admin=await onRequest({...context,request:new Request('https://example.com/admin/')});assert.equal(await admin.text(),'Forwarded');
  const post=await onRequest({...context,request:new Request('https://example.com/rawatbhata/food',{method:'POST'})});assert.equal(post.status,405);
});

