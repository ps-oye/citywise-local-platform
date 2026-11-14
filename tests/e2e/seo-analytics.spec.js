import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const api='http://127.0.0.1:54329',merchant='70000000-0000-4000-8000-000000000001',city='70000000-0000-4000-8000-000000000090',path='/qa-town/food/qa-test-kitchen';
const control={'x-fixture-control':'phase3_isolated_control'};
async function events(request){return (await request.get(api+'/__test/events',{headers:control})).json();}
async function login(page){await page.goto('/admin/');await page.getByLabel('Email address',{exact:true}).fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill('Isolated-fixture-pass-42!');await page.getByRole('button',{name:/^Sign in/}).click();await expect(page.getByLabel('Manage city')).toBeVisible();await page.getByLabel('Manage city').selectOption(city);await expect(page.getByLabel('Manage city')).toBeEnabled();await expect(page.getByLabel('Manage city')).toHaveValue(city);}

test('homepage/category/merchant content and native search work without JavaScript',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
  try{
    const home=await page.goto('/rawatbhata');expect(home.status()).toBe(200);await expect(page.getByRole('heading',{level:1})).toContainText('rediscovered');await expect(page.locator('.place-card')).not.toHaveCount(0);await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',/Rawatbhata/);
    await page.goto('/qa-town/food');await expect(page.locator('.place-card')).toContainText(['QA Test Kitchen']);await page.locator('.place-card-link').filter({hasText:'QA Test Kitchen'}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('QA Test Kitchen');await expect(page.locator('.product-card')).toHaveCount(12);await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',new RegExp(path+'$'));
    await page.goto('/qa-town/search');await page.getByRole('searchbox').fill('Vegetable Thali');await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.locator('.place-card')).toContainText('QA Test Kitchen');
    const missing=await page.goto('/qa-town/missing-category');expect(missing.status()).toBe(404);expect(missing.headers()['x-robots-tag']).toContain('noindex');
  }finally{await context.close();}
});

test('SPA metadata stays current and preview/demo structured data does not advertise a real business',async({page,request})=>{
  await page.goto('/rawatbhata/food/demo-food');await expect(page.locator('[data-merchant-ready]')).toBeVisible();await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',/Demo/);await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
  const graph=await page.locator('#page-structured-data').textContent();expect(graph).not.toContain('"@type":"Restaurant"');expect(graph).not.toContain('aggregateRating');
  await page.getByRole('link',{name:'Home',exact:true}).first().click();await expect(page.getByRole('heading',{level:1})).toContainText('rediscovered');await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',/rediscovered/);
  const robots=await request.get('/robots.txt');expect(await robots.text()).toContain('Allow: /');expect(await robots.text()).not.toContain('Sitemap:');const sitemap=await request.get('/sitemap.xml');expect(sitemap.headers()['content-type']).toContain('application/xml');expect(await sitemap.text()).not.toContain('<loc>');
});

test('listing views are reported once per render and requests contain no visitor or URL data',async({page,request})=>{
  await request.post(api+'/__test/reset-event-limits',{headers:control});const baseline=new Set((await events(request)).map(event=>event.event_key));const sent=[];page.on('request',request=>{if(request.url().endsWith('/api/events'))sent.push(...request.postDataJSON().events);});
  await page.goto(path);await expect(page.locator('[data-merchant-ready]')).toBeVisible();await expect.poll(async()=>(await events(request)).filter(event=>!baseline.has(event.event_key)&&event.listing_id===merchant&&event.event_type==='listing_view').length).toBe(1);
  await page.getByLabel('Search products',{exact:true}).fill('Thali');await expect(page.locator('.product-card')).toHaveCount(1);await page.waitForTimeout(400);
  expect((await events(request)).filter(event=>!baseline.has(event.event_key)&&event.listing_id===merchant&&event.event_type==='listing_view')).toHaveLength(1);
  expect(sent.length).toBeGreaterThan(0);for(const event of sent)expect(Object.keys(event).sort()).toEqual(['event_key','event_type',event.event_type.startsWith('ad_')?'advertisement_id':'listing_id'].sort());
});

test('only loaded active visible ads qualify and a modal interrupts continuous exposure',async({page,request})=>{
  await request.post(api+'/__test/reset-event-limits',{headers:control});const baseline=new Set((await events(request)).map(event=>event.event_key));await page.goto('/rawatbhata');await expect(page.locator('.promotion-controls')).toBeVisible();await page.getByRole('button',{name:'Pause slideshow',exact:true}).click();
  const active=page.locator('.promotion-slide:not([hidden])'),first=await active.getAttribute('data-ad-id');await expect.poll(async()=>(await events(request)).filter(event=>!baseline.has(event.event_key)&&event.advertisement_id===first&&event.event_type==='ad_visible_impression').length).toBe(1);
  await page.getByRole('button',{name:'Next promotion',exact:true}).click();const second=await active.getAttribute('data-ad-id');await page.getByRole('button',{name:'Choose your neighbourhood',exact:true}).click();await page.waitForTimeout(1300);
  expect((await events(request)).filter(event=>!baseline.has(event.event_key)&&event.advertisement_id===second&&event.event_type==='ad_visible_impression')).toHaveLength(0);
  await page.getByRole('button',{name:'Close location selector',exact:true}).click();await expect.poll(async()=>(await events(request)).filter(event=>!baseline.has(event.event_key)&&event.advertisement_id===second&&event.event_type==='ad_visible_impression').length).toBe(1);
  const hiddenIds=await page.locator('.promotion-slide[hidden]').evaluateAll(slides=>slides.map(slide=>slide.dataset.adId));for(const ad of hiddenIds.filter(id=>id!==first))expect((await events(request)).filter(event=>!baseline.has(event.event_key)&&event.advertisement_id===ad)).toHaveLength(0);
});

test('privacy opt-out and browser privacy signals leave discovery usable without tracking',async({page,browser})=>{
  await page.goto('/rawatbhata');await page.getByRole('button',{name:'Privacy & analytics preferences',exact:true}).click();await page.getByRole('checkbox',{name:'Turn off optional activity analytics',exact:true}).check();await page.getByRole('button',{name:'Close privacy preferences',exact:true}).click();const requests=[];page.on('request',request=>{if(request.url().endsWith('/api/events'))requests.push(request.url());});
  await page.goto(path);await expect(page.locator('[data-merchant-ready]')).toBeVisible();await page.waitForTimeout(500);expect(requests).toHaveLength(0);
  const context=await browser.newContext({extraHTTPHeaders:{DNT:'1'}});await context.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));const privatePage=await context.newPage();const signalRequests=[];privatePage.on('request',request=>{if(request.url().endsWith('/api/events'))signalRequests.push(request.url());});
  try{await privatePage.goto(path);await expect(privatePage.locator('[data-merchant-ready]')).toBeVisible();await privatePage.waitForTimeout(500);expect(signalRequests).toHaveLength(0);}finally{await context.close();}
});

test('admin analytics shows real aggregates, date controls and explicit demo scope on mobile and desktop',async({page,request})=>{
  await request.post(api+'/__test/reset-event-limits',{headers:control});const posted=await request.post('/api/events',{headers:{Origin:'http://127.0.0.1:5173'},data:{events:[{event_key:randomUUID(),event_type:'listing_view',listing_id:merchant}]}});expect(posted.status()).toBe(202);
  await login(page);await page.getByRole('link',{name:'Enquiries & analytics',exact:true}).click();await expect(page.getByRole('heading',{name:'See what brings people closer.'})).toBeVisible();await expect(page.locator('.analytics-period')).toContainText('Excludes fictional demo activity');await expect(page.locator('.admin-stat').filter({hasText:'Listing views'}).locator('strong')).not.toHaveText('0');await expect(page.getByRole('img',{name:'Daily listing view reports'})).toBeVisible();
  await page.getByRole('checkbox',{name:'Include fictional demo activity',exact:true}).check();await page.getByRole('button',{name:'Update report',exact:true}).click();await expect(page.locator('.analytics-period')).toContainText('Includes fictional demo activity');await page.getByRole('button',{name:'Last 7 days',exact:true}).click();await expect(page.locator('.analytics-chart')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/analytics-'+test.info().project.name+'.png',fullPage:true});
});
