const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['admin', 'api', 'assets', 'images', 'icons', 'media', 'sitemaps', 'src', 'node-modules', 'docs', 'explore', 'search']);
export const isCitySlug = value => typeof value === 'string' && value.length <= 120 && SLUG.test(value) && !RESERVED.has(value);
export const cityHomePath = city => '/' + (typeof city === 'string' ? city : city.slug) + '/';
export function parsePublicPath(pathname) {
  if (pathname === '/') return { kind: 'platform' };
  if (!pathname.startsWith('/') || pathname.includes('//')) return null;
  const parts = pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !SLUG.test(part) || part.length>120) || !isCitySlug(parts[0])) return null;
  if(parts.length===3)return ['explore','search'].includes(parts[1])?null:{kind:'merchant',citySlug:parts[0],categorySlug:parts[1],listingSlug:parts[2]};
  return { citySlug: parts[0], kind: !parts[1] ? 'home' : parts[1] === 'explore' ? 'explore' : parts[1] === 'search' ? 'search' : 'category', categorySlug: parts[1] ?? null };
}
export function isPublicPath(pathname) { return Boolean(parsePublicPath(pathname)); }

