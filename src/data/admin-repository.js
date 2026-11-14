export function createAdminRepository(client) {
  async function rpc(name,args={}) {
    const {data,error} = await client.rpc(name,args);
    if(error)throw Object.assign(new Error(error.message),{code:error.code,details:error.details});
    return data;
  }
  return {
    context: city => rpc('admin_context',{p_city_id:city||null}),
    overview: city => rpc('admin_overview',{p_city_id:city}),
    analytics: (city,from,to,includeDemo=false) => rpc('admin_analytics',{p_city_id:city,p_from:from,p_to:to,p_include_demo:includeDemo}),
    listings: (city,query='',status='all',offset=0) => rpc('admin_listings',{p_city_id:city,p_query:query,p_status:status,p_offset:offset,p_limit:20}),
    listing: id => rpc('admin_listing',{p_id:id}),
    saveListing: (data,revision) => rpc('admin_save_listing',{p_data:data,p_expected:revision||null}),
    listingState: (id,action,revision) => rpc('admin_listing_state',{p_id:id,p_action:action,p_expected:revision}),
    saveTaxonomy: (kind,data,revision) => rpc('admin_save_taxonomy',{p_kind:kind,p_data:data,p_expected:revision||null}),
    deleteTaxonomy: (kind,id,revision) => rpc('admin_delete_taxonomy',{p_kind:kind,p_id:id,p_expected:revision}),
    ads: (city,offset=0) => rpc('admin_ads',{p_city_id:city,p_offset:offset,p_limit:20}),
    ad: id => rpc('admin_ad',{p_id:id}),
    saveAd: (data,revision) => rpc('admin_save_ad',{p_data:data,p_expected:revision||null}),
    ranking: (city,category,query='') => rpc('admin_ranking',{p_city_id:city,p_category_id:category,p_query:query}),
    saveRanking: (section,entries,revision) => rpc('admin_save_ranking',{p_section:section,p_entries:entries,p_expected:revision||null}),
    hours: id => rpc('admin_hours',{p_listing_id:id}),
    saveHours: (id,weekly,special,removed,revision) => rpc('admin_save_hours',{p_listing_id:id,p_weekly:weekly,p_special:special,p_removed:removed,p_expected:revision}),
    override: (id,data,revision) => rpc('admin_set_override',{p_listing_id:id,p_data:data,p_expected:revision}),
    updateMedia: (id,alt,role,enabled,order,revision) => rpc('admin_update_media',{p_id:id,p_alt_text:alt,p_role:role,p_enabled:enabled,p_order:order,p_expected:revision}),
    catalogMerchants: (city,query='',offset=0) => rpc('admin_catalog_merchants',{p_city_id:city,p_query:query,p_offset:offset}),
    catalogContext: merchant => rpc('admin_catalog_context',{p_merchant_id:merchant}),
    catalogProducts: (merchant,query='',status='all',offset=0) => rpc('admin_catalog_products',{p_merchant_id:merchant,p_query:query,p_status:status,p_offset:offset,p_limit:20}),
    catalogProduct: id => rpc('admin_catalog_product',{p_id:id}),
    saveProduct: (merchant,data,revision) => rpc('admin_save_product',{p_merchant_id:merchant,p_data:data,p_expected:revision||null}),
    productState: (id,action,revision) => rpc('admin_product_state',{p_id:id,p_action:action,p_expected:revision}),
    saveProductCategory: (merchant,data,revision) => rpc('admin_save_product_category',{p_merchant_id:merchant,p_data:data,p_expected:revision||null}),
    prepareImport: (merchant,mode,rows,source,id) => rpc('admin_prepare_import',{p_merchant_id:merchant,p_mode:mode,p_rows:rows,p_source:source,p_request_id:id}),
    importReport: (id,offset=0,limit=25,filter='all') => rpc('admin_import_report',{p_job_id:id,p_offset:offset,p_limit:limit,p_filter:filter}),
    importHistory: (merchant,offset=0) => rpc('admin_import_history',{p_merchant_id:merchant,p_offset:offset,p_limit:20}),
    applyImport: id => rpc('admin_apply_import',{p_job_id:id}),
  };
}
