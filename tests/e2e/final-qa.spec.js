import {test,expect} from '@playwright/test';

const api='http://127.0.0.1:54329/rest/v1/rpc/';
const merchant='70000000-0000-4000-8000-000000000001';
const qaCity='70000000-0000-4000-8000-000000000090';
const merchantPath='/qa-town/food/qa-test-kitchen';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function admin(page){
  await page.goto('/admin/');
  await page.getByLabel('Email address',{exact:true}).fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill('Isolated-fixture-pass-42!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('.admin-stat')).toHaveCount(6);
  await page.getByLabel('Manage city').selectOption(qaCity);
  await expect(page.getByText('Here’s what’s happening in QA Town.')).toBeVisible();
}

test('search discards previous-text options immediately and pending suggestions cannot reopen after blur',async({page})=>{
  await page.goto('/');await expect(page.locator('[data-carousel-pause]')).toBeVisible();
  const input=page.getByRole('combobox',{name:'Search all local places',exact:true});
  await input.fill('Kaju Katli');
  await expect(page.locator('.header-search [role=option]').first()).toContainText('Sample Kaju Katli');
  await input.fill('Electrical');
  expect(await input.getAttribute('aria-expanded')).toBe('false');
  await expect(page.locator('.header-search [role=option]').first()).toContainText('BrightWire');
  const arrived=deferred(),release=deferred();
  await page.route(api+'discovery_listings',async route=>{
    const response=await route.fetch();arrived.resolve();await release.promise;
    await route.fulfill({response}).catch(()=>{}); // A correct blur handler aborts this request.
  });
  try{
    await input.fill('grocery');await arrived.promise;
    await page.getByRole('heading',{level:1}).click();release.resolve();
    await page.waitForTimeout(350);
    await expect(input).not.toBeFocused();await expect(input).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.header-search [role=listbox]')).toBeHidden();
  }finally{release.resolve();}
});

test('changing fulfilment invalidates a delayed review before it can open an inconsistent confirmation',async({page})=>{
  await page.goto(merchantPath);await expect(page.locator('[data-merchant-ready]')).toBeVisible();
  await page.getByRole('button',{name:'Add QA Vegetable Thali to cart',exact:true}).click();
  const arrived=deferred(),release=deferred(),preferences=[];
  await page.route(api+'merchant_cart_quote',async route=>{
    const preference=route.request().postDataJSON().p_fulfilment;preferences.push(preference);
    const response=await route.fetch();if(preference==='pickup'){arrived.resolve();await release.promise;}
    await route.fulfill({response}).catch(()=>{});
  });
  try{
    await page.getByRole('button',{name:'Review WhatsApp enquiry',exact:true}).click();await arrived.promise;
    await page.getByLabel('Your preference',{exact:true}).selectOption('delivery');release.resolve();
    await expect(page.getByRole('button',{name:'Review WhatsApp enquiry',exact:true})).toBeEnabled();
    await page.waitForTimeout(200);await expect(page.locator('#checkout-dialog')).not.toBeVisible();
    await page.getByRole('button',{name:'Review WhatsApp enquiry',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Review your enquiry',exact:true})).toBeVisible();
    await expect(page.locator('.checkout-preference')).toContainText('Delivery');expect(preferences).toEqual(['pickup','delivery']);
  }finally{release.resolve();}
});

test('accepting an old admin confirmation after browser navigation cannot submit the previous page mutation',async({page})=>{
  await admin(page);await page.evaluate(id=>{location.hash='#merchants/'+id;},merchant);
  await expect(page.getByRole('heading',{level:1})).toHaveText('QA Test Kitchen');
  const writes=[];
  // Intercept the mutation so the regression itself never disables a shared fixture.
  await page.route(api+'admin_listing_state',async route=>{writes.push(route.request().postDataJSON());await route.fulfill({status:409,contentType:'application/json',body:'{"code":"40001","message":"isolated blocked mutation"}'});});
  await page.getByRole('button',{name:'Disable listing',exact:true}).click();
  const dialog=page.locator('#admin-confirm');await expect(dialog).toBeVisible();
  await page.evaluate(()=>{location.hash='#overview';});
  await expect(page.getByRole('heading',{level:1})).toHaveText('A good day to grow locally.');
  if(await dialog.isVisible())await dialog.getByRole('button',{name:'Disable',exact:true}).click();
  await expect(dialog).not.toBeVisible();await page.waitForTimeout(200);expect(writes).toEqual([]);
});

test('optional analytics opt-out synchronizes across already-open tabs without reloading',async({page,context})=>{
  await page.goto(merchantPath);await expect(page.locator('[data-merchant-ready]')).toBeVisible();
  const other=await context.newPage();
  try{
    await other.goto(merchantPath);await expect(other.locator('[data-merchant-ready]')).toBeVisible();
    await page.waitForTimeout(500);
    await other.getByRole('button',{name:'Privacy & analytics preferences',exact:true}).click();
    await page.getByRole('button',{name:'Privacy & analytics preferences',exact:true}).click();
    await page.getByRole('checkbox',{name:'Turn off optional activity analytics',exact:true}).check();
    await expect(other.getByRole('checkbox',{name:'Turn off optional activity analytics',exact:true})).toBeChecked();
    await other.getByRole('button',{name:'Close privacy preferences',exact:true}).click();
    const sent=[];other.on('request',request=>{if(request.url().endsWith('/api/events'))sent.push(request.url());});
    if(await other.getByRole('button',{name:'Open menu',exact:true}).isVisible())await other.getByRole('button',{name:'Open menu',exact:true}).click();
    await other.locator('.primary-nav [data-explore-link]').click();
    await expect(other.locator('.results-grid .place-card').first()).toBeVisible();
    await other.locator('.results-grid .place-card-link').first().click();
    await expect(other.locator('[data-merchant-ready]')).toBeVisible();await other.waitForTimeout(500);expect(sent).toEqual([]);
    await page.getByRole('checkbox',{name:'Turn off optional activity analytics',exact:true}).uncheck();
    await expect(other.locator('[data-analytics-opt-out]')).not.toBeChecked();
  }finally{await other.close();}
});

test('every demo category and published demo merchant has meaningful canonical HTML and safe contact actions',async({request})=>{
  const response=await request.post(api+'discovery_context',{data:{p_city_slug:'rawatbhata'}});expect(response.ok()).toBe(true);
  const context=await response.json();expect(context.categories).toHaveLength(15);
  for(const category of context.categories){const page=await request.get('/rawatbhata/'+category.slug);expect(page.status(),category.slug).toBe(200);expect(await page.text()).toContain(category.name.replaceAll('&','&amp;'));}
  const ids=new Set();let offset=0,more=true;
  while(more){
    const result=await(await request.post(api+'discovery_listings',{data:{p_city_id:context.city.id,p_offset:offset,p_limit:24}})).json();
    for(const item of result.items){
      expect(ids.has(item.id)).toBe(false);ids.add(item.id);expect(item.is_demo).toBe(true);
      const path='/rawatbhata/'+item.category_slug+'/'+item.slug,page=await request.get(path),html=await page.text();
      expect(page.status(),path).toBe(200);expect(html).toContain('rel="canonical" href="http://127.0.0.1:5173'+path+'"');
      expect(html).toMatch(/Contact &(?:amp;)? visiting information/);expect(html).not.toMatch(/href="(?:https:\/\/wa\.me\/|tel:)/);
    }
    more=result.has_more;offset=result.next_offset;expect(offset).toBeLessThan(100);
  }
  expect(ids.size).toBe(33);
});

test('public and admin surfaces remain readable without document overflow at phone, tablet and desktop widths',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function widths(){
    for(const width of [320,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(page.locator('main h1')).toHaveCount(1);
      const slide=page.locator('.promotion-slide:not([hidden])');
      if(await slide.count()){
        const cta=await slide.locator('.promotion-cta').boundingBox(),caption=await slide.locator('.promotion-caption').boundingBox();
        expect(cta).not.toBeNull();expect(caption).not.toBeNull();
        expect(cta.x+cta.width<=caption.x||caption.x+caption.width<=cta.x||cta.y+cta.height<=caption.y||caption.y+caption.height<=cta.y).toBe(true);
      }
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const path of ['/','/rawatbhata/food',merchantPath,'/rawatbhata/hotels/demo-hotels','/rawatbhata/home-services/demo-home-services','/rawatbhata/fitness/demo-fitness-4']){
    await page.goto(path);await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.locator('[data-search-slot] input')).toBeVisible();await widths();
  }
  await admin(page);await widths();
  for(const name of ['Merchants','Products & imports','Categories','Locations','Advertisements','Homepage ranking','Business hours','Enquiries & analytics','Media library']){
    const link=page.getByRole('link',{name,exact:true});await link.click();await expect(link).toHaveAttribute('aria-current','page');
    await expect(page.locator('.admin-loading')).toHaveCount(0);await expect(page.locator('main h1')).toBeVisible();await widths();
  }
  await page.setViewportSize({width:test.info().project.name==='mobile'?390:1440,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/phase-7-admin-'+test.info().project.name+'.png',fullPage:true});expect(errors).toEqual([]);
});
