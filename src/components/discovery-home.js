import {escapeHtml as e} from '../utils/dom.js';
import {icon} from './icons.js';
import {categoryMarkup,railMarkup,skeletonMarkup,emptyMarkup} from './discovery-ui.js';
import {promotionSlideMarkup} from './promotion-carousel.js';
export function discoverySearchMarkup(city,query=''){
  return '<form class="seo-search" role="search" method="get" action="/'+e(city.slug)+'/search"><label class="sr-only" for="public-search">Search local places</label><input id="public-search" name="q" type="search" maxlength="100" value="'+e(query)+'" placeholder="What would you like to discover?"><button class="button button-primary" type="submit">Search</button></form>';
}
export function homeSectionsMarkup(home,context,locality,url){
  const sections=(home.sections||[]).filter(section=>section.items.length);
  return sections.length?sections.map(section=>railMarkup(section,context.city,locality,url)).join(''):emptyMarkup('A little more local is on its way','Published local places will appear here. Explore all places or try another neighbourhood.','');
}
export function discoveryHomeMarkup(context,{locality='',home=null,url=new URL('https://example.invalid')}={}){
  const ads=context.advertisements||[],city=context.city;
  return '<div class="container"><div class="promotion-wrap" data-promotion-wrap'+(ads.length?'':' hidden')+'><div class="promotion-carousel" data-promotion-carousel>'+ads.map((ad,i)=>promotionSlideMarkup(ad,i,ads.length,{origin:url.origin})).join('')+'</div></div><section class="welcome-section"><div><p class="eyebrow">'+icon('leaf')+'Made for '+e(city.name)+'</p><h1>Your town, <em>rediscovered.</em></h1><p>Everyday favourites. Unexpected discoveries. All a little closer to home.</p></div><div class="welcome-search" data-welcome-search>'+discoverySearchMarkup(city)+'</div></section><section class="categories-section" id="categories" aria-labelledby="categories-title"><div class="compact-heading"><h2 id="categories-title">Find your kind of local</h2><span>'+context.categories.filter(c=>!c.parent_id).length+' ways to explore</span></div><div class="category-grid">'+context.categories.filter(c=>!c.parent_id).map(c=>categoryMarkup(c,city,locality)).join('')+'</div></section><div data-home-sections>'+(home?homeSectionsMarkup(home,context,locality,url):skeletonMarkup())+'</div><div class="more-sections" data-home-more'+(home?.has_more?'':' hidden')+'><button type="button" class="button button-outline" data-load-home>Explore more categories '+icon('arrow')+'</button></div><section class="local-note">'+icon('spark')+'<div><h2>Big discoveries. Small-town heart.</h2><p>A good meal, a helping hand, a place to pause. Make a little more room for local.</p></div><a class="see-all" href="/'+e(city.slug)+'/explore">Explore all places '+icon('arrow')+'</a></section></div>';
}
