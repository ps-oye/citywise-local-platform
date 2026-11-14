import { demoImagePath } from '../domain/discovery.js';
import { placeholder } from '../components/discovery-ui.js';
export function createMediaService(client, origin) {
  const cache=new Map();
  async function sign(bucket,paths) {
    if(!client || !['listing-media','promotional-media'].includes(bucket))return new Map();
    const unique=[...new Set(paths)].filter(path=>/^[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(jpg|jpeg|png|webp|avif)$/.test(path));
    const needed=unique.filter(path=>!cache.has(bucket+'/'+path) || cache.get(bucket+'/'+path).expires<Date.now());
    if(needed.length){
      const {data,error}=await client.storage.from(bucket).createSignedUrls(needed,60);
      if(!error)for(const item of data || []){
        try{const url=new URL(item.signedUrl);if(url.origin===origin)cache.set(bucket+'/'+item.path,{url:url.href,expires:Date.now()+45000});}catch{/* Invalid response falls back to the local placeholder. */}
      }
    }
    return new Map(unique.map(path=>[path,cache.get(bucket+'/'+path)?.url || placeholder]));
  }
  function hydrate(root) {
    const life=new AbortController(), queue=new Set();let timer;
    async function flush(){
      const images=[...queue];queue.clear();
      for(const bucket of ['listing-media','promotional-media']){
        const group=images.filter(img=>img.dataset.mediaBucket===bucket && img.isConnected);
        if(!group.length)continue;
        try{const urls=await sign(bucket,group.map(img=>img.dataset.mediaPath));for(const img of group)if(img.isConnected)img.src=urls.get(img.dataset.mediaPath) || placeholder;}catch{for(const img of group)img.src=placeholder;}
      }
    }
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){queue.add(entry.target);observer.unobserve(entry.target);}if(queue.size){clearTimeout(timer);timer=setTimeout(flush,0);}},{rootMargin:'240px'});
    root.querySelectorAll('img').forEach(img=>{
      img.addEventListener('error',()=>{
        if(img.src.endsWith(placeholder))return;
        if(img.dataset.mediaPath && !img.dataset.mediaRetried){img.dataset.mediaRetried='true';cache.delete(img.dataset.mediaBucket+'/'+img.dataset.mediaPath);queue.add(img);flush();}
        else img.src=placeholder;
      },{signal:life.signal});
      if(img.dataset.mediaPath){if(observer)observer.observe(img);else queue.add(img);}
      else if(!demoImagePath(img.getAttribute('src')) && !img.getAttribute('src')?.startsWith('/icons/')){/* Static placeholders need no signing. */}
    });
    if(!observer && queue.size)flush();
    return ()=>{observer?.disconnect();clearTimeout(timer);life.abort();};
  }
  return {hydrate};
}

