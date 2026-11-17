import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:54329',control={'x-fixture-control':'phase3_isolated_control'};
const merchant='70000000-0000-4000-8000-000000000001',other='70000000-0000-4000-8000-000000000002',city='70000000-0000-4000-8000-000000000090';
const address='House 25, Example Colony\nNear Main Market, Rawatbhata, Rajasthan';
const note='Near gate & ring once <please> 🙂';
async function records(request){return (await request.get(api+'/__test/checkouts',{headers:control})).json();}
async function resetLimits(request){await request.post(api+'/__test/reset-limits',{headers:control,data:{}});}
async function review(page,path='/qa-town/food/qa-test-kitchen',product='QA Vegetable Thali'){
  await page.goto(path);await expect(page.locator('[data-merchant-ready]')).toBeVisible();
  await page.getByRole('button',{name:'Add '+product+' to cart',exact:true}).click();
  await page.getByRole('button',{name:'Order on WhatsApp',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Review your enquiry',exact:true})).toBeVisible();
}
async function confirm(page){
  await page.getByLabel('Delivery Address',{exact:false}).fill(address);
  const response=page.waitForResponse(response=>response.url().endsWith('/api/checkout'));
  await page.getByRole('button',{name:'Confirm & Order on WhatsApp',exact:true}).click();const reply=await response;expect(reply.status()).toBe(200);return reply.json();
}
async function login(page){
  await page.goto('/admin/');await page.getByLabel('Email address',{exact:true}).fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill('Isolated-fixture-pass-42!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByLabel('Manage city')).toBeVisible();await page.getByLabel('Manage city').selectOption(city);await expect(page.getByLabel('Manage city')).toBeEnabled();
}
test.beforeEach(async({page,request})=>{await resetLimits(request);await page.addInitScript(()=>{window.open=()=>null;});});

test('food delivery validates address, preserves multiline text, calculates multiple products and stores no customer text',async({page,request},info)=>{
  const before=(await records(request)).length;await review(page);
  await expect(page.locator('[data-fulfilment]')).toHaveCount(0);await expect(page.locator('#merchant-cart')).not.toContainText('Pickup');await expect(page.locator('#merchant-cart')).not.toContainText('Enquiry only');
  const confirmButton=page.getByRole('button',{name:'Confirm & Order on WhatsApp',exact:true});await expect(confirmButton).toBeDisabled();
  const field=page.getByLabel('Delivery Address',{exact:false});await field.fill('  \n  ');await field.blur();await expect(page.locator('[data-address-error]')).toContainText('complete delivery address');await expect(confirmButton).toBeDisabled();
  await field.fill('House');await expect(confirmButton).toBeDisabled();await field.fill(address);await page.getByLabel('Delivery instructions or landmark (optional)').fill(note);await expect(confirmButton).toBeEnabled();
  await page.getByRole('button',{name:'Back to cart',exact:true}).click();await page.getByRole('button',{name:'Increase quantity of QA Vegetable Thali',exact:true}).click();await page.getByRole('button',{name:'Add QA Egg Toast to cart',exact:true}).click();
  await page.getByRole('button',{name:'Order on WhatsApp',exact:true}).click();await expect(field).toHaveValue(address);await expect(page.locator('.checkout-total')).toContainText('₹40.00');
  await page.screenshot({path:'test-results/delivery-confirmation-'+info.project.name+'.png',fullPage:true});
  const result=await confirm(page),message=new URL(result.url).searchParams.get('text');
  expect(new URL(result.url).pathname).toBe('/12025550123');for(const value of [address,note,'QA Vegetable Thali','QA Egg Toast','₹40.00','not a confirmed order'])expect(message).toContain(value);
  expect(result.reference).toMatch(/^SO-/);expect(result.receipt.delivery_address).toBeUndefined();expect(result.receipt.instructions).toBeNull();
  const after=await records(request);expect(after.length).toBe(before+1);const row=after.find(row=>row.reference===result.reference);expect(row.instructions).toBeNull();expect(row.delivery_fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(row.state).toBe('handoff_created');
  expect(new URL(page.url()).searchParams.has('delivery_address')).toBe(false);
  const saved=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));expect(saved).not.toContain(address);expect(saved).not.toContain(note);
});

test('admin merchant filter and monetary aggregates retain archived and renamed merchant history',async({page,request})=>{
  await review(page);const first=await confirm(page);
  await page.getByRole('button',{name:'Return to browsing',exact:true}).click();
  await review(page,'/qa-town/food/qa-second-kitchen','QA Other Merchant Item');const second=await confirm(page);expect(new URL(second.url).pathname).toBe('/12025550124');
  await request.post(api+'/__test/merchant-state',{headers:control,data:{id:other,name:'Renamed archived kitchen',enabled:false}});
  try{
    const all=await records(request),own=all.filter(row=>row.merchant_id===other),total=all.reduce((sum,row)=>sum+Number(row.total_minor),0);
    await login(page);await page.getByRole('link',{name:'Enquiries & analytics',exact:true}).click();await expect(page.getByRole('heading',{name:'Order Tracking',exact:true})).toBeVisible();
    const picker=page.getByLabel('Merchant/shop',{exact:true});await expect(picker).toHaveValue('');await expect(picker.locator('option').filter({hasText:'All Merchants'})).toHaveCount(1);
    await expect(page.locator('.tracking-stats .admin-stat').first().locator('strong')).toHaveText(String(all.length));
    await expect(page.locator('[data-checkout-activity]')).toContainText(first.reference);await expect(page.locator('[data-checkout-activity]')).toContainText(second.reference);
    await picker.selectOption(other);await expect(page.locator('.tracking-stats .admin-stat').first().locator('strong')).toHaveText(String(own.length));
    await expect(page.locator('[data-checkout-activity]')).toContainText('Renamed archived kitchen');await expect(page.locator('[data-checkout-activity]')).toContainText(second.reference);await expect(page.locator('[data-checkout-activity]')).not.toContainText(first.reference);
    await expect(page.locator('[data-checkout-tracking]')).not.toContainText(address);await expect(page.locator('[data-checkout-tracking]')).not.toContainText(note);
    await picker.selectOption('');await page.getByLabel('Sort merchant summary',{exact:true}).selectOption('value');await expect(page.locator('[data-merchant-summary]')).toBeVisible();expect(total).toBeGreaterThan(0);
    await page.getByLabel('From',{exact:true}).fill('2000-01-01');await page.getByLabel('Through',{exact:true}).fill('2000-01-02');await page.getByRole('button',{name:'Update report',exact:true}).click();
    await expect(page.getByRole('heading',{name:'No checkout initiations in this period',exact:true})).toBeVisible();await expect(page.locator('.tracking-stats .admin-stat').first().locator('strong')).toHaveText('0');
  }finally{await request.post(api+'/__test/merchant-state',{headers:control,data:{id:other,name:'QA Second Kitchen',enabled:true}});}
});

test('delivery fields lock during preparation and unlock safely after a failed request',async({page})=>{
  await review(page);const field=page.getByLabel('Delivery Address',{exact:false}),instructions=page.getByLabel('Delivery instructions or landmark (optional)');await field.fill(address);await instructions.fill(note);
  let release,arrived;const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{arrived=resolve;});
  await page.route('**/api/checkout',async route=>{arrived();await gate;await route.fulfill({status:503,contentType:'application/json',body:'{"code":"checkout_unavailable"}'});});
  try{
    await page.getByRole('button',{name:'Confirm & Order on WhatsApp',exact:true}).click();await ready;await expect(field).toBeDisabled();await expect(instructions).toBeDisabled();
    release();await expect(page.locator('[data-checkout-error]')).toContainText('try again');await expect(field).toBeEnabled();await expect(instructions).toBeEnabled();await expect(field).toHaveValue(address);await expect(instructions).toHaveValue(note);
  }finally{release();}
  await page.unroute('**/api/checkout');const result=await confirm(page);expect(new URL(result.url).searchParams.get('text')).toContain(address);
});

test('one enabled city temporarily opens Rawatbhata without city selection and Contact Us contains only the supplied email',async({page,request})=>{
  await request.post(api+'/__test/city-enabled',{headers:control,data:{id:city,enabled:false}});
  try{
    const root=await request.get('/',{maxRedirects:0});expect(root.status()).toBe(307);expect(root.headers().location).toBe('/rawatbhata/');expect(root.headers()['cache-control']).toBe('no-store');
    await page.goto('/');await expect(page).toHaveURL(/\/rawatbhata\/$/);await expect(page.locator('.category-tile')).toHaveCount(15);await expect(page.locator('.city-card')).toHaveCount(0);
    await expect(page.locator('header [data-platform-link]')).toBeHidden();await expect(page.locator('footer [data-platform-link]')).toBeHidden();
    await page.locator('[data-location-open]').click();await expect(page.locator('[data-city-select]')).toHaveCount(0);await expect(page.getByRole('link',{name:'Browse all cities'})).toHaveCount(0);await page.getByRole('button',{name:'Demo Lakeside',exact:true}).click();await expect(page).toHaveURL(/locality=demo-lakeside/);
    const contact=page.locator('.footer-contact');await expect(contact.getByRole('heading',{name:'Contact Us',exact:true})).toBeVisible();await expect(contact.getByRole('link')).toHaveAttribute('href','mailto:ShaharOneRawatbhata@gmail.com');await expect(contact.getByRole('link')).toHaveText('ShaharOneRawatbhata@gmail.com');await expect(contact.locator('a[href^="tel:"]')).toHaveCount(0);
  }finally{await request.post(api+'/__test/city-enabled',{headers:control,data:{id:city,enabled:true}});}
  await page.goto('/');await expect(page.locator('.city-card')).toHaveCount(2);
});
