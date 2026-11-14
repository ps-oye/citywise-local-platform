import { escapeHtml as e } from '../utils/dom.js';
import { applyBrand } from '../components/brand.js';
import { icon } from '../components/icons.js';
import { mountSearchBox } from '../components/search-box.js';
import { mountPromotionCarousel } from '../components/promotion-carousel.js';
import { cardMarkup, categoryMarkup, railMarkup, skeletonMarkup, emptyMarkup, imageMarkup } from '../components/discovery-ui.js';
import { parsePublicPath, isPublicPath } from '../config/public-routes.js';
import { readDiscoveryFilters, updateUrl, categoryPath, isUuid, availabilityLabel } from '../domain/discovery.js';
import { formatMoney } from '../utils/format.js';
import { merchantPath } from '../domain/merchant.js';
import {discoveryHomeMarkup} from '../components/discovery-home.js';
import {pageMetadata,applyPageMetadata} from '../domain/seo.js';

export function mountDiscovery({ repository, merchantRepository, cart, checkout, media, config,analytics }) {
  const main=document.querySelector('main');
  const locationDialog=document.querySelector('#location-dialog');
  const previewDialog=document.querySelector('#preview-dialog');
  const pageLife=new AbortController();
  let context, route, filters, currentLocality, currentCategory;
  let initialBootstrap,pageBootstrap,pageAnalytics;
  const embeddedDiscovery=document.getElementById('discovery-bootstrap');
  if(embeddedDiscovery){try{initialBootstrap=JSON.parse(embeddedDiscovery.textContent);}catch{/* Refetch malformed public bootstrap data under RLS. */}embeddedDiscovery.remove();}
  let routeRequest, previewRequest, routeVersion=0, baseKey='', previewPushed=false;
  let pageCleanups=[], headerCleanup, mediaCleanup, previewMediaCleanup, toastTimer;
  let homeOffset=0, resultOffset=0, totalResults=0, shownResults=0;
  const seenSections=new Set(),seenResults=new Set();
  function toast(message){const box=document.querySelector('[data-toast]');clearTimeout(toastTimer);box.textContent=message;box.hidden=false;toastTimer=setTimeout(()=>{box.hidden=true;},3500);}
  function refreshMedia(){mediaCleanup?.();mediaCleanup=media.hydrate(main);}
  function cleanupPage(){for(const cleanup of pageCleanups)cleanup();pageCleanups=[];mediaCleanup?.();}
  function getScope(){return context?.city?{cityId:context.city.id,localityId:currentLocality?.id}:null;}
  async function openListing(id,item){
    try{const listing=item||await repository.preview(id,routeRequest?.signal);const path=listing&&merchantPath(listing,context?.city?.slug);if(path)navigate(path);else toast('This place is no longer available.');}
    catch(error){if(error.name!=='AbortError')toast('This place could not be loaded. Please try again.');}
  }
  function closeMenu(){document.querySelector('#main-navigation').classList.remove('is-open');document.querySelector('[data-menu-open]').setAttribute('aria-expanded','false');}
  function navigate(href,{replace=false}={}){
    const url=new URL(href,location.origin);
    if(url.origin!==location.origin || !isPublicPath(url.pathname))return;
    if(replace)history.replaceState({},'',url);else history.pushState({},'',url);
    closeMenu();renderRoute(true);
  }
  function setParams(changes,pathname){navigate(updateUrl(new URL(location.href),{listing:null,page:null,...changes},pathname));}
  function updateMetadata(items=[]){applyPageMetadata(pageMetadata({url:new URL(location.href),route,context,items,page:filters.page,brandName:config.brandName,origin:document.documentElement.dataset.siteOrigin||config.siteUrl||location.origin,indexable:document.documentElement.dataset.siteIndexing==='enabled'}));}
  function applyHeader(){
    const citySlug = context.city.slug;
    document.querySelectorAll('[data-home-link]').forEach(a=>{a.href='/'+context.city.slug;a.toggleAttribute('aria-current',route.kind==='home');if(route.kind==='home')a.setAttribute('aria-current','page');});
    document.querySelectorAll('[data-explore-link]').forEach(a=>{a.href='/'+context.city.slug+'/explore';if(route.kind==='explore')a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.querySelectorAll('[data-categories-link]').forEach(a=>{a.href='/'+context.city.slug+'#categories';});
    document.querySelector('[data-current-location]').textContent=currentLocality?.name || context.city.name;
    document.querySelector('[data-nav-categories]').innerHTML=context.categories.filter(c=>!c.parent_id).slice(0,5).map(c=>'<a href="'+e(categoryPath(context.city,c))+'">'+e(c.short_name||c.name)+'</a>').join('');
    document.querySelector('[data-demo-notice]').hidden=!(context.has_demo_content || context.advertisements.some(ad=>ad.is_demo));
    headerCleanup?.();
    headerCleanup=mountSearchBox(document.querySelector('[data-search-slot]'),{
      repository,getScope,value:filters.query,onSearch:query=>setParams({q:query,category:null,sort:null,...Object.fromEntries(Object.keys(filters.facets).map(k=>['f.'+k,null]))},'/'+citySlug+'/search'),
      onChoose:openListing,label:'Search all local places',
    });
  }
  function renderLocation(){
    if(!context?.city){toast('The local catalog is not ready yet.');return;}
    const selected=filters.localitySlug;
    document.querySelector('[data-location-content]').innerHTML=(context.cities.length>1?'<div class="city-field"><label class="field-label" for="location-city">City</label><select id="location-city" data-city-select>'+context.cities.map(city=>'<option value="'+e(city.slug)+'"'+(city.id===context.city.id?' selected':'')+'>'+e(city.name)+', '+e(city.state)+'</option>').join('')+'</select></div>':'<p class="city-name">'+icon('pin')+e(context.city.name)+', '+e(context.city.state)+'</p>')+'<div class="locality-options"><button class="locality-option" type="button" data-locality="" aria-pressed="'+!selected+'">'+icon('grid')+'All neighbourhoods'+(!selected?icon('check'):'')+'</button>'+context.localities.map(locality=>'<button class="locality-option" type="button" data-locality="'+e(locality.slug)+'" aria-pressed="'+(selected===locality.slug)+'">'+icon('pin')+e(locality.name)+(selected===locality.slug?icon('check'):'')+'</button>').join('')+'</div><p class="location-caption">Choose an area to find places nearby. Your precise location is never requested.</p>';
    if(!locationDialog.open)locationDialog.showModal();
  }
  function closePreview(updateHistory=true){
    if(!updateHistory)previewPushed=false;
    previewRequest?.abort();previewMediaCleanup?.();if(previewDialog.open)previewDialog.close();
    if(updateHistory && new URL(location.href).searchParams.has('listing')){
      if(previewPushed){previewPushed=false;history.back();}
      else history.replaceState({},'',updateUrl(new URL(location.href),{listing:null}));
    }
  }
  async function openPreview(id,{push=true}={}){
    if(!isUuid(id))return;
    if(push){previewPushed=true;history.pushState({},'',updateUrl(new URL(location.href),{listing:id}));}
    previewRequest?.abort();previewRequest=new AbortController();
    previewMediaCleanup?.();
    const body=document.querySelector('[data-preview-content]');
    body.innerHTML='<div class="preview-body"><p class="eyebrow">A little closer look</p><h2 id="preview-title">Loading this place…</h2>'+skeletonMarkup(1)+'</div>';
    if(!previewDialog.open)previewDialog.showModal();
    try{
      const item=await repository.preview(id,previewRequest.signal);
      if(previewRequest.signal.aborted)return;
      if(!item){body.innerHTML='<div class="preview-body"><h2 id="preview-title">This place is not available</h2><p class="preview-description">It may have been unpublished or moved. Explore the other places in your town.</p></div>';return;}
      const category=context?.categories.find(c=>c.id===item.category_id);
      const facets=Object.values(item.facets||{}).flat().filter(value=>typeof value==='string').slice(0,5);
      body.innerHTML=imageMarkup(item,{className:'preview-image',eager:true})+'<div class="preview-body"><p class="eyebrow">'+e(item.category_name || 'Local discovery')+(item.sponsored?' · Sponsored':'')+'</p><h2 id="preview-title">'+e(item.name)+'</h2><p class="preview-description">'+e(item.description||item.short_description||'')+'</p><div class="preview-facts">'+(item.locality_name?'<p>'+icon('pin')+e(item.locality_name)+'</p>':'')+'<p>'+icon('clock')+e(availabilityLabel(item.availability))+'</p>'+(item.price_minor!==null&&item.price_minor!==undefined?'<p>From '+e(formatMoney(Number(item.price_minor)))+(item.price_unit?' / '+e(item.price_unit):'')+'</p>':'')+'</div>'+(facets.length?'<div class="subcategories">'+facets.map(value=>'<span class="filter-chip">'+e(value)+'</span>').join('')+'</div>':'')+(item.is_demo?'<p class="preview-demo-note">Fictional sample listing. Photos and prices are illustrative. Contact and ordering are unavailable for this demo.</p>':'')+'<div class="preview-actions">'+(category?'<a class="button button-primary" href="'+e(categoryPath(context.city,category))+'">More '+e(category.short_name||category.name)+icon('arrow')+'</a>':'')+'<button type="button" class="button button-outline" data-share-preview>'+icon('share')+'Copy preview link</button></div></div>';
      previewMediaCleanup=media.hydrate(body);
    }catch(error){
      if(error.name==='AbortError')return;
      body.innerHTML='<div class="preview-body"><h2 id="preview-title">We couldn’t load this place</h2><p class="preview-description">Please close the preview and try again.</p></div>';
    }
  }
  function renderHome(){
    applyBrand(config,context.city.name+', rediscovered');
    main.innerHTML=discoveryHomeMarkup(context,{locality:filters.localitySlug,home:pageBootstrap?.home,url:new URL(location.href)});
    const ads=context.advertisements;
    if(!ads.length)document.querySelector('[data-promotion-wrap]').hidden=true;
    pageCleanups.push(mountPromotionCarousel(document.querySelector('[data-promotion-carousel]'),ads,{onPreview:openListing,analytics:pageAnalytics}));
    pageCleanups.push(mountSearchBox(document.querySelector('[data-welcome-search]'),{
      repository,getScope,value:filters.query,label:'Find your next local favourite',placeholder:'What would you like to discover?',
      onSearch:query=>setParams({q:query,category:null},'/'+context.city.slug+'/search'),onChoose:openListing,
    }));
    seenSections.clear();
    if(pageBootstrap?.home){homeOffset=pageBootstrap.home.next_offset;pageBootstrap.home.sections.forEach(section=>seenSections.add(section.id));updateMetadata(pageBootstrap.home.sections.flatMap(section=>section.items));}
    else{homeOffset=0;loadHome(true);}refreshMedia();
  }
  async function loadHome(initial=false){
    const version=routeVersion,button=document.querySelector('[data-load-home]'),root=document.querySelector('[data-home-sections]');
    if(!root)return;
    if(button){button.disabled=true;button.textContent='Finding more local places…';}
    try{
      const result=await repository.home(context.city.id,currentLocality?.id,homeOffset,routeRequest.signal);
      if(version!==routeVersion)return;
      if(initial)root.innerHTML='';
      for(const section of result.sections || []){
        if(seenSections.has(section.id))continue;seenSections.add(section.id);
        if(section.items.length)root.insertAdjacentHTML('beforeend',railMarkup(section,context.city,filters.localitySlug,new URL(location.href)));
      }
      homeOffset=result.next_offset;
      if(initial)updateMetadata((result.sections||[]).flatMap(section=>section.items));
      document.querySelector('[data-home-more]').hidden=!result.has_more;
      if(!root.children.length)root.innerHTML=emptyMarkup('A little more local is on its way',currentLocality?'No featured places in this area yet. Try another neighbourhood or explore all places.':'Published local places will appear here. Check back soon.','');
      refreshMedia();
    }catch(error){
      if(error.name==='AbortError'||version!==routeVersion)return;
      if(initial)root.innerHTML=emptyMarkup('Local discoveries are taking a short pause','We couldn’t load the featured places. Please try again.',{name:'retry',label:'Try again'});
      else{toast('More categories could not be loaded. Please try again.');}
    }finally{
      if(version===routeVersion && button){button.disabled=false;button.innerHTML='Explore more categories '+icon('arrow');}
    }
  }
  function filtersMarkup(){
    const isCategory=route.kind==='category';
    const attributes=context.attributes.filter(a=>a.category_id===currentCategory?.id && a.value_type==='options' && Array.isArray(a.options));
    return '<details class="filters-details"'+(matchMedia('(min-width:801px)').matches?' open':'')+'><summary>Refine your discovery</summary><div class="filters-content"><form data-filter-form>'+(!isCategory?'<div class="filter-field"><label class="field-label" for="category-filter">Category</label><select id="category-filter" name="category" data-filter><option value="">All categories</option>'+context.categories.filter(c=>!c.parent_id).map(c=>'<option value="'+e(c.slug)+'"'+(currentCategory?.id===c.id?' selected':'')+'>'+e(c.name)+'</option>').join('')+'</select></div>':'')+'<div class="filter-field"><label class="field-label" for="locality-filter">Neighbourhood</label><select id="locality-filter" name="locality" data-filter><option value="">All neighbourhoods</option>'+context.localities.map(p=>'<option value="'+e(p.slug)+'"'+(currentLocality?.id===p.id?' selected':'')+'>'+e(p.name)+'</option>').join('')+'</select></div>'+attributes.map(a=>'<div class="filter-field"><label class="field-label" for="facet-'+e(a.attribute_key)+'">'+e(a.label)+'</label><select id="facet-'+e(a.attribute_key)+'" name="f.'+e(a.attribute_key)+'" data-filter><option value="">Any '+e(a.label.toLowerCase())+'</option>'+a.options.filter(value=>typeof value==='string').map(value=>'<option value="'+e(value)+'"'+(filters.facets[a.attribute_key]===value?' selected':'')+'>'+e(value)+'</option>').join('')+'</select></div>').join('')+'<button class="clear-filters" type="button" data-action="clear-filters">Clear filters</button></form><p class="filter-note">Service providers may also appear in the neighbourhoods they serve.</p></div></details>';
  }
  function renderBrowse(){
    const title=route.kind==='category'?currentCategory.name:route.kind==='search'&&filters.query?'Results for “'+filters.query+'”':'Explore local places';
    const subtitle=route.kind==='category'?currentCategory.description:'Find a familiar favourite or something new, in '+context.city.name+'.';
    applyBrand(config,title);
    const children=context.categories.filter(c=>c.parent_id===currentCategory?.id);
    main.innerHTML='<div class="container"><section class="browse-intro"><div><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/'+e(context.city.slug)+'">Home</a>'+icon('chevron')+'<a href="/'+e(context.city.slug)+'/explore">Explore</a>'+(route.kind==='category'?icon('chevron')+'<span>'+e(currentCategory.short_name||currentCategory.name)+'</span>':'')+'</nav><h1>'+e(title)+'</h1><p class="lead">'+e(subtitle||'')+'</p>'+(children.length?'<div class="subcategories">'+children.map(c=>'<a class="filter-chip" href="'+e(categoryPath(context.city,c))+'">'+e(c.short_name||c.name)+'</a>').join('')+'</div>':'')+'</div>'+(currentCategory?imageMarkup(currentCategory,{className:'browse-category-image',category:true,eager:true}):'')+'</section><div class="browse-layout">'+filtersMarkup()+'<section class="results-content" aria-label="Places"><h2 class="sr-only">Places</h2><div class="results-search" data-results-search></div><div class="results-toolbar"><span class="results-count" role="status" data-result-count>Finding places…</span><label class="sort-field" for="sort-filter">Sort by <select id="sort-filter" name="sort" data-filter>'+[['recommended','Recommended'],['name','Name A–Z'],['newest','Recently added'],['price_asc','Price: low to high'],['price_desc','Price: high to low']].map(([value,label])=>'<option value="'+value+'"'+(value===filters.sort?' selected':'')+'>'+label+'</option>').join('')+'</select></label></div><div data-results>'+skeletonMarkup(3)+'</div><div class="results-pagination" data-result-pagination hidden><p data-shown-count></p><button type="button" class="button button-outline" data-load-results>Show more places '+icon('arrow')+'</button></div></section></div></div>';
    pageCleanups.push(mountSearchBox(document.querySelector('[data-results-search]'),{
      repository,getScope:()=>({...getScope(),categoryId:currentCategory?.id}),value:filters.query,label:'Search within these places',
      placeholder:route.kind==='category'?'Search '+(currentCategory.short_name||currentCategory.name).toLowerCase()+'…':'Search within local places…',
      onSearch:query=>setParams({q:query}),onChoose:openListing,
    }));
    resultOffset=(filters.page-1)*12;shownResults=0;seenResults.clear();loadResults(true,pageBootstrap?.listings);refreshMedia();
  }
  async function loadResults(initial=false,provided=null){
    const version=routeVersion,root=document.querySelector('[data-results]'),button=document.querySelector('[data-load-results]');
    if(!root)return;if(button){button.disabled=true;button.textContent='Loading more places…';}
    try{
      const result=provided||await repository.listings({...getScope(),categoryId:currentCategory?.id,query:filters.query,sort:filters.sort,facets:filters.facets,offset:resultOffset,limit:12},routeRequest.signal);
      if(version!==routeVersion)return;
      if(initial){root.innerHTML='';root.className='results-grid';}
      const items=(result.items||[]).filter(item=>!seenResults.has(item.id));
      items.forEach(item=>seenResults.add(item.id));shownResults+=items.length;
      root.insertAdjacentHTML('beforeend',items.map(item=>cardMarkup(item,new URL(location.href),context.city.slug)).join(''));
      resultOffset=result.next_offset;totalResults=result.total;
      if(initial)updateMetadata(result.items||[]);
      document.querySelector('[data-result-count]').innerHTML='<strong>'+totalResults+'</strong> '+(totalResults===1?'place':'places')+(currentLocality?' in '+e(currentLocality.name):' to discover');
      if(!shownResults){root.className='';root.innerHTML=emptyMarkup('No places found this time','Try another search, category or neighbourhood. A small change can lead somewhere good.',{name:'reset-search',label:'Reset discovery'});}
      document.querySelector('[data-result-pagination]').hidden=!shownResults;
      document.querySelector('[data-shown-count]').textContent='Showing '+shownResults+' of '+totalResults+' places';
      if(button)button.hidden=!result.has_more;
      refreshMedia();
    }catch(error){
      if(error.name==='AbortError'||version!==routeVersion)return;
      if(initial){root.className='';root.innerHTML=emptyMarkup('We couldn’t load these places','Your filters are saved. Please try again.',{name:'retry',label:'Try again'});document.querySelector('[data-result-count]').textContent='Places unavailable';}
      else toast('More places could not be loaded. Please try again.');
    }finally{if(version===routeVersion&&button){button.disabled=false;button.innerHTML='Show more places '+icon('arrow');}}
  }
  async function renderRoute(focus=false){
    const url=new URL(location.href),nextBase=url.pathname+'?'+[...url.searchParams].filter(([key])=>key!=='listing').map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&');
    if(context&&baseKey===nextBase){const id=readDiscoveryFilters(url).listingId;if(id)openPreview(id,{push:false});else closePreview(false);return;}
    routeRequest?.abort();routeRequest=new AbortController();const version=++routeVersion;
    closePreview(false);cleanupPage();route=parsePublicPath(url.pathname);filters=readDiscoveryFilters(url);baseKey=nextBase;
    pageBootstrap=initialBootstrap?.path===url.pathname&&initialBootstrap.search===url.search?initialBootstrap:null;initialBootstrap=null;pageAnalytics=analytics?.page();
    if(!pageBootstrap&&!(route?.kind==='merchant'&&main.querySelector('[data-merchant-root]')))main.innerHTML='<div class="container initial-loading" role="status"><p class="eyebrow">A little local inspiration</p>'+skeletonMarkup()+'</div>';
    try{
      if(!route)throw new Error('not_found');
      context=pageBootstrap?.context||await repository.context(route.citySlug,routeRequest.signal);
      if(version!==routeVersion)return;
      if(!context?.city){main.innerHTML='<div class="container">'+emptyMarkup('This town is getting ready','The local catalog is not available for this city yet. Please check back soon.',{name:'retry',label:'Try again'},'h1')+'</div>';return;}
      currentLocality=context.localities.find(p=>p.slug===filters.localitySlug);
      currentCategory=context.categories.find(c=>c.slug===(route.kind==='category'?route.categorySlug:filters.categorySlug));
      applyHeader();
      if(route.kind==='category'&&!currentCategory){main.innerHTML='<div class="container">'+emptyMarkup('This category is not available','It may be unpublished. Explore the other categories in your town.',{name:'explore',label:'Explore all places'},'h1')+'</div>';return;}
      if(route.kind==='merchant'){
        const {mountMerchant}=await import('./merchant.js');
        if(version!==routeVersion)return;
        let bootstrap;
        const embedded=document.getElementById('merchant-bootstrap');
        if(embedded){try{const value=JSON.parse(embedded.textContent);if(value.path===url.pathname)bootstrap=value;}catch{/* Load again through RLS if embedded data is malformed. */}embedded.remove();}
        const cleanup=await mountMerchant({main,route,repository:merchantRepository,cart,checkout,media,config,navigate,toast,signal:routeRequest.signal,bootstrap,analytics:pageAnalytics});
        if(version!==routeVersion){cleanup();return;}pageCleanups.push(cleanup);
      }else if(route.kind==='home')renderHome();else renderBrowse();
      if(focus){main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
      if(url.hash)requestAnimationFrame(()=>document.getElementById(url.hash.slice(1))?.scrollIntoView());
      if(filters.listingId)openPreview(filters.listingId,{push:false});
    }catch(error){
      if(error.name==='AbortError'||version!==routeVersion)return;
      if(import.meta.env.DEV)console.warn('Discovery initialization:',error.name,error.message);
      context=null;
      const setup=['setup_required','unconfigured'].includes(error.code);
      main.innerHTML='<div class="container initial-loading">'+emptyMarkup(setup?'Your local discovery is getting ready':'Discovery is taking a short pause',setup?'The discovery catalog needs its initial setup. Please check back shortly.':'We couldn’t connect to the local catalog. Please try again.',{name:'retry',label:'Try again'},'h1')+'</div>';
    }
  }
  document.querySelectorAll('[data-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.icon);});
  document.addEventListener('click',event=>{
    if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    const preview=event.target.closest('[data-preview]');
    if(preview){event.preventDefault();openPreview(preview.dataset.preview);return;}
    const anchor=event.target.closest('a[href]');
    if(anchor&&!anchor.target&&!anchor.hasAttribute('download')){
      const href=new URL(anchor.href,location.href);
      if(href.origin===location.origin&&isPublicPath(href.pathname)){
        if(href.pathname===location.pathname&&href.search===location.search&&href.hash)return;
        event.preventDefault();navigate(href.href);return;
      }
    }
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='retry'){baseKey='';renderRoute();}
    if(action==='explore')navigate('/'+context.city.slug+'/explore');
    if(action==='clear-filters'||action==='reset-search'){
      const changes={locality:null,category:null,sort:null,listing:null,...Object.fromEntries(Object.keys(filters.facets).map(key=>['f.'+key,null]))};
      if(action==='reset-search')changes.q=null;
      setParams(changes);
    }
    if(event.target.closest('[data-load-home]'))loadHome();
    if(event.target.closest('[data-load-results]'))loadResults();
    if(event.target.closest('[data-location-open]'))renderLocation();
    if(event.target.closest('[data-locality]')){const selected=event.target.closest('[data-locality]').dataset.locality;locationDialog.close();setParams({locality:selected});}
    if(event.target.closest('[data-menu-open]')){const button=document.querySelector('[data-menu-open]');const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));document.querySelector('#main-navigation').classList.toggle('is-open',open);}
    if(event.target.closest('[data-dialog-close]')){const dialog=event.target.closest('dialog');if(dialog===previewDialog)closePreview();else dialog.close();}
    if(event.target.closest('[data-share-preview]'))navigator.clipboard.writeText(location.href).then(()=>toast('Preview link copied.')).catch(()=>toast('Copy the link from your address bar to share this preview.'));
  },{signal:pageLife.signal});
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-filter]')){const changes={[event.target.name]:event.target.value};if(event.target.name==='category')for(const key of Object.keys(filters.facets))changes['f.'+key]=null;setParams(changes);}
    if(event.target.matches('[data-city-select]')){locationDialog.close();navigate('/'+event.target.value);}
  },{signal:pageLife.signal});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();},{signal:pageLife.signal});
  previewDialog.addEventListener('cancel',event=>{event.preventDefault();closePreview();},{signal:pageLife.signal});
  for(const dialog of [locationDialog,previewDialog])dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){if(dialog===previewDialog)closePreview();else dialog.close();}}},{signal:pageLife.signal});
  window.addEventListener('popstate',()=>renderRoute(),{signal:pageLife.signal});
  renderRoute();
  return ()=>{routeRequest?.abort();previewRequest?.abort();cleanupPage();headerCleanup?.();previewMediaCleanup?.();clearTimeout(toastTimer);analytics?.destroy();pageLife.abort();};
}

