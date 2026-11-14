import { normalizeSearch,isUuid } from './discovery.js';

export const CATALOG_SORTS = new Set(['featured','name','price_asc','price_desc']);
export const DIETARY = new Set(['','vegetarian','non_vegetarian','egg','not_applicable']);
export function merchantPath(item,citySlug) {
  const city = citySlug || item.city?.slug;
  if(!city || !item.category_slug || !item.slug)return null;
  const values=[city,item.category_slug,item.slug];
  if(values.some(value=>!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)))return null;
  return '/'+values.map(encodeURIComponent).join('/');
}
export function catalogFilters(url) {
  const p=url.searchParams;
  return { query:normalizeSearch(p.get('product_q')),categoryId:isUuid(p.get('product_category'))?p.get('product_category'):'',dietary:DIETARY.has(p.get('diet'))?p.get('diet'):'',availableOnly:p.get('available')==='1',sort:CATALOG_SORTS.has(p.get('product_sort'))?p.get('product_sort'):'featured' };
}
export function formatClock(time) {
  if(typeof time!=='string' || !/^\d{2}:\d{2}/.test(time))return '';
  if(time.startsWith('24:00'))return 'midnight';
  const hour=Number(time.slice(0,2));return (hour%12||12)+':'+time.slice(3,5)+' '+(hour<12?'am':'pm');
}
export function formatZonedDate(value,timezone,{timeOnly=false}={}) {
  try { return new Intl.DateTimeFormat('en-IN',{ timeZone:timezone,...(!timeOnly?{weekday:'short',day:'numeric',month:'short'}:{}),hour:'numeric',minute:'2-digit' }).format(new Date(value)); } catch { return ''; }
}
export function statusCopy(status) {
  if(!status || status.state==='hours_unavailable')return {label:'Hours not provided',detail:'Check with the business before visiting.',closed:false};
  if(status.state==='temporarily_closed')return {label:'Temporarily closed',detail:status.next_change_at?'Status will be checked again '+formatZonedDate(status.next_change_at,status.timezone):'A manual closure is in place.',closed:true};
  if(status.state==='open')return {label:status.source==='manual'?'Open · manual status':'Open by schedule',detail:status.next_change_at?'Until '+formatZonedDate(status.next_change_at,status.timezone):status.source==='manual'?'Opening status was set by the administrator.':'Open by the published schedule.',closed:false};
  return {label:'Closed by schedule',detail:status.next_open_at?'Next opens '+formatZonedDate(status.next_open_at,status.timezone):'No opening is scheduled in the next eight days.',closed:true};
}
export function directionsUrl(merchant) {
  if(merchant.is_demo || !merchant.actions?.directions_enabled)return null;
  const hasCoordinates=merchant.latitude!==null && merchant.latitude!==undefined && merchant.longitude!==null && merchant.longitude!==undefined;
  const lat=Number(merchant.latitude),lng=Number(merchant.longitude);
  if(hasCoordinates && (!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180))return null;
  if(!hasCoordinates && !merchant.maps_place_id)return null;
  const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');
  url.searchParams.set('destination',hasCoordinates?lat+','+lng:merchant.name);
  if(merchant.maps_place_id)url.searchParams.set('destination_place_id',merchant.maps_place_id);
  return url.href;
}
export function verifiedTelephone(merchant,kind='phone_number') {
  const value=merchant[kind];return !merchant.is_demo&&merchant.contact_verified_at&&/^\+[1-9][0-9]{7,14}$/.test(value||'')?value:null;
}
