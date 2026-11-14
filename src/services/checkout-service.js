import { isUuid } from '../domain/discovery.js';

export function createCheckoutService({fetcher=fetch,storage}={}) {
  if(storage===undefined){try{storage=globalThis.sessionStorage;}catch{storage=null;}}
  const memory=new Map();
  return {
    async prepare(input) {
      const signature=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const key='rawatbhata:checkout:'+input.merchant_id;
      let pending=memory.get(key);
      if(!pending){try{pending=JSON.parse(storage?.getItem(key)||'null');}catch{/* Use a fresh request if storage is inaccessible. */}}
      if(pending?.signature!==signature||!isUuid(pending.key))pending={signature,key:crypto.randomUUID()};
      memory.set(key,pending);try{storage?.setItem(key,JSON.stringify(pending));}catch{/* In-memory retries remain idempotent. */}
      try{
        const response=await fetcher('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',
          body:JSON.stringify({...input,idempotency_key:pending.key}),signal:AbortSignal.timeout(20000)});
        const data=await response.json();
        if(response.ok && data.status==='handoff_created' && /^https:\/\/wa\.me\/[1-9][0-9]{7,14}\?text=/.test(data.url||'') && data.url.length<=19000)return data;
        if(data.code==='idempotency_conflict'){memory.delete(key);try{storage?.removeItem(key);}catch{/* Next confirmation uses a fresh key. */}}
        const error=new Error('The enquiry link could not be prepared.');error.code=data.code||'checkout_unavailable';error.quote=data.quote;throw error;
      }catch(error){if(error.code)throw error;const failure=new Error('The enquiry link could not be prepared.');failure.code='checkout_unavailable';throw failure;}
    },
  };
}

