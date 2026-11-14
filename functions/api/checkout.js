import { handleCheckout } from '../../src/server/checkout-handler.js';
import { serverSupabase } from '../../src/server/supabase.js';

export async function onRequest(context) {
  // Real Pages ingress supplies cf metadata and replaces CF-Connecting-IP.
  // Never fall back to caller-supplied X-Forwarded-For.
  const identity=context.request.cf?context.request.headers.get('CF-Connecting-IP'):null;
  return handleCheckout(context.request,{client:serverSupabase(context.env),identity,
    secret:context.env.CHECKOUT_HMAC_SECRET||context.env.SUPABASE_SERVICE_ROLE_KEY||context.env.SUPABASE_SECRET_KEY});
}
