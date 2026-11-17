// Shared by public browser navigation and server-rendered merchant pages.
// Missing optional delivery reads must not hide existing public businesses.
export async function loadMerchantDetail(rpc,args,signal){
  try{
    const merchant=await rpc('merchant_detail_checkout',args,signal);
    return merchant?{...merchant,checkout_ready:true}:null;
  }catch(error){
    if(error.rpcCode!=='PGRST202')throw error;
  }
  const merchant=await rpc('merchant_detail',args,signal);
  if(!merchant)return null;
  const context=await rpc('discovery_context',{p_city_slug:args.p_city_slug},signal);
  if(!context?.city||!Array.isArray(context.cities))throw new Error('Public city context unavailable');
  return {...merchant,checkout_ready:false,has_multiple_cities:context.cities.length>1};
}
