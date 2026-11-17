import {test,expect} from '@playwright/test';
const city='70000000-0000-4000-8000-000000000090';
const missing={status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202',message:'The delivery context RPC is missing from the schema cache.'})};

async function signIn(page,email='admin@example.test'){
  await page.goto('/admin/');await page.getByLabel('Email address',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill('Isolated-fixture-pass-42!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
}

test('pending migration does not block admin login, existing edits or city-wide analytics',async({page})=>{
  const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url().split('/').at(-1)));
  await page.route('**/rest/v1/rpc/admin_context_checkout',route=>route.fulfill(missing));
  await signIn(page);await expect(page.locator('.admin-stat')).toHaveCount(6);
  await expect(page.locator('[data-schema-notice]')).toContainText('reviewed migration 10');
  await page.reload();await expect(page.locator('.admin-stat')).toHaveCount(6);
  await page.getByLabel('Manage city').selectOption(city);await expect(page.getByText('Here’s what’s happening in QA Town.')).toBeVisible();

  await page.getByRole('link',{name:'Categories',exact:true}).click();await page.locator('.admin-table tbody a').first().click();
  await expect(page.getByLabel('Food catalog: merchant-managed delivery checkout',{exact:true})).toHaveCount(0);
  const savedCategory=page.waitForRequest(request=>request.url().endsWith('/rest/v1/rpc/admin_save_taxonomy'));
  await page.getByRole('button',{name:'Save category',exact:true}).click();
  expect((await savedCategory).postDataJSON().p_data.food_catalog).toBeUndefined();await expect(page.locator('.admin-toast')).toHaveText('Category saved.');

  await page.getByRole('link',{name:'Merchants',exact:true}).click();
  const loaded=page.waitForResponse(response=>response.url().endsWith('/rest/v1/rpc/admin_listing')&&response.status()===200);
  await page.getByRole('link',{name:'QA Test Kitchen',exact:true}).click();const before=(await (await loaded).json()).actions;
  const savedMerchant=page.waitForRequest(request=>request.url().endsWith('/rest/v1/rpc/admin_save_listing'));
  await page.getByRole('button',{name:'Save merchant',exact:true}).click();const after=(await savedMerchant).postDataJSON().p_data.actions;
  expect(after.pickup_available).toBe(before.pickup_available);expect(after.delivery_available).toBe(before.delivery_available);
  await expect(page.locator('.admin-toast')).toHaveText('Merchant saved.');

  await page.getByRole('link',{name:'Enquiries & analytics',exact:true}).click();await expect(page.getByRole('heading',{name:'City-wide discovery',exact:true})).toBeVisible();
  await expect(page.getByLabel('Merchant/shop',{exact:true})).toBeHidden();await expect(page.getByText('Discovery through the days',{exact:true})).toBeVisible();
  expect(requests).not.toContain('admin_checkout_merchants');expect(requests).not.toContain('admin_checkout_tracking');
  await page.getByRole('button',{name:'Last 7 days',exact:true}).click();await expect(page.getByRole('button',{name:'Update report',exact:true})).toBeEnabled();
  await expect(page.locator('.admin-toast')).not.toHaveAttribute('data-error','true');

  await page.unroute('**/rest/v1/rpc/admin_context_checkout');await page.reload();await expect(page.locator('[data-schema-notice]')).toHaveCount(0);
  await expect(page.getByLabel('Merchant/shop',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Order Tracking',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('a missing new context cannot bypass the single-admin authorization check',async({page})=>{
  let contextRequests=0;
  page.on('request',request=>{if(/\/rpc\/admin_context(?:_checkout)?$/.test(request.url()))contextRequests++;});
  await page.route('**/rest/v1/rpc/admin_context_checkout',route=>route.fulfill(missing));
  await signIn(page,'viewer@example.test');await expect(page.locator('[data-login-feedback]')).toContainText('not the platform administrator');
  await expect(page.locator('.admin-workspace')).toHaveCount(0);expect(contextRequests).toBe(0);
});
