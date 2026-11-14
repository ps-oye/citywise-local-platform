import {e,heading,field,empty} from './ui.js';
export async function merchantPicker(app,route,title,detail) {
  let sequence=0;
  async function search(query='') {
    const attempt=++sequence,data=await app.repo.listings(app.context.city_id,query,'all');
    if(attempt!==sequence||!app.mount(heading('Merchant tools',title,detail)+`<section class="admin-card"><form class="admin-toolbar" data-picker-search>${field('Find a merchant','picker-search',query,{type:'search',placeholder:'Business name or slug',maxlength:100})}<button type="submit" class="button button-secondary">Find merchants</button></form>${data.items.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Merchant</th><th>Type</th><th></th></tr></thead><tbody>${data.items.map(item=>`<tr><td><a href="#${route}/${e(item.id)}">${e(item.name)}</a></td><td>${e(item.category_name)}</td><td><a href="#${route}/${e(item.id)}">Manage ↗</a></td></tr>`).join('')}</tbody></table></div><p class="admin-helper">Showing up to 20 matches. Search by name to narrow the selection.</p>`:empty('No merchants found','Try another search or add a merchant first.')}</section>`))return;
    app.root.querySelector('[data-picker-search]').onsubmit=event=>{event.preventDefault();app.run(event.currentTarget.querySelector('button'),()=>search(event.currentTarget.elements['picker-search'].value.trim()));};
  }
  await search();
}
