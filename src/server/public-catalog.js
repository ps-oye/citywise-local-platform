import {parseOrigin,isPublicSupabaseKey} from '../config/environment.js';
import {CITY_FIELDS,CITY_PAGE_SIZE,citySearchPattern,cityResults} from '../domain/cities.js';
export function publicCatalog(env={},fetcher=fetch){
  const origin=parseOrigin(env.SUPABASE_URL||env.VITE_SUPABASE_URL||''),key=env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!origin||!isPublicSupabaseKey(key||''))throw new Error('Public catalog configuration missing');
  async function request(path,init={}){
    const response=await fetcher(origin+'/rest/v1/'+path,{...init,headers:{apikey:key,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
    const reader=response.body?.getReader();if(!reader)throw new Error('Missing catalog response');
    let size=0;const chunks=[];
    const maxBytes=response.ok?1048576:16384;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('Public catalog response too large');}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('Public catalog unavailable');}
    if(!response.ok)throw Object.assign(new Error('Public catalog unavailable'),{rpcCode:response.status===404&&data?.code==='PGRST202'?'PGRST202':undefined});
    return data;
  }
  return {origin,key,
    rpc:(name,args={})=>request('rpc/'+name,{method:'POST',body:JSON.stringify(args)}),
    async cities(filters){
      const params=new URLSearchParams({select:CITY_FIELDS,enabled:'eq.true',order:'is_default.desc,name.asc,id.asc',limit:String(CITY_PAGE_SIZE+1),offset:String(filters.offset)});
      if(filters.query)params.set('name','ilike.'+citySearchPattern(filters.query));
      return cityResults(await request('cities?'+params),filters);
    },
  };
}
