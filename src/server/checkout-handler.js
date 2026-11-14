import { isUuid } from '../domain/discovery.js';
import { buildWhatsAppUrl } from '../domain/whatsapp.js';

const ALLOWED = new Set(['merchant_id','items','fulfilment','instructions','quote_token','idempotency_key']);
const HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'};
const reply=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{...HEADERS,...extra}});
async function readJson(request) {
  if(Number(request.headers.get('content-length'))>16384)throw new RangeError('Too large');
  const reader=request.body?.getReader();if(!reader)throw new TypeError('Missing body');
  const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new RangeError('Too large');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function clientFingerprint(identity,secret,now=new Date()) {
  if(typeof identity!=='string'||identity.length>100||!/^[0-9a-f:.]+$/i.test(identity)||typeof secret!=='string'||secret.length<32)throw new TypeError('Trusted client identity unavailable');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(now.toISOString().slice(0,10)+'\n'+identity));
  return [...new Uint8Array(signature)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export async function handleCheckout(request,{client,identity,secret,now}={}) {
  if(request.method!=='POST')return reply(405,{code:'method_not_allowed'},{Allow:'POST'});
  const origin=new URL(request.url).origin;
  if(request.headers.get('origin')!==origin || request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{code:'origin_rejected'});
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,{code:'json_required'});
  let body;
  try{body=await readJson(request);}catch(error){return reply(error instanceof RangeError?413:400,{code:'invalid_request'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!ALLOWED.has(key))
    ||!isUuid(body.merchant_id)||!isUuid(body.idempotency_key)||!/^[a-f0-9]{32}$/.test(body.quote_token||'')
    ||!Array.isArray(body.items)||!body.items.length||body.items.length>30||!['enquiry','pickup','delivery'].includes(body.fulfilment)
    ||typeof body.instructions!=='string'||body.instructions.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.instructions)
    ||body.items.some(item=>!item||typeof item!=='object'||Object.keys(item).length!==2||!isUuid(item.product_id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)
    ||new Set(body.items.map(item=>item.product_id.toLowerCase())).size!==body.items.length)return reply(400,{code:'invalid_request'});
  if(!client)return reply(503,{code:'checkout_unconfigured'});
  try{
    const hash=await clientFingerprint(identity,secret,now);
    const limit=await client.rpc('checkout_consume_limit',{p_client_hash:hash,p_merchant_id:body.merchant_id});
    if(limit.error)throw new Error('Limiter unavailable');
    if(!limit.data?.allowed)return reply(429,{code:'rate_limited'},{'Retry-After':String(limit.data?.retry_after||60)});
    const result=await client.rpc('checkout_initiate',{
      p_merchant_id:body.merchant_id,p_items:body.items,p_fulfilment:body.fulfilment,p_instructions:body.instructions,
      p_quote_token:body.quote_token,p_idempotency_key:body.idempotency_key,
    });
    if(result.error){if(result.error.code==='22023')return reply(400,{code:'invalid_request'});throw new Error('Initiation unavailable');}
    if(result.data?.status==='changed')return reply(409,{code:'quote_changed',quote:result.data.quote});
    if(result.data?.status==='conflict')return reply(409,{code:'idempotency_conflict'});
    if(result.data?.status==='blocked')return reply(422,{code:'checkout_blocked',quote:result.data.quote});
    if(result.data?.status!=='initiated')throw new Error('Invalid initiation response');
    const url=buildWhatsAppUrl(result.data.receipt);
    const handoff=await client.rpc('checkout_mark_handoff',{p_idempotency_key:body.idempotency_key,p_request_hash:result.data.request_hash});
    if(handoff.error||handoff.data!==true)throw new Error('Handoff unavailable');
    return reply(200,{status:'handoff_created',reference:result.data.receipt.reference,url,receipt:result.data.receipt});
  }catch(error){return reply(error instanceof RangeError?422:503,{code:error instanceof RangeError?'message_too_long':'checkout_unavailable'});}
}
