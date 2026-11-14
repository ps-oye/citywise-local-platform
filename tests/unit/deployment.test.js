import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeployment,verifyDeploymentBackend} from '../../scripts/deployment-config.mjs';
import {publicSecurityHeaders,PUBLIC_SECURITY_HEADERS} from '../../src/config/security-headers.js';
const publicEnv={VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},serverEnv={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_'+'x'.repeat(25),CHECKOUT_HMAC_SECRET:'h'.repeat(40)};
test('preview preparation binds one Supabase project and rejects privileged browser configuration',()=>{
  const good=validateDeployment(publicEnv,serverEnv);assert.deepEqual(good.errors,[]);assert.equal(good.bindings.SUPABASE_PUBLISHABLE_KEY,publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
  assert.ok(validateDeployment({...publicEnv,VITE_SUPABASE_PUBLISHABLE_KEY:serverEnv.SUPABASE_SECRET_KEY},serverEnv).errors.length);
  assert.ok(validateDeployment(publicEnv,{...serverEnv,SUPABASE_URL:'https://different.supabase.co'}).errors.some(error=>error.includes('same Supabase')));
});
test('runtime credential checks never echo secrets and reject weak HMACs or malformed service keys',()=>{
  for(const altered of [{SUPABASE_SECRET_KEY:'bad'},{CHECKOUT_HMAC_SECRET:'short'},{ANALYTICS_HMAC_SECRET:'short'}]){const result=validateDeployment(publicEnv,{...serverEnv,...altered});assert.ok(result.errors.length);assert.ok(!result.errors.join().includes(serverEnv.SUPABASE_SECRET_KEY));}
});
test('production preparation requires a distinct project and matching explicit HTTPS canonical origin',()=>{
  assert.ok(validateDeployment(publicEnv,serverEnv,{mode:'production'}).errors.length);
  const livePublic={...publicEnv,VITE_SITE_URL:'https://example.com'},liveServer={...serverEnv,SITE_URL:'https://example.com',PRODUCTION_SUPABASE_PROJECT_REF:'fixture'};
  assert.deepEqual(validateDeployment(livePublic,liveServer,{mode:'production'}).errors,[]);
  assert.ok(validateDeployment({...livePublic,VITE_SUPABASE_URL:'https://qyzcvmghhwxctwlaqhrq.supabase.co'},{...liveServer,SUPABASE_URL:'https://qyzcvmghhwxctwlaqhrq.supabase.co',PRODUCTION_SUPABASE_PROJECT_REF:'qyzcvmghhwxctwlaqhrq'},{mode:'production'}).errors.some(error=>error.includes('reserved')));
});

test('production project selection rejects hostname suffixes, injected refs and non-default ports',()=>{
  for(const [ref,origin] of [
    ['fixture','https://fixture.supabase.co.unrelated.example'],
    ['fixture','https://fixture.supabase.co:8443'],
    ['fixture.supabase.co.unrelated.example','https://fixture.supabase.co.unrelated.example.supabase.co'],
    ['fixture/path','https://fixture.supabase.co'],
    [42,'https://42.supabase.co'],
  ]){
    const result=validateDeployment({...publicEnv,VITE_SUPABASE_URL:origin,VITE_SITE_URL:'https://example.com'},
      {...serverEnv,SUPABASE_URL:origin,SITE_URL:'https://example.com',PRODUCTION_SUPABASE_PROJECT_REF:ref},{mode:'production'});
    assert.ok(result.errors.some(error=>error.includes('production Supabase project')),String(ref)+' must reject '+origin);
  }
  const explicitDefault=validateDeployment({...publicEnv,VITE_SUPABASE_URL:'https://fixture.supabase.co:443',VITE_SITE_URL:'https://example.com'},
    {...serverEnv,SUPABASE_URL:'https://fixture.supabase.co',SITE_URL:'https://example.com',PRODUCTION_SUPABASE_PROJECT_REF:'fixture'},{mode:'production'});
  assert.deepEqual(explicitDefault.errors,[]);
});
test('public readiness does not mask an invalid or revoked server credential',async()=>{
  const input=validateDeployment(publicEnv,serverEnv),publicClient={rpc:async name=>name==='discovery_context'?{city:{id:'fixture',slug:'town'},has_demo_content:true}:name==='discovery_home'?{sections:[]}:{pages:0,total:0}};
  await assert.rejects(verifyDeploymentBackend(input,{publicClient,serviceClient:{rpc:async()=>({error:{message:'Invalid private credential'}})}}),/server credential/);
  const result=await verifyDeploymentBackend(input,{publicClient,serviceClient:{rpc:async()=>({data:false,error:null})}});assert.equal(result.server_credential,'verified');
  const missingHome={rpc:async name=>name==='discovery_home'?null:publicClient.rpc(name)};
  await assert.rejects(verifyDeploymentBackend(input,{publicClient:missingHome,serviceClient:{rpc:async()=>({data:false,error:null})}}),/homepage query/);
  await assert.rejects(verifyDeploymentBackend({...input,mode:'production'},{publicClient,serviceClient:{rpc:async()=>({data:false,error:null})}}),/production content/);
});
test('custom Supabase CSP sources are exact validated origins and never accept executable or injected values',()=>{
  const headers=publicSecurityHeaders({SUPABASE_URL:'https://database.example.com'});assert.ok(headers['Content-Security-Policy'].includes('https://database.example.com'));assert.ok(!headers['Content-Security-Policy'].includes("'unsafe-inline'"));
  for(const url of ['javascript:alert(1)','https://example.com/path',"https://example.com\nscript-src *"])assert.equal(publicSecurityHeaders({SUPABASE_URL:url})['Content-Security-Policy'],PUBLIC_SECURITY_HEADERS['Content-Security-Policy']);
});
