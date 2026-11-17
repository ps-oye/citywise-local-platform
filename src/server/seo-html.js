import {escapeHtml as e} from '../utils/dom.js';
import {jsonForHtml} from '../domain/seo.js';
import {cityHomePath} from '../config/public-routes.js';

export function publicShell(html,{city,locality,categories=[],hasMultipleCities=true}={}){
  const home=city?cityHomePath(city):'/';
  for(const [attribute,path] of [['home-link',home],['explore-link',city?home+'explore':'/'],['categories-link',city?home+'#categories':'/#cities']]){
    const pattern=new RegExp('<a\\b([^>]*data-'+attribute+'[^>]*)>','g');
    html=html.replace(pattern,(_match,attributes)=>'<a'+attributes.replace(/\s+href="[^"]*"/,'').replace(/\s+hidden(?=\s|$)/,'')+' href="'+e(path)+'"'+(!city?' hidden':'')+'>');
  }
  if(city&&!hasMultipleCities){
    html=html.replace(/(<a\b[^>]*data-platform-link[^>]*)(>)/g,'$1 hidden$2');
    html=html.replace(/(<a\b[^>]*class="brand"[^>]*href=")\/("[^>]*>)/g,(_match,start,end)=>start+e(home)+end);
    html=html.replace('aria-label="Choose your city and neighbourhood"','aria-label="Choose your neighbourhood"');
  }
  html=html.replace(/(<strong\b[^>]*data-current-location[^>]*>)[\s\S]*?(<\/strong>)/,(_match,start,end)=>start+e(locality?.name||city?.name||'Choose your city')+end);
  html=html.replace(/(<div\b[^>]*data-nav-categories[^>]*>)[\s\S]*?(<\/div>)/,(_match,start,end)=>start+(city?categories.filter(category=>!category.parent_id).slice(0,5).map(category=>'<a href="'+e('/'+city.slug+'/'+category.slug)+'">'+e(category.short_name||category.name)+'</a>').join(''):'')+end);
  return html;
}
export function metadataHtml(meta){
  return '<title>'+e(meta.title)+'</title><meta name="description" content="'+e(meta.description)+'"><meta name="robots" content="'+e(meta.robots)+'"><link rel="canonical" href="'+e(meta.canonical)+'">'+
    Object.entries({'og:title':meta.title,'og:description':meta.description,'og:url':meta.canonical,'og:image':meta.image,'og:image:alt':meta.imageAlt,'og:type':meta.type,'og:locale':'en_IN'}).map(([key,value])=>'<meta property="'+key+'" content="'+e(value)+'">').join('')+
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+e(meta.title)+'"><meta name="twitter:description" content="'+e(meta.description)+'"><meta name="twitter:image" content="'+e(meta.image)+'"><meta name="twitter:image:alt" content="'+e(meta.imageAlt)+'"><script type="application/ld+json" id="page-structured-data">'+jsonForHtml(meta.structuredData)+'</script>';
}
export function renderSeoHtml(html,{meta,body,bootstrap,bootstrapId,indexable=false}){
  html=html.replace(/<title>[\s\S]*?<\/title>/gi,'').replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi,'').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'');
  html=html.replace('<html ',()=>'<html data-site-origin="'+e(new URL(meta.canonical).origin)+'" data-site-indexing="'+(indexable?'enabled':'disabled')+'" ')
    .replace('</head>',()=>metadataHtml(meta)+'</head>')
    .replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,()=>'<main id="main" tabindex="-1">'+body+'</main>');
  if(bootstrap)html=html.replace('</body>',()=>'<script type="application/json" id="'+bootstrapId+'">'+jsonForHtml(bootstrap)+'</script></body>');
  return html;
}
