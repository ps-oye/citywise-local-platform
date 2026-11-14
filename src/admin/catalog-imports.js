import {createCatalogFileReader} from '../services/catalog-file-reader.js';
import {templateBytes,reportCsv,downloadBytes} from '../services/catalog-downloads.js';
import {columnLabel} from '../domain/catalog-import.js';
import {adminError} from '../domain/admin.js';
import {formatMoney} from '../utils/format.js';
import {catalogHeader,catalogUrl,errorTable} from './catalog-ui.js';
import {e,field,select,badge,empty} from './ui.js';
const reportStatus=report=>report.job.status==='pending'&&report.expired?'Expired':report.job.status==='pending'?'Ready for review':report.job.status==='applied'?'Applied':'Needs attention';
function formatValue(value,key,context) {
  if(value===null||value===undefined||value==='')return '—';
  if(['price_minor','original_price_minor'].includes(key))return formatMoney(Number(value));
  if(key==='product_category_id')return context.categories.find(c=>c.id===value)?.name||value;
  if(key==='image_media_id')return context.media.find(m=>m.id===value)?.alt_text||value;
  if(typeof value==='boolean')return value?'Yes':'No';return String(value);
}
async function exportReport(app,report,button) {
  await app.run(button,()=>app.repo.importReport(report.job.id,0,1000,'all'),data=>downloadBytes(reportCsv(data),'catalog-import-'+report.job.id+'.csv'));
}
function renderReport(app,context,holder,initial,onSettled=()=>{},onBusy=()=>{}) {
  let report=initial,offset=0,filter='all',sequence=0,alive=true,applying=false;
  function draw() {
    if(!alive||!app.current()||!holder.isConnected)return;
    const status=reportStatus(report),summary=report.summary,ready=report.job.status==='pending'&&!report.expired&&!summary.invalid;
    holder.innerHTML=`<section class="admin-card catalog-preview"><div class="admin-section-heading"><div><p class="eyebrow">${report.job.status==='applied'?'Import complete':'Review before updating'}</p><h2>${report.job.status==='applied'?'Your catalog is up to date.':'Your import preview'}</h2><p><strong>${e(report.source.name)}</strong>${report.source.sheet?' · '+e(report.source.sheet):''} · ${report.job.mode==='price_only'?'Price-only update':'Insert / update'}</p></div>${badge(status,report.job.status==='applied'?'green':ready?'amber':'red')}</div><div class="catalog-import-counts">${[['new','New products'],['updated','Updates'],['unchanged','Unchanged'],['invalid','Invalid rows']].map(([key,label])=>`<div data-import-count="${key}"><strong>${Number(summary[key]||0)}</strong><span>${label}</span></div>`).join('')}</div>${report.job.status==='applied'?`<p class="catalog-success" role="status">${Number(report.job.applied_count)} product changes applied.${summary.version?' Catalog version '+e(summary.version)+'.':''} Products absent from the file were preserved.</p>`:report.job.status==='failed'||report.expired?`<p class="catalog-failure" role="alert">${e(summary.message||'No product changes were applied. Correct the invalid rows and prepare a new preview.')}</p>`:'<p class="admin-helper">No products have changed yet. Review the proposed values below. Other products stay untouched. This preview expires after 30 minutes.</p>'}<div class="admin-toolbar">${select('Show preview rows','import-filter',[['all','All rows'],['new','New'],['updated','Updated'],['unchanged','Unchanged'],['invalid','Invalid']].map(([id,name])=>({id,name})),filter)}<button class="button button-secondary" type="button" data-export-report>Download report CSV</button></div>${report.items.length?`<div class="admin-table-wrap"><table class="admin-table catalog-preview-table"><thead><tr><th>Row</th><th>SKU / product</th><th>Change</th><th>Details</th></tr></thead><tbody>${report.items.map(item=>`<tr data-import-row="${e(item.row_number)}"><td>${e(item.row_number)}</td><td><code>${e(item.sku)}</code><small>${e(item.name)}</small></td><td>${badge(item.action,item.action==='new'?'green':item.action==='invalid'?'red':item.action==='updated'?'amber':'neutral')}</td><td>${item.error?`<p class="catalog-row-error">${e(columnLabel(item.error.column_name||''))}: ${e(item.error.message)}</p>`:item.changes?.length?`<details class="catalog-change-details"><summary>${item.changes.length} field${item.changes.length===1?'':'s'} ${item.action==='new'?'provided':'changed'}</summary><dl>${item.changes.map(change=>`<div><dt>${e(columnLabel(change.field))}</dt><dd><span>${e(formatValue(change.before,change.field,context))}</span><span aria-hidden="true">→</span><strong>${e(formatValue(change.after,change.field,context))}</strong></dd></div>`).join('')}</dl></details>`:'No change needed.'}</td></tr>`).join('')}</tbody></table></div>`:empty('No rows match this filter')}<div class="admin-pagination"><span>${report.total?offset+1:0}–${Math.min(offset+25,report.total)} of ${report.total} rows</span><div class="admin-inline"><button class="button button-secondary" type="button" data-report-previous${offset?'':' disabled'}>Previous rows</button><button class="button button-secondary" type="button" data-report-next${report.has_more?'':' disabled'}>Next rows</button></div></div>${report.errors.length?errorTable(report.errors):''}<div class="catalog-confirm-row"><p>${ready?'Changes will become available in the merchant’s catalog after confirmation.':report.job.status==='applied'?'Your recorded import can be reviewed again from Import history.':'Prepare a new preview after fixing errors or refreshing an expired/stale file.'}</p><button class="button button-primary" type="button" data-confirm-import${ready?'':' disabled'}>${ready&&summary.new+summary.updated===0?'Finish review':'Confirm import'}</button></div><p class="catalog-reference">Import reference ${e(report.job.id)}</p></section>`;
    async function page(){if(applying)return;const attempt=++sequence;const result=await app.repo.importReport(report.job.id,offset,25,filter);if(alive&&!applying&&attempt===sequence&&app.current()){report=result;draw();}}
    holder.querySelector('[name=import-filter]').onchange=event=>{filter=event.target.value;offset=0;app.run(null,page);};
    holder.querySelector('[data-report-previous]').onclick=event=>{offset=Math.max(0,offset-25);app.run(event.currentTarget,page);};holder.querySelector('[data-report-next]').onclick=event=>{offset+=25;app.run(event.currentTarget,page);};
    holder.querySelector('[data-export-report]').onclick=event=>exportReport(app,report,event.currentTarget);
    holder.querySelector('[data-confirm-import]').onclick=async event=>{
      const button=event.currentTarget;
      if(applying)return;
      if(!await app.confirm('Apply this import to '+context.merchant.name+'?',`${summary.new||0} new products and ${summary.updated||0} updates will be applied together. ${report.job.mode==='price_only'?'Only prices will change. ':''}Products absent from this file will be preserved.`,'Confirm & apply'))return;
      if(!alive||!app.current()||applying)return;applying=true;++sequence;onBusy(true);
      holder.querySelectorAll('[name=import-filter],[data-report-previous],[data-report-next],[data-export-report]').forEach(control=>{control.disabled=true;});
      try{await app.run(button,()=>app.repo.applyImport(report.job.id),result=>{if(!alive)return;report=result;offset=0;filter='all';draw();if(report.job.status==='applied'){app.setDirty(false);app.toast('Catalog import applied.');}else app.toast('Nothing was applied. Review the error report.',true);onSettled(report);});}
      finally{applying=false;if(alive&&app.current()){draw();onBusy(false);}}
    };
    if(applying)holder.querySelectorAll('[name=import-filter],[data-report-previous],[data-report-next],[data-export-report]').forEach(control=>{control.disabled=true;});
  }
  draw();return ()=>{alive=false;++sequence;};
}
export async function importPage(app,context) {
  if(context.merchant.archived_at)throw new Error('Restore this merchant before importing products.');
  if(!app.mount(catalogHeader(context,'import')+`<ol class="catalog-steps" aria-label="Import workflow"><li><span>1</span>Choose your file</li><li><span>2</span>Review every change</li><li><span>3</span>Confirm & update</li></ol><div class="catalog-import-layout"><section class="admin-card"><div class="admin-section-heading"><div><p class="eyebrow">A whole catalog, without the busywork</p><h2>Import products</h2><p>Excel and CSV files, safely matched by SKU.</p></div>${badge('For '+context.merchant.name,'green')}</div><form data-import-form><fieldset class="catalog-edit-fields" data-import-inputs><div class="admin-form-grid">${select('Import mode','import-mode',[{id:'upsert',name:'Insert / update products'},{id:'price_only',name:'Price-only update'}],'upsert',{wide:true,help:'Insert/update matches existing SKUs and creates new ones. Price-only requires existing SKUs and never changes product details.'})}${field('Choose spreadsheet','import-file','',{type:'file',accept:'.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',required:true,wide:true})}<div data-sheet-picker class="field-wide"></div></div></fieldset><div class="catalog-import-actions"><p data-import-status role="status">Choose a file under 5 MiB with up to 1,000 product rows.</p><div class="admin-inline"><button class="button button-secondary" type="button" data-cancel-read hidden>Cancel reading</button><button class="button button-primary" type="submit" data-build-preview disabled>Validate & preview</button></div></div></form><div data-file-errors></div></section><aside class="admin-card catalog-import-guide"><p class="eyebrow">A good place to start</p><h2>Use a template.</h2><p>Choose the mode, download the matching headings, then fill in your products.</p><div class="catalog-template-buttons"><button class="button button-secondary" type="button" data-template="xlsx">Download Excel template ↧</button><button class="button button-secondary" type="button" data-template="csv">Download CSV template ↧</button></div><ul><li>Required for insert/update: SKU, Product Name and Price.</li><li>Keep SKU cells as Text to preserve leading zeros. SKUs are case-sensitive.</li><li>Enter prices in rupees, with up to two decimal places.</li><li>Replace formulas with plain values. Upload images separately.</li><li>Omitted optional columns preserve existing values. Blank category, image and original price clear them.</li><li>Blank unit → item; dietary type → not_applicable; available/active → true; display order → 0.</li></ul><a class="text-link" href="${catalogUrl(context.merchant.id,{tab:'categories'})}">View category references ↗</a></aside></div><section class="admin-card"><details class="catalog-reference-details"><summary>Category & image references for this merchant</summary><p>Use an existing product category’s name or slug. Image Reference takes a media UUID belonging to this merchant.</p><div class="catalog-reference-columns"><div><h3>Product categories</h3>${context.categories.length?context.categories.map(c=>`<p><strong>${e(c.name)}</strong><br><code>${e(c.slug)}</code></p>`).join(''):'<p>No categories yet. Leave Category blank, or create one first.</p>'}</div><div><h3>Uploaded images</h3>${context.media.filter(m=>m.enabled).map(m=>`<label class="admin-field"><span>${e(m.alt_text)}</span><input aria-label="Image reference for ${e(m.alt_text)}" type="text" readonly value="${e(m.id)}"></label>`).join('')||'<p>No uploaded images. Leave Image Reference blank.</p>'}<a class="text-link" href="#media/${e(context.merchant.id)}">Upload merchant images ↗</a></div></div></details></section><div data-import-preview></div>`))return;
  const reader=createCatalogFileReader(),form=app.root.querySelector('[data-import-form]'),feedback=form.querySelector('[data-import-status]'),errorHolder=app.root.querySelector('[data-file-errors]'),previewHolder=app.root.querySelector('[data-import-preview]');
  let selectedFile,metadata,requestId,version=0,busy=false,reportCleanup;
  app.setCleanup(()=>{++version;reader.destroy();reportCleanup?.();});
  function controls(value){busy=value;form.querySelector('[data-import-inputs]').disabled=value;form.querySelector('[data-build-preview]').disabled=value||!metadata;form.querySelector('[data-cancel-read]').hidden=!value;}
  function invalidate(){++version;requestId=null;reportCleanup?.();previewHolder.innerHTML='';errorHolder.innerHTML='';feedback.classList.remove('admin-form-error');app.setDirty(true);}
  function errors(items){errorHolder.innerHTML=errorTable(items)+'<button class="button button-secondary" type="button" data-export-validation>Download validation errors</button>';errorHolder.querySelector('[data-export-validation]').onclick=()=>downloadBytes(reportCsv({items:[],errors:items}),'catalog-validation-errors.csv');}
  form.elements['import-file'].onchange=async()=>{
    invalidate();selectedFile=form.elements['import-file'].files[0];metadata=null;form.querySelector('[data-sheet-picker]').innerHTML='';controls(true);const attempt=version;
    try{
      feedback.textContent='Reading file safely…';const loaded=await reader.open(selectedFile);if(!app.current()||version!==attempt)return;metadata=loaded;
      if(metadata.type==='xlsx')form.querySelector('[data-sheet-picker]').innerHTML=select('Worksheet','import-sheet',metadata.sheets.map(name=>({id:name,name})),metadata.sheets[0]);
      form.querySelector('[name=import-sheet]')?.addEventListener('change',()=>{invalidate();feedback.textContent='Worksheet changed. Build a new preview before confirming.';});
      feedback.textContent=selectedFile.name+' is ready to validate. No products have changed.';
    }catch(error){if(app.current()&&attempt===version){feedback.textContent=error.message;feedback.classList.add('admin-form-error');errors([{row_number:1,column_name:'File',error_code:'file_error',message:error.message}]);}}
    finally{if(app.current()&&attempt===version)controls(false);}
  };
  form.elements['import-mode'].onchange=()=>{invalidate();feedback.textContent='Import mode changed. Use its matching template and build a new preview.';};
  form.querySelector('[data-cancel-read]').onclick=()=>{invalidate();reader.cancel();metadata=null;selectedFile=null;form.elements['import-file'].value='';feedback.textContent='Reading cancelled. No products were changed.';controls(false);};
  app.root.querySelectorAll('[data-template]').forEach(button=>button.onclick=()=>{
    const mode=form.elements['import-mode'].value,format=button.dataset.template;downloadBytes(templateBytes(mode,format),'catalog-'+mode+'.'+format,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8');
  });
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!metadata||!selectedFile)return;
    const attempt=version,mode=form.elements['import-mode'].value,sheet=form.elements['import-sheet']?.value||'';controls(true);errorHolder.innerHTML='';
    try{
      feedback.textContent='Validating cells…';const parsed=await reader.parse(sheet,mode);if(!app.current()||attempt!==version)return;
      const headerCodes=new Set(['unknown_column','duplicate_column','price_only_column','required_column','extra_cell','empty_file']);
      if(parsed.errors.some(error=>headerCodes.has(error.error_code))){errors(parsed.errors);feedback.textContent='Fix the file headings and rows before building a preview.';feedback.classList.add('admin-form-error');return;}
      if(parsed.errors.length)errors(parsed.errors);
      feedback.textContent='Comparing with the current catalog…';requestId||=crypto.randomUUID();
      const report=await app.repo.prepareImport(context.merchant.id,mode,parsed.rows,{name:selectedFile.name,size:selectedFile.size,type:metadata.type,sheet},requestId);
      if(!app.current()||attempt!==version)return;
      feedback.textContent=report.job.status==='failed'?'The preview found invalid rows. No product changes were applied.':'Preview ready. Review the changes below before confirming.';
      reportCleanup=renderReport(app,context,previewHolder,report,result=>{feedback.textContent=result.job.status==='applied'?'Import applied. Upload another file or review Import history.':'The import was not applied. Build a new preview after reviewing its errors.';requestId=null;},value=>{controls(value);form.querySelector('[data-cancel-read]').hidden=true;});
      // A new attempt is necessary after validation failure; applied/pending retries keep their identity.
      if(report.job.status==='failed')requestId=null;
      previewHolder.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){if(app.current()&&attempt===version){feedback.textContent=adminError(error);feedback.classList.add('admin-form-error');if(error.code==='42501')await app.session.verify();}}
    finally{if(app.current()&&attempt===version)controls(false);}
  };
}
export async function importReportPage(app,context,id) {
  const report=await app.repo.importReport(id);if(report.job.merchant_id!==context.merchant.id)throw new Error('This import belongs to another merchant.');
  if(!app.mount(catalogHeader(context,'history')+`<div class="admin-section-heading"><h2>Import report</h2><a class="text-link" href="${catalogUrl(context.merchant.id,{tab:'history'})}">← Import history</a></div><div data-history-report></div>`))return;
  app.setCleanup(renderReport(app,context,app.root.querySelector('[data-history-report]'),report));
}
export async function importHistoryPage(app,context) {
  let offset=0;
  async function load(){
    const result=await app.repo.importHistory(context.merchant.id,offset);
    if(!app.mount(catalogHeader(context,'history')+`<section class="admin-card"><div class="admin-section-heading"><div><p class="eyebrow">Every change, accounted for</p><h2>Import history</h2><p>Prepared previews, results and error reports for this merchant.</p></div><a class="button button-primary" href="${catalogUrl(context.merchant.id,{tab:'import'})}">Import a file</a></div>${result.items.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>File / reference</th><th>Mode</th><th>Status</th><th>Rows / changes</th><th></th></tr></thead><tbody>${result.items.map(item=>`<tr><td><a href="${catalogUrl(context.merchant.id,{tab:'report',job:item.id})}">${e(item.source.name)}</a><small>${e(item.id.slice(0,8))} · ${e(new Date(item.created_at).toLocaleDateString('en-IN'))}</small></td><td>${item.mode==='price_only'?'Price only':'Insert / update'}</td><td>${badge(item.status==='pending'&&new Date(item.expires_at)<new Date()?'Expired':item.status==='pending'?'Ready':item.status,item.status==='applied'?'green':item.status==='failed'?'red':'neutral')}</td><td>${item.row_count} rows<small>${item.applied_count} applied${item.summary.invalid?' · '+item.summary.invalid+' invalid':''}</small></td><td><a href="${catalogUrl(context.merchant.id,{tab:'report',job:item.id})}">View report ↗</a></td></tr>`).join('')}</tbody></table></div>`:empty('Your first import starts here','Import a file to see its preview, changes and report here.')}<div class="admin-pagination"><span>Prepared imports never change products until confirmed.</span><div class="admin-inline"><button class="button button-secondary" type="button" data-history-previous${offset?'':' disabled'}>Previous imports</button><button class="button button-secondary" type="button" data-history-next${result.has_more?'':' disabled'}>Next imports</button></div></div></section>`))return;
    app.root.querySelector('[data-history-previous]').onclick=event=>{offset=Math.max(0,offset-20);app.run(event.currentTarget,load);};app.root.querySelector('[data-history-next]').onclick=event=>{offset+=20;app.run(event.currentTarget,load);};
  }
  await load();
}
