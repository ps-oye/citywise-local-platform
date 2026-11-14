import {prepareAdminImage,adminMediaRequest} from '../services/admin-media.js';
import {e,pretty,field,select,check,badge,formActions,formValues} from './ui.js';
import {imageMarkup} from '../components/discovery-ui.js';
export function mountMediaManager(app,holder,{entity,record,onRecord}) {
  let current=record,hydrate;
  const roles=entity==='listing'?['banner','logo','gallery']:['desktop','mobile'];
  function update(next) {current=next;onRecord?.(next);render();}
  function render() {
    if(!app.current()||!holder.isConnected)return;hydrate?.();
    const items=entity==='listing'?current.media:roles.filter(role=>current[role+'_image_path']||current[role==='desktop'?'demo_image_path':'demo_mobile_image_path']).map(role=>({id:role,media_role:role,bucket_id:'promotional-media',object_path:current[role+'_image_path'],demo_image_path:current[role==='desktop'?'demo_image_path':'demo_mobile_image_path'],alt_text:current.alt_text,enabled:true,display_order:0}));
    holder.innerHTML=`<div class="admin-section-heading"><div><p class="eyebrow">The first impression</p><h2>${entity==='listing'?'Business photographs':'Banner images'}</h2></div>${badge(items.length+' images')}</div><p class="admin-helper">JPEG, PNG or WebP · up to 5 MiB and 16 megapixels. Images are resized to 1600 pixels and saved as WebP with metadata removed. Upload only images you have permission to use.</p><form data-media-upload><div class="admin-form-grid">${select('Image role','upload-role',roles.map(id=>({id,name:pretty(id)})),roles[0])}${field('Describe the image','upload-alt','',{required:true,maxlength:240,placeholder:'What does the photograph show?'})}${field('Choose image','upload-file','',{type:'file',accept:'image/jpeg,image/png,image/webp',required:true,wide:true})}</div>${formActions('Upload image')}</form><div class="admin-media-grid">${items.map(item=>`<article class="admin-media-item" data-media-item="${e(item.id)}">${imageMarkup({name:current.name||current.title,is_demo:current.is_demo,demo_image_path:item.demo_image_path,media:item.object_path?item:null})}<div class="admin-inline">${badge(pretty(item.media_role))}${item.enabled?'':badge('Hidden')}</div>${entity==='listing'?`<form data-media-edit="${e(item.id)}">${field('Image description','alt-'+item.id,item.alt_text,{required:true,maxlength:240})}${select('Role','role-'+item.id,roles.map(id=>({id,name:pretty(id)})),item.media_role)}${field('Display order','order-'+item.id,item.display_order,{type:'number',min:0,max:1000000,required:true})}${check('Show publicly','enabled-'+item.id,item.enabled)}${formActions('Save image')}</form>`:''}${item.object_path?`<div class="admin-inline"><button type="button" class="button button-danger" data-remove-image="${e(item.id)}">Remove image</button></div>`:''}</article>`).join('')}</div>`;
    hydrate=app.media.hydrate(holder);
    const upload=holder.querySelector('[data-media-upload]');
    upload.onsubmit=event=>{
      event.preventDefault();app.run(upload.querySelector('[type=submit]'),async()=>{
        const file=upload.elements['upload-file'].files[0];upload.querySelector('[data-form-feedback]').textContent='Preparing image…';const blob=await prepareAdminImage(file);
        const form=new FormData();form.set('image',blob,'image.webp');form.set('entity',entity);form.set('entity_id',current.id);form.set('role',upload.elements['upload-role'].value);form.set('alt_text',upload.elements['upload-alt'].value.trim());form.set('expected',current.updated_at);
        upload.querySelector('[data-form-feedback]').textContent='Uploading…';return adminMediaRequest(app.session,form);
      },result=>{update(result.record);app.toast('Image uploaded.');});
    };
    holder.querySelectorAll('[data-media-edit]').forEach(form=>{form.onsubmit=event=>{
      event.preventDefault();const id=form.dataset.mediaEdit,v=formValues(form);app.run(form.querySelector('[type=submit]'),()=>app.repo.updateMedia(id,v.get('alt-'+id),v.get('role-'+id),v.checked('enabled-'+id),Number(v.get('order-'+id)),current.updated_at),result=>{update(result);app.toast('Image details saved.');});
    };});
    holder.querySelectorAll('[data-remove-image]').forEach(button=>button.onclick=async()=>{
      if(!await app.confirm('Remove this image?','This removes the image metadata and its storage object. Images referenced by a product are protected. Advertisements must be paused first.','Remove image'))return;
      app.run(button,async()=>{
        const result=await adminMediaRequest(app.session,{action:'remove',entity,entity_id:current.id,expected:current.updated_at,...(entity==='listing'?{media_id:button.dataset.removeImage}:{role:button.dataset.removeImage})});
        return {result,next:result.record};
      },({result,next})=>{update(next);app.toast(result.message,!result.storageRemoved);});
    });
  }
  render();return ()=>hydrate?.();
}
