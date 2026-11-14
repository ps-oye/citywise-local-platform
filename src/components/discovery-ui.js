import { escapeHtml as e } from '../utils/dom.js';
import { formatMoney } from '../utils/format.js';
import { categoryPath, demoImagePath, availabilityLabel, updateUrl, topFeatured } from '../domain/discovery.js';
import { icon } from './icons.js';
import { merchantPath } from '../domain/merchant.js';
export const placeholder = '/images/listing-placeholder.svg';
export function imageMarkup(item, { className = '', eager = false, category = false } = {}) {
  const path = item.media && !category ? null : demoImagePath(category ? item.cover_image_path : item.demo_image_path);
  const media = item.media || null;
  const attrs = !path && media ? ' data-media-bucket="'+e(media.bucket_id)+'" data-media-path="'+e(media.object_path)+'"' : '';
  return '<img class="'+e(className)+'" src="'+e(path || placeholder)+'" alt="'+e(category ? item.name : item.media?.alt_text || (item.is_demo ? 'Illustrative photo for '+item.name : item.name))+'" width="'+(category?192:768)+'" height="'+(category?192:512)+'" loading="'+(eager?'eager':'lazy')+'" decoding="async"'+(eager?' fetchpriority="high"':'')+attrs+'>';
}
export function cardMarkup(item, url = new URL(location.href), citySlug) {
  const path=merchantPath(item,citySlug||url.pathname.split('/').filter(Boolean)[0]);
  const href = path ? path+(url.searchParams.get('locality')?'?locality='+encodeURIComponent(url.searchParams.get('locality')):'') : updateUrl(url,{listing:item.id});
  const closed = ['closed','temporarily_closed'].includes(item.availability);
  const price = item.price_minor === null || item.price_minor === undefined ? '' : '<span class="card-price">From '+e(formatMoney(Number(item.price_minor)))+(item.price_unit?' <small>/ '+e(item.price_unit)+'</small>':'')+'</span>';
  return '<article class="place-card'+(closed?' is-closed':'')+'"><a class="place-card-link" href="'+e(href)+'"'+(!path?' data-preview="'+e(item.id)+'"':'')+' aria-label="Explore '+e(item.name)+'"><div class="card-image">'+imageMarkup(item)+'<div class="card-image-labels">'+(item.sponsored?'<span class="sponsored-label">Sponsored</span>':'')+(item.is_demo?'<span class="demo-label">Demo</span>':'')+'</div><span class="card-open">'+icon('arrow')+'</span></div><div class="card-content"><p class="card-category">'+e(item.category_short_name || item.category_name || 'Local discovery')+'</p><h3>'+e(item.name)+'</h3><p class="card-locality">'+icon('pin')+e(item.locality_name || 'Locality not listed')+'</p><p class="card-description">'+e(item.short_description || '')+'</p>'+(item.matched_product?'<p class="matched-product">Matching item: '+e(item.matched_product)+'</p>':'')+'<div class="card-meta">'+price+'<span class="availability'+(closed?' closed':'')+'">'+icon('clock')+e(availabilityLabel(item.availability))+'</span></div></div></a></article>';
}
export function categoryMarkup(category, city, locality) {
  const href = categoryPath(city,category)+(locality?'?locality='+encodeURIComponent(locality):'');
  return '<a class="category-tile" href="'+e(href)+'"><span class="category-photo">'+imageMarkup(category,{category:true})+'</span><span>'+e(category.short_name || category.name)+'</span></a>';
}
export function railMarkup(section, city, locality, url) {
  const href = categoryPath(city,{slug:section.slug})+(locality?'?locality='+encodeURIComponent(locality):'');
  return '<section class="listing-section" aria-labelledby="section-'+e(section.id)+'"><div class="section-heading"><div><p class="eyebrow">Closer than you think</p><h2 id="section-'+e(section.id)+'">'+e(section.title)+'</h2>'+(section.description?'<p>'+e(section.description)+'</p>':'')+'</div><a class="see-all" href="'+e(href)+'">See all '+icon('arrow')+'</a></div><div class="listing-rail">'+topFeatured(section.items).map(item=>cardMarkup(item,url,city.slug)).join('')+'</div></section>';
}
export function emptyMarkup(title, message, action, heading = 'h2') { const tag = heading === 'h1' ? 'h1' : 'h2'; return '<div class="empty-state">'+icon('search')+'<'+tag+'>'+e(title)+'</'+tag+'><p>'+e(message)+'</p>'+(action?'<button class="button button-primary" data-action="'+e(action.name)+'">'+e(action.label)+'</button>':'')+'</div>'; }
export function skeletonMarkup(count = 4) { return '<div class="loading-state" role="status" aria-label="Loading places"><span class="sr-only">Loading places…</span><div class="listing-rail">'+Array.from({length:count},()=>'<div class="skeleton-card" aria-hidden="true"><div></div><span></span><span></span></div>').join('')+'</div></div>'; }

