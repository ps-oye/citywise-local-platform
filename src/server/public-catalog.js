import {parseOrigin,isPublicSupabaseKey} from '../config/environment.js';
export function publicCatalog(env={},fetcher=fetch){
  const origin=parseOrigin(env.SUPABASE_URL||env.VITE_SUPABASE_URL||''),key=env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!origin||!isPublicSupabaseKey(key||''))throw new Error('Public catalog configuration missing');
  return {origin,key,async rpc(name,args={}){
    const response=await fetcher(origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000),cache:'no-store'});
    if(!response.ok)throw new Error('Public catalog unavailable');
    const reader=response.body?.getReader();if(!reader)throw new Error('Missing catalog response');
    let size=0;const chunks=[];
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();throw new Error('Public catalog response too large');}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }};
}
