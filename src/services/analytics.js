import {isUuid,isActiveAdvertisement} from '../domain/discovery.js';
const preferenceKey='rawatbhata:analytics-opt-out';
export function analyticsAllowed({navigator:nav={},optOut=false}={}){return !optOut&&nav.doNotTrack!=='1'&&nav.doNotTrack!=='yes'&&nav.globalPrivacyControl!==true;}
export function qualifiesAd({ratio,visible,active,loaded,covered=false}){return ratio>=.5&&visible&&active&&loaded&&!covered;}
export function createAnalytics({fetcher=fetch,nav=navigator,doc=document,storage}={}){
  let optOut=false;try{storage??=globalThis.localStorage;optOut=storage?.getItem(preferenceKey)==='true';}catch{/* Preference persistence is optional. */}
  const life=new AbortController();let queue=[],timer,busy=false,controller,preferenceVersion=0;
  const view=doc.defaultView;
  const allowed=()=>analyticsAllowed({navigator:nav,optOut});
  function schedule(delay=300){clearTimeout(timer);if(queue.length&&allowed())timer=setTimeout(flush,delay);}
  async function flush(){
    clearTimeout(timer);if(busy||!queue.length||!allowed())return;
    busy=true;const batch=queue.splice(0,20),version=preferenceVersion;controller=new AbortController();
    try{
      const result=await fetcher('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',keepalive:true,body:JSON.stringify({events:batch.map(({attempts,...event})=>event)}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
      if(result.status===429||result.status>=500)throw new Error('retry');
    }catch{if(allowed()&&version===preferenceVersion)queue=[...batch.filter(event=>event.attempts<2).map(event=>({...event,attempts:event.attempts+1})),...queue].slice(0,100);}
    finally{busy=false;controller=null;schedule(2000);}
  }
  function track(type,id){
    if(!allowed()||!isUuid(id)||queue.length>=100||typeof crypto.randomUUID!=='function')return;
    queue.push({event_key:crypto.randomUUID(),event_type:type,[type.startsWith('ad_')?'advertisement_id':'listing_id']:id,attempts:0});schedule();
  }
  function page(){
    const views=new Set(),impressions=new Set();
    return {track,view(id){if(!views.has(id)){views.add(id);track('listing_view',id);}},
      watchAd(slide,ad){
        if(typeof IntersectionObserver==='undefined')return ()=>{};
        const local=new AbortController(),image=slide.querySelector('img');let ratio=0,qualification;
        const state=()=>({ratio,visible:!doc.hidden,active:!slide.hidden&&!slide.closest('[hidden]')&&isActiveAdvertisement(ad),
          loaded:Boolean(image?.complete&&image.naturalWidth>0&&!(image.currentSrc||image.src).includes('/images/listing-placeholder.svg')),
          covered:Boolean(doc.querySelector('dialog[open]'))});
        function check(){
          clearTimeout(qualification);
          if(impressions.has(ad.id)||!allowed()||!qualifiesAd(state()))return;
          qualification=setTimeout(()=>{if(allowed()&&qualifiesAd(state())&&!impressions.has(ad.id)){impressions.add(ad.id);track('ad_visible_impression',ad.id);}},1000);
        }
        const observer=new IntersectionObserver(entries=>{ratio=entries[0]?.intersectionRatio||0;check();},{threshold:[0,.5,1]});observer.observe(slide);
        const mutations=new MutationObserver(check);mutations.observe(slide,{subtree:true,attributes:true,attributeFilter:['hidden','src','srcset']});
        const dialogs=new MutationObserver(check);doc.querySelectorAll('dialog').forEach(dialog=>dialogs.observe(dialog,{attributes:true,attributeFilter:['open']}));
        doc.addEventListener('visibilitychange',check,{signal:local.signal});image?.addEventListener('load',check,{signal:local.signal});image?.addEventListener('error',check,{signal:local.signal});
        return ()=>{clearTimeout(qualification);observer.disconnect();mutations.disconnect();dialogs.disconnect();local.abort();};
      }};
  }
  function updatePreference(value){const next=Boolean(value);if(next!==optOut)preferenceVersion++;optOut=next;if(optOut){queue=[];clearTimeout(timer);controller?.abort();}sync();}
  function refreshPreference(){if(!storage)return;try{updatePreference(storage.getItem(preferenceKey)==='true');}catch{/* A blocked store must not undo this tab's choice. */}}
  function setOptOut(value){try{storage?.setItem(preferenceKey,String(Boolean(value)));}catch{/* This tab still honors the choice. */}updatePreference(value);}
  const dialog=doc.querySelector('#privacy-dialog'),checkbox=dialog?.querySelector('[data-analytics-opt-out]');
  function sync(){if(checkbox){const forced=!analyticsAllowed({navigator:nav});checkbox.checked=optOut||forced;checkbox.disabled=forced;dialog.querySelector('[data-privacy-signal]').hidden=!forced;}}
  doc.addEventListener('click',event=>{if(event.target.closest('[data-privacy-open]')){sync();dialog?.showModal();}if(event.target.closest('[data-privacy-close]'))dialog?.close();},{signal:life.signal});
  checkbox?.addEventListener('change',()=>setOptOut(checkbox.checked),{signal:life.signal});
  view?.addEventListener('storage',event=>{if(event.storageArea===storage&&(event.key===preferenceKey||event.key===null))refreshPreference();},{signal:life.signal});
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)flush();else refreshPreference();},{signal:life.signal});
  return {page,track,flush,setOptOut,allowed,destroy(){clearTimeout(timer);controller?.abort();queue=[];life.abort();}};
}
