import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {deploymentInputs,checkDeployment} from './deployment-config.mjs';
const cli='node_modules/wrangler/bin/wrangler.js';
let bindings={},cloudflareCredentials=[],selectedAccountId;
function sanitize(value){let text=String(value);for(const secret of [...Object.values(bindings),...cloudflareCredentials])if(secret?.length>=16)text=text.replaceAll(secret,'[redacted]');return text;}
function wrangler(args,input){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,...args],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...(selectedAccountId?{CLOUDFLARE_ACCOUNT_ID:selectedAccountId}:{}),WRANGLER_SEND_METRICS:'false'}});let stdout='',stderr='';
  child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',()=>reject(new Error('Could not start Wrangler.')));
  child.on('close',code=>code===0?resolve(stdout):reject(new Error(sanitize(stderr||stdout)||'Wrangler failed.')));child.stdin.end(input||'');
});}
try{
  const input=await deploymentInputs('preview');bindings=input.bindings;
  console.log(JSON.stringify(await checkDeployment(input)));
  // Credential output is captured in memory only, never printed or written to the repository.
  const auth=JSON.parse(await wrangler(['auth','token','--json']));
  cloudflareCredentials=[auth.token,auth.key].filter(Boolean);
  const authHeaders=auth.type==='api_key'?{'X-Auth-Key':auth.key,'X-Auth-Email':auth.email}:{Authorization:'Bearer '+auth.token};
  if(!cloudflareCredentials.length)throw new Error('Cloudflare login is required. Run npx wrangler login in your own browser.');
  async function api(path,{optional=false}={}){
    const result=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:authHeaders,signal:AbortSignal.timeout(15000)});
    if(optional&&result.status===404)return null;
    if(!result.ok)throw new Error('Cloudflare account/project metadata could not be verified.');
    const body=await result.json();if(!body.success)throw new Error('Cloudflare account/project metadata could not be verified.');return body.result;
  }
  selectedAccountId=process.env.CLOUDFLARE_ACCOUNT_ID;
  if(!selectedAccountId){const accounts=await api('/accounts');if(!Array.isArray(accounts)||accounts.length!==1)throw new Error('Set CLOUDFLARE_ACCOUNT_ID to the intended account before deployment.');selectedAccountId=accounts[0].id;}
  if(!/^[a-f0-9]{32}$/.test(selectedAccountId))throw new Error('The selected Cloudflare account ID is invalid.');
  const branch=process.env.PAGES_PREVIEW_BRANCH||'phase-6';if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(branch)||['main','master','production'].includes(branch))throw new Error('Choose a separate preview branch such as phase-6.');
  const projectPath='/accounts/'+selectedAccountId+'/pages/projects/'+input.project;
  let project=await api(projectPath,{optional:true});
  if(!project){await wrangler(['pages','project','create',input.project,'--production-branch','main']);project=await api(projectPath);}
  if(project?.name!==input.project||typeof project.production_branch!=='string'||project.production_branch===branch)throw new Error('The chosen branch is not a verified preview target.');
  // The pinned CLI supports the hidden global --env on Pages secrets. Only preview bindings change.
  await wrangler(['pages','secret','bulk','--project-name',input.project,'--env','preview'],JSON.stringify(bindings));
  console.log('Runtime bindings configured for the preview environment.');
  const output=await wrangler(['pages','deploy','dist','--project-name',input.project,'--branch',branch,'--commit-dirty=true']);
  const urls=output.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/g)||[],url=urls.find(url=>/^https:\/\/[a-f0-9]{8,}\./.test(url))||urls[0];
  if(!url)throw new Error('Wrangler did not return a verifiable Pages deployment URL. Inspect Cloudflare deployment status before retrying.');
  const deployment={url,project:input.project,branch,mode:'preview',indexing:false,deployed_at:new Date().toISOString()};
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/preview-deployment.json',JSON.stringify(deployment,null,2)+'\n');
  console.log(JSON.stringify(deployment,null,2));
}catch(error){console.error(sanitize(error.message));process.exitCode=1;}
