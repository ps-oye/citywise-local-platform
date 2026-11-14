import {localDateTime} from '../../domain/admin.js';
import {safeDestination} from '../../utils/urls.js';
import {imageMarkup} from '../../components/discovery-ui.js';
import {mountMediaManager} from '../media-manager.js';
import {e,heading,field,select,check,badge,empty,formActions,formValues,dirtyGuard} from '../ui.js';
export async function advertisementsPage(app,id) {
  if(id){
    const city=app.context.cities.find(c=>c.id===app.context.city_id),isNew=id==='new';
    const record=isNew?{id:crypto.randomUUID(),city_id:city.id,title:'',alt_text:'',starts_at:new Date().toISOString(),priority:0,enabled:false,sponsored:true}:await app.repo.ad(id);
    if(!record)throw new Error('This advertisement could not be found.');
    if(record.city_id!==app.context.city_id)throw new Error('Select this advertisement’s city before opening its details.');
    return editor(app,record,isNew);
  }
  let offset=0,hydrate;
  async function load(){
    const data=await app.repo.ads(app.context.city_id,offset);hydrate?.();
    if(!app.mount(heading('A place in the spotlight','Advertisements','Manage clearly labelled promotions, with images for every screen.',`<a class="button button-primary" href="#advertisements/new">+ Add advertisement</a>`)+`<section class="admin-card">${data.items.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Promotion</th><th>Schedule</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>${data.items.map(ad=>`<tr><td><a href="#advertisements/${e(ad.id)}">${e(ad.title)}</a><small>${ad.sponsored?'Sponsored':'Community promotion'}${ad.is_demo?' · Sample':''}</small></td><td>${e(localDateTime(ad.starts_at,app.context.cities.find(c=>c.id===ad.city_id)?.timezone).replace('T',' '))}<small>${ad.ends_at?'Until '+e(localDateTime(ad.ends_at,app.context.cities.find(c=>c.id===ad.city_id)?.timezone).replace('T',' ')):'No expiry'}</small></td><td>${e(ad.priority)}</td><td>${badge(ad.archived_at?'Archived':ad.is_public?'Live':ad.enabled?'Scheduled / ineligible':'Paused',ad.is_public?'green':'neutral')}</td><td><a href="#advertisements/${e(ad.id)}">Edit ↗</a></td></tr>`).join('')}</tbody></table></div>`:empty('Make your first promotion','Create an advertisement, upload its banner, then enable it when it is ready.')}<div class="admin-pagination"><span>Lower priority numbers appear first.</span><div class="admin-inline"><button type="button" class="button button-secondary" data-previous${offset?'':' disabled'}>Previous</button><button type="button" class="button button-secondary" data-next${data.has_more?'':' disabled'}>Next</button></div></div></section>`))return;
    app.root.querySelector('[data-previous]').onclick=event=>{offset=Math.max(0,offset-20);app.run(event.currentTarget,load);};app.root.querySelector('[data-next]').onclick=event=>{offset+=20;app.run(event.currentTarget,load);};
  }
  await load();app.setCleanup(()=>hydrate?.());
}
async function editor(app,record,isNew) {
  let current=record;
  const city=app.context.cities.find(c=>c.id===record.city_id),zone=city?.timezone||'Asia/Kolkata';
  const initial=await app.repo.listings(record.city_id);
  if(record.listing_id&&!initial.items.some(item=>item.id===record.listing_id)){const selected=await app.repo.listing(record.listing_id);if(selected)initial.items.unshift(selected);}
  if(!app.mount(heading('Advertisements',isNew?'Create a little buzz':record.title,'Create a paused promotion, add its images, then enable it for the chosen schedule.',`<a class="button button-secondary" href="#advertisements">← All advertisements</a>`)+`<section class="admin-card"><form data-advertisement><div class="admin-form-grid">${field('Title','title',record.title,{required:true,maxlength:180})}${field('CTA label','cta_text',record.cta_text,{maxlength:80,placeholder:'Explore this place'})}${field('Subtitle','subtitle',record.subtitle,{maxlength:400,wide:true})}${field('Banner description','alt_text',record.alt_text,{required:true,maxlength:240})}${field('Display priority','priority',record.priority,{type:'number',min:0,max:1000000,required:true,help:'Lower numbers appear first.'})}${field('Starts at','starts_local',localDateTime(record.starts_at,zone),{type:'datetime-local',required:true,help:'All schedule times use '+zone+'.'})}${field('Ends at (optional)','ends_local',localDateTime(record.ends_at,zone),{type:'datetime-local',help:'Leave empty for no expiry.'})}${field('Destination URL','destination_url',record.destination_url,{maxlength:2048,wide:true,placeholder:'/rawatbhata/food/merchant-slug or https://…',help:'A same-site path or an HTTPS website. No automatic redirects.'})}${select('Linked merchant (optional)','listing_id',[{id:'',name:'No linked merchant'},...initial.items],record.listing_id||'',{wide:true,help:'Optional association. Find additional merchants using the search below.'})}</div><div class="admin-check-grid">${check('Clearly label as Sponsored','sponsored',record.sponsored)}${check('Enable this advertisement','enabled',record.enabled,isNew)}</div>${isNew?'<p class="admin-helper">New advertisements are saved paused. Upload a desktop banner before enabling.</p>':''}${record.archived_at?'<p class="admin-helper">This promotion is archived. Saving these settings restores it, using the enable setting above.</p>':''}${formActions(isNew?'Create paused advertisement':'Save advertisement')}</form></section><section class="admin-card"><h2>Find a linked merchant</h2><form class="admin-toolbar" data-ad-search>${field('Merchant name','ad-merchant-query','',{type:'search',maxlength:100})}<button class="button button-secondary" type="submit">Find merchants</button></form><p data-ad-search-status role="status"></p></section>${!isNew?'<section class="admin-card" data-ad-media></section><section class="admin-card"><h2>Archive promotion</h2><p>Archiving pauses the promotion and retains its banner images.</p><button type="button" class="button button-danger" data-archive-ad>Archive advertisement</button></section>':''}`))return;
  const form=app.root.querySelector('[data-advertisement]');dirtyGuard(form,app);
  form.onsubmit=event=>{
    event.preventDefault();app.run(form.querySelector('[type=submit]'),()=>{
      const v=formValues(form),destination=v.get('destination_url');
      if(destination&&!safeDestination(destination,location.origin))throw new Error('Use a same-site path or an HTTPS destination without credentials.');
      return app.repo.saveAd({id:current.id,city_id:current.city_id,title:v.get('title'),subtitle:v.get('subtitle'),cta_text:v.get('cta_text'),alt_text:v.get('alt_text'),priority:Number(v.get('priority')),starts_local:v.get('starts_local'),ends_local:v.get('ends_local'),destination_url:destination,listing_id:v.get('listing_id'),sponsored:v.checked('sponsored'),enabled:!isNew&&v.checked('enabled'),archive:false},current.updated_at);
    },async saved=>{app.setDirty(false);app.toast(isNew?'Paused advertisement created. Add its banner below.':'Advertisement saved.');if(isNew)await app.navigate('#advertisements/'+saved.id);else await editor(app,saved,false);});
  };
  app.root.querySelector('[data-ad-search]').onsubmit=event=>{
    event.preventDefault();const search=event.currentTarget;
    app.run(search.querySelector('button'),()=>app.repo.listings(current.city_id,search.elements['ad-merchant-query'].value.trim()),data=>{
      const selected=form.elements.listing_id.value,options=data.items.map(item=>({id:item.id,name:item.name}));if(selected&&!options.some(o=>o.id===selected))options.unshift({id:selected,name:form.elements.listing_id.selectedOptions[0].textContent});
      form.elements.listing_id.innerHTML='<option value="">No linked merchant</option>'+options.map(item=>`<option value="${e(item.id)}"${item.id===selected?' selected':''}>${e(item.name)}</option>`).join('');app.root.querySelector('[data-ad-search-status]').textContent=data.items.length+' matches loaded in the linked merchant selector.';
    });
  };
  if(!isNew){
    app.setCleanup(mountMediaManager(app,app.root.querySelector('[data-ad-media]'),{entity:'advertisement',record:current,onRecord:next=>{if(form.elements.alt_text.value===current.alt_text)form.elements.alt_text.value=next.alt_text;current=next;}}));
    app.root.querySelector('[data-archive-ad]').onclick=async event=>{
      if(!await app.confirm('Archive this advertisement?','This pauses it immediately and discards unsaved form edits. Images are retained.','Archive advertisement'))return;
      app.run(event.currentTarget,()=>app.repo.saveAd({id:current.id,city_id:current.city_id,listing_id:current.listing_id||'',title:current.title,subtitle:current.subtitle||'',cta_text:current.cta_text||'',destination_url:current.destination_url||'',alt_text:current.alt_text,starts_local:localDateTime(current.starts_at,zone),ends_local:localDateTime(current.ends_at,zone),priority:current.priority,enabled:false,sponsored:current.sponsored,archive:true},current.updated_at),async()=>{app.setDirty(false);app.toast('Advertisement archived.');await app.navigate('#advertisements');});
    };
  }
}
