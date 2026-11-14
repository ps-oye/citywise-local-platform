import {escapeHtml as e} from '../utils/dom.js';
import {jsonForHtml} from '../domain/seo.js';
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
