export const PAGE_SIZE = 12;
export const HOME_PAGE_SIZE = 4;
export const SORTS = new Set(['recommended', 'name', 'newest', 'price_asc', 'price_desc']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeSearch(value) { return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 100); }
export function isUuid(value) { return typeof value === 'string' && UUID.test(value); }
export function readPageNumber(url){const value=url.searchParams.get('page');return value&&/^[1-9]\d{0,2}$/.test(value)&&Number(value)<=834?Number(value):1;}
export function readDiscoveryFilters(url) {
  const params = url.searchParams;
  const facets = {};
  for (const [key, value] of params) if (key.startsWith('f.') && /^[a-z0-9-]{1,120}$/.test(key.slice(2)) && value.length <= 120 && Object.keys(facets).length < 6) facets[key.slice(2)] = value;
  return { query: normalizeSearch(params.get('q')), localitySlug: params.get('locality') || '', categorySlug: params.get('category') || '', sort: SORTS.has(params.get('sort')) ? params.get('sort') : 'recommended', facets, page:readPageNumber(url), listingId: isUuid(params.get('listing')) ? params.get('listing') : null };
}
export function updateUrl(url, changes = {}, pathname) {
  const next = new URL(url);
  if (pathname) next.pathname = pathname;
  for (const [key,value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  return next.pathname + next.search + next.hash;
}
export function categoryPath(city, category) { return '/' + encodeURIComponent(city.slug) + '/' + encodeURIComponent(category.slug); }
export function topFeatured(items) {
  return [...items].filter((item) => item.enabled !== false && item.publication_status !== 'draft' && item.publication_status !== 'archived')
    .sort((a,b) => (a.rank ?? 0) - (b.rank ?? 0) || a.id.localeCompare(b.id)).slice(0,4);
}
export function isActiveAdvertisement(ad, now = Date.now()) {
  return ad.enabled !== false && !ad.archived_at && (!ad.starts_at || new Date(ad.starts_at).getTime() <= now) && (!ad.ends_at || new Date(ad.ends_at).getTime() > now);
}
export function demoImagePath(value) { return typeof value === 'string' && /^\/images\/demo\/[a-z0-9-]+\.(webp|avif|jpg)$/.test(value) ? value : null; }
export function availabilityLabel(value) { return ({temporarily_closed:'Temporarily closed',closed:'Closed by schedule',open:'Open by schedule',manually_open:'Open · manual status',hours_unavailable:'Hours not provided'})[value]||'Hours not verified'; }

