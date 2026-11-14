export const IMPORT_LIMITS=Object.freeze({bytes:5*1024*1024,rows:1000,columns:32,expandedBytes:16*1024*1024,entries:128,payloadBytes:1024*1024,timeout:15000});
export const CATALOG_COLUMNS=Object.freeze([
  ['sku','SKU'],['name','Product Name'],['description','Description'],['category','Category'],['price','Price'],['original_price','Original Price'],
  ['unit','Unit'],['dietary_type','Dietary Type'],['available','Available'],['active','Active'],['display_order','Display Order'],['image_reference','Image Reference'],
]);
export const PRICE_COLUMNS=CATALOG_COLUMNS.filter(([key])=>['sku','price','original_price'].includes(key));
export const columnLabel=key=>CATALOG_COLUMNS.find(([value])=>value===key)?.[1]||({price_minor:'Price',original_price_minor:'Original Price',product_category_id:'Category',image_media_id:'Image Reference'}[key])||key;
const normalize=value=>String(value??'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
const aliases=new Map(CATALOG_COLUMNS.flatMap(([key,label])=>[[normalize(key),key],[normalize(label),key]]));
const blank=value=>value===null||value===undefined||typeof value==='string'&&!value.trim();
const scalar=value=>value===null||['string','number','boolean'].includes(typeof value);
export function rowsFromSheet(matrix,mode='upsert') {
  if(!Array.isArray(matrix)||matrix.length>IMPORT_LIMITS.rows+1)throw new Error('Use at most 1,000 data rows, including blank row positions.');
  if(!['upsert','price_only'].includes(mode))throw new Error('Choose a supported import mode.');
  const first=matrix.findIndex(row=>Array.isArray(row)&&row.some(value=>!blank(value)));
  if(first===-1)throw new Error('This file is empty. Add a header row and product data.');
  const header=matrix[first];if(header.length>IMPORT_LIMITS.columns)throw new Error('Use at most 32 columns.');
  const keys=header.map(value=>blank(value)?null:aliases.get(normalize(value))),seen=new Set(),errors=[];
  header.forEach((value,index)=>{
    if(blank(value))return;
    const key=keys[index];
    if(!key)errors.push({row_number:first+1,column_name:String(value).slice(0,120),error_code:'unknown_column',message:'Unknown column. Use the downloaded template; merchant identity comes from the dashboard.'});
    else if(seen.has(key))errors.push({row_number:first+1,column_name:columnLabel(key),error_code:'duplicate_column',message:'This column appears more than once.'});
    else if(mode==='price_only'&&!['sku','price','original_price'].includes(key))errors.push({row_number:first+1,column_name:columnLabel(key),error_code:'price_only_column',message:'Price-only files may contain only SKU, Price and optional Original Price.'});
    seen.add(key);
  });
  for(const key of mode==='price_only'?['sku','price']:['sku','name','price'])if(!seen.has(key))errors.push({row_number:first+1,column_name:columnLabel(key),error_code:'required_column',message:'This required column is missing.'});
  const rows=[];
  for(let index=first+1;index<matrix.length;index++){
    const values=matrix[index]||[];if(values.every(blank))continue;
    if(values.length>IMPORT_LIMITS.columns)throw new Error('Use at most 32 columns.');
    const row={row_number:index+1};
    for(let col=0;col<Math.max(header.length,values.length);col++){
      if(!keys[col]){if(!blank(values[col]))errors.push({row_number:index+1,column_name:'Column '+(col+1),error_code:'extra_cell',message:'This cell has no recognised column heading.'});continue;}
      const value=values[col]??'';
      row[keys[col]]=typeof value==='string'?value.trim():scalar(value)?value:{invalid_type:value instanceof Date?'date':'cell_error'};
    }
    rows.push(row);
  }
  if(!rows.length)errors.push({row_number:first+2,column_name:null,error_code:'empty_file',message:'Add at least one product row below the headings.'});
  if(rows.length>IMPORT_LIMITS.rows)throw new Error('Split this import into files of at most 1,000 products.');
  if(new TextEncoder().encode(JSON.stringify(rows)).length>IMPORT_LIMITS.payloadBytes)throw new Error('The product data exceeds 1 MiB. Split it into smaller imports.');
  return {rows,errors,columns:keys.filter(Boolean),header_row:first+1};
}
export function validateImportRows(rows,mode='upsert') {
  const errors=[],duplicates=new Map();
  for(const row of rows){const sku=String(row.sku??'').trim();duplicates.set(sku,(duplicates.get(sku)||0)+1);}
  for(const row of rows){
    const add=(column_name,error_code,message)=>errors.push({row_number:row.row_number,column_name,error_code,message});
    for(const [key,value] of Object.entries(row)){
      if(key==='row_number')continue;
      if(!scalar(value)){add(key,'invalid_cell','Use plain text, numbers or booleans. Dates and spreadsheet errors are unsupported.');continue;}
      if(typeof value==='string'&&/^\s*[=+@-]/u.test(value))add(key,'formula','Replace formula-like cells with literal values.');
      if(typeof value==='string'&&/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))add(key,'control_character','Remove unsupported control characters.');
    }
    if(typeof row.sku!=='string'||!row.sku.trim()||row.sku.trim().length>80)add('sku','invalid_sku','SKU must be text with 1–80 characters. Format Excel SKU cells as Text.');
    else if(duplicates.get(row.sku.trim())>1)add('sku','duplicate_sku','Duplicate SKU in this file. Remove every duplicate.');
    const validPrice=value=>['string','number'].includes(typeof value)&&/^\d{1,9}(\.\d{1,2})?$/.test(String(value).trim())&&Number(value)<=999999999.99;
    if(!validPrice(row.price))add('price','invalid_price','Use a non-negative price with at most two decimal places and no currency symbols or separators.');
    if(!blank(row.original_price)&&!validPrice(row.original_price))add('original_price','invalid_price','Use a non-negative amount with at most two decimal places.');
    else if(!blank(row.original_price)&&validPrice(row.price)&&Number(row.original_price)<Number(row.price))add('original_price','original_below_price','Original Price must be at least Price.');
    if(mode==='upsert'){
      if(typeof row.name!=='string'||!row.name.trim()||row.name.length>180)add('name','invalid_name','Product Name must contain 1–180 characters.');
      if(row.description!==undefined&&(typeof row.description!=='string'&&row.description!==null||String(row.description??'').length>5000))add('description','invalid_description','Use plain text up to 5,000 characters.');
      if(!blank(row.unit)&&(typeof row.unit!=='string'||row.unit.length>80))add('unit','invalid_unit','Unit must contain at most 80 characters.');
      if(!blank(row.dietary_type)&&!['vegetarian','non_vegetarian','egg','not_applicable'].includes(String(row.dietary_type).toLowerCase().replace(/[ -]/g,'_')))add('dietary_type','invalid_dietary','Use vegetarian, non_vegetarian, egg or not_applicable.');
      for(const key of ['available','active'])if(!blank(row[key])&&!['true','false','yes','no','1','0'].includes(String(row[key]).toLowerCase()))add(key,'invalid_boolean','Use true/false, yes/no or 1/0.');
      if(!blank(row.display_order)&&(!/^\d{1,7}$/.test(String(row.display_order))||Number(row.display_order)>1000000))add('display_order','invalid_order','Use an integer from 0 to 1,000,000.');
      if(!blank(row.image_reference)&&!/^([a-f0-9]{8}-){1}([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(row.image_reference)))add('image_reference','invalid_image','Use an image UUID from this merchant’s media library.');
    }
  }
  return errors;
}
