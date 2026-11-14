import {createClient} from '@supabase/supabase-js';
import {parseOrigin,isPublicSupabaseKey} from '../config/environment.js';
import {MAX_IMAGE_BYTES,validateWebP} from '../domain/admin-media.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'}});
async function boundedBody(request,max) {
  if(Number(request.headers.get('Content-Length'))>max)throw Object.assign(new Error('The upload is too large.'),{status:413});
  const reader=request.body?.getReader();if(!reader)throw new Error('Provide a request body.');let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Object.assign(new Error('The upload is too large.'),{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return data;
}
function userClient(env,token) {
  const url=parseOrigin(env.SUPABASE_URL||env.VITE_SUPABASE_URL||''),key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!isPublicSupabaseKey(key||''))return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+token},fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
export async function handleAdminMedia(request,{env={},createClientForUser=userClient}={}) {
  if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply(403,{message:'Use the administration workspace to upload images.'});
  const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{16,4096})$/)?.[1];
  if(!token)return reply(401,{message:'Sign in to manage images.'});
  const client=createClientForUser(env,token);if(!client)return reply(503,{message:'Media storage is not configured.'});
  try {
    const verified=await client.auth.getUser(token);if(verified.error||!verified.data?.user)return reply(401,{message:'Your session has expired. Sign in again.'});
    const admin=await client.rpc('is_admin');if(admin.error||admin.data!==true)return reply(403,{code:'42501',message:'Administrator access is required.'});
    const type=request.headers.get('Content-Type')||'';
    if(type.startsWith('application/json')){
      const data=JSON.parse(new TextDecoder().decode(await boundedBody(request,2048)));
      if(Object.keys(data).some(key=>!['action','entity','entity_id','media_id','role','expected'].includes(key))||data.action!=='remove'||!['listing','advertisement'].includes(data.entity)||!uuid(data.entity_id)||data.entity==='listing'&&!uuid(data.media_id))throw new Error('The image removal request is invalid.');
      const {action,...input}=data;const detached=await client.rpc('admin_remove_media',{p_data:input});if(detached.error)throw detached.error;
      let storageRemoved=true;
      if(detached.data.path){const result=await client.storage.from(detached.data.bucket).remove([detached.data.path]);storageRemoved=!result.error;}
      return reply(200,{ok:true,storageRemoved,record:detached.data.record,message:storageRemoved?'Image removed.':'Image detached. Its private storage object could not be deleted; retry cleanup in Supabase Storage.'});
    }
    if(!/^multipart\/form-data;\s*boundary=.{1,120}$/i.test(type))throw new Error('Choose an image using the upload form.');
    const data=await boundedBody(request,MAX_IMAGE_BYTES+8192),form=await new Request(request.url,{method:'POST',headers:{'Content-Type':type},body:data}).formData();
    if([...form.keys()].some(key=>!['image','entity','entity_id','role','alt_text','expected'].includes(key))||[...form.keys()].some(key=>form.getAll(key).length!==1))throw new Error('The upload fields are invalid.');
    const entity=form.get('entity'),id=form.get('entity_id'),role=form.get('role'),alt=String(form.get('alt_text')||'').trim(),file=form.get('image');
    if(!['listing','advertisement'].includes(entity)||!uuid(id)||!(entity==='listing'?['banner','logo','gallery']:['desktop','mobile']).includes(role)||alt.length<1||alt.length>240||!file||typeof file==='string'||file.type!=='image/webp')throw new Error('Check the image, description and image role.');
    const bytes=await file.arrayBuffer();validateWebP(bytes);
    const bucket=entity==='listing'?'listing-media':'promotional-media',path=id+'/'+crypto.randomUUID()+'.webp';
    const uploaded=await client.storage.from(bucket).upload(path,bytes,{contentType:'image/webp',cacheControl:'3600',upsert:false});if(uploaded.error)throw uploaded.error;
    const attached=await client.rpc('admin_attach_media',{p_data:{entity,entity_id:id,object_path:path,alt_text:alt,role,expected:form.get('expected')}});
    if(attached.error){
      // Only known database rejections prove rollback. A timed-out response may have committed.
      if(/^(22|23|40|42)[0-9A-Z]{3}$/.test(attached.error.code||''))await client.storage.from(bucket).remove([path]).catch(()=>{});
      else throw new Error('The upload response was interrupted. Reload this record to check whether the image was attached before retrying.');
      throw attached.error;
    }
    return reply(201,{ok:true,record:attached.data});
  }catch(error){
    const messages={ADMIN_STALE_RECORD:'This record changed. Reload it before uploading or editing images.',ADMIN_MEDIA_IN_USE:'This image is used by a product. Change the product image first.',ADMIN_PAUSE_AD_FIRST:'Pause the advertisement before removing its image.'};
    const message=messages[error.message]||(error.code?'The image change could not be saved. Check access and reload the record.':error.message);
    return reply(error.status||400,{message:message||'The image request failed.',code:error.code||null});
  }
}
