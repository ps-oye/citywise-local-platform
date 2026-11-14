import {publicCatalog} from './public-catalog.js';
import {renderSeoHtml} from './seo-html.js';
import {deploymentSettings,pageMetadata,pageNumber} from '../domain/seo.js';
import {readDiscoveryFilters,updateUrl} from '../domain/discovery.js';
import {discoveryHomeMarkup,discoverySearchMarkup} from '../components/discovery-home.js';
import {cardMarkup,imageMarkup} from '../components/discovery-ui.js';
import {escapeHtml as e} from '../utils/dom.js';
import {publicSecurityHeaders} from '../config/security-headers.js';
import {errorPage} from './merchant-page.js';

function browseContent(context,route,filters,result,url,page){
  const category=context.categories.find(item=>item.slug===route.categorySlug),city=context.city;
  const title=category?.name||(filters.query?'Results for “'+filters.query+'”':'Explore local places');
  const query=discoverySearchMarkup(city,filters.query);
  const select='<form class="seo-filter-form" method="get" action="'+e(url.pathname)+'">'+(filters.query?'<input type="hidden" name="q" value="'+e(filters.query)+'">':'')+'<label>Neighbourhood<select name="locality"><option value="">All neighbourhoods</option>'+context.localities.map(item=>'<option value="'+e(item.slug)+'"'+(item.slug===filters.localitySlug?' selected':'')+'>'+e(item.name)+'</option>').join('')+'</select></label><button class="button button-outline" type="submit">Apply filters</button></form>';
  const previous=page>1?'<a class="button button-outline" href="'+e(updateUrl(url,{page:page-1===1?null:page-1}))+'">Previous places</a>':'';
  const next=result.has_more?'<a class="button button-outline" href="'+e(updateUrl(url,{page:page+1}))+'">Next places</a>':'';
  return '<div class="container"><section class="browse-intro"><div><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/'+e(city.slug)+'">Home</a><span aria-hidden="true">›</span><a href="/'+e(city.slug)+'/explore">Explore</a></nav><h1>'+e(title)+'</h1><p class="lead">'+e(category?.description||'Find local shops, services and places in '+city.name+'.')+'</p></div>'+(category?imageMarkup(category,{className:'browse-category-image',category:true,eager:true}):'')+'</section><div class="browse-layout"><aside class="filters-content">'+select+'</aside><section class="results-content" aria-label="Places"><h2 class="sr-only">Places</h2><div class="results-search">'+query+'</div><div class="results-toolbar"><p><strong>'+Number(result.total)+'</strong> places to discover</p></div><div class="results-grid">'+(result.items.length?result.items.map(item=>cardMarkup(item,url,city.slug)).join(''):'<p>No places found. Try another search or neighbourhood.</p>')+'</div><nav class="seo-pagination" aria-label="Listing pages">'+previous+next+'</nav></section></div></div>';
}
export async function serveDiscoveryPage(context,route,{fetcher=fetch}={}){
  const url=new URL(context.request.url),settings=deploymentSettings(context.env,url),filters=readDiscoveryFilters(url),page=pageNumber(url);
  try{
    const client=publicCatalog(context.env,fetcher),data=await client.rpc('discovery_context',{p_city_slug:route.citySlug||null});
    if(!data?.city)return errorPage(context,404,'This town is not available','Explore another city or return to discovery.');
    const category=data.categories.find(item=>item.slug===(route.kind==='category'?route.categorySlug:filters.categorySlug));
    if(route.kind==='category'&&!category)return errorPage(context,404,'This category is not available','It may have been unpublished. Explore the other categories in town.');
    const locality=data.localities.find(item=>item.slug===filters.localitySlug);
    const result=route.kind==='home'?await client.rpc('discovery_home',{p_city_id:data.city.id,p_locality_id:locality?.id||null,p_offset:0,p_limit:4}):
      await client.rpc('discovery_listings',{p_city_id:data.city.id,p_category_id:category?.id||null,p_locality_id:locality?.id||null,p_query:filters.query,p_sort:filters.sort,p_offset:(page-1)*12,p_limit:12,p_facets:filters.facets});
    if(page>1&&!result.items?.length)return errorPage(context,404,'No more places on this page','Return to the first page to explore the available places.');
    const items=route.kind==='home'?(result.sections||[]).flatMap(section=>section.items):result.items;
    const meta=pageMetadata({url,route,context:data,items,...settings,page});
    const body=route.kind==='home'?discoveryHomeMarkup(data,{home:result,locality:filters.localitySlug,url}):browseContent(data,route,filters,result,url,page);
    const asset=await context.env.ASSETS.fetch(new Request(new URL('/index.html',url)));if(!asset.ok)throw new Error('Missing public shell');
    let html=renderSeoHtml(await asset.text(),{meta,body,indexable:settings.indexable,bootstrapId:'discovery-bootstrap',bootstrap:{path:url.pathname,search:url.search,context:data,home:route.kind==='home'?result:null,listings:route.kind==='home'?null:result}});
    html=html.replace(/(<strong\b[^>]*data-current-location[^>]*>)[\s\S]*?(<\/strong>)/,(_match,start,end)=>start+e(locality?.name||data.city.name)+end)
      .replace(/(<div\b[^>]*data-demo-notice) hidden/,data.has_demo_content?'$1':'$1 hidden');
    return new Response(context.request.method==='HEAD'?null:html,{headers:{...publicSecurityHeaders(context.env),'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':meta.robots}});
  }catch{return errorPage(context,503,'Discovery is taking a short pause','The local catalog could not be loaded. Please try again shortly.');}
}
