const CONTROLS=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function normalize(value,max){
  if(typeof value!=='string'||value.length>max*2||CONTROLS.test(value)||/[\uD800-\uDFFF]/u.test(value))return null;
  const result=value.normalize('NFC').replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[^\S\n]+/g,' ').trim()).filter(Boolean).join('\n');
  return result.length<=max?result:null;
}
export const ADDRESS_MESSAGE='Enter a complete delivery address (at least 12 characters), including your house/building and street or locality.';
export function deliveryAddress(value){
  const address=normalize(value,1000);
  if(!address||address.length<12||(address.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu)||[]).length<3
    ||(address.match(/[\p{L}\p{N}]/gu)||[]).length<8)return {value:'',error:ADDRESS_MESSAGE};
  return {value:address,error:''};
}
export function deliveryInstructions(value=''){
  const result=normalize(value,500);
  return result===null?{value:'',error:'Keep delivery instructions within 500 characters and remove unsupported control characters.'}:{value:result,error:''};
}

// Admin form guidance mirrors the server-owned category capability; checkout is still enforced in SQL.
export function foodCatalogType(type,categoryIds,categories){
  if(type==='RESTAURANT')return true;
  const byId=new Map(categories.map(category=>[category.id,category]));
  return categoryIds.some(id=>{
    const seen=new Set();let category=byId.get(id);
    while(category&&!seen.has(category.id)){if(category.food_catalog)return true;seen.add(category.id);category=byId.get(category.parent_id);}
    return false;
  });
}
