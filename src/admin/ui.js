import {escapeHtml as escape} from '../utils/dom.js';
import {icon} from '../components/icons.js';
export const e=value=>escape(value??'');
export const pretty=value=>String(value??'').toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function field(label,name,value='',options={}) {
  const {type='text',required=false,help='',wide=false,...attrs}=options;
  const attributes=Object.entries(attrs).map(([key,value])=>value===true?' '+e(key):value===false?'':' '+e(key)+'="'+e(value)+'"').join('');
  const accessible=` aria-label="${e(label)}"${help?` aria-describedby="${e(name)}-help"`:''}`;
  const control=type==='textarea'?`<textarea id="${e(name)}" name="${e(name)}"${accessible}${required?' required':''}${attributes}>${e(value)}</textarea>`:`<input id="${e(name)}" name="${e(name)}" type="${e(type)}" value="${e(value)}"${accessible}${required?' required':''}${attributes}>`;
  return `<label class="admin-field${wide?' field-wide':''}" for="${e(name)}"><span>${e(label)}${required?' <small aria-hidden="true">*</small>':''}</span>${control}${help?`<small id="${e(name)}-help">${e(help)}</small>`:''}</label>`;
}
export function select(label,name,items,value='',{help='',multiple=false,required=false,wide=false}={}) {
  const selected=multiple?new Set(value||[]):new Set([value]);
  return `<label class="admin-field${wide?' field-wide':''}" for="${e(name)}"><span>${e(label)}</span><select id="${e(name)}" name="${e(name)}" aria-label="${e(label)}"${help?` aria-describedby="${e(name)}-help"`:''}${multiple?' multiple size="6"':''}${required?' required':''}>${items.map(item=>`<option value="${e(item.id)}"${selected.has(item.id)?' selected':''}>${e(item.name)}</option>`).join('')}</select>${help?`<small id="${e(name)}-help">${e(help)}</small>`:''}</label>`;
}
export const check=(label,name,checked=false,disabled=false)=>`<label class="admin-check"><input type="checkbox" name="${e(name)}"${checked?' checked':''}${disabled?' disabled':''}><span>${e(label)}</span></label>`;
export const badge=(label,tone='neutral')=>`<span class="admin-badge badge-${e(tone)}">${e(label)}</span>`;
export const empty=(title,detail='')=>`<div class="admin-empty">${icon('grid')}<h2>${e(title)}</h2>${detail?`<p>${e(detail)}</p>`:''}</div>`;
export const heading=(eyebrow,title,detail='',action='')=>`<div class="admin-page-heading"><div><p class="eyebrow">${e(eyebrow)}</p><h1>${e(title)}</h1>${detail?`<p>${e(detail)}</p>`:''}</div>${action}</div>`;
export const button=(label,action,primary=false)=>`<button class="button ${primary?'button-primary':'button-secondary'}" type="button" data-action="${e(action)}">${e(label)}</button>`;
export const formActions=(label='Save changes')=>`<div class="admin-form-actions"><p data-form-feedback role="status"></p><button type="submit" class="button button-primary">${e(label)} ${icon('check')}</button></div>`;
export function formValues(form) { const data=new FormData(form);return {get:name=>String(data.get(name)??'').trim(),all:name=>data.getAll(name).map(String),checked:name=>data.has(name)}; }
export function dirtyGuard(form,app) {
  const mark=()=>app.setDirty(true);form.addEventListener('input',mark);form.addEventListener('change',mark);
}
export function picker(items,selection,label='Select merchant') {return select(label,'listing-picker',[{id:'',name:'Choose a merchant…'},...items.map(item=>({id:item.id,name:item.name+(item.publication_status==='draft'?' · Draft':'')}))],selection);}
