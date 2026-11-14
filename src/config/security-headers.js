import {parseOrigin} from './environment.js';
export const PUBLIC_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};

export function publicSecurityHeaders(env={}){
  const origin=parseOrigin(env.SUPABASE_URL||env.VITE_SUPABASE_URL||'');
  if(!origin||new URL(origin).hostname.endsWith('.supabase.co'))return {...PUBLIC_SECURITY_HEADERS};
  return {...PUBLIC_SECURITY_HEADERS,'Content-Security-Policy':PUBLIC_SECURITY_HEADERS['Content-Security-Policy'].replaceAll('https://*.supabase.co','https://*.supabase.co '+origin)};
}

