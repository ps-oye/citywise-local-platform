import {readFile,readdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {loadEnv} from 'vite';
import {readEnvironment,parseOrigin} from '../src/config/environment.js';
import {publicCatalog} from '../src/server/public-catalog.js';
import {serverSupabase} from '../src/server/supabase.js';

export function validateDeployment(publicEnv,serverEnv,{mode='preview',project='rawatbhata-one'}={}){
  const config=readEnvironment(publicEnv),errors=[...config.errors];
  if(!config.configured)errors.push('Configure both public Supabase values before deployment.');
  if(!/^[a-z0-9][a-z0-9-]{0,57}$/.test(project))errors.push('Use a valid Cloudflare Pages project name.');
  if(parseOrigin(serverEnv.SUPABASE_URL||config.supabaseUrl)!==config.supabaseUrl)errors.push('Browser and server must use the same Supabase project.');
  const key=serverEnv.SUPABASE_SECRET_KEY||serverEnv.SUPABASE_SERVICE_ROLE_KEY||'';
  let privileged=/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key);
  try{privileged||=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString()).role==='service_role';}catch{/* No credential values are printed. */}
  if(!privileged)errors.push('A valid server-only Supabase secret/service-role key is required.');
  if(typeof serverEnv.CHECKOUT_HMAC_SECRET!=='string'||serverEnv.CHECKOUT_HMAC_SECRET.length<32)errors.push('CHECKOUT_HMAC_SECRET must contain at least 32 characters.');
  if(serverEnv.ANALYTICS_HMAC_SECRET&&(typeof serverEnv.ANALYTICS_HMAC_SECRET!=='string'||serverEnv.ANALYTICS_HMAC_SECRET.length<32))errors.push('ANALYTICS_HMAC_SECRET must contain at least 32 characters when supplied.');
  if(mode==='production'){
    const site=parseOrigin(serverEnv.SITE_URL||config.siteUrl||'');
    if(!site?.startsWith('https://')||site!==config.siteUrl)errors.push('Production SITE_URL must match the HTTPS VITE_SITE_URL used by the build.');
    const projectRef=serverEnv.PRODUCTION_SUPABASE_PROJECT_REF;
    if(typeof projectRef!=='string'||!/^[a-z0-9]+$/.test(projectRef)||config.supabaseUrl!=='https://'+projectRef+'.supabase.co')errors.push('Select the intended separate production Supabase project explicitly.');
    if(config.supabaseUrl?.includes('qyzcvmghhwxctwlaqhrq.'))errors.push('The existing development database is reserved for preview deployment.');
  }
  const bindings={SUPABASE_URL:config.supabaseUrl||'',SUPABASE_PUBLISHABLE_KEY:config.supabaseKey,
    ...(serverEnv.SUPABASE_SECRET_KEY?{SUPABASE_SECRET_KEY:serverEnv.SUPABASE_SECRET_KEY}:{SUPABASE_SERVICE_ROLE_KEY:key}),CHECKOUT_HMAC_SECRET:serverEnv.CHECKOUT_HMAC_SECRET||''};
  if(serverEnv.ANALYTICS_HMAC_SECRET)bindings.ANALYTICS_HMAC_SECRET=serverEnv.ANALYTICS_HMAC_SECRET;
  return {errors,config,bindings,project,mode};
}
export async function deploymentInputs(mode='preview'){
  let privateVars={};try{privateVars=parseEnv(await readFile('.dev.vars','utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Could not read server environment configuration.');}
  const publicEnv=loadEnv('production',process.cwd(),'VITE_'),serverEnv={...privateVars,...process.env};
  const wrangler=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const selected=validateDeployment(publicEnv,serverEnv,{mode,project:process.env.PAGES_PROJECT_NAME||wrangler.name});
  if(selected.project!==wrangler.name)selected.errors.push('PAGES_PROJECT_NAME must match the reviewed name in wrangler.jsonc.');
  return {...selected,serverEnv,wrangler};
}
async function filesIn(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(entry=>entry.isDirectory()?filesIn(dir+'/'+entry.name):[dir+'/'+entry.name]))).flat();}
export async function verifyDeploymentBackend(input,{publicClient=publicCatalog(input.bindings),serviceClient=serverSupabase(input.bindings)}={}){
  const [context,index,service]=await Promise.all([publicClient.rpc('discovery_context',{p_city_slug:null}),publicClient.rpc('seo_sitemap_index'),serviceClient?.rpc('is_admin')]);
  if(!context?.city||!Number.isInteger(index.pages))throw new Error('The target database needs the reviewed Phase 6 migration and city setup.');
  if(!service||service.error||typeof service.data!=='boolean')throw new Error('The configured server credential could not authenticate to the same Supabase project.');
  const home=await publicClient.rpc('discovery_home',{p_city_id:context.city.id,p_locality_id:null,p_offset:0,p_limit:4});
  if(!Array.isArray(home?.sections)||home.sections.length>4||home.sections.some(section=>!Array.isArray(section.items)||section.items.length>4))throw new Error('The public homepage query is not ready; verify the bounded Phase 6 homepage migration.');
  if(input.mode==='production'&&(context.has_demo_content||index.total<1))throw new Error('Prepare real production content and deliberately remove/reassign demo content before launch.');
  return {public_catalog:'reachable',homepage:'ready',phase6_schema:'ready',server_credential:'verified',demo_content:Boolean(context.has_demo_content)};
}
export async function checkDeployment(input,{remote=true}={}){
  if(input.errors.length)throw new Error(input.errors.join('\n'));
  const files=await filesIn('dist'),secrets=[input.bindings.SUPABASE_SECRET_KEY,input.bindings.SUPABASE_SERVICE_ROLE_KEY,input.bindings.CHECKOUT_HMAC_SECRET,input.bindings.ANALYTICS_HMAC_SECRET].filter(value=>value?.length>=16);
  for(const path of files){const bytes=await readFile(path);if(secrets.some(value=>bytes.includes(Buffer.from(value))))throw new Error('A configured server secret appears in built output.');if(/\.(?:env|sql)$|\.dev\.vars|node_modules|\/src\//i.test(path))throw new Error('A source/configuration file is present in built assets.');}
  for(const path of ['dist/index.html','dist/admin/index.html','dist/_routes.json','dist/_headers','dist/images/share-card.png'])await readFile(path);
  const routes=JSON.parse(await readFile('dist/_routes.json','utf8'));if(routes.exclude.some(path=>path==='/api/*'||path==='/robots.txt'||path==='/sitemap.xml'))throw new Error('A protected/dynamic route bypasses Pages Functions.');
  let health;
  if(remote)health=await verifyDeploymentBackend(input);
  return {mode:input.mode,project:input.project,built_files_checked:files.length,server_secret_matches:0,...health};
}
