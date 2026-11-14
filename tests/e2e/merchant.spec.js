import {test,expect} from '@playwright/test';

const api='http://127.0.0.1:54329';
const merchant='70000000-0000-4000-8000-000000000001';
const product='71000000-0000-4000-8000-000000000001';
const qa='/qa-town/food/qa-test-kitchen';
async function control(request,path,data){const options={headers:{'x-fixture-control':'phase3_isolated_control'}};return data===undefined?request.get(api+'/__test/'+path,options):request.post(api+'/__test/'+path,{...options,data});}
async function open(page,path=qa){await page.goto(path);await expect(page.locator('[data-merchant-ready]')).toBeVisible();}
async function add(page,name='QA Vegetable Thali'){await page.getByRole('button',{name:'Add '+name+' to cart',exact:true}).click();}
async function review(page){await page.getByRole('button',{name:'Review WhatsApp enquiry'}).click();await expect(page.getByRole('dialog',{name:'Review your enquiry'})).toBeVisible();}
test.beforeEach(async({request,page})=>{
  await control(request,'reset-limits',{});
  await page.addInitScript(()=>{window.open=()=>null;});
});

test('direct merchant HTML has useful content without JavaScript and hidden URLs return a real 404',async({browser,request})=>{
  const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
  try{
    const response=await page.goto('http://127.0.0.1:5173/rawatbhata/food/demo-food');
    expect(response.status()).toBe(200);await expect(page.getByRole('heading',{level:1})).toHaveText('Demo Gulmohar Kitchen');
    await expect(page.getByRole('heading',{name:'Contact & visiting information'})).toBeVisible();
    await expect(page.locator('.product-card')).toHaveCount(12);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',/\/rawatbhata\/food\/demo-food$/);
  }finally{await context.close();}
  const missing=await request.get('/rawatbhata/food/unpublished-or-missing');expect(missing.status()).toBe(404);expect(await missing.text()).toContain('This place is not available');
});
test('legacy quick-look URLs remain usable alongside the new merchant URLs',async({page,request})=>{
  const response=await request.post(api+'/rest/v1/rpc/discovery_home',{data:{p_city_id:'10000000-0000-4000-8000-000000000001',p_limit:1}});
  const item=(await response.json()).sections[0].items[0];
  await page.goto('/?listing='+item.id);await expect(page.getByRole('dialog',{name:item.name,exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#preview-dialog')).not.toBeVisible();await expect(page).not.toHaveURL(/listing=/);await expect(page.locator('.listing-section')).toHaveCount(4);
});

test('catalog search, dietary/category/availability filters, sorting and incremental loading use SQL',async({page})=>{
  await open(page);await expect(page.locator('.product-card')).toHaveCount(12);
  await page.getByRole('button',{name:'Show more items'}).click();await expect(page.locator('.product-card')).toHaveCount(17);
  await expect(page.getByRole('button',{name:'Add QA Sold-out Snack to cart'})).toBeDisabled();
  await page.getByRole('combobox',{name:'Dietary preference'}).selectOption('egg');await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card h3')).toHaveText('QA Egg Toast');
  await page.getByRole('combobox',{name:'Dietary preference'}).selectOption('');
  await page.getByRole('checkbox',{name:'Available only'}).check();await expect(page.locator('[data-catalog-count]')).toHaveText('16 items');
  await page.getByRole('combobox',{name:'Product category'}).selectOption({label:'Small plates'});await expect(page.locator('.product-card')).toHaveCount(8);
  await page.getByRole('combobox',{name:'Sort products'}).selectOption('price_desc');await expect(page.locator('.product-card h3').first()).toHaveText('QA Plate 17');
  await page.reload();await expect(page.locator('[data-merchant-ready]')).toBeVisible();await expect(page.locator('.product-card h3').first()).toHaveText('QA Plate 17');
  await page.getByRole('searchbox',{name:'Search products'}).fill('no-matching-food');await expect(page.getByRole('heading',{name:'No items match this time'})).toBeVisible();
  await page.getByRole('button',{name:'Reset product filters'}).click();await expect(page.locator('.product-card')).toHaveCount(12);
});

test('carts persist, adjust quantities, remove/clear items and remain separate for each merchant',async({page})=>{
  await open(page);await add(page);await add(page,'QA Egg Toast');
  const cart=page.getByRole('complementary',{name:'Your merchant cart'});
  await cart.getByRole('button',{name:'Increase quantity of QA Vegetable Thali'}).click();
  await expect(cart.getByLabel('Quantity of QA Vegetable Thali',{exact:true})).toHaveText('2');
  await expect(cart.locator('.cart-estimate')).toContainText('₹40.00');
  await page.reload();await expect(page.locator('[data-merchant-ready]')).toBeVisible();await expect(cart.getByLabel('Quantity of QA Vegetable Thali',{exact:true})).toHaveText('2');
  await open(page,'/qa-town/food/qa-second-kitchen');await expect(cart).toContainText('A little room for your favourites');
  await add(page,'QA Other Merchant Item');await expect(cart.locator('.cart-estimate')).toContainText('₹50.00');
  await open(page);await expect(cart.getByLabel('Quantity of QA Vegetable Thali',{exact:true})).toHaveText('2');
  await cart.getByRole('button',{name:'Decrease quantity of QA Vegetable Thali'}).click();await expect(cart.getByLabel('Quantity of QA Vegetable Thali',{exact:true})).toHaveText('1');
  await cart.getByRole('button',{name:'Remove QA Egg Toast'}).click();await expect(cart.locator('.cart-line')).toHaveCount(1);
  await cart.getByRole('button',{name:'Clear cart'}).click();await expect(cart).toContainText('A little room for your favourites');
});

test('demo merchants support sample carts and confirmation while actual WhatsApp checkout stays disabled',async({page})=>{
  let attempts=0;page.on('request',request=>{if(request.url().endsWith('/api/checkout'))attempts++;});
  await open(page,'/rawatbhata/food/demo-food');await add(page,'Sample Rajasthani Thali');
  await page.getByRole('button',{name:'Review sample cart'}).click();
  const dialog=page.getByRole('dialog',{name:'Review your enquiry'});await expect(dialog).toContainText('fictional demo');
  await expect(dialog.getByRole('button',{name:'WhatsApp unavailable in demo'})).toBeDisabled();
  await expect(page.locator('main a[href^="https://wa.me/"]')).toHaveCount(0);await expect(page.locator('main a[href^="tel:"]')).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(attempts).toBe(0);
});

test('confirmation records only initiation/handoff and provides a usable link when popups are blocked',async({page,request})=>{
  await open(page);await add(page);await add(page,'QA Egg Toast');
  await page.getByLabel('Your preference').selectOption('delivery');await review(page);
  const dialog=page.locator('#checkout-dialog');await expect(dialog).toContainText('₹30.00');await expect(dialog).toContainText('Delivery');
  await page.getByLabel('A note for the business (optional)').fill('A question about the portion size.');
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/checkout'));
  await dialog.getByRole('button',{name:'Confirm & open WhatsApp'}).click();const response=await responsePromise;expect(response.status()).toBe(200);const result=await response.json();
  await expect(dialog.getByRole('heading',{name:'Your enquiry link is ready'})).toBeVisible();
  const fallback=dialog.getByRole('link',{name:'Open WhatsApp'});await expect(fallback).toHaveAttribute('href',/^https:\/\/wa\.me\/12025550123\?text=/);
  const message=new URL(await fallback.getAttribute('href')).searchParams.get('text');expect(message).toContain('not a confirmed order');expect(message).toContain('A question about the portion size.');
  const records=await (await control(request,'checkouts')).json();const record=records.find(record=>record.reference===result.reference);
  expect(record.state).toBe('handoff_created');expect(record.total_minor).toBe(3000);
  await dialog.getByRole('button',{name:'Return to browsing'}).click();await expect(page.locator('.cart-line')).toHaveCount(2);
});

test('a price change after review requires a second explicit confirmation at the authoritative new price',async({page,request})=>{
  await open(page);await add(page);await review(page);
  try{
    await control(request,'products/'+product,{price_minor:1500});
    const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/checkout'));
    await page.getByRole('button',{name:'Confirm & open WhatsApp'}).click();expect((await responsePromise).status()).toBe(409);
    const dialog=page.getByRole('dialog',{name:'Review your updated enquiry'});await expect(dialog).toBeVisible();await expect(dialog.locator('.checkout-total')).toContainText('₹15.00');
    await expect(dialog).toContainText('Please review the updated details');
    const acceptedPromise=page.waitForResponse(response=>response.url().endsWith('/api/checkout'));
    await dialog.getByRole('button',{name:'Confirm & open WhatsApp'}).click();const accepted=await(await acceptedPromise).json();expect(accepted.receipt.total_minor).toBe(1500);
    await expect(page.getByRole('heading',{name:'Your enquiry link is ready'})).toBeVisible();
  }finally{await control(request,'products/'+product,{price_minor:1000,available:true});}
});

test('stock withdrawal after review blocks the handoff and preserves an editable cart',async({page,request})=>{
  await open(page);await add(page);await review(page);
  try{
    await control(request,'products/'+product,{available:false});
    await page.getByRole('button',{name:'Confirm & open WhatsApp'}).click();
    await expect(page.getByRole('dialog')).toContainText('Currently unavailable');await expect(page.getByRole('button',{name:'Confirm & open WhatsApp'})).toBeDisabled();
    await page.getByRole('button',{name:'Back to cart'}).click();await expect(page.locator('#checkout-dialog')).not.toBeVisible();await expect(page.locator('#merchant-cart .cart-unavailable')).toContainText('Unavailable');
    await page.getByRole('button',{name:'Remove QA Vegetable Thali'}).click();await expect(page.locator('.cart-line')).toHaveCount(0);
  }finally{await control(request,'products/'+product,{available:true,price_minor:1000});}
});

test('a lost HTTP response retries the same recorded enquiry without duplicate records',async({page,request})=>{
  await open(page);await add(page);await review(page);
  let firstResult,firstKey,attempts=0;
  await page.route('**/api/checkout',async route=>{
    attempts++;const body=route.request().postDataJSON();
    if(attempts===1){firstKey=body.idempotency_key;const response=await route.fetch();firstResult=await response.json();await route.fulfill({status:503,contentType:'application/json',body:'{"code":"checkout_unavailable"}'});}
    else{expect(body.idempotency_key).toBe(firstKey);await route.continue();}
  });
  await page.getByRole('button',{name:'Confirm & open WhatsApp'}).click();await expect(page.locator('[data-checkout-error]')).toContainText('retries reuse the same enquiry');
  await page.getByRole('button',{name:'Confirm & open WhatsApp'}).click();await expect(page.locator('.checkout-reference')).toHaveText(firstResult.reference);
  const records=await(await control(request,'checkouts')).json();expect(records.filter(record=>record.idempotency_key===firstKey)).toHaveLength(1);
});

test('relevant offerings, galleries, manual closures and service coverage use the same reusable page',async({page})=>{
  await open(page,'/rawatbhata/hotels/demo-hotels');await expect(page.getByRole('heading',{name:'Rooms & stays'})).toBeVisible();await expect(page.locator('#catalog')).toHaveCount(0);await expect(page.locator('#merchant-cart')).toHaveCount(0);
  await page.getByRole('button',{name:'View photos'}).click();await expect(page.getByRole('dialog',{name:'Business photographs'})).toBeVisible();await page.keyboard.press('Escape');
  await open(page,'/rawatbhata/fitness/demo-fitness-4');await expect(page.getByRole('heading',{name:'Memberships & training'})).toBeVisible();await expect(page.locator('[data-operating-status]')).toContainText('Temporarily closed');
  await open(page,'/rawatbhata/home-services/demo-home-services');await expect(page.getByRole('heading',{name:'How we can help'})).toBeVisible();await expect(page.locator('.service-area-list>span')).toHaveCount(3);
  await open(page);await expect(page.getByRole('link',{name:'Directions',exact:true})).toHaveAttribute('href','https://www.google.com/maps/dir/?api=1&destination=0%2C0');
  await expect(page.getByRole('link',{name:'Call business',exact:true})).toHaveAttribute('href','tel:+12025550123');
});

test('small screens, sticky cart summary, keyboard controls and dialogs stay usable',async({page},testInfo)=>{
  await open(page);await add(page);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  if(testInfo.project.name==='mobile'){
    await page.setViewportSize({width:390,height:844});await expect(page.locator('[data-mobile-cart]')).toBeVisible();await page.locator('[data-mobile-cart] button').click();await expect(page.locator('#merchant-cart')).toBeFocused();
  }
  await review(page);await page.keyboard.press('Tab');expect(await page.locator('#checkout-dialog').evaluate(dialog=>dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(page.locator('#checkout-dialog')).not.toBeVisible();
});

test('catalog errors and malicious product text have safe recovery',async({page})=>{
  await page.route(api+'/rest/v1/rpc/merchant_products',async route=>{
    const response=await route.fetch();const result=await response.json();result.items[0].name='<img src=x onerror="window.injected=true">';await route.fulfill({response,json:result});
  });
  await open(page,qa+'?product_sort=featured');await expect(page.locator('.product-card h3').first()).toHaveText('<img src=x onerror="window.injected=true">');await expect(page.locator('.product-card h3 img')).toHaveCount(0);expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  await page.unroute(api+'/rest/v1/rpc/merchant_products');
  await page.route(api+'/rest/v1/rpc/merchant_products',route=>route.fulfill({status:403,contentType:'application/json',body:'{"code":"42501","message":"private detail"}'}));
  await page.getByRole('searchbox',{name:'Search products'}).fill('sample');await expect(page.getByRole('heading',{name:'The catalog could not be loaded'})).toBeVisible();await expect(page.locator('main')).not.toContainText('private detail');
  await page.unroute(api+'/rest/v1/rpc/merchant_products');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'No items match this time'})).toBeVisible();
});

test('untrusted stored prices are refreshed and blocked browser storage retains an in-memory cart',async({page})=>{
  await page.addInitScript(({merchant,product})=>{try{localStorage.setItem('rawatbhata:cart:v1:'+merchant,JSON.stringify({version:1,merchant_id:merchant,items:[{product_id:product,quantity:1,name:'Tampered display name',unit:'plate',price_minor:1,available:true}]}));}catch{/* A later test blocks storage deliberately. */}},{merchant,product});
  await open(page);await expect(page.locator('.cart-estimate')).toContainText('₹10.00');await expect(page.locator('.cart-line h3')).toHaveText('QA Vegetable Thali');
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
  await page.reload();await expect(page.locator('[data-merchant-ready]')).toBeVisible();await add(page);await expect(page.locator('.cart-line')).toHaveCount(1);await expect(page.locator('[data-toast]')).toContainText('Browser storage is unavailable');
});
