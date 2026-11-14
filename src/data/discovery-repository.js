export class DiscoveryError extends Error {
  constructor(code = 'unavailable') { super('Discovery could not be loaded.'); this.name = 'DiscoveryError'; this.code = code; }
}
export function createDiscoveryRepository(client) {
  async function rpc(name, params = {}, signal) {
    if (!client) throw new DiscoveryError('unconfigured');
    const timeout = AbortSignal.timeout(12000);
    const { data, error } = await client.rpc(name, params).abortSignal(signal ? AbortSignal.any([signal, timeout]) : timeout);
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (error) throw new DiscoveryError(['PGRST202','42883'].includes(error.code) ? 'setup_required' : 'unavailable');
    return data;
  }
  return {
    context: (citySlug, signal) => rpc('discovery_context', { p_city_slug: citySlug || null }, signal),
    home: (cityId, localityId, offset = 0, signal) => rpc('discovery_home', { p_city_id: cityId, p_locality_id: localityId || null, p_offset: offset, p_limit: 4 }, signal),
    listings: (filters, signal) => rpc('discovery_listings', { p_city_id: filters.cityId, p_category_id: filters.categoryId || null, p_locality_id: filters.localityId || null, p_query: filters.query || '', p_sort: filters.sort || 'recommended', p_offset: filters.offset || 0, p_limit: filters.limit || 12, p_facets: filters.facets || {} }, signal),
    preview: (id, signal) => rpc('discovery_preview', { p_listing_id: id }, signal),
  };
}

