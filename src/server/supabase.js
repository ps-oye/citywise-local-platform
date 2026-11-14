import { createClient } from '@supabase/supabase-js';
import { parseOrigin } from '../config/environment.js';

// Imported by server adapters only. Never import this module from src/app.js or public pages.
export function serverSupabase(env={}) {
  const url=parseOrigin(env.SUPABASE_URL||env.VITE_SUPABASE_URL||'');
  const key=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
