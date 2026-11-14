import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyToMinor,slugify,localDateTime,adminError} from '../../src/domain/admin.js';
import {validateWebP,inputDimensions,stripWebPMetadata} from '../../src/domain/admin-media.js';
import {handleAdminMedia} from '../../src/server/admin-media-handler.js';
import {createAdminSession} from '../../src/services/admin-session.js';
import {createSupabaseClient} from '../../src/data/supabase-client.js';
import {readEnvironment} from '../../src/config/environment.js';
const ID='20000000-0000-4000-8000-000000000001';
function image(width=32,height=24){const data=new Uint8Array(30);data.set(Buffer.from('RIFF'),0);new DataView(data.buffer).setUint32(4,22,true);data.set(Buffer.from('WEBPVP8 '),8);new DataView(data.buffer).setUint32(16,10,true);data.set([0,0,0,157,1,42,width&255,width>>8,height&255,height>>8],20);return data;}
function mocks({allowed=true,valid=true,attachError=false}={}){
  const calls=[];return {calls,client:{auth:{getUser:async token=>{calls.push(['getUser',token]);return {data:{user:valid?{id:ID}:null},error:null};}},rpc:async(name,args)=>{calls.push([name,args]);return name==='is_admin'?{data:allowed}:name==='admin_attach_media'?{data:{id:ID},error:typeof attachError==='object'?attachError:attachError?{code:'23503',message:'Not found'}:null}:{data:{bucket:'listing-media',path:ID+'/remove.webp'}};},storage:{from:bucket=>({upload:async(path,data,options)=>{calls.push(['upload',bucket,path,data.byteLength,options]);return {data:{path}};},remove:async(paths)=>{calls.push(['remove',bucket,paths]);return {data:[]};}})}}};
}
const token='isolated_test_access_token';
function request(body,extra={}){return new Request('http://localhost/api/admin/media',{method:'POST',headers:{Authorization:'Bearer '+token,...extra},body});}
function upload(bytes=image()){const form=new FormData();form.set('image',new Blob([bytes],{type:'image/webp'}),'photo.webp');form.set('entity','listing');form.set('entity_id',ID);form.set('role','banner');form.set('alt_text','A licensed business photograph');return form;}
test('admin prices preserve exact minor units, slugs normalize and schedules use the selected timezone',()=>{
  assert.equal(moneyToMinor('19.99'),1999);assert.equal(moneyToMinor('0'),0);assert.equal(moneyToMinor(''),null);for(const input of ['1.001','-1','1e3','1,000','NaN'])assert.throws(()=>moneyToMinor(input));assert.equal(slugify(' Café & Stays '),'cafe-stays');assert.equal(localDateTime('2026-11-12T00:00:00Z','Asia/Kolkata'),'2026-11-12T05:30');assert.match(adminError({code:'40001',message:'ADMIN_STALE_RECORD'}),/Reload/);
});
test('canonical image containers reject metadata, animation, bad lengths, malformed dimensions and huge input headers',()=>{
  assert.deepEqual(validateWebP(image()),{width:32,height:24});assert.throws(()=>validateWebP(image(1601,20)),/1600/);
  for(const mutate of [data=>data[4]=1,data=>data[20]=1,data=>data[8]=0,data=>data[16]=11,data=>data[26]=0]){const bytes=image();mutate(bytes);assert.throws(()=>validateWebP(bytes));}
  const metadata=new Uint8Array(40);metadata.set(image());metadata.set(Buffer.from('EXIF'),30);new DataView(metadata.buffer).setUint32(4,32,true);new DataView(metadata.buffer).setUint32(34,2,true);assert.throws(()=>validateWebP(metadata),/metadata/);
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set(Buffer.from('IHDR'),12);new DataView(png.buffer).setUint32(16,100);new DataView(png.buffer).setUint32(20,50);assert.deepEqual(inputDimensions(png,'image/png'),{width:100,height:50});assert.throws(()=>inputDimensions(new Uint8Array(30),'image/jpeg'));
});
test('media endpoint rejects anonymous, wrong-origin and ordinary authenticated users before any storage write',async()=>{
  assert.equal((await handleAdminMedia(new Request('http://localhost/api/admin/media',{method:'POST'}))).status,401);
  const mock=mocks({allowed:false});assert.equal((await handleAdminMedia(request(upload()),{createClientForUser:()=>mock.client})).status,403);assert.equal(mock.calls.some(call=>call[0]==='upload'),false);
  assert.equal((await handleAdminMedia(request(upload(),{Origin:'https://attacker.example'}),{createClientForUser:()=>mock.client})).status,403);
  const revoked=mocks({valid:false});assert.equal((await handleAdminMedia(request(upload()),{createClientForUser:()=>revoked.client})).status,401);assert.equal(revoked.calls.some(call=>call[0]==='is_admin'),false);
});
test('browser-generated ICC profiles are removed before strict server validation',()=>{
  const data=new Uint8Array(58);data.set(image().subarray(0,12));new DataView(data.buffer).setUint32(4,50,true);data.set(Buffer.from('VP8X'),12);new DataView(data.buffer).setUint32(16,10,true);data[20]=32;data[24]=31;data[27]=23;data.set(Buffer.from('ICCP'),30);new DataView(data.buffer).setUint32(34,2,true);data.set(image().subarray(12),40);
  assert.throws(()=>validateWebP(data),/metadata/);const stripped=stripWebPMetadata(data);assert.equal(stripped.length,48);assert.deepEqual(validateWebP(stripped),{width:32,height:24});assert.equal(stripped[20],0);
});
test('media endpoint verifies the caller JWT, uploads with the user client and attaches metadata',async()=>{
  const mock=mocks();let passedToken;
  const result=await handleAdminMedia(request(upload()),{createClientForUser:(env,caller)=>{passedToken=caller;return mock.client;}});
  assert.equal(result.status,201);assert.equal(passedToken,token);assert.equal(mock.calls[0][0],'getUser');assert.equal(mock.calls[1][0],'is_admin');
  const stored=mock.calls.find(call=>call[0]==='upload');assert.equal(stored[1],'listing-media');assert.match(stored[2],new RegExp('^'+ID+'/[a-f0-9-]{36}\\.webp$'));assert.equal(stored[4].upsert,false);
  assert.equal(mock.calls.find(call=>call[0]==='admin_attach_media')[1].p_data.object_path,stored[2]);
});
test('media endpoint cleans up a failed attachment and rejects bad content and oversized bodies',async()=>{
  const mock=mocks({attachError:true});assert.equal((await handleAdminMedia(request(upload()),{createClientForUser:()=>mock.client})).status,400);assert.ok(mock.calls.some(call=>call[0]==='remove'));
  const invalid=mocks();const bad=image();bad[4]=0;assert.equal((await handleAdminMedia(request(upload(bad)),{createClientForUser:()=>invalid.client})).status,400);assert.equal(invalid.calls.some(call=>call[0]==='upload'),false);
  assert.equal((await handleAdminMedia(request('x',{'Content-Type':'multipart/form-data; boundary=test','Content-Length':String(6*1024*1024)}),{createClientForUser:()=>invalid.client})).status,413);
});
test('image removal detaches references before deleting storage, and is reauthorized each time',async()=>{
  const mock=mocks();const result=await handleAdminMedia(request(JSON.stringify({action:'remove',entity:'listing',entity_id:ID,media_id:ID}),{'Content-Type':'application/json'}),{createClientForUser:()=>mock.client});assert.equal(result.status,200);assert.deepEqual(mock.calls.map(call=>call[0]),['getUser','is_admin','admin_remove_media','remove']);
});
test('an ambiguous attachment timeout never deletes a possibly committed image',async()=>{
  const mock=mocks({attachError:{code:'',message:'Fetch timed out'}});const response=await handleAdminMedia(request(upload()),{createClientForUser:()=>mock.client});assert.equal(response.status,400);assert.match((await response.json()).message,/Reload/);assert.equal(mock.calls.some(call=>call[0]==='remove'),false);
});
test('admin auth callbacks are synchronous, simultaneous checks coalesce and role revocation clears access',async()=>{
  const previous=globalThis.document;globalThis.document=new EventTarget();document.visibilityState='visible';
  let callback,allowed=true,current={id:ID,email:'admin@example.test'},calls=0;const changes=[];
  const client={auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};},getUser:async()=>{calls++;return {data:{user:current}};},signInWithPassword:async()=>{current={id:ID};assert.equal(callback('SIGNED_IN'),undefined);return {data:{}};},signOut:async()=>{current=null;callback('SIGNED_OUT');return {};},getSession:async()=>({data:{session:{access_token:token}}})},rpc:async()=>({data:allowed})};
  const session=createAdminSession(client,state=>changes.push(state));
  try{
    await session.start();const start=calls;await Promise.all([session.verify(),session.verify(),session.verify()]);assert.equal(calls,start+1);assert.equal(changes.at(-1).user.id,ID);
    await session.signIn('admin@example.test','test-only');assert.equal(await session.token(),token);allowed=false;assert.equal(await session.verify(),false);assert.equal(changes.at(-1).user,null);await session.signOut();assert.equal(changes.at(-1).user,null);
  }finally{session.destroy();globalThis.document=previous;}
});
test('admin and public SDK clients keep authentication storage isolated',async()=>{
  const config=readEnvironment({VITE_SUPABASE_URL:'http://127.0.0.1:54329',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}),values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const admin=createSupabaseClient(config,{admin:true,storage}),visitor=createSupabaseClient(config);
  assert.equal(admin.auth.persistSession,true);assert.equal(admin.auth.storage,storage);assert.equal(visitor.auth.persistSession,false);assert.notEqual(visitor.auth.storage,storage);admin.auth.stopAutoRefresh();visitor.auth.stopAutoRefresh();
});
