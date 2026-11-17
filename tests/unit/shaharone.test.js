import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicPath,cityHomePath,isCitySlug} from '../../src/config/public-routes.js';
import {cityFilters,citySearchPattern,CITY_PAGE_SIZE} from '../../src/domain/cities.js';
import {pageMetadata} from '../../src/domain/seo.js';
import {publicCatalog} from '../../src/server/public-catalog.js';
import {serveDiscoveryPage} from '../../src/server/discovery-page.js';
import {serveSeoEndpoint} from '../../src/server/seo-endpoints.js';
import {siteRedirect} from '../../src/server/site-redirects.js';
import {publicShell} from '../../src/server/seo-html.js';

const city={id:'00000000-0000-4000-8000-000000000001',slug:'rawatbhata',name:'Rawatbhata',state:'Rajasthan',country_code:'IN',timezone:'Asia/Kolkata',is_default:true};
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SITE_URL:'https://shaharone.in',VITE_BRAND_NAME:'ShaharOne',DEPLOYMENT_ENV:'production',SITE_INDEXING_ENABLED:'true',SITE_REDIRECTS_ENABLED:'true'};
const shell='<html lang="en"><head><title>Shell</title></head><body><a href="/" data-home-link>Home</a><a href="/" data-explore-link>Explore</a><a href="/#categories" data-categories-link>Categories</a><main></main></body></html>';
const context=path=>({request:new Request('https://shaharone.in'+path),env:{...env,ASSETS:{fetch:async()=>new Response(shell)}}});
const redirect=(path,overrides={},method='GET')=>siteRedirect(new Request(path,{method}),{...env,...overrides});

test('platform and city routes have distinct identities and reject reserved or ambiguous city slugs',()=>{
  assert.deepEqual(parsePublicPath('/'),{kind:'platform'});
  for(const slug of ['rawatbhata','future-city']){
    assert.equal(cityHomePath(slug),'/'+slug+'/');
    assert.equal(parsePublicPath('/'+slug+'/').kind,'home');
    assert.equal(parsePublicPath('/'+slug+'/food/kitchen').citySlug,slug);
  }
  assert.equal(parsePublicPath('/'+'x'.repeat(120)+'/').kind,'home');
  for(const slug of ['admin','api','assets','search','explore','bad/city','UPPER','x'.repeat(121)])assert.equal(isCitySlug(slug),false);
  for(const path of ['//rawatbhata','/rawatbhata//food','/rawatbhata/food//'])assert.equal(parsePublicPath(path),null);
});

test('city search bounds input and escapes wildcard characters for a literal database search',()=>{
  const filters=cityFilters(new URL('https://shaharone.in/?city_q=Ra%25_%5C&'+'page=2'));
  assert.equal(filters.query,'Ra%_\\');assert.equal(filters.offset,24);assert.equal(citySearchPattern(filters.query),'%Ra\\%\\_\\\\%');
  for(const page of ['0','-2','1000','1.5','NaN'])assert.equal(cityFilters(new URL('https://shaharone.in/?page='+page)).page,1);
  assert.equal(cityFilters(new URL('https://shaharone.in/?city_q='+('x'.repeat(90)))).query.length,80);
});

test('city selection fetches a bounded public projection with RLS credentials and no discovery payload',async()=>{
  const calls=[];
  const client=publicCatalog({...env,SUPABASE_SECRET_KEY:'sb_secret_never_forwarded'},async(url,init)=>{calls.push({url:new URL(url),init});return new Response(JSON.stringify(Array.from({length:25},()=>city)));});
  const result=await client.cities({query:'Rawat',page:1,offset:0});
  assert.equal(result.cities.length,CITY_PAGE_SIZE);assert.equal(result.hasMore,true);assert.equal(calls.length,1);
  const {url,init}=calls[0];assert.equal(url.pathname,'/rest/v1/cities');assert.equal(url.searchParams.get('enabled'),'eq.true');assert.equal(url.searchParams.get('limit'),'25');assert.equal(url.searchParams.get('name'),'ilike.%Rawat%');assert.equal(url.searchParams.get('order'),'is_default.desc,name.asc,id.asc');
  assert.ok(!url.searchParams.get('select').includes('*'));assert.equal(init.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);assert.ok(!JSON.stringify(init).includes('sb_secret'));
});

test('platform HTML exposes enabled city links, native search, social metadata and bounded bootstrap before JavaScript',async()=>{
  const calls=[],fetcher=async url=>{calls.push(url);return new Response(JSON.stringify([city,{...city,id:'second',slug:'future-city',name:'Future <City>'}]))};
  const response=await serveDiscoveryPage(context('/'),{kind:'platform'},{fetcher}),html=await response.text();
  assert.equal(response.status,200);assert.equal(calls.length,1);assert.match(calls[0],/\/rest\/v1\/cities\?/);assert.match(html,/href="\/rawatbhata\/" data-city-card/);assert.match(html,/Future &lt;City&gt;/);assert.match(html,/method="get" data-city-search/);assert.match(html,/rel="canonical" href="https:\/\/shaharone.in\/"/);assert.match(html,/"platform":/);assert.ok(!html.includes('discovery_home'));assert.match(response.headers.get('X-Robots-Tag'),/^index/);
  const missing=await serveDiscoveryPage(context('/?page=2'),{kind:'platform'},{fetcher:async()=>new Response('[]')});assert.equal(missing.status,404);
});

test('platform query errors fail safely rather than inventing a supported city',async()=>{
  const response=await serveDiscoveryPage(context('/'),{kind:'platform'},{fetcher:async()=>new Response('{"secret":"private detail"}',{status:403})});
  assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private detail'));assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
});

test('ShaharOne metadata distinguishes platform and city canonicals while searches stay noindex',()=>{
  const base={origin:'https://shaharone.in',indexable:true};
  const platform=pageMetadata({...base,url:new URL('https://shaharone.in/'),route:{kind:'platform'},context:{cities:[city]}});
  assert.equal(platform.canonical,'https://shaharone.in/');assert.match(platform.title,/ShaharOne/);assert.match(JSON.stringify(platform.structuredData),/https:\/\/shaharone.in\/rawatbhata\//);
  const cityMeta=pageMetadata({...base,url:new URL('https://shaharone.in/rawatbhata/'),route:{kind:'home'},context:{city},items:[{is_demo:false}]});
  assert.equal(cityMeta.canonical,'https://shaharone.in/rawatbhata/');assert.equal(cityMeta.structuredData['@graph'][1].itemListElement[0].name,'ShaharOne');
  const filtered=pageMetadata({...base,url:new URL('https://shaharone.in/?city_q=Rawat'),route:{kind:'platform'},context:{cities:[city]}});assert.match(filtered.robots,/noindex/);assert.equal(filtered.canonical,'https://shaharone.in/');
});

test('server navigation points to the selected city and the platform shell hides city-only destinations',()=>{
  const html=publicShell(shell,{city});assert.match(html,/data-home-link href="\/rawatbhata\/"/);assert.match(html,/data-explore-link href="\/rawatbhata\/explore"/);assert.match(html,/data-categories-link href="\/rawatbhata\/#categories"/);
  assert.match(publicShell(shell),/data-home-link href="\/" hidden/);
});

test('host migration redirects require explicit opt-in and an exact configured target',()=>{
  const url='https://rawatbhata-one.pages.dev/rawatbhata/food';
  for(const overrides of [{SITE_REDIRECTS_ENABLED:'false'},{SITE_URL:'https://other.example'},{SITE_URL:'https://shaharone.in.evil.test'}])assert.equal(redirect(url,overrides),null);
  assert.equal(redirect('http://localhost:5173/rawatbhata/food'),null);
  assert.equal(redirect('https://branch.rawatbhata-one.pages.dev/rawatbhata/food'),null);
  assert.equal(redirect('https://rawatbhata-one.pages.dev.evil.test/'),null);
  assert.equal(redirect('https://shaharone.in/'),null);
});

test('old homepage and www redirects preserve search parameters without confusing platform and city roots',()=>{
  assert.equal(redirect('https://rawatbhata-one.pages.dev/?listing=uuid&locality=lakeside').headers.get('Location'),'https://shaharone.in/rawatbhata/?listing=uuid&locality=lakeside');
  assert.equal(redirect('https://www.shaharone.in/?city_q=Rawat').headers.get('Location'),'https://shaharone.in/?city_q=Rawat');
  const response=redirect('https://rawatbhata-one.pages.dev/rawatbhata/food/kitchen?product_q=tea&product_sort=price_asc');
  assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://shaharone.in/rawatbhata/food/kitchen?product_q=tea&product_sort=price_asc');
  assert.equal(redirect('https://www.shaharone.in/future-city/food?q=tea').headers.get('Location'),'https://shaharone.in/future-city/food?q=tea');
});

test('redirects do not forward API writes or unknown legacy structures and canonical city slashes stay local',()=>{
  for(const method of ['GET','POST'])assert.equal(redirect('https://www.shaharone.in/api/checkout',{},method),null);
  assert.equal(redirect('https://rawatbhata-one.pages.dev/rawatbhata/food/kitchen',{},'POST'),null);
  assert.equal(redirect('https://rawatbhata-one.pages.dev/unknown/too/deep/path'),null);
  assert.equal(redirect('http://localhost:5173/rawatbhata?q=tea').headers.get('Location'),'/rawatbhata/?q=tea');
  assert.equal(redirect('http://localhost:5173/?listing=uuid',{DEPLOYMENT_ENV:'development'}).headers.get('Location'),'/rawatbhata/?listing=uuid');
  assert.equal(redirect('http://localhost:5173/?city_q=Rawat'),null);
});

test('platform sitemap is separate from bounded database pages and city homes use trailing slashes',async()=>{
  const fetcher=async url=>new Response(JSON.stringify(url.endsWith('seo_sitemap_index')?{pages:1}:['/rawatbhata','/rawatbhata/food/kitchen']));
  const index=await serveSeoEndpoint(context('/sitemap.xml'),{fetcher});assert.match(await index.text(),/\/sitemaps\/platform.xml/);
  const root=await serveSeoEndpoint(context('/sitemaps/platform.xml'),{fetcher});assert.match(await root.text(),/<loc>https:\/\/shaharone.in\/<\/loc>/);
  const page=await serveSeoEndpoint(context('/sitemaps/0.xml'),{fetcher}),text=await page.text();assert.match(text,/<loc>https:\/\/shaharone.in\/rawatbhata\/<\/loc>/);assert.match(text,/\/rawatbhata\/food\/kitchen<\/loc>/);
});

test('a singleton city uses a temporary root redirect and omits the platform sitemap',async()=>{
  const fetcher=async url=>new Response(JSON.stringify(url.includes('/cities?')?[city]:url.endsWith('seo_sitemap_index')?{pages:1}:['/rawatbhata']));
  const root=await serveDiscoveryPage(context('/?city_q=Rawat'),{kind:'platform'},{fetcher});assert.equal(root.status,307);assert.equal(root.headers.get('Location'),'/rawatbhata/?city_q=Rawat');assert.equal(root.headers.get('Cache-Control'),'no-store');
  const index=await serveSeoEndpoint(context('/sitemap.xml'),{fetcher}),body=await index.text();assert.ok(!body.includes('platform.xml'));assert.ok(body.includes('/sitemaps/0.xml'));
  const platform=await serveSeoEndpoint(context('/sitemaps/platform.xml'),{fetcher});assert.equal(platform.status,404);
});
