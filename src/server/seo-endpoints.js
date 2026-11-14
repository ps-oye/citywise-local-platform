import {createClient} from '@supabase/supabase-js';
import {publicCatalog} from './public-catalog.js';
import {deploymentSettings} from '../domain/seo.js';
import {escapeHtml as xml} from '../utils/dom.js';
import {isUuid} from '../domain/discovery.js';
import {PUBLIC_SECURITY_HEADERS} from '../config/security-headers.js';
const base={...PUBLIC_SECURITY_HEADERS,'Cache-Control':'no-store','X-Robots-Tag':'noindex, follow'};
export async function serveSeoEndpoint(context,{fetcher=fetch}={}){
  const url=new URL(context.request.url),settings=deploymentSettings(context.env,url),head=context.request.method==='HEAD';
  if(url.pathname==='/robots.txt'){
    // Allow crawlers to see page-level noindex. robots disallow alone cannot prevent URL indexing.
    const text='User-agent: *\nAllow: /\nDisallow: /api/\n'+(settings.indexable?'Sitemap: '+settings.origin+'/sitemap.xml\n':'# Preview pages return noindex metadata and headers.\n');
    return new Response(head?null:text,{headers:{...base,'Content-Type':'text/plain; charset=utf-8'}});
  }
  try{
    const client=publicCatalog(context.env,fetcher);
    if(url.pathname.startsWith('/media/')){
      const id=url.pathname.slice(7);if(!isUuid(id))return new Response(null,{status:404,headers:base});
      const media=await client.rpc('public_media',{p_id:id});
      if(!media||media.bucket_id!=='listing-media'||!/^[a-f0-9-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(jpg|jpeg|png|webp|avif)$/i.test(media.object_path))return new Response(null,{status:404,headers:base});
      const sdk=createClient(client.origin,client.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init={})=>fetcher(input,{...init,signal:AbortSignal.timeout(10000)})}});
      const {data,error}=await sdk.storage.from(media.bucket_id).download(media.object_path);
      if(error||!data||data.size>5242880||!['image/jpeg','image/png','image/webp','image/avif'].includes(data.type))return new Response(null,{status:404,headers:base});
      return new Response(head?null:data,{headers:{...base,'Content-Type':data.type,'Content-Length':String(data.size),'X-Robots-Tag':settings.indexable&&!media.is_demo?'index, follow':'noindex, follow'}});
    }
    if(!settings.indexable){
      const tag=url.pathname==='/sitemap.xml'?'sitemapindex':'urlset';
      return new Response(head?null:'<?xml version="1.0" encoding="UTF-8"?><'+tag+' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></'+tag+'>',{headers:{...base,'Content-Type':'application/xml; charset=utf-8'}});
    }
    let body;
    if(url.pathname==='/sitemap.xml'){
      const result=await client.rpc('seo_sitemap_index');if(!Number.isInteger(result.pages)||result.pages<0||result.pages>1000)throw new Error('Invalid sitemap index');
      body='<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+Array.from({length:result.pages},(_,i)=>'<sitemap><loc>'+xml(settings.origin+'/sitemaps/'+i+'.xml')+'</loc></sitemap>').join('')+'</sitemapindex>';
    }else{
      const page=/^\/sitemaps\/([0-9]{1,3})\.xml$/.exec(url.pathname);if(!page)return new Response(null,{status:404,headers:base});
      const paths=await client.rpc('seo_sitemap_page',{p_page:Number(page[1])});if(!Array.isArray(paths)||paths.length>1000||paths.some(path=>!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+){0,2}$/.test(path)))throw new Error('Invalid sitemap paths');
      if(!paths.length)return new Response(null,{status:404,headers:base});
      body='<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(path=>'<url><loc>'+xml(settings.origin+path)+'</loc></url>').join('')+'</urlset>';
    }
    return new Response(head?null:'<?xml version="1.0" encoding="UTF-8"?>'+body,{headers:{...base,'Content-Type':'application/xml; charset=utf-8'}});
  }catch{return new Response(head?null:'Sitemap or media temporarily unavailable',{status:503,headers:{...base,'Content-Type':'text/plain; charset=utf-8','Retry-After':'60'}});}
}
export const isSeoEndpoint=path=>path==='/robots.txt'||path==='/sitemap.xml'||path.startsWith('/sitemaps/')||path.startsWith('/media/');
