import { PUBLIC_SECURITY_HEADERS,publicSecurityHeaders } from '../config/security-headers.js';
import { escapeHtml as e } from '../utils/dom.js';
import { merchantPageMarkup } from '../components/merchant-ui.js';
import { emptyMarkup } from '../components/discovery-ui.js';
import {publicCatalog} from './public-catalog.js';
import {deploymentSettings,pageMetadata} from '../domain/seo.js';
import {renderSeoHtml} from './seo-html.js';

const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...PUBLIC_SECURITY_HEADERS};
export async function errorPage(context,status,title,message){
  let html='<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Local discovery</title></head><body><main></main></body></html>';
  try{const asset=await context.env.ASSETS.fetch(new Request(new URL('/index.html',context.request.url)));if(asset.ok)html=await asset.text();}catch{/* The minimal HTML fallback still has a useful heading and return link. */}
  html=html.replace(/<title>[\s\S]*?<\/title>/i,()=>'<title>'+e(title)+' · Rawatbhata One</title>')
    .replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,()=>'<main id="main" tabindex="-1"><div class="container initial-loading">'+emptyMarkup(title,message,null,'h1')+'<a class="button button-outline" href="/">Return to discovery</a></div></main>');
  return new Response(context.request.method==='HEAD'?null:html,{status,headers:{...headers,...publicSecurityHeaders(context.env),'X-Robots-Tag':'noindex, nofollow'}});
}
export async function serveMerchantPage(context,route,{fetcher=fetch}={}){
  const env=context.env||{},url=new URL(context.request.url);
  try{
    const {rpc}=publicCatalog(env,fetcher),settings=deploymentSettings(env,url);
    const merchant=await rpc('merchant_detail',{p_city_slug:route.citySlug,p_category_slug:route.categorySlug,p_listing_slug:route.listingSlug});
    if(!merchant)return errorPage(context,404,'This place is not available','It may have moved or been unpublished. Explore the other places in town.');
    if(merchant.canonical_path!==url.pathname.replace(/\/$/,'')){
      if(!/^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(merchant.canonical_path))throw new Error('Invalid merchant canonical route');
      return new Response(null,{status:308,headers:{...PUBLIC_SECURITY_HEADERS,'Cache-Control':'no-store',Location:merchant.canonical_path+url.search}});
    }
    const products=['COMMERCE','RESTAURANT'].includes(merchant.listing_type)?await rpc('merchant_products',{p_merchant_id:merchant.id,p_limit:12}):null;
    const assetUrl=new URL('/index.html',url);
    const asset=await context.env.ASSETS.fetch(new Request(assetUrl));
    if(!asset.ok)throw new Error('Public shell unavailable');
    const meta=pageMetadata({url,route,merchant,...settings});
    const html=renderSeoHtml(await asset.text(),{meta,body:merchantPageMarkup(merchant,{products,interactive:false}),indexable:settings.indexable,bootstrapId:'merchant-bootstrap',bootstrap:{path:url.pathname,merchant,products}});
    return new Response(context.request.method==='HEAD'?null:html,{status:200,headers:{...headers,...publicSecurityHeaders(env),'X-Robots-Tag':meta.robots}});
  }catch{return errorPage(context,503,'This place could not be loaded','Please try again shortly. Your saved carts are kept in your browser.');}
}
