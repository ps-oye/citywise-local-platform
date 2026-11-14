import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { Readable } from 'node:stream';
import { loadEnv } from 'vite';
import { parsePublicPath } from '../src/config/public-routes.js';
import { handleCheckout } from '../src/server/checkout-handler.js';
import { handleAdminMedia } from '../src/server/admin-media-handler.js';
import { serverSupabase } from '../src/server/supabase.js';
import { serveMerchantPage } from '../src/server/merchant-page.js';
import {serveDiscoveryPage} from '../src/server/discovery-page.js';
import {serveSeoEndpoint,isSeoEndpoint} from '../src/server/seo-endpoints.js';
import {handleEvents} from '../src/server/events-handler.js';

export function applicationRuntime(mode){
  async function install(server,isPreview){
    let privateVars={};try{privateVars=parseEnv(await readFile('.dev.vars','utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Could not read local server configuration');}
    const env={...loadEnv(mode,process.cwd(),''),...privateVars,...process.env};
    const trusted=serverSupabase(env);
    server.middlewares.use(async(request,response,next)=>{
      const port=isPreview?server.config.preview.port:server.config.server.port;
      const url=new URL(request.url,'http://127.0.0.1:'+port),route=parsePublicPath(url.pathname);
      if(!['/api/checkout','/api/admin/media','/api/events'].includes(url.pathname)&&!route&&!isSeoEndpoint(url.pathname))return next();
      try{
        const init={method:request.method,headers:request.headers};
        if(!['GET','HEAD'].includes(request.method)){init.body=Readable.toWeb(request);init.duplex='half';}
        const webRequest=new Request(url,init);
        let result;
        if(url.pathname==='/api/admin/media')result=await handleAdminMedia(webRequest,{env});
        else if(url.pathname==='/api/checkout')result=await handleCheckout(webRequest,{client:trusted,identity:request.socket.remoteAddress,secret:env.CHECKOUT_HMAC_SECRET||env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY});
        else if(url.pathname==='/api/events')result=await handleEvents(webRequest,{client:trusted,identity:request.socket.remoteAddress,secret:env.ANALYTICS_HMAC_SECRET||env.CHECKOUT_HMAC_SECRET,enabled:env.ANALYTICS_ENABLED!=='false'});
        else if(!['GET','HEAD'].includes(request.method))result=new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
        else result=await (isSeoEndpoint(url.pathname)?serveSeoEndpoint:route.kind==='merchant'?serveMerchantPage:serveDiscoveryPage)({request:webRequest,env:{...env,ASSETS:{fetch:async()=>{
          const html=await readFile(isPreview?'dist/index.html':'index.html','utf8');
          return new Response(isPreview?html:await server.transformIndexHtml(request.url,html),{headers:{'Content-Type':'text/html'}});
        }}}},isSeoEndpoint(url.pathname)?{}:route);
        response.statusCode=result.status;
        result.headers.forEach((value,name)=>{if(!isPreview&&name==='content-security-policy')return;response.setHeader(name,value);});
        response.end(Buffer.from(await result.arrayBuffer()));
      }catch{response.statusCode=503;response.setHeader('Content-Type','text/plain');response.setHeader('Cache-Control','no-store');response.end('This service is temporarily unavailable.');}
    });
  }
  return {name:'merchant-runtime',configureServer:server=>install(server,false),configurePreviewServer:server=>install(server,true)};
}
