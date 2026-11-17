import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeployment,verifyDeploymentBackend,deploymentInputs} from '../../scripts/deployment-config.mjs';
import {publicSecurityHeaders,PUBLIC_SECURITY_HEADERS} from '../../src/config/security-headers.js';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const publicEnv={VITE_SITE_URL:'https://shaharone.in',VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},serverEnv={SITE_URL:'https://shaharone.in',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_'+'x'.repeat(25),CHECKOUT_HMAC_SECRET:'h'.repeat(40)};

async function ciInputs(publicEnvironment,overrides={}){
  const directory=await mkdtemp(join(tmpdir(),'shaharone-deployment-'));
  try{
    await writeFile(join(directory,'wrangler.jsonc'),JSON.stringify({name:'rawatbhata-one',vars:{SITE_URL:'https://shaharone.in'}}));
    const environment={...serverEnv,...overrides};delete environment.SITE_URL;
    if(Object.hasOwn(overrides,'SITE_URL'))environment.SITE_URL=overrides.SITE_URL;
    return await deploymentInputs({directory,environment,publicEnvironment});
  }finally{await unlink(join(directory,'wrangler.jsonc'));await rmdir(directory);}
}

test('a clean Pages build reads the runtime site origin from Wrangler without ignored local files',async()=>{
  const input=await ciInputs(publicEnv);assert.deepEqual(input.errors,[]);assert.equal(input.serverEnv.SITE_URL,'https://shaharone.in');assert.equal(input.config.siteUrl,input.serverEnv.SITE_URL);
});

test('a clean Pages build with no VITE_SITE_URL names the missing Production build variable',async()=>{
  const {VITE_SITE_URL,...missing}=publicEnv,input=await ciInputs(missing);
  assert.ok(input.errors.some(message=>/Set VITE_SITE_URL.*Production build variables/.test(message)));
  assert.ok(!input.errors.join().includes(serverEnv.SUPABASE_SECRET_KEY));
});

test('build variables cannot silently override a different committed runtime site origin',async()=>{
  const input=await ciInputs({...publicEnv,VITE_SITE_URL:'https://other.example'},{SITE_URL:'https://other.example'});
  assert.ok(input.errors.some(message=>/runtime SITE_URL in wrangler/.test(message)));
});

test('URL configuration does not bypass the pending delivery migration release check',async()=>{
  const input=validateDeployment(publicEnv,serverEnv);
  await assert.rejects(verifyDeploymentBackend(input,{publicClient:{rpc:async()=>{throw Object.assign(new Error('Missing function'),{rpcCode:'PGRST202'});}},serviceClient:{}}),/migration 10 must be applied/);
});
test('single hosted preparation binds one Supabase project and rejects privileged browser configuration',()=>{
  const good=validateDeployment(publicEnv,serverEnv);assert.deepEqual(good.errors,[]);assert.equal(good.bindings.SUPABASE_PUBLISHABLE_KEY,publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
  assert.ok(validateDeployment({...publicEnv,VITE_SUPABASE_PUBLISHABLE_KEY:serverEnv.SUPABASE_SECRET_KEY},serverEnv).errors.length);
  assert.ok(validateDeployment(publicEnv,{...serverEnv,SUPABASE_URL:'https://different.supabase.co'}).errors.some(error=>error.includes('same Supabase')));
});
test('runtime credential checks never echo secrets and reject weak HMACs or malformed service keys',()=>{
  for(const altered of [{SUPABASE_SECRET_KEY:'bad'},{CHECKOUT_HMAC_SECRET:'short'},{ANALYTICS_HMAC_SECRET:'short'}]){const result=validateDeployment(publicEnv,{...serverEnv,...altered});assert.ok(result.errors.length);assert.ok(!result.errors.join().includes(serverEnv.SUPABASE_SECRET_KEY));}
});
test('single hosted preparation reuses the existing project and requires a matching explicit HTTPS canonical origin',()=>{
  assert.ok(validateDeployment(publicEnv,{...serverEnv,SITE_URL:''}).errors.length);
  const livePublic={...publicEnv,VITE_SITE_URL:'https://example.com'},liveServer={...serverEnv,SITE_URL:'https://example.com'};
  assert.deepEqual(validateDeployment(livePublic,liveServer).errors,[]);
  assert.deepEqual(validateDeployment({...livePublic,VITE_SUPABASE_URL:'https://qyzcvmghhwxctwlaqhrq.supabase.co'},{...liveServer,SUPABASE_URL:'https://qyzcvmghhwxctwlaqhrq.supabase.co'}).errors,[]);
});

test('deployment matching rejects suffix hosts, ports, unsafe origins and different site URLs',()=>{
  for(const url of ['https://fixture.supabase.co.unrelated.example','https://fixture.supabase.co:8443','https://fixture.supabase.co/path']){
    assert.ok(validateDeployment({...publicEnv,VITE_SUPABASE_URL:url},serverEnv).errors.length);
  }
  for(const site of ['http://localhost:5173','https://other.example','https://shaharone.in/path'])assert.ok(validateDeployment(publicEnv,{...serverEnv,SITE_URL:site}).errors.length);
  assert.deepEqual(validateDeployment({...publicEnv,VITE_SUPABASE_URL:'https://fixture.supabase.co:443'},serverEnv).errors,[]);
});

test('public readiness does not mask an invalid or revoked server credential',async()=>{
  const input=validateDeployment(publicEnv,serverEnv),publicClient={cities:async()=>({cities:[{id:'fixture',slug:'town'}]}),rpc:async name=>name==='merchant_is_food'?false:name==='discovery_context'?{city:{id:'fixture',slug:'town'},has_demo_content:true}:name==='discovery_home'?{sections:[]}:{pages:0,total:0}};
  await assert.rejects(verifyDeploymentBackend(input,{publicClient,serviceClient:{rpc:async()=>({error:{message:'Invalid private credential'}})}}),/server credential/);
  const result=await verifyDeploymentBackend(input,{publicClient,serviceClient:{rpc:async()=>({data:false,error:null})}});assert.equal(result.server_credential,'verified');
  const missingHome={...publicClient,rpc:async name=>name==='discovery_home'?null:publicClient.rpc(name)};
  await assert.rejects(verifyDeploymentBackend(input,{publicClient:missingHome,serviceClient:{rpc:async()=>({data:false,error:null})}}),/homepage query/);
  await assert.rejects(verifyDeploymentBackend({...input,indexingEnabled:true},{publicClient,serviceClient:{rpc:async()=>({data:false,error:null})}}),/sitemap content/);
  await assert.rejects(verifyDeploymentBackend(input,{publicClient:{...publicClient,cities:async()=>({cities:[]})},serviceClient:{rpc:async()=>({data:false,error:null})}}),/city selector/);
});
test('custom Supabase CSP sources are exact validated origins and never accept executable or injected values',()=>{
  const headers=publicSecurityHeaders({SUPABASE_URL:'https://database.example.com'});assert.ok(headers['Content-Security-Policy'].includes('https://database.example.com'));assert.ok(!headers['Content-Security-Policy'].includes("'unsafe-inline'"));
  for(const url of ['javascript:alert(1)','https://example.com/path',"https://example.com\nscript-src *"])assert.equal(publicSecurityHeaders({SUPABASE_URL:url})['Content-Security-Policy'],PUBLIC_SECURITY_HEADERS['Content-Security-Policy']);
});
