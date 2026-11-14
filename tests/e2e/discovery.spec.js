import { test, expect } from '@playwright/test';

const api='http://127.0.0.1:54329/rest/v1/rpc/';
async function home(page) {
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Your town, rediscovered.');
  await expect(page.locator('.listing-section')).toHaveCount(4);
}
test('homepage loads database-backed categories, promotions and top-four listing rows',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const requests=[];page.on('request',request=>{if(request.url().startsWith(api))requests.push(request);});
  await home(page);
  await expect(page.locator('.category-tile')).toHaveCount(15);
  await expect(page.locator('[data-demo-notice]')).toBeVisible();
  const sections=page.locator('.listing-section');
  for(let i=0;i<4;i++)await expect(sections.nth(i).locator('.place-card')).toHaveCount(4);
  await expect(page.getByRole('region',{name:'Sponsored local promotions'})).toBeVisible();
  await expect(page.locator('.promotion-slide:not([hidden]) .promotion-label')).toContainText('Sponsored · Demo');
  // Server-rendered public data is reused instead of fetching the same initial content again.
  expect(requests.filter(request=>request.url().endsWith('discovery_context')).length).toBe(0);
  expect(requests.filter(request=>request.url().endsWith('discovery_home')).length).toBe(0);
  expect(errors).toEqual([]);
});

test('more-category loading covers all fifteen categories without duplicate sections or filler cards',async({page})=>{
  await home(page);
  const button=page.getByRole('button',{name:'Explore more categories'});
  await button.click();await expect(page.locator('.listing-section')).toHaveCount(8);
  await button.click();await expect(page.locator('.listing-section')).toHaveCount(12);
  await button.click();await expect(page.locator('.listing-section')).toHaveCount(15);
  await expect(button).toBeHidden();
  const ids=await page.locator('.listing-section').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-labelledby')));
  expect(new Set(ids).size).toBe(15);
  for(const section of await page.locator('.listing-section').all())expect(await section.locator('.place-card').count()).toBeLessThanOrEqual(4);
});

test('category navigation, dietary filters, locality, sorting, refresh and back navigation work',async({page})=>{
  await home(page);
  await page.locator('.category-tile').filter({hasText:'Food & drink'}).click();
  await expect(page).toHaveURL(/\/rawatbhata\/food$/);
  await expect(page.getByRole('heading',{level:1})).toHaveText('Food & Restaurants');
  await expect(page.locator('.results-grid .place-card')).toHaveCount(4);
  if(await page.locator('.filters-details').getAttribute('open')===null)await page.locator('.filters-details summary').click();
  await page.getByLabel('Food preference',{exact:true}).selectOption('Vegetarian');
  await expect(page.locator('.results-grid .place-card')).toHaveCount(3);
  await page.getByLabel('Sort by').selectOption('price_desc');
  await expect(page.locator('.results-grid .place-card h3').first()).toHaveText('Demo Gulmohar Kitchen');
  if(await page.locator('.filters-details').getAttribute('open')===null)await page.locator('.filters-details summary').click();
  await page.getByLabel('Neighbourhood',{exact:true}).selectOption('demo-lakeside');
  await expect(page.locator('.results-grid .place-card')).toHaveCount(1);
  await expect(page.locator('.results-grid .place-card h3')).toHaveText('Demo The Courtyard Café');
  await page.reload();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(1);
  await expect(page.getByLabel('Sort by')).toHaveValue('price_desc');
  await page.goBack();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(3);
});

test('location selector filters the homepage and restores all neighbourhoods',async({page})=>{
  await home(page);
  await page.getByRole('button',{name:'Choose your neighbourhood'}).click();
  const dialog=page.getByRole('dialog',{name:'Where are you exploring?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Demo Lakeside',exact:true}).click();
  await expect(page).toHaveURL(/locality=demo-lakeside/);
  await expect(page.locator('.listing-section').first().locator('.place-card')).toHaveCount(1);
  await expect(page.locator('[data-current-location]')).toHaveText('Demo Lakeside');
  await page.getByRole('button',{name:'Choose your neighbourhood'}).click();
  await dialog.getByRole('button',{name:'All neighbourhoods'}).click();
  await expect(page.locator('.listing-section').first().locator('.place-card')).toHaveCount(4);
  await expect(page).not.toHaveURL(/locality=/);
});

test('keyboard search suggestions find a matching product and open its merchant page',async({page})=>{
  await home(page);
  const input=page.getByRole('combobox',{name:'Search all local places',exact:true});
  await input.fill('Kaju Katli');
  await expect(page.locator('.header-search [role="option"]').first()).toContainText('Sample Kaju Katli');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant',/option-0$/);
  await input.press('Enter');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Demo Mishri Sweet Studio');
  await expect(page.locator('[data-merchant-ready]')).toBeVisible();
  await expect(page).toHaveURL(/\/rawatbhata\/sweets\/demo-sweets$/);
  await expect(page.locator('main a[href*="wa.me"]')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('.listing-section')).toHaveCount(4);
});

test('search result pages and incremental listing loading use actual SQL search',async({page})=>{
  await home(page);
  const input=page.getByRole('combobox',{name:'Search all local places',exact:true});
  await input.fill('hotel');await input.press('Enter');
  await expect(page).toHaveURL(/\/rawatbhata\/search\?q=hotel/);
  await expect(page.locator('.results-grid .place-card')).toHaveCount(4);
  await page.getByRole('link',{name:'Explore all places',exact:true}).click();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(12);
  await expect(page.locator('[data-result-count]')).toContainText('33');
  await page.getByRole('button',{name:'Show more places'}).click();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(24);
  await page.getByRole('button',{name:'Show more places'}).click();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(33);
  await expect(page.getByRole('button',{name:'Show more places'})).toBeHidden();
});

test('carousel controls support reduced motion and sponsored category navigation',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await home(page);
  const carousel=page.getByRole('region',{name:'Sponsored local promotions'});
  await expect(carousel.locator('.promotion-slide:not([hidden]) h2')).toHaveText('Good food. Great company.');
  await expect(carousel.getByRole('button',{name:'Auto-rotation disabled for reduced motion'})).toBeDisabled();
  await carousel.getByRole('button',{name:'Next promotion'}).click();
  await expect(carousel.locator('.promotion-slide:not([hidden]) h2')).toHaveText('A little escape, closer to home.');
  await carousel.getByRole('button',{name:'Previous promotion'}).click();
  await expect(carousel.locator('.promotion-slide:not([hidden]) h2')).toHaveText('Good food. Great company.');
  await carousel.getByRole('button',{name:'Go to promotion 3'}).click();
  await carousel.getByRole('link',{name:'Discover stays'}).click();
  await expect(page).toHaveURL(/\/rawatbhata\/hotels$/);
  await expect(page.locator('.results-grid .place-card')).toHaveCount(4);
});

test('carousel rotates automatically and a manual pause stops rotation',async({page})=>{
  await page.clock.install();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await home(page);
  await page.mouse.move(0,0);
  await page.clock.runFor(100);
  await page.clock.fastForward(7000);
  const slide=page.locator('.promotion-slide:not([hidden]) h2');
  await expect(slide).toHaveText('A little escape, closer to home.');
  await page.getByRole('button',{name:'Pause slideshow'}).click();
  await page.locator('main').focus();
  await page.clock.fastForward(20000);
  await expect(slide).toHaveText('A little escape, closer to home.');
  await expect(page.getByRole('button',{name:'Play slideshow'})).toBeEnabled();
});

test('empty results and request failures have working recovery controls',async({page})=>{
  await page.goto('/rawatbhata/search?q=unfindable-query-for-testing');
  await expect(page.getByRole('heading',{name:'No places found this time'})).toBeVisible();
  await page.getByRole('button',{name:'Reset discovery'}).click();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(12);
  await page.route(api+'discovery_listings',route=>route.fulfill({status:403,contentType:'application/json',body:'{"code":"42501","message":"private database detail"}'}));
  if(!await page.locator('.filters-details').evaluate(details=>details.open))await page.getByText('Refine your discovery',{exact:true}).click();
  await page.getByLabel('Category',{exact:true}).selectOption('food');
  await expect(page.getByRole('heading',{name:'We couldn’t load these places'})).toBeVisible();
  await expect(page.locator('main')).not.toContainText('private database detail');
  await page.unroute(api+'discovery_listings');
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(4);
});

test('catalog setup errors and unknown categories recover without fake listings',async({page})=>{
  await home(page);
  await page.route(api+'discovery_context',route=>route.fulfill({status:404,contentType:'application/json',body:'{"code":"PGRST202","message":"private backend detail"}'}));
  await page.getByRole('link',{name:'Explore all places',exact:true}).first().click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Your local discovery is getting ready');
  await expect(page.locator('.place-card')).toHaveCount(0);
  await page.unroute(api+'discovery_context');
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(12);
  await page.goto('/rawatbhata/unknown-category');
  await expect(page.getByRole('heading',{level:1})).toHaveText('This category is not available');
  await page.getByRole('button',{name:'Explore all places',exact:true}).click();
  await expect(page.locator('.results-grid .place-card')).toHaveCount(12);
});

test('untrusted descriptions and search text render as plain text',async({page})=>{
  await home(page);
  await page.route(api+'merchant_detail',async route=>{
    const response=await route.fetch();const item=await response.json();
    item.name='<img src=x onerror="window.injected=true">';
    item.description='<script>window.injected=true</script>';
    await route.fulfill({response,json:item});
  });
  await page.locator('.place-card-link').first().click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('<img src=x onerror="window.injected=true">');
  await expect(page.locator('h1 img')).toHaveCount(0);
  await expect(page.locator('main script')).toHaveCount(0);
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  await page.unroute(api+'merchant_detail');
  await page.goto('/rawatbhata/search?q='+encodeURIComponent('<img src=x onerror="window.injected=true">'));
  await expect(page.getByRole('heading',{level:1})).toContainText('<img');
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
});

test('mobile navigation, small viewports and keyboard skip navigation remain usable',async({page},testInfo)=>{
  await home(page);
  if(testInfo.project.name==='mobile'){
    await page.getByRole('button',{name:'Open menu'}).click();
    await expect(page.locator('#main-navigation')).toBeVisible();
    await page.locator('.primary-nav').getByRole('link',{name:'Explore all',exact:true}).click();
    await expect(page.locator('#main-navigation')).not.toBeVisible();
    await expect(page.locator('.results-grid .place-card')).toHaveCount(12);
    await page.goto('/');await expect(page.locator('.listing-section')).toHaveCount(4);
  }
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('administration remains separate from public discovery and returns to it',async({page})=>{
  await page.goto('/admin/');
  await expect(page.getByRole('heading',{name:'Sign in to your workspace'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Visit public site'}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Your town, rediscovered.');
});

