// Test-only PostgREST-shaped adapter backed by the actual SQL migrations/RLS/seed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, asRole, ADMIN_ID, OTHER_ID } from './database.js';
const db = await createTestDatabase();
const fixturePort=Number(process.env.FIXTURE_PORT)||54329;
await db.exec(await readFile('supabase/seeds/discovery-demo.sql', 'utf8'));
await db.exec(await readFile('supabase/seeds/merchant-demo.sql','utf8'));
await db.exec(await readFile('tests/fixtures/merchant-checkout.sql','utf8'));
const trustedKey='server_only_phase3_fixture_key';
// Isolated fake Auth transport only. Every privilege check still executes the real SQL/RLS.
const users=[{id:ADMIN_ID,email:'admin@example.test'},{id:OTHER_ID,email:'viewer@example.test'}];
const accessTokens=new Map(),refreshTokens=new Map(),objects=new Map(),signedTokens=new Map();
function authSession(user) {
  const token=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,session_id:randomUUID()})).toString('base64url'),'isolated_fixture_signature'].join('.');
  const refresh=randomUUID();accessTokens.set(token,user);refreshTokens.set(refresh,user);
  return {access_token:token,refresh_token:refresh,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{...user,aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}}};
}
async function jsonBody(request,max=100000){let body='';for await(const chunk of request){body+=chunk;if(body.length>max)throw new Error('Payload too large');}return JSON.parse(body||'{}');}
const definitions = {
  discovery_context: { args: ['p_city_slug'], defaults: [null] },
  discovery_home: { args: ['p_city_id','p_locality_id','p_offset','p_limit'], defaults: [null,null,0,4] },
  discovery_listings: { args: ['p_city_id','p_category_id','p_locality_id','p_query','p_sort','p_offset','p_limit','p_facets'], defaults: [null,null,null,'','recommended',0,12,{}] },
  discovery_preview: { args: ['p_listing_id'], defaults: [null] },
  merchant_detail:{args:['p_city_slug','p_category_slug','p_listing_slug'],defaults:[null,null,null]},
  merchant_products:{args:['p_merchant_id','p_query','p_category_id','p_dietary','p_available_only','p_sort','p_offset','p_limit'],defaults:[null,'',null,'',false,'featured',0,12]},
  merchant_cart_quote:{args:['p_merchant_id','p_items','p_fulfilment'],defaults:[null,[],'enquiry']},
  merchant_availability:{args:['p_listing_id','p_at'],defaults:[null,new Date().toISOString()]},
  checkout_consume_limit:{args:['p_client_hash','p_merchant_id'],defaults:[null,null],service:true},
  checkout_initiate:{args:['p_merchant_id','p_items','p_fulfilment','p_instructions','p_quote_token','p_idempotency_key'],defaults:[null,[],'enquiry','','',null],service:true},
  checkout_mark_handoff:{args:['p_idempotency_key','p_request_hash'],defaults:[null,null],service:true},
  is_admin:{args:[],defaults:[]},
  seo_sitemap_index:{args:[],defaults:[]},
  seo_sitemap_page:{args:['p_page'],defaults:[0]},
  public_media:{args:['p_id'],defaults:[null]},
  analytics_consume_limit:{args:['p_client_hash','p_count'],defaults:[null,1],service:true},
  analytics_record_events:{args:['p_events'],defaults:[[]],service:true},
};
const adminFunctions=(await db.query("select proname,proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'admin_%'")).rows;
for(const fn of adminFunctions)definitions[fn.proname]={args:fn.proargnames,defaults:fn.proargnames.map(()=>null)};
const server = createServer(async (request,response) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ['http://127.0.0.1:5173','http://127.0.0.1:4173','http://127.0.0.1:8788'].includes(request.headers.origin) ? request.headers.origin : 'http://127.0.0.1:5173',
    'Access-Control-Allow-Headers': request.headers['access-control-request-headers'] || 'apikey,authorization,x-client-info,content-type,accept,prefer,content-profile,accept-profile',
    'Access-Control-Allow-Methods': 'POST,GET,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  if(request.method==='OPTIONS'){response.writeHead(204,headers);response.end();return;}
  const url=new URL(request.url,'http://127.0.0.1:'+fixturePort);
  const bearer=request.headers.authorization?.replace(/^Bearer /,''),authenticated=accessTokens.get(bearer);
  if(url.pathname.startsWith('/auth/v1/')){
    try{
      if(url.pathname==='/auth/v1/token'&&request.method==='POST'){
        const body=await jsonBody(request,2048),user=url.searchParams.get('grant_type')==='refresh_token'?refreshTokens.get(body.refresh_token):body.password==='Isolated-fixture-pass-42!'?users.find(user=>user.email===body.email):null;
        if(!user){response.writeHead(400,headers);response.end('{"error_code":"invalid_credentials","message":"Invalid login credentials"}');return;}
        response.writeHead(200,headers);response.end(JSON.stringify(authSession(user)));return;
      }
      if(url.pathname==='/auth/v1/user'&&request.method==='GET'&&authenticated){response.writeHead(200,headers);response.end(JSON.stringify({...authenticated,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}}));return;}
      if(url.pathname==='/auth/v1/logout'&&authenticated){accessTokens.delete(bearer);response.writeHead(204,headers);response.end();return;}
      response.writeHead(403,headers);response.end('{"error_code":"not_authorized","message":"Not authorized"}');
    }catch{response.writeHead(400,headers);response.end('{}');}return;
  }
  if(request.url==='/health'){response.writeHead(200,headers);response.end('{"ready":true}');return;}
  if(request.url?.startsWith('/__test/')){
    if(request.headers['x-fixture-control']!=='phase3_isolated_control'){response.writeHead(403,headers);response.end('{}');return;}
    try{
      let result;
      if(request.url==='/__test/checkouts'&&request.method==='GET')result=(await db.query('select reference,idempotency_key,state,total_minor,merchant_id from private.checkout_intents order by created_at')).rows;
      else if(url.pathname==='/__test/events'&&request.method==='GET')result=(await db.query('select event_key,event_type,listing_id,advertisement_id,created_at from private.analytics_events order by created_at,id')).rows;
      else if(url.pathname==='/__test/reset-event-limits'&&request.method==='POST'){await db.exec('delete from private.analytics_rate_limits');result={ok:true};}
      else if(request.url==='/__test/reset-limits'&&request.method==='POST'){await db.exec('delete from private.checkout_rate_limits');result={ok:true};}
      else if(request.url==='/__test/admin-access'&&request.method==='POST'){const input=await jsonBody(request,1024);await db.query('update private.admin_users set active=$1',[input.active===true]);result={ok:true};}
      else if(request.url==='/__test/media'&&request.method==='GET')result=(await db.query('select name,bucket_id,owner_id from storage.objects')).rows;
      else if(/^\/__test\/products\/[a-f0-9-]{36}$/.test(request.url)&&request.method==='POST'){
        let body='';for await(const chunk of request){body+=chunk;if(body.length>1024)throw new Error('Too large');}
        const input=JSON.parse(body);const id=request.url.split('/').at(-1);
        await db.query('update public.products set price_minor=coalesce($1,price_minor),original_price_minor=null,available=coalesce($2,available) where id=$3',[input.price_minor??null,input.available??null,id]);result={ok:true};
      }else{response.writeHead(404,headers);response.end('{}');return;}
      response.writeHead(200,headers);response.end(JSON.stringify(result));
    }catch{response.writeHead(400,headers);response.end('{}');}return;
  }
  if(url.pathname.startsWith('/storage/v1/')){
    try{
      const parts=url.pathname.split('/').slice(3),role=authenticated?'authenticated':'anon',uid=authenticated?.id;
      if(parts[0]==='object'&&parts[1]==='authenticated'&&request.method==='GET'){
        const bucket=parts[2],path=parts.slice(3).join('/');
        const allowed=await asRole(db,role,uid,tx=>tx.query('select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path]));
        const bytes=objects.get(bucket+'/'+path);if(!allowed.rows.length||!bytes)throw new Error('Image not found');
        response.writeHead(200,{...headers,'Content-Type':'image/webp'});response.end(bytes);return;
      }
      if(parts[0]==='object'&&parts[1]==='sign'){
        const bucket=parts[2],path=parts.slice(3).join('/');
        if(request.method==='GET'){
          const signed=signedTokens.get(url.searchParams.get('token')),bytes=objects.get(bucket+'/'+path);
          if(!signed||signed.bucket!==bucket||signed.path!==path||signed.expiry<Date.now()||!bytes)throw new Error('Image not found');
          response.writeHead(200,{...headers,'Content-Type':'image/webp'});response.end(bytes);return;
        }
        const input=await jsonBody(request),results=[];
        for(const path of input.paths){
          const rows=await asRole(db,role,uid,tx=>tx.query('select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path]));
          if(!rows.rows.length){results.push({path,error:'Access denied',signedURL:null});continue;}
          const token=randomUUID();signedTokens.set(token,{bucket,path,expiry:Date.now()+Math.min(input.expiresIn,60)*1000});results.push({path,error:null,signedURL:'/object/sign/'+bucket+'/'+path+'?token='+token});
        }
        response.writeHead(200,headers);response.end(JSON.stringify(results));return;
      }
      if(parts[0]!=='object')throw new Error('Unsupported storage operation');
      const bucket=parts[1],path=parts.slice(2).join('/');
      if(request.method==='POST'&&path){
        const chunks=[];let total=0;for await(const chunk of request){total+=chunk.length;if(total>5*1024*1024)throw new Error('Too large');chunks.push(chunk);}
        const result=await asRole(db,role,uid,tx=>tx.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4) returning id',[bucket,path,uid||null,{mimetype:request.headers['content-type'],size:total}]));
        objects.set(bucket+'/'+path,Buffer.concat(chunks));response.writeHead(200,headers);response.end(JSON.stringify({Id:result.rows[0].id,Key:bucket+'/'+path}));return;
      }
      if(request.method==='DELETE'&&!path){
        const input=await jsonBody(request),result=await asRole(db,role,uid,tx=>tx.query('delete from storage.objects where bucket_id=$1 and name=any($2::text[]) returning name',[bucket,input.prefixes]));
        for(const item of result.rows)objects.delete(bucket+'/'+item.name);response.writeHead(200,headers);response.end(JSON.stringify(result.rows));return;
      }
      throw new Error('Unsupported storage operation');
    }catch(error){response.writeHead(400,headers);response.end(JSON.stringify({statusCode:'400',error:'StorageError',message:error.message}));}return;
  }
  const name=request.url?.split('?')[0].split('/').at(-1);
  const definition=definitions[name];
  if(request.method!=='POST' || !request.url.startsWith('/rest/v1/rpc/') || !definition){response.writeHead(404,headers);response.end('{"code":"PGRST202","message":"Fixture endpoint not found"}');return;}
  if(definition.service&&request.headers.apikey!==trustedKey){response.writeHead(403,headers);response.end('{"code":"42501","message":"Permission denied"}');return;}
  try {
    const input=await jsonBody(request,name==='admin_prepare_import'?2*1024*1024:100000);
    const values=definition.args.map((arg,i)=>input[arg]===undefined?definition.defaults[i]:input[arg]);
    const placeholders=values.map((_,i)=>'$'+(i+1)).join(',');
    const result=await asRole(db,definition.service?'service_role':authenticated?'authenticated':'anon',authenticated?.id||null,tx=>tx.query('select public.'+name+'('+placeholders+') result',values));
    response.writeHead(200,headers);response.end(JSON.stringify(result.rows[0].result));
  } catch(error) { response.writeHead(400,headers);response.end(JSON.stringify({code:error.code || 'FIXTURE_ERROR',message:error.message})); }
});
server.listen(fixturePort,'127.0.0.1',()=>console.log('Isolated discovery fixture API ready on 127.0.0.1:'+fixturePort));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

