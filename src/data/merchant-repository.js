import { DiscoveryError } from './discovery-repository.js';

export function createMerchantRepository(client) {
  async function rpc(name,args,signal){
    if(!client)throw new DiscoveryError('unconfigured');
    const timeout=AbortSignal.timeout(12000);
    const {data,error}=await client.rpc(name,args).abortSignal(signal?AbortSignal.any([signal,timeout]):timeout);
    if(signal?.aborted)throw new DOMException('Request cancelled','AbortError');
    if(error)throw new DiscoveryError(['PGRST202','42883'].includes(error.code)?'setup_required':'unavailable');
    return data;
  }
  return {
    detail:(route,signal)=>rpc('merchant_detail',{p_city_slug:route.citySlug,p_category_slug:route.categorySlug,p_listing_slug:route.listingSlug},signal),
    products:(merchantId,filters={},signal)=>rpc('merchant_products',{p_merchant_id:merchantId,p_query:filters.query||'',p_category_id:filters.categoryId||null,p_dietary:filters.dietary||'',p_available_only:Boolean(filters.availableOnly),p_sort:filters.sort||'featured',p_offset:filters.offset||0,p_limit:12},signal),
    quote:(merchantId,items,fulfilment='enquiry',signal)=>rpc('merchant_cart_quote',{p_merchant_id:merchantId,p_items:items,p_fulfilment:fulfilment},signal),
  };
}
