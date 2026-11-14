import '../../styles/catalog.css';
import {formatMoney} from '../../utils/format.js';
import {catalogHeader,catalogUrl} from '../catalog-ui.js';
import {catalogProductEditor,productCategoriesPage} from '../catalog-product-editor.js';
import {importPage,importHistoryPage,importReportPage} from '../catalog-imports.js';
import {e,heading,field,select,badge,empty} from '../ui.js';
export async function catalogPage(app,value) {
  if(!value)return merchantSelection(app);
  const [id,search='']=value.split('?'),query=new URLSearchParams(search),context=await app.repo.catalogContext(id);
  if(context.merchant.city_id!==app.context.city_id)throw new Error('This catalog belongs to another city. Select that city before opening it.');
  if(query.has('product'))return catalogProductEditor(app,context,query.get('product'));
  if(query.get('tab')==='categories')return productCategoriesPage(app,context,query.get('category'));
  if(query.get('tab')==='import')return importPage(app,context);
  if(query.get('tab')==='history')return importHistoryPage(app,context);
  if(query.get('tab')==='report')return importReportPage(app,context,query.get('job'));
  return products(app,context);
}
async function merchantSelection(app) {
  let query='',offset=0,attempt=0;
  async function load(){
    const version=++attempt,data=await app.repo.catalogMerchants(app.context.city_id,query,offset);
    if(version!==attempt||!app.mount(heading('Products & imports','A well-kept catalog starts here.','Choose a shop or restaurant to manage products, upload spreadsheets and review import history.')+`<section class="admin-card"><form class="admin-toolbar" data-catalog-merchants>${field('Find a shop or restaurant','catalog-merchant-query',query,{type:'search',maxlength:100,placeholder:'Search merchant name or slug'})}<button class="button button-secondary" type="submit">Find merchants</button></form>${data.items.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Merchant</th><th>Type</th><th>Publication</th><th></th></tr></thead><tbody>${data.items.map(item=>`<tr><td><a href="${catalogUrl(item.id)}">${e(item.name)}</a></td><td>${item.listing_type==='RESTAURANT'?'Restaurant':'Commerce'}</td><td>${badge(item.publication_status,item.publication_status==='published'?'green':'neutral')}</td><td><a href="${catalogUrl(item.id)}">Open catalog ↗</a></td></tr>`).join('')}</tbody></table></div>`:empty('No shops or restaurants found','Try another name or create a commerce listing first.')}<div class="admin-pagination"><span>Catalogs are kept separate for each merchant.</span><div class="admin-inline"><button class="button button-secondary" type="button" data-previous${offset?'':' disabled'}>Previous</button><button class="button button-secondary" type="button" data-next${data.has_more?'':' disabled'}>Next</button></div></div></section>`))return;
    app.root.querySelector('[data-catalog-merchants]').onsubmit=event=>{event.preventDefault();query=event.currentTarget.elements['catalog-merchant-query'].value.trim();offset=0;app.run(event.currentTarget.querySelector('button'),load);};
    app.root.querySelector('[data-previous]').onclick=event=>{offset=Math.max(0,offset-20);app.run(event.currentTarget,load);};app.root.querySelector('[data-next]').onclick=event=>{offset+=20;app.run(event.currentTarget,load);};
  }
  await load();
}
async function products(app,context) {
  let query='',status='all',offset=0,sequence=0;
  async function load(){
    const attempt=++sequence,data=await app.repo.catalogProducts(context.merchant.id,query,status,offset);
    if(attempt!==sequence||!app.mount(catalogHeader(context)+`<section class="admin-card"><div class="admin-section-heading"><div><p class="eyebrow">The collection</p><h2>Products</h2><p>${data.total} matching products · catalog version ${context.version}</p></div><div class="admin-inline">${!context.merchant.archived_at?`<a class="button button-secondary" href="${catalogUrl(context.merchant.id,{tab:'import'})}">Import spreadsheet</a><a class="button button-primary" href="${catalogUrl(context.merchant.id,{product:'new'})}">+ Add product</a>`:''}</div></div><form class="admin-toolbar" data-product-search>${field('Find a product','product-query',query,{type:'search',maxlength:100,placeholder:'Product name or SKU'})}${select('Show products','product-status',[['all','All current products'],['active','Active'],['inactive','Inactive'],['unavailable','Unavailable'],['archived','Archived']].map(([id,name])=>({id,name})),status)}<button type="submit" class="button button-secondary">Search products</button></form>${data.items.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody>${data.items.map(item=>`<tr><td><a href="${catalogUrl(context.merchant.id,{product:item.id})}">${e(item.name)}</a><small>${e(item.unit)}</small></td><td><code>${e(item.sku)}</code></td><td>${e(formatMoney(Number(item.price_minor)))}${item.original_price_minor!==null?'<small><del>'+e(formatMoney(Number(item.original_price_minor)))+'</del></small>':''}</td><td>${e(item.category_name||'—')}</td><td>${badge(item.archived_at?'Archived':item.active?'Active':'Inactive',item.active&&!item.archived_at?'green':'neutral')}${!item.available?'<small>Unavailable</small>':''}</td><td><a href="${catalogUrl(context.merchant.id,{product:item.id})}" aria-label="Edit ${e(item.name)}">Edit ↗</a></td></tr>`).join('')}</tbody></table></div>`:empty('No products found',query?'Try a different search or status.':'Add a product or import your first catalog.')}<div class="admin-pagination"><span>${data.total?offset+1:0}–${Math.min(offset+20,data.total)} of ${data.total}</span><div class="admin-inline"><button class="button button-secondary" type="button" data-previous${offset?'':' disabled'}>Previous</button><button class="button button-secondary" type="button" data-next${data.has_more?'':' disabled'}>Next</button></div></div></section>`))return;
    app.root.querySelector('[data-product-search]').onsubmit=event=>{event.preventDefault();query=event.currentTarget.elements['product-query'].value.trim();status=event.currentTarget.elements['product-status'].value;offset=0;app.run(event.currentTarget.querySelector('button'),load);};app.root.querySelector('[data-previous]').onclick=event=>{offset=Math.max(0,offset-20);app.run(event.currentTarget,load);};app.root.querySelector('[data-next]').onclick=event=>{offset+=20;app.run(event.currentTarget,load);};
  }
  await load();
}
