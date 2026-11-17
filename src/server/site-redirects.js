import {parseOrigin} from '../config/environment.js';
import {parsePublicPath,cityHomePath} from '../config/public-routes.js';

// Opt in only after the apex domain is live. Never redirect API writes or arbitrary hosts.
export function siteRedirect(request,env={}){
  if(!['GET','HEAD'].includes(request.method))return null;
  const url=new URL(request.url),route=parsePublicPath(url.pathname);
  const origin=parseOrigin(env.SITE_URL||env.VITE_SITE_URL||'');
  const enabled=env.SITE_REDIRECTS_ENABLED==='true'&&origin==='https://shaharone.in';
  let path;
  if(enabled&&url.hostname==='www.shaharone.in')path=url.pathname;
  if(enabled&&url.hostname==='rawatbhata-one.pages.dev'){
    if(route?.kind==='platform')path='/rawatbhata/';
    else if(route)path=route.kind==='home'?cityHomePath(route.citySlug):url.pathname.replace(/\/$/,'');
    else if(['/admin','/admin/'].includes(url.pathname))path='/admin/';
  }
  if(path&&!path.startsWith('//')&&!path.includes('\\')&&!url.pathname.startsWith('/api/'))return new Response(null,{status:308,headers:{Location:origin+path+url.search,'Cache-Control':'no-store'}});
  if(route?.kind==='home'&&url.pathname!==cityHomePath(route.citySlug))return new Response(null,{status:308,headers:{Location:cityHomePath(route.citySlug)+url.search,'Cache-Control':'no-store'}});
  // Historical root quick-look/search links still resolve without making / a city homepage.
  if(route?.kind==='platform'&&['listing','q','locality','category','sort'].some(key=>url.searchParams.has(key)))return new Response(null,{status:307,headers:{Location:'/rawatbhata/'+url.search,'Cache-Control':'no-store'}});
  return null;
}
