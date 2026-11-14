import { escapeHtml as e } from '../utils/dom.js';
import { safeDestination } from '../utils/urls.js';
import { isActiveAdvertisement, demoImagePath } from '../domain/discovery.js';
import { imageMarkup } from './discovery-ui.js';
import { icon } from './icons.js';
export function shouldRotate(state) { return state.count>1 && !state.paused && !state.hovered && !state.focused && state.visible && !state.reduced && !state.hidden; }
export function promotionSlideMarkup(ad,i,count,{origin,mobile=false}={}) {
    const destination=safeDestination(ad.destination_url,origin);
    const asset=demoImagePath(ad.demo_mobile_image_path);
    const mediaPath=mobile && ad.mobile_image_path?ad.mobile_image_path:ad.desktop_image_path;
    const image=imageMarkup({...ad,media:mediaPath?{bucket_id:'promotional-media',object_path:mediaPath,alt_text:ad.alt_text}:null},{className:'promotion-image',eager:i===0});
    const cta=destination?'<a class="promotion-cta" href="'+e(destination)+'"'+(destination.startsWith('https:')?' target="_blank" rel="noopener noreferrer"':'')+'>'+e(ad.cta_text || 'Explore more')+icon('arrow')+'</a>':ad.listing_id?'<button class="promotion-cta" type="button" data-promotion-preview="'+e(ad.listing_id)+'">'+e(ad.cta_text || 'Take a look')+icon('arrow')+'</button>':'';
    return '<section class="promotion-slide" data-ad-id="'+e(ad.id)+'" data-slide="'+i+'" role="group" aria-roledescription="slide" aria-label="'+(i+1)+' of '+count+'"'+(i?' hidden':'')+'><picture>'+(asset?'<source media="(max-width:600px)" srcset="'+e(asset)+'">':'')+image+'</picture><span class="promotion-label">'+(ad.sponsored?'Sponsored':'Featured')+(ad.is_demo?' · Demo':'')+'</span><p class="eyebrow">A little local inspiration</p><h2>'+e(ad.title)+'</h2><p class="promotion-copy">'+e(ad.subtitle || '')+'</p>'+cta+(ad.is_demo?'<span class="promotion-caption">Illustrative image · Fictional promotion</span>':'')+'</section>';
}
export function mountPromotionCarousel(root, ads, { onPreview,analytics } = {}) {
  const activeAds=ads.filter(ad=>isActiveAdvertisement(ad));
  if(!activeAds.length){root.hidden=true;return ()=>{};}
  root.hidden=false;root.className='promotion-carousel';root.setAttribute('role','region');root.setAttribute('aria-roledescription','carousel');root.setAttribute('aria-label','Sponsored local promotions');
  root.innerHTML=activeAds.map((ad,i)=>promotionSlideMarkup(ad,i,activeAds.length,{origin:location.origin,mobile:matchMedia('(max-width:600px)').matches})).join('')+(activeAds.length>1?'<div class="promotion-controls"><div class="promotion-dots">'+activeAds.map((_,i)=>'<button type="button" class="promotion-dot" data-dot="'+i+'" aria-label="Go to promotion '+(i+1)+'" aria-current="'+(i===0)+'"></button>').join('')+'</div><div class="promotion-buttons"><button type="button" class="icon-button" data-carousel-pause aria-label="Pause slideshow">'+icon('pause')+'</button><button type="button" class="icon-button previous" data-carousel-previous aria-label="Previous promotion">'+icon('chevron')+'</button><button type="button" class="icon-button" data-carousel-next aria-label="Next promotion">'+icon('chevron')+'</button></div></div>':'')+'<span class="sr-only" aria-live="polite" data-slide-announcement></span>';
  const life=new AbortController(), preference=matchMedia('(prefers-reduced-motion: reduce)');
  const state={count:activeAds.length,paused:preference.matches,hovered:false,focused:false,visible:true,reduced:preference.matches,hidden:document.hidden};
  let index=0,timer,expiryTimer;
  const impressionCleanups=[...root.querySelectorAll('[data-slide]')].map((slide,i)=>analytics?.watchAd(slide,activeAds[i]));
  function schedule(){clearTimeout(timer);if(shouldRotate(state))timer=setTimeout(()=>show(index+1,false),6500);}
  function show(next,announce=true){
    const usable=activeAds.map((ad,i)=>isActiveAdvertisement(ad)?i:-1).filter(i=>i>=0);
    if(!usable.length){root.hidden=true;clearTimeout(timer);return;}
    index=(next+activeAds.length)%activeAds.length;
    if(!usable.includes(index))index=usable[0];
    root.querySelectorAll('[data-slide]').forEach((slide,i)=>{slide.hidden=i!==index;});
    root.querySelectorAll('[data-dot]').forEach((dot,i)=>{dot.setAttribute('aria-current',String(i===index));dot.disabled=!usable.includes(i);});
    if(announce)root.querySelector('[data-slide-announcement]').textContent='Promotion '+(index+1)+' of '+activeAds.length+': '+activeAds[index].title;
    schedule();
  }
  function syncPause(){const button=root.querySelector('[data-carousel-pause]');if(button){button.innerHTML=icon(state.paused?'play':'pause');button.disabled=state.reduced;button.setAttribute('aria-label',state.reduced?'Auto-rotation disabled for reduced motion':state.paused?'Play slideshow':'Pause slideshow');}schedule();}
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-carousel-next]'))show(index+1);
    if(event.target.closest('[data-carousel-previous]'))show(index-1);
    if(event.target.closest('[data-dot]'))show(Number(event.target.closest('[data-dot]').dataset.dot));
    if(event.target.closest('[data-carousel-pause]')){state.paused=!state.paused;syncPause();}
    const preview=event.target.closest('[data-promotion-preview]');if(preview)onPreview?.(preview.dataset.promotionPreview);
    if(event.target.closest('.promotion-cta')){const slide=event.target.closest('[data-ad-id]');if(slide&&!slide.hidden&&isActiveAdvertisement(activeAds[index]))analytics?.track('ad_click',slide.dataset.adId);}
  },{signal:life.signal});
  root.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();show(index+(event.key==='ArrowRight'?1:-1));}},{signal:life.signal});
  root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){state.hovered=true;schedule();}},{signal:life.signal});
  root.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'){state.hovered=false;schedule();}},{signal:life.signal});
  root.addEventListener('focusin',()=>{state.focused=true;schedule();},{signal:life.signal});
  root.addEventListener('focusout',()=>queueMicrotask(()=>{state.focused=root.contains(document.activeElement);schedule();}),{signal:life.signal});
  document.addEventListener('visibilitychange',()=>{state.hidden=document.hidden;schedule();},{signal:life.signal});
  preference.addEventListener('change',()=>{state.reduced=preference.matches;state.paused=state.reduced;syncPause();},{signal:life.signal});
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{state.visible=entries[0].isIntersecting;schedule();},{threshold:.4});
  observer?.observe(root);
  function scheduleExpiry(){clearTimeout(expiryTimer);const next=Math.min(...activeAds.map(ad=>ad.ends_at?new Date(ad.ends_at).getTime():Infinity).filter(time=>time>Date.now()));if(Number.isFinite(next))expiryTimer=setTimeout(()=>{show(index,false);scheduleExpiry();},Math.min(next-Date.now()+20,2147483647));}
  syncPause();scheduleExpiry();
  return ()=>{clearTimeout(timer);clearTimeout(expiryTimer);observer?.disconnect();impressionCleanups.forEach(cleanup=>cleanup?.());life.abort();};
}

