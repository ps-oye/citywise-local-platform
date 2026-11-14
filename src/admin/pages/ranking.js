import {e,heading,field,select,check,badge,empty,formActions,formValues,dirtyGuard} from '../ui.js';
export async function rankingPage(app,id) {
  const category=app.context.categories.find(c=>c.id===id)||app.context.categories[0];
  if(!category){app.mount(heading('Homepage curation','Homepage ranking')+empty('Add a category first','Categories organise the homepage sections.'));return;}
  let data=await app.repo.ranking(app.context.city_id,category.id),section=data.section||{id:crypto.randomUUID(),city_id:app.context.city_id,category_id:category.id,title:category.name,display_order:category.display_order,enabled:true},entries=data.placements.map(p=>({...p}));
  if(!app.mount(heading('A thoughtfully curated homepage','Homepage ranking','Arrange the places that lead each category. Up to four eligible, featured listings appear publicly.')+`<section class="admin-card">${select('Choose category','ranking-category',app.context.categories,category.id)}<p class="admin-helper admin-spaced">Published, enabled listings are eligible when their city, category and locality are also visible. Hidden placements retain their order and can be featured again.</p><form data-ranking><div class="admin-form-grid">${field('Section title','section-title',section.title||category.name,{required:true,maxlength:180})}${field('Section display order','section-order',section.display_order,{required:true,type:'number',min:0,max:1000000})}</div>${check('Show this category section on the homepage','section-enabled',section.enabled)}<ol class="admin-ranking-list" data-ranking-list></ol>${formActions('Save homepage ranking')}</form></section><section class="admin-card"><h2>Add a merchant to this section</h2><form class="admin-toolbar" data-ranking-search>${field('Find a merchant in this category','ranking-query','',{type:'search',maxlength:100})}<button type="submit" class="button button-secondary">Find merchants</button></form><div data-ranking-candidates></div></section>`))return;
  const form=app.root.querySelector('[data-ranking]');dirtyGuard(form,app);
  app.root.querySelector('[name=ranking-category]').onchange=event=>app.navigate('#ranking/'+event.target.value);
  function list() {
    const holder=app.root.querySelector('[data-ranking-list]');
    holder.innerHTML=entries.length?entries.map((item,index)=>`<li data-placement="${e(item.listing_id)}"><span class="admin-rank-number">${index+1}</span><div class="admin-ranking-title"><strong>${e(item.name)}</strong><small>${item.is_public?'Eligible for public display':'Not currently publicly eligible'}</small></div><label class="admin-check"><input type="checkbox" data-featured="${index}"${item.enabled?' checked':''}><span>Featured</span></label><div class="admin-rank-buttons"><button type="button" data-up="${index}" aria-label="Move ${e(item.name)} up"${index?'':' disabled'}>↑</button><button type="button" data-down="${index}" aria-label="Move ${e(item.name)} down"${index===entries.length-1?' disabled':''}>↓</button></div></li>`).join(''):empty('Choose the first place to feature','Find merchants below and add them to this section.');
    holder.querySelectorAll('[data-featured]').forEach(input=>input.onchange=()=>{entries[Number(input.dataset.featured)].enabled=input.checked;app.setDirty(true);});
    for(const direction of ['up','down'])holder.querySelectorAll('[data-'+direction+']').forEach(button=>button.onclick=()=>{
      const from=Number(button.dataset[direction]),to=from+(direction==='up'?-1:1);[entries[from],entries[to]]=[entries[to],entries[from]];list();app.setDirty(true);holder.querySelector('[data-'+direction+'="'+to+'"]')?.focus();
    });
  }
  function candidates() {
    const items=data.candidates.filter(candidate=>!entries.some(p=>p.listing_id===candidate.id)),holder=app.root.querySelector('[data-ranking-candidates]');
    holder.innerHTML=items.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Merchant</th><th>Eligibility</th><th></th></tr></thead><tbody>${items.map(item=>`<tr><td>${e(item.name)}</td><td>${badge(item.is_public?'Eligible':'Not public',item.is_public?'green':'neutral')}</td><td><button class="admin-small-button" type="button" data-add-placement="${e(item.id)}">Add to section</button></td></tr>`).join('')}</tbody></table></div>`:empty('No more matches','Search another name, or publish a merchant in this category.');
    holder.querySelectorAll('[data-add-placement]').forEach(button=>button.onclick=()=>{
      if(entries.length>=100){app.toast('A section can hold up to 100 placements.',true);return;}
      const item=data.candidates.find(c=>c.id===button.dataset.addPlacement);entries.push({...item,listing_id:item.id,enabled:true});list();candidates();app.setDirty(true);
    });
  }
  list();candidates();
  app.root.querySelector('[data-ranking-search]').onsubmit=event=>{
    event.preventDefault();const search=event.currentTarget;app.run(search.querySelector('button'),()=>app.repo.ranking(app.context.city_id,category.id,search.elements['ranking-query'].value.trim()),result=>{data={...data,candidates:result.candidates};candidates();});
  };
  form.onsubmit=event=>{event.preventDefault();const v=formValues(form);app.run(form.querySelector('[type=submit]'),()=>app.repo.saveRanking({id:section.id,city_id:section.city_id,category_id:section.category_id,title:v.get('section-title'),display_order:Number(v.get('section-order')),enabled:v.checked('section-enabled')},entries.map(item=>({listing_id:item.listing_id,enabled:item.enabled})),section.updated_at),result=>{section=result.section;app.setDirty(false);app.toast('Homepage ranking saved.');});};
}
