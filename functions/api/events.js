import {handleEvents} from '../../src/server/events-handler.js';
import {serverSupabase} from '../../src/server/supabase.js';
export async function onRequest(context){
  return handleEvents(context.request,{client:serverSupabase(context.env),identity:context.request.cf?context.request.headers.get('CF-Connecting-IP'):null,
    secret:context.env.ANALYTICS_HMAC_SECRET||context.env.CHECKOUT_HMAC_SECRET,enabled:context.env.ANALYTICS_ENABLED!=='false'});
}
