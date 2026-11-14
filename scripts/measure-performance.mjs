// Reproducible local lab run: isolated SQL/HTTP fixtures and the actual Cloudflare Pages runtime.
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import lighthouse from 'lighthouse';
import desktop from 'lighthouse/core/config/desktop-config.js';
import {launch} from 'chrome-launcher';
const children=[],logs=new Map(),fixture={...process.env,FIXTURE_PORT:'54339',VITE_SUPABASE_URL:'http://127.0.0.1:54339',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_phase1_local_fixture',VITE_BRAND_NAME:'Rawatbhata One',VITE_SITE_URL:'',WRANGLER_SEND_METRICS:'false'};
function child(file,args,env=fixture){const processChild=spawn(process.execPath,[file,...args],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(processChild);logs.set(processChild,'');for(const stream of [processChild.stdout,processChild.stderr])stream.on('data',chunk=>logs.set(processChild,(logs.get(processChild)+chunk).slice(-12000)));return processChild;}
function completed(processChild){return new Promise((resolve,reject)=>{processChild.on('error',()=>reject(new Error('Could not launch lab process.')));processChild.on('exit',code=>code===0?resolve():reject(new Error(logs.get(processChild))));});}
async function ready(url,processChild){for(let attempt=0;attempt<100;attempt++){if(processChild.exitCode!==null)throw new Error(logs.get(processChild));try{if((await fetch(url)).ok)return;}catch{/* Wait for the owned server. */}await new Promise(resolve=>setTimeout(resolve,300));}throw new Error('Lab server did not become ready.\n'+logs.get(processChild));}
let chrome;
try{
  await mkdir('artifacts/lighthouse',{recursive:true});
  await completed(child('node_modules/vite/bin/vite.js',['build','--mode','test','--outDir','artifacts/performance-dist']));
  const database=child('tests/helpers/discovery-server.mjs',[]);await ready('http://127.0.0.1:54339/health',database);
  const runtime=child('node_modules/wrangler/bin/wrangler.js',['pages','dev','artifacts/performance-dist','--ip','127.0.0.1','--port','8788','--inspector-port','9230',
    '--binding','SUPABASE_URL=http://127.0.0.1:54339','--binding','SUPABASE_PUBLISHABLE_KEY=sb_publishable_phase1_local_fixture',
    '--binding','SUPABASE_SECRET_KEY=server_only_phase3_fixture_key','--binding','SUPABASE_SERVICE_ROLE_KEY=server_only_phase3_fixture_key',
    '--binding','CHECKOUT_HMAC_SECRET=isolated_phase3_hmac_secret_for_tests_only','--binding','ANALYTICS_ENABLED=false']);
  await ready('http://127.0.0.1:8788/qa-town/food/qa-test-kitchen',runtime);
  const probe=await fetch('http://127.0.0.1:8788/qa-town/food/qa-test-kitchen');if(!(await probe.text()).includes('QA Test Kitchen'))throw new Error('The lab did not use its isolated database.');
  const robots=await fetch('http://127.0.0.1:8788/robots.txt');if(!(await robots.text()).includes('Allow: /'))throw new Error('Pages robots route failed.');
  console.log('Cloudflare Pages runtime smoke passed using isolated fixtures.');
  chrome=await launch({chromePath:process.env.CHROME_PATH,chromeFlags:['--headless=new','--disable-dev-shm-usage']});
  const reports=[];
  for(const [name,path] of [['home','/rawatbhata'],['category','/rawatbhata/food'],['merchant','/qa-town/food/qa-test-kitchen']])for(const device of ['mobile','desktop']){
    const result=await lighthouse('http://127.0.0.1:8788'+path,{port:chrome.port,logLevel:'error',output:['json','html'],onlyCategories:['performance','accessibility','best-practices','seo']},device==='desktop'?desktop:undefined);
    if(result.lhr.runtimeError)throw new Error(result.lhr.runtimeError.message);
    const prefix='artifacts/lighthouse/'+name+'-'+device;await writeFile(prefix+'.json',result.report[0]);await writeFile(prefix+'.html',result.report[1]);
    const row={page:name,device,scores:Object.fromEntries(Object.entries(result.lhr.categories).map(([key,value])=>[key,Math.round(value.score*100)])),fcp_ms:Math.round(result.lhr.audits['first-contentful-paint'].numericValue),lcp_ms:Math.round(result.lhr.audits['largest-contentful-paint'].numericValue),cls:result.lhr.audits['cumulative-layout-shift'].numericValue};reports.push(row);console.log(JSON.stringify(row));
  }
  await writeFile('artifacts/lighthouse/summary.json',JSON.stringify({environment:'isolated local Cloudflare Pages runtime; simulated mobile/desktop; preview noindex retained',measured_at:new Date().toISOString(),reports},null,2)+'\n');
}finally{
  await chrome?.kill();for(const processChild of children.reverse())if(processChild.exitCode===null){if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(processChild.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else processChild.kill('SIGTERM');}
}
