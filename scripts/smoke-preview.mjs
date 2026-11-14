import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseOrigin} from '../src/config/environment.js';
const target=process.argv[2]||JSON.parse(await readFile('artifacts/preview-deployment.json','utf8')).url,base=parseOrigin(target);
if(!base?.startsWith('https://'))throw new Error('Use the actual HTTPS preview origin.');
const checks=[];
for(const path of ['/','/rawatbhata/food','/rawatbhata/food/demo-food','/admin/','/robots.txt','/sitemap.xml','/images/share-card.png','/rawatbhata/not-a-category']){
  const response=await fetch(base+path),type=response.headers.get('content-type'),body=type?.includes('image/')?'':await response.text();
  const expected=path.endsWith('not-a-category')?404:200;if(response.status!==expected)throw new Error(path+' returned '+response.status);
  if(['/','/rawatbhata/food','/rawatbhata/food/demo-food'].includes(path)&&(!body.includes('og:title')||!body.includes('page-structured-data')||!response.headers.get('x-robots-tag')?.includes('noindex')||!response.headers.get('content-security-policy')))throw new Error('Hosted metadata/header check failed: '+path);
  if(path==='/robots.txt'&&(!body.includes('Allow: /')||body.includes('Sitemap:')))throw new Error('Preview robots policy failed.');
  if(path==='/sitemap.xml'&&body.includes('<loc>'))throw new Error('Preview sitemap must be empty.');
  if(path==='/admin/'&&(!body.includes('noindex')||!response.headers.get('cache-control')?.includes('no-store')))throw new Error('Admin caching/indexing guard failed.');
  if(path==='/'){
    const asset=/src="(\/assets\/public-[^"]+\.js)"/.exec(body)?.[1];if(!asset)throw new Error('Missing public bundle');const reply=await fetch(base+asset);if(!reply.headers.get('cache-control')?.includes('immutable'))throw new Error('Hashed asset cache header failed.');checks.push({path:asset,status:reply.status,immutable:true});
    if(!body.includes('listing-section')||body.includes('Getting your neighbourhood ready'))throw new Error('Homepage SSR missing.');
  }
  checks.push({path,status:response.status,content_type:type,robots:response.headers.get('x-robots-tag'),cache:response.headers.get('cache-control')});
}
for(const [path,options,expected] of [
  ['/api/events',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{"events":[]}'},403],
  ['/api/events',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{"events":[]}'},400],
  ['/api/events',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',DNT:'1'},body:'{"events":[]}'},204],
  ['/api/checkout',{method:'GET'},405],
  ['/api/admin/media',{method:'POST',headers:{Origin:base,'Content-Type':'application/octet-stream'},body:'not an image'},401]]){
  const response=await fetch(base+path,options);if(response.status!==expected)throw new Error(path+' boundary returned '+response.status+' rather than '+expected);checks.push({path,status:response.status,boundary:true});
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/hosted-smoke.json',JSON.stringify({url:base,checked_at:new Date().toISOString(),checks},null,2)+'\n');
console.log(JSON.stringify({url:base,hosted_checks_passed:checks.length,database_business_writes:0}));
