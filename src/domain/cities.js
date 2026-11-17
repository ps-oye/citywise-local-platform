export const CITY_PAGE_SIZE = 24;
export const CITY_FIELDS = 'id,name,slug,state,country_code,timezone,is_default';

export function cityFilters(url) {
  const query = (url.searchParams.get('city_q') || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  const rawPage = url.searchParams.get('page') || '1';
  const page = /^[1-9][0-9]{0,2}$/.test(rawPage) ? Number(rawPage) : 1;
  return { query, page, offset: (page - 1) * CITY_PAGE_SIZE };
}
export const citySearchPattern = query => '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
export function cityResults(rows, filters) {
  if (!Array.isArray(rows)) throw new Error('Invalid city catalog');
  return { cities: rows.slice(0, CITY_PAGE_SIZE), hasMore: rows.length > CITY_PAGE_SIZE, ...filters };
}
