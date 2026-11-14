// Read-only hosted QA. Browser privacy signals prevent optional test activity.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {parseOrigin} from '../src/config/environment.js';

const target=process.argv[2]||JSON.parse(await readFile('artifacts/preview-deployment.json','utf8')).url;
const base=parseOrigin(target);
if(!base?.startsWith('https://'))throw new Error('Use the actual HTTPS preview origin.');
const output='artifacts/phase-7';await mkdir(output,{recursive:true});
const htmlChecks=[];
async function html(path){
  const response=await fetch(base+path,{headers:{DNT:'1'},signal:AbortSignal.timeout(15000)});
  if(response.status!==200||!response.headers.get('x-robots-tag')?.includes('noindex'))throw new Error('Preview HTML/indexing check failed: '+path);
  const body=await response.text();
  if(!body.includes('<h1')||body.includes('Getting your neighbourhood ready'))throw new Error('Meaningful public HTML missing: '+path);
  htmlChecks.push({path,status:response.status});return body;
}
function bootstrap(body,id){
  const match=new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>').exec(body);
  if(!match)throw new Error('Public bootstrap missing: '+id);return JSON.parse(match[1]);
}
const home=bootstrap(await html('/'),'discovery-bootstrap'),city=home.context.city;
for(const category of home.context.categories)await html('/'+city.slug+'/'+category.slug);
const listings=new Map();let total,page=1,more=true;
while(more){
  if(page>834)throw new Error('Public pagination exceeded the bounded range.');
  const result=bootstrap(await html('/'+city.slug+'/explore'+(page>1?'?page='+page:'')),'discovery-bootstrap').listings;
  total??=result.total;if(result.total!==total)throw new Error('Catalog changed during enumeration; repeat QA against a stable preview.');
  for(const item of result.items){if(listings.has(item.id))throw new Error('Duplicate public listing across pages.');listings.set(item.id,item);}
  more=result.has_more;page++;
}
if(listings.size!==total)throw new Error('Public enumeration did not cover the reported total.');
for(const item of listings.values()){
  const path='/'+city.slug+'/'+item.category_slug+'/'+item.slug,body=await html(path),data=bootstrap(body,'merchant-bootstrap').merchant;
  if(data.id!==item.id||!body.includes('rel="canonical" href="'+base+path+'"'))throw new Error('Merchant identity/canonical mismatch: '+path);
  if(data.is_demo&&(data.actions?.checkout_enabled||data.phone_number||data.whatsapp_number||/href="(?:https:\/\/wa\.me\/|tel:)/.test(body)))throw new Error('Demo contact restriction failed: '+path);
}
console.log(JSON.stringify({public_html_checked:htmlChecks.length,categories:home.context.categories.length,merchants:listings.size}));

const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined}),browserChecks=[];
try{
  for(const width of [320,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900},extraHTTPHeaders:{DNT:'1'},reducedMotion:'reduce'});
    try{
      await context.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));
      const page=await context.newPage(),errors=[],eventRequests=[],checkoutRequests=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(request.url().endsWith('/api/events'))eventRequests.push(request.url());if(request.url().endsWith('/api/checkout'))checkoutRequests.push(request.url());});
      async function fits(){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
      async function dialogFits(locator){const box=await locator.boundingBox();expect(box).not.toBeNull();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.width).toBeLessThanOrEqual(width+1);expect(box.height).toBeLessThanOrEqual(901);await fits();}
      await page.goto(base,{waitUntil:'domcontentloaded'});await expect(page.locator('[data-search-slot] input')).toBeVisible();
      await expect(page.locator('.category-tile')).toHaveCount(home.context.categories.filter(category=>!category.parent_id).length);
      for(const section of await page.locator('.listing-section').all())expect(await section.locator('.place-card').count()).toBeLessThanOrEqual(4);
      await fits();await page.screenshot({path:output+'/hosted-home-'+width+'.png'});
      await page.locator('.place-card-link').first().click();await expect(page.locator('[data-merchant-ready]')).toBeVisible();
      await fits();await page.screenshot({path:output+'/hosted-merchant-'+width+'.png'});
      await page.locator('[data-add-product]:not(:disabled)').first().click();await page.getByRole('button',{name:'Review sample cart',exact:true}).click();
      const review=page.getByRole('dialog',{name:'Review your enquiry',exact:true});await expect(review).toBeVisible();
      await expect(review.getByRole('button',{name:'WhatsApp unavailable in demo',exact:true})).toBeDisabled();await dialogFits(review);
      await page.screenshot({path:output+'/hosted-cart-'+width+'.png'});await page.keyboard.press('Escape');await expect(review).toBeHidden();
      await page.getByRole('button',{name:'Choose your neighbourhood',exact:true}).click();
      const location=page.getByRole('dialog',{name:'Where are you exploring?',exact:true});await expect(location).toBeVisible();await dialogFits(location);
      await page.keyboard.press('Escape');await expect(location).toBeHidden();
      await page.goto(base+'/admin/');await expect(page.getByRole('heading',{name:'Sign in to your workspace',exact:true})).toBeVisible();await fits();
      expect(errors).toEqual([]);expect(eventRequests).toEqual([]);expect(checkoutRequests).toEqual([]);
      browserChecks.push({width,public_navigation:'passed',sample_cart:'passed',demo_checkout:'disabled',dialogs:'passed',admin_login_form:'present',browser_errors:0});
    }finally{await context.close();}
  }
}finally{await browser.close();}
const report={url:base,checked_at:new Date().toISOString(),categories:home.context.categories.length,merchants:listings.size,html_checks:htmlChecks,browser_checks:browserChecks,business_writes:0};
await writeFile(output+'/hosted-qa.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({url:base,public_html_checks:htmlChecks.length,browser_checks:browserChecks,business_writes:0}));
