import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:54329',headers={'x-fixture-control':'phase3_isolated_control'};
const city='70000000-0000-4000-8000-000000000090',merchant='70000000-0000-4000-8000-000000000001';
const path='/qa-town/food/qa-test-kitchen';
async function schema(request,available){const r=await request.post(api+'/__test/delivery-schema',{headers,data:{available}});expect(r.ok()).toBe(true);}
async function checkouts(request){return (await (await request.get(api+'/__test/checkouts',{headers})).json()).length;}

test('dashboard public merchant links render existing products and contacts before the delivery migration',async({page,request})=>{
  const before=await checkouts(request);let popup;
  await schema(request,false);
  try{
    await page.goto('/admin/');await page.getByLabel('Email address',{exact:true}).fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill('Isolated-fixture-pass-42!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByLabel('Manage city')).toBeVisible();await page.getByLabel('Manage city').selectOption(city);
    await expect(page.getByLabel('Manage city')).toBeEnabled();await page.getByRole('link',{name:'Merchants',exact:true}).click();await page.getByRole('link',{name:'QA Test Kitchen',exact:true}).click();
    const href=await page.getByRole('link',{name:'View public page'}).getAttribute('href');
    const html=await request.get(href);expect(html.status()).toBe(200);const body=await html.text();expect(body).toContain('QA Test Kitchen');expect(body).toContain('QA Vegetable Thali');expect(body).toContain('data-ordering-unavailable');
    const opened=page.waitForEvent('popup');await page.getByRole('link',{name:'View public page'}).click();popup=await opened;
    await expect(popup.locator('[data-merchant-ready]')).toBeVisible();await expect(popup.getByRole('heading',{level:1})).toHaveText('QA Test Kitchen');
    await popup.getByRole('button',{name:'Add QA Vegetable Thali to cart',exact:true}).click();await expect(popup.locator('[data-merchant-action="review"]')).toBeDisabled();
    await expect(popup.locator('[data-fulfilment]')).toHaveCount(0);await expect(popup.locator('[data-ordering-unavailable]')).toContainText('temporarily unavailable');
    await expect(popup.getByRole('link',{name:'Get directions',exact:true})).toBeVisible();
    const blocked=await request.post('/api/checkout',{headers:{Origin:test.info().project.use.baseURL},data:{merchant_id:merchant,items:[{product_id:'71000000-0000-4000-8000-000000000001',quantity:1}],fulfilment:'pickup',instructions:'',quote_token:'a'.repeat(32),idempotency_key:'74000000-0000-4000-8000-000000000050'}});
    expect(blocked.status()).toBe(503);expect((await blocked.json()).code).toBe('checkout_unconfigured');expect(await checkouts(request)).toBe(before);
    await schema(request,true);await popup.reload();await expect(popup.getByRole('button',{name:'Order on WhatsApp',exact:true})).toBeEnabled();await expect(popup.locator('[data-ordering-unavailable]')).toHaveCount(0);
  }finally{await schema(request,true);await popup?.close();}
});

test('category-to-merchant browser navigation and catalog filters work with the existing schema',async({page,request})=>{
  await schema(request,false);
  try{
    let documents=0;page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;});
    await page.goto('/qa-town/food');await expect(page.locator('a[href="'+path+'"]').first()).toBeVisible();const initial=documents;
    await page.locator('a[href="'+path+'"]').first().click();await expect(page.locator('[data-merchant-ready]')).toBeVisible();expect(documents).toBe(initial);
    await expect(page.getByRole('heading',{level:1})).toHaveText('QA Test Kitchen');await page.getByRole('searchbox',{name:'Search products',exact:true}).fill('Thali');
    await expect(page.locator('[data-product-card]')).toHaveCount(1);await expect(page.locator('[data-product-card]')).toContainText('QA Vegetable Thali');
    await page.getByRole('button',{name:'Add QA Vegetable Thali to cart',exact:true}).click();await page.getByRole('button',{name:'Increase quantity of QA Vegetable Thali',exact:true}).click();
    await expect(page.getByLabel('Quantity of QA Vegetable Thali',{exact:true})).toHaveText('2');await expect(page.locator('[data-merchant-action="review"]')).toBeDisabled();
  }finally{await schema(request,true);}
});

test('legacy server-rendered pages preserve all public listing types and hidden routes remain 404',async({request})=>{
  await schema(request,false);
  try{
    const types=new Map();
    for(const offset of [0,24]){
      const r=await request.post(api+'/rest/v1/rpc/discovery_listings',{data:{p_city_id:'10000000-0000-4000-8000-000000000001',p_offset:offset,p_limit:24}});expect(r.ok()).toBe(true);
      for(const row of (await r.json()).items)if(!types.has(row.listing_type))types.set(row.listing_type,row);
    }
    expect(types.size).toBeGreaterThanOrEqual(5);
    for(const row of types.values()){
      const r=await request.get('/rawatbhata/'+row.category_slug+'/'+row.slug);expect(r.status()).toBe(200);expect(await r.text()).toContain('Contact & visiting information');
    }
    const hidden=await request.get('/qa-town/food/qa-draft-kitchen');expect(hidden.status()).toBe(404);
    const unknown=await request.get('/unsupported-city/food/missing');expect(unknown.status()).toBe(404);
  }finally{await schema(request,true);}
});
