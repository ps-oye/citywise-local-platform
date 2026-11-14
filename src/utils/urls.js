// Use this for future merchant/ad destinations before assigning an href.
export function safeDestination(value, origin) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0020\\]/.test(value)) return null;
  try {
    const base = new URL(origin);
    if (value.startsWith('/') && !value.startsWith('//')) {
      const url = new URL(value, base);
      return url.origin === base.origin ? `${url.pathname}${url.search}${url.hash}` : null;
    }
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
