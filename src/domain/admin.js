export const LISTING_TYPES = ['COMMERCE','RESTAURANT','HOTEL','SERVICE_PROVIDER','FITNESS','ATTRACTION','INFORMATIONAL','GENERAL_BUSINESS'];
export const WEEKDAYS = [[1,'Monday'],[2,'Tuesday'],[3,'Wednesday'],[4,'Thursday'],[5,'Friday'],[6,'Saturday'],[0,'Sunday']];
export const OFFERING_KINDS = {HOTEL:['room','package'],FITNESS:['membership','package'],SERVICE_PROVIDER:['service','package'],ATTRACTION:['visiting_info'],INFORMATIONAL:['visiting_info','service'],GENERAL_BUSINESS:['service','package']};
export function slugify(value) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100); }
export function moneyToMinor(value) {
  if(value==='')return null;
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(String(value)))throw new Error('Enter a valid non-negative price with up to two decimal places.');
  const [whole,fraction='']=String(value).split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export function localDateTime(value, timezone='Asia/Kolkata') {
  if(!value)return '';
  try { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`; }catch {return '';}
}
export function adminError(error) {
  if(error?.message==='CATALOG_ROW_INVALID'){
    try {const detail=JSON.parse(error.details||'{}');if(detail.message)return detail.message;}catch{/* The database detail is optional. */}
    return 'Check the product fields, price and merchant-scoped category/image references.';
  }
  if(error?.message==='CATALOG_IMPORT_LIMIT')return 'Use 1–1,000 product rows and at most 1 MiB of normalized product data. Split larger imports.';
  if(error?.message==='CATALOG_MERCHANT_REQUIRED')return 'Select an unarchived commerce or restaurant merchant to manage products.';
  if(error?.message==='CATALOG_REQUEST_CONFLICT')return 'This request identity was already used for different data. Start a new preview.';
  const messages={ADMIN_STALE_RECORD:'This record changed while you were editing. Reload it before saving again.',ADMIN_UNFEATURE_FIRST:'Remove this merchant from its featured category in Homepage ranking before changing that category.',ADMIN_FIXED_IDENTITY:'Existing city and sample status cannot be changed.',ADMIN_MEDIA_IN_USE:'This image is used by a product. Change the product image before removing it.',ADMIN_PAUSE_AD_FIRST:'Pause this advertisement before removing its images.',ADMIN_INVALID_ATTRIBUTE:'Check the category-specific details and try again.',ADMIN_CATEGORY_REQUIRED:'Select at least one category and a primary category.',ADMIN_OVERLAPPING_HOURS:'Opening intervals overlap. Adjust the shifts before saving.'};
  if(messages[error?.message])return messages[error.message];
  if(error?.code==='40001')return messages.ADMIN_STALE_RECORD;
  if(error?.code==='42501')return 'Your account no longer has administrator access. Sign in again.';
  if(['23503','23001'].includes(error?.code))return 'This record is still in use, or a selected related record no longer exists. Disable it instead or reload your selections.';
  if(error?.code==='23505')return 'That slug, name, date or opening time is already in use. Choose a unique value.';
  if(error?.code==='23514')return 'Check the highlighted fields, opening intervals, verified contact and image requirements. The change was not saved.';
  if(/^ADMIN_/.test(error?.message||''))return 'Check the form values and try again.';
  if(error?.code)return 'The request could not be completed. Check your connection and try again.';
  return error?.message || 'Something went wrong. Please try again.';
}
