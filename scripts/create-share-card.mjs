import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
try{const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});const svg=await readFile('public/images/share-card.svg');
  await page.setContent('<!doctype html><html><body style="margin:0"><img alt="Rawatbhata One share artwork" width="1200" height="630" src="data:image/svg+xml;base64,'+svg.toString('base64')+'"></body></html>');await page.locator('img').evaluate(img=>img.decode());await page.screenshot({path:'public/images/share-card.png'});console.log('Generated the 1200 x 630 original brand share image.');
}finally{await browser.close();}
