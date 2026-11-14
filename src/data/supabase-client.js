import { createClient } from '@supabase/supabase-js';

// Public pages never load or persist an administrator's session.
// Admin sessions stay in this tab; public clients never read them.
export function createSupabaseClient(config, { admin = false, fetch, storage } = {}) {
  if (!config.configured || config.errors.length) return null;
  let sessionStore = storage;
  if (admin && !sessionStore) {
    try { sessionStore = globalThis.sessionStorage; } catch { /* Private browsing can deny storage. */ }
    if (!sessionStore) {
      const memory = new Map();
      sessionStore = { getItem: key => memory.get(key) ?? null, setItem: (key,value) => memory.set(key,value), removeItem: key => memory.delete(key) };
    }
  }
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: admin,
      autoRefreshToken: admin,
      detectSessionInUrl: false,
      storageKey: 'rawatbhata-one-admin-session',
      flowType: 'pkce',
      ...(admin ? { storage: sessionStore } : {}),
    },
    global: fetch ? { fetch } : {},
  });
}
