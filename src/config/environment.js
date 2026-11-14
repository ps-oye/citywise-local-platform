const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PUBLIC_VARIABLES = new Set([
  'VITE_BRAND_NAME', 'VITE_SITE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY',
]);

export function parseOrigin(value) {
  try {
    const url = new URL(value);
    const secure = url.protocol === 'https:';
    const local = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
    if ((!secure && !local) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isPublicSupabaseKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export function readEnvironment(env = {}) {
  const errors = [];
  const rawUrl = (env.VITE_SUPABASE_URL ?? '').trim();
  const rawKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const rawSite = (env.VITE_SITE_URL ?? '').trim();
  const supabaseUrl = rawUrl ? parseOrigin(rawUrl) : null;
  const siteUrl = rawSite ? parseOrigin(rawSite) : null;
  const brandName = (env.VITE_BRAND_NAME ?? 'Rawatbhata One').trim();

  if (!brandName || brandName.length > 80) errors.push('VITE_BRAND_NAME must contain 1–80 characters.');
  if (rawUrl && !supabaseUrl) errors.push('VITE_SUPABASE_URL must be an HTTPS origin (HTTP is allowed on localhost).');
  if (rawSite && !siteUrl) errors.push('VITE_SITE_URL must be an HTTPS origin (HTTP is allowed on localhost).');
  if (Boolean(rawUrl) !== Boolean(rawKey)) errors.push('Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or leave both blank.');
  if (rawKey && !isPublicSupabaseKey(rawKey)) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a public publishable key or legacy anon JWT. Secret and service-role keys are forbidden.');
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && !PUBLIC_VARIABLES.has(name)) {
      errors.push(`${name} is not an allowed public configuration variable.`);
    }
  }

  return Object.freeze({
    brandName: brandName || 'Rawatbhata One',
    siteUrl,
    supabaseUrl,
    supabaseKey: rawKey,
    configured: Boolean(supabaseUrl && rawKey && errors.length === 0),
    errors: Object.freeze(errors),
  });
}
