import {test,expect} from '@playwright/test';

test('platform landing selects a city and preserves city-scoped category, merchant and back navigation',async({page},info)=>{
  const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/rest/v1/'))requests.push(request.url());});
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Your city.A little closer.');
  await expect(page.locator('.city-card').first()).toContainText('Rawatbhata');
  await expect(page.locator('.city-card')).toContainText(['Rawatbhata','QA Town']);
  await expect(page).toHaveTitle(/ShaharOne/);
  expect(requests.filter(url=>url.includes('/rpc/discovery_')||url.includes('/rest/v1/cities'))).toEqual([]);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:900});
  await page.screenshot({path:'test-results/shaharone-platform-'+info.project.name+'.png',fullPage:true});
  await page.locator('.city-card[href="/rawatbhata/"]').click();
  await expect(page).toHaveURL(/\/rawatbhata\/$/);await expect(page.locator('.category-tile')).toHaveCount(15);
  await expect(page.locator('[data-current-location]')).toHaveText('Rawatbhata');
  await page.locator('.category-tile').filter({hasText:'Food & drink'}).click();
  await expect(page).toHaveURL(/\/rawatbhata\/food$/);
  await page.locator('.place-card-link').first().click();await expect(page.locator('[data-merchant-ready]')).toBeVisible();
  await expect(page.locator('.merchant-breadcrumb a').first()).toHaveAttribute('href','/rawatbhata/');
  await page.goBack();await expect(page.locator('.results-grid .place-card')).toHaveCount(4);
  await page.getByRole('link',{name:'ShaharOne home',exact:true}).click();await expect(page.locator('.city-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('city search uses the database, survives refresh and shows an honest empty state',async({page})=>{
  let release;const startup=new Promise(resolve=>{release=resolve;});
  await page.route('**/src/app.js',async route=>{await startup;await route.continue();});
  await page.goto('/',{waitUntil:'commit'});
  await page.getByRole('searchbox',{name:'Find your city',exact:true}).fill('Rawat');
  release();await expect(page.locator('[data-search-slot] input')).toBeVisible();
  await expect(page.getByRole('searchbox',{name:'Find your city',exact:true})).toHaveValue('Rawat');
  await page.getByRole('searchbox',{name:'Find your city',exact:true}).press('Enter');
  await expect(page).toHaveURL(/city_q=Rawat/);await expect(page.locator('.city-card')).toHaveCount(1);await expect(page.locator('.city-card')).toContainText('Rawatbhata');
  await page.reload();await expect(page.locator('.city-card')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
  await page.getByRole('searchbox',{name:'Find your city',exact:true}).fill('no-city-with-this-name');
  await page.getByRole('searchbox',{name:'Find your city',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'No matching cities yet'})).toBeVisible();await expect(page.locator('.city-card')).toHaveCount(0);
  await page.getByRole('link',{name:'Browse cities',exact:true}).click();await expect(page.locator('.city-card')).toHaveCount(2);
});

test('an additional enabled city reuses the application and does not mix Rawatbhata search or merchants',async({page})=>{
  await page.goto('/');await page.locator('.city-card[href="/qa-town/"]').click();
  await expect(page.locator('[data-current-location]')).toHaveText('QA Town');
  const search=page.getByRole('combobox',{name:'Search all local places',exact:true});
  await search.fill('Kaju Katli');await search.press('Enter');
  await expect(page).toHaveURL(/\/qa-town\/search\?q=Kaju/);await expect(page.locator('.results-grid .place-card')).toHaveCount(0);
  await page.getByRole('link',{name:'ShaharOne home',exact:true}).click();await page.locator('.city-card[href="/qa-town/"]').click();
  await page.locator('.category-tile').filter({hasText:'Food & drink'}).click();
  await expect(page).toHaveURL(/\/qa-town\/food$/);
  await expect(page.locator('.place-card-link[href="/qa-town/food/qa-test-kitchen"]')).toBeVisible();
  expect(await page.locator('.place-card-link').evaluateAll(nodes=>nodes.every(node=>node.getAttribute('href').startsWith('/qa-town/')))).toBe(true);
  await page.locator('.place-card-link[href="/qa-town/food/qa-test-kitchen"]').click();await expect(page).toHaveURL(/\/qa-town\/food\/qa-test-kitchen$/);await expect(page.locator('[data-merchant-ready]')).toBeVisible();
  await page.getByRole('button',{name:'Choose your city and neighbourhood'}).click();
  await page.locator('[data-city-select]').selectOption('rawatbhata');
  await expect(page).toHaveURL(/\/rawatbhata\/$/);await expect(page.locator('.listing-section')).toHaveCount(4);
});

test('platform and city selection work without JavaScript and historical homepage links remain valid',async({browser,request})=>{
  const context=await browser.newContext({javaScriptEnabled:false});
  try{
    const page=await context.newPage();await page.goto('/');await expect(page.locator('.city-card')).toHaveCount(2);
    await page.getByRole('searchbox',{name:'Find your city',exact:true}).fill('Rawat');await page.getByRole('button',{name:'Search cities',exact:true}).click();
    await expect(page.locator('.city-card')).toHaveCount(1);await page.locator('.city-card').click();
    await expect(page).toHaveURL(/\/rawatbhata\/$/);await expect(page.locator('.listing-section')).toHaveCount(4);
    await expect(page.locator('header [data-explore-link]')).toHaveAttribute('href','/rawatbhata/explore');
  }finally{await context.close();}
  const oldHome=await request.get('/rawatbhata',{maxRedirects:0});expect(oldHome.status()).toBe(308);expect(oldHome.headers().location).toBe('/rawatbhata/');
  const oldQuery=await request.get('/?q=tea&locality=demo-lakeside',{maxRedirects:0});expect(oldQuery.status()).toBe(307);expect(oldQuery.headers().location).toBe('/rawatbhata/?q=tea&locality=demo-lakeside');
  const missing=await request.get('/unsupported-city/');expect(missing.status()).toBe(404);
});
