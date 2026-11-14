import { parsePublicPath } from '../src/config/public-routes.js';
import { PUBLIC_SECURITY_HEADERS } from '../src/config/security-headers.js';
import { serveMerchantPage } from '../src/server/merchant-page.js';
import {serveDiscoveryPage} from '../src/server/discovery-page.js';
import {serveSeoEndpoint,isSeoEndpoint} from '../src/server/seo-endpoints.js';

// Public routes use public credentials/RLS; static and administrative assets bypass this renderer.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const route=parsePublicPath(url.pathname);
  if (!route&&!isSeoEndpoint(url.pathname)) return context.next();
  if (!['GET', 'HEAD'].includes(context.request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', ...PUBLIC_SECURITY_HEADERS } });
  if(isSeoEndpoint(url.pathname))return serveSeoEndpoint(context);
  if(route.kind==='merchant')return serveMerchantPage(context,route);
  return serveDiscoveryPage(context,route);
}

