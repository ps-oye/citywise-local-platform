import {e,heading} from './ui.js';
export const catalogUrl=(id,values={})=>'#catalog/'+id+(Object.keys(values).length?'?'+new URLSearchParams(values):'');
export function catalogHeader(context,tab='products') {
  const id=context.merchant.id;
  return heading('Products & imports',context.merchant.name,'Look after this merchant’s catalog, one product or one spreadsheet at a time.',`<a class="button button-secondary" href="#catalog">← Choose merchant</a>`)+`<nav class="admin-tabs catalog-tabs" aria-label="Catalog tools">${[['products','Products'],['import','Import files'],['categories','Product categories'],['history','Import history']].map(([key,label])=>`<a href="${catalogUrl(id,key==='products'?{}:{tab:key})}"${key===tab?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`+(context.merchant.archived_at?'<p class="admin-helper">This merchant is archived. Restore the merchant before changing its catalog.</p>':'');
}
export function errorTable(errors,limit=25) {
  if(!errors.length)return '';
  return `<div class="catalog-errors" role="alert"><h3>Check these cells</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Row</th><th>Column</th><th>What to fix</th></tr></thead><tbody>${errors.slice(0,limit).map(error=>`<tr><td>${e(error.row_number)}</td><td>${e(error.column_name||'File')}</td><td>${e(error.message)}</td></tr>`).join('')}</tbody></table></div>${errors.length>limit?`<p>Showing ${limit} of ${errors.length} errors. Download the report for the full list.</p>`:''}</div>`;
}
