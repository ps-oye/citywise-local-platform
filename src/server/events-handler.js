import {clientFingerprint} from './checkout-handler.js';
import {isUuid} from '../domain/discovery.js';
const types=new Set(['listing_view','phone_click','directions_click','whatsapp_click','ad_visible_impression','ad_click']);
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const response=(status,body,extra={})=>new Response(body?JSON.stringify(body):null,{status,headers:{...headers,...extra}});
async function readBody(request){
  if(Number(request.headers.get('content-length'))>8192)throw new RangeError();
  const reader=request.body?.getReader();if(!reader)throw new Error();
  const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new RangeError();}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function handleEvents(request,{client,identity,secret,enabled=true,now}={}){
  if(request.method!=='POST')return response(405,{code:'method_not_allowed'},{Allow:'POST'});
  if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return response(403,{code:'origin_rejected'});
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response(415,{code:'json_required'});
  if(!enabled||request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1'||/bot\b|crawler|spider|headless/i.test(request.headers.get('user-agent')||''))return response(204);
  let body;
  try{body=await readBody(request);}catch(error){return response(error instanceof RangeError?413:400,{code:'invalid_events'});}
  if(!body||Array.isArray(body)||Object.keys(body).length!==1||!Array.isArray(body.events)||!body.events.length||body.events.length>20||body.events.some(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==3||!isUuid(item.event_key)||!types.has(item.event_type))return true;
    return item.event_type.startsWith('ad_')?!isUuid(item.advertisement_id)||'listing_id' in item:!isUuid(item.listing_id)||'advertisement_id' in item;
  }))return response(400,{code:'invalid_events'});
  if(!client)return response(503,{code:'events_unavailable'});
  if(typeof secret!=='string'||secret.length<32)return response(503,{code:'events_unavailable'});
  try{
    const hash=await clientFingerprint(identity,secret+'\nanalytics',now);
    const budget=await client.rpc('analytics_consume_limit',{p_client_hash:hash,p_count:body.events.length});
    if(budget.error)throw new Error();if(!budget.data?.allowed)return response(429,{code:'rate_limited'},{'Retry-After':String(budget.data?.retry_after||60)});
    const result=await client.rpc('analytics_record_events',{p_events:body.events});
    if(result.error)return response(result.error.code==='22023'||result.error.code==='22P02'?400:503,{code:result.error.code==='22023'?'invalid_events':'events_unavailable'});
    return response(202,{accepted:Number(result.data?.accepted||0)});
  }catch{return response(503,{code:'events_unavailable'});}
}
