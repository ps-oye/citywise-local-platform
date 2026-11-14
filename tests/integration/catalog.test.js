import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createTestDatabase,asRole,ADMIN_ID,OTHER_ID} from '../helpers/database.js';
const MERCHANT='70000000-0000-4000-8000-000000000001',OTHER='70000000-0000-4000-8000-000000000002';
let db;
const rpc=async(name,args=[],uid=ADMIN_ID,role='authenticated')=>(await asRole(db,role,uid,tx=>tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args))).rows[0].result;
const source={name:'catalog.csv',size:100,type:'csv',sheet:''};
const prepare=(rows,mode='upsert',id=randomUUID(),merchant=MERCHANT)=>rpc('admin_prepare_import',[merchant,mode,rows,source,id]);
const product=changes=>({id:randomUUID(),sku:'QA-'+randomUUID().slice(0,8),name:'Catalog fixture',price:'10.25',unit:'box',dietary_type:'vegetarian',active:true,available:true,...changes});
before(async()=>{db=await createTestDatabase();await db.exec(await readFile('supabase/seeds/discovery-demo.sql','utf8'));await db.exec(await readFile('supabase/seeds/merchant-demo.sql','utf8'));await db.exec(await readFile('tests/fixtures/merchant-checkout.sql','utf8'));});
after(async()=>{if(db)await db.close();});
test('catalog RPCs and private helpers require the allowlisted UID; staging never grants browser writes',async()=>{
  for(const name of ['admin_catalog_context','admin_import_history']){
    await assert.rejects(rpc(name,[MERCHANT],OTHER_ID),error=>error.code==='42501');await assert.rejects(rpc(name,[MERCHANT],null,'anon'),error=>error.code==='42501');
  }
  await assert.rejects(asRole(db,'authenticated',OTHER_ID,tx=>tx.query('select private.catalog_version($1)',[MERCHANT])),error=>error.code==='42501');
  await assert.rejects(asRole(db,'authenticated',ADMIN_ID,tx=>tx.query('delete from private.catalog_import_previews')),error=>error.code==='42501');
  const info=(await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='catalog_import_previews'")).rows[0];assert.equal(info.relrowsecurity,true);
});
test('manual product editing, exact prices, category scoping, row revisions and archive/restore work',async()=>{
  const data=product();let saved=await rpc('admin_save_product',[MERCHANT,data,null]);assert.equal(saved.price_minor,1025);assert.equal(saved.unit,'box');
  await assert.rejects(rpc('admin_save_product',[OTHER,{...data,name:'Wrong merchant'},saved.updated_at]),error=>error.code==='22023');
  await assert.rejects(rpc('admin_save_product',[MERCHANT,{...data,price:'1.001'},saved.updated_at]),error=>error.message==='CATALOG_ROW_INVALID');
  saved=await rpc('admin_save_product',[MERCHANT,{...data,name:'Updated product',price:'12.99'},saved.updated_at]);assert.equal(saved.price_minor,1299);
  await assert.rejects(rpc('admin_save_product',[MERCHANT,data,null]),error=>error.code==='40001');
  saved=await rpc('admin_product_state',[saved.id,'archive',saved.updated_at]);assert.equal(saved.active,false);assert.ok(saved.archived_at);
  const preview=await prepare([{row_number:2,sku:saved.sku,price:'2'}],'price_only');assert.equal(preview.job.status,'failed');assert.equal(preview.errors[0].error_code,'archived_sku');
  saved=await rpc('admin_product_state',[saved.id,'restore',saved.updated_at]);assert.equal(saved.archived_at,null);assert.equal(saved.active,false);
});
test('previews classify new, updated and unchanged rows without changing products; apply is idempotent',async()=>{
  const data=product(),existing=await rpc('admin_save_product',[MERCHANT,data,null]);const newSku='NEW-'+randomUUID().slice(0,8),unchanged=await rpc('admin_save_product',[MERCHANT,product(),null]);
  const rows=[{row_number:2,sku:existing.sku,name:'New name',price:'13.50'},{row_number:3,sku:newSku,name:'New item',price:'5'},{row_number:5,sku:unchanged.sku,name:unchanged.name,price:'10.25'}];
  const id=randomUUID();let preview=await prepare(rows,'upsert',id);assert.equal(preview.job.status,'pending');assert.deepEqual(preview.summary,{new:1,updated:1,unchanged:1,invalid:0,total:3});
  assert.equal((await rpc('admin_catalog_product',[existing.id])).price_minor,1025);assert.equal((await db.query('select count(*)::int total from public.products where sku=$1',[newSku])).rows[0].total,0);
  assert.equal((await prepare(rows,'upsert',id)).job.id,id);await assert.rejects(prepare([{...rows[0],price:'99'}],'upsert',id),error=>error.message==='CATALOG_REQUEST_CONFLICT');
  const applied=await rpc('admin_apply_import',[id]);assert.equal(applied.job.status,'applied');assert.equal(applied.job.applied_count,2);assert.equal((await rpc('admin_catalog_product',[existing.id])).price_minor,1350);
  const repeated=await rpc('admin_apply_import',[id]);assert.equal(repeated.summary.version,applied.summary.version);assert.equal(repeated.job.applied_count,2);
  assert.equal((await rpc('admin_catalog_product',[existing.id])).unit,'box');assert.equal((await rpc('admin_catalog_product',[existing.id])).dietary_type,'vegetarian');
});
test('duplicate SKUs, invalid decimals, formulas and foreign image/category references produce row reports and block every change',async()=>{
  const sku='DUP-'+randomUUID().slice(0,8),rows=[{row_number:2,sku,name:'One',price:'1'},{row_number:3,sku:' '+sku+' ',name:'Two',price:'2'},
    {row_number:5,sku:'BAD-PRICE',name:'Bad',price:'1.001'},{row_number:6,sku:'FORMULA',name:'=HYPERLINK("bad")',price:'1'},
    {row_number:8,sku:'BAD-CATEGORY',name:'Bad category',price:'1',category:'does-not-exist'},{row_number:9,sku:'BAD-IMAGE',name:'Bad image',price:'1',image_reference:randomUUID()}];
  const report=await prepare(rows);assert.equal(report.job.status,'failed');assert.equal(report.summary.invalid,6);assert.deepEqual(report.errors.map(e=>e.row_number),[2,3,5,6,8,9]);
  assert.equal((await rpc('admin_apply_import',[report.job.id])).job.status,'failed');assert.equal((await db.query('select count(*)::int total from public.products where sku=$1',[sku])).rows[0].total,0);
});
test('price-only updates reject unknown SKUs and extra fields, preserve product data, and do not silently clear original prices',async()=>{
  let saved=await rpc('admin_save_product',[MERCHANT,product({original_price:'20'}),null]);
  let report=await prepare([{row_number:2,sku:saved.sku,price:'21'}],'price_only');assert.equal(report.errors[0].error_code,'original_below_price');
  report=await prepare([{row_number:2,sku:'UNKNOWN-SKU',price:'2'}],'price_only');assert.equal(report.errors[0].error_code,'unknown_sku');
  report=await prepare([{row_number:2,sku:saved.sku,price:'12',name:'Not a price field'}],'price_only');assert.equal(report.job.status,'failed');
  report=await prepare([{row_number:2,sku:saved.sku,price:'12.34',original_price:''}],'price_only');report=await rpc('admin_apply_import',[report.job.id]);assert.equal(report.job.status,'applied');
  const updated=await rpc('admin_catalog_product',[saved.id]);assert.equal(updated.price_minor,1234);assert.equal(updated.original_price_minor,null);for(const key of ['name','description','unit','dietary_type','active','available','sku'])assert.equal(updated[key],saved[key]);
});
test('catalog changes after preview or expiration reject confirmation and persist a failure report',async()=>{
  const saved=await rpc('admin_save_product',[MERCHANT,product(),null]);let preview=await prepare([{row_number:2,sku:saved.sku,price:'1'}],'price_only');
  await db.query('update public.products set price_minor=2000 where id=$1',[saved.id]);let failed=await rpc('admin_apply_import',[preview.job.id]);assert.equal(failed.job.status,'failed');assert.equal(failed.errors[0].error_code,'CATALOG_STALE_PREVIEW');assert.equal((await rpc('admin_catalog_product',[saved.id])).price_minor,2000);
  preview=await prepare([{row_number:2,sku:saved.sku,price:'1'}],'price_only');await db.query("update private.catalog_import_previews set expires_at=now()-interval '1 minute' where job_id=$1",[preview.job.id]);
  failed=await rpc('admin_apply_import',[preview.job.id]);assert.equal(failed.errors[0].error_code,'CATALOG_PREVIEW_EXPIRED');assert.equal(failed.job.applied_count,0);
});
test('a later-row database failure rolls back earlier writes while retaining its error report',async()=>{
  const first=await rpc('admin_save_product',[MERCHANT,product(),null]),second=await rpc('admin_save_product',[MERCHANT,product(),null]);
  const preview=await prepare([{row_number:2,sku:first.sku,price:'1'},{row_number:3,sku:second.sku,price:'2'}],'price_only');
  await db.exec("create function private.qa_reject_catalog() returns trigger language plpgsql as $$ begin if new.price_minor=200 then raise exception 'Isolated failure'; end if; return new; end $$; create trigger qa_reject_catalog before update on public.products for each row execute function private.qa_reject_catalog();");
  try{const report=await rpc('admin_apply_import',[preview.job.id]);assert.equal(report.job.status,'failed');assert.equal(report.job.applied_count,0);assert.equal(report.errors[0].row_number,3);assert.equal((await rpc('admin_catalog_product',[first.id])).price_minor,1025);assert.equal((await rpc('admin_catalog_product',[second.id])).price_minor,1025);}
  finally{await db.exec('drop trigger qa_reject_catalog on public.products; drop function private.qa_reject_catalog();');}
});
test('products missing from files remain untouched, category edits invalidate previews and reports page deterministically',async()=>{
  const untouched=await rpc('admin_save_product',[MERCHANT,product(),null]),sku='PAGED-'+randomUUID().slice(0,8);
  let preview=await prepare([{row_number:2,sku,name:'A',price:'1'},{row_number:3,sku:sku+'b',name:'B',price:'2'}]);
  const first=await rpc('admin_import_report',[preview.job.id,0,1,'all']),second=await rpc('admin_import_report',[preview.job.id,1,1,'all']);assert.equal(first.has_more,true);assert.notEqual(first.items[0].sku,second.items[0].sku);
  await rpc('admin_apply_import',[preview.job.id]);assert.equal((await rpc('admin_catalog_product',[untouched.id])).price_minor,1025);
  preview=await prepare([{row_number:2,sku,price:'3'}],'price_only');await rpc('admin_save_product_category',[MERCHANT,{id:randomUUID(),name:'New category',slug:'new-category',enabled:true,display_order:0},null]);
  const failed=await rpc('admin_apply_import',[preview.job.id]);assert.equal(failed.errors[0].error_code,'CATALOG_STALE_PREVIEW');
  await assert.rejects(rpc('admin_import_report',[preview.job.id,0,1001,'all']),error=>error.code==='22023');
});
test('revocation blocks pending confirmations, and alternate UIDs cannot apply or overwrite a prepared job',async()=>{
  const preview=await prepare([{row_number:2,sku:'REVOKE-TEST',name:'Revoked',price:'1'}]);
  await assert.rejects(rpc('admin_apply_import',[preview.job.id],OTHER_ID),error=>error.code==='42501');
  await db.exec('update private.admin_users set active=false');try{await assert.rejects(rpc('admin_apply_import',[preview.job.id]),error=>error.code==='42501');}finally{await db.exec('update private.admin_users set active=true');}
});
test('a SKU appearing after the snapshot check cannot be adopted as a previewed new product',async()=>{
  const existing=await rpc('admin_save_product',[MERCHANT,product(),null]),newSku='RACE-'+randomUUID().slice(0,8);
  const preview=await prepare([{row_number:2,sku:newSku,name:'Should not replace another row',price:'1'}]);
  const definition=(await db.query("select pg_get_functiondef('private.catalog_snapshot(uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
  await db.exec(definition.replace('private.catalog_snapshot','private.qa_original_catalog_snapshot'));
  await db.exec('grant execute on function private.qa_original_catalog_snapshot(uuid,jsonb) to authenticated');
  // Simulates a direct authorized rename committed between snapshot validation and the per-row read.
  await db.exec("create or replace function private.catalog_snapshot(p_merchant uuid,p_rows jsonb) returns text language plpgsql volatile security invoker set search_path='' as $$ declare result text; begin result:=private.qa_original_catalog_snapshot(p_merchant,p_rows); update public.products set sku='"+newSku+"' where id='"+existing.id+"'; return result; end $$;");
  try{const report=await rpc('admin_apply_import',[preview.job.id]);assert.equal(report.job.status,'failed');assert.equal(report.errors[0].error_code,'CATALOG_STALE_PREVIEW');assert.equal((await rpc('admin_catalog_product',[existing.id])).name,existing.name);assert.equal((await rpc('admin_catalog_product',[existing.id])).sku,existing.sku);}
  finally{await db.exec(definition);await db.exec('drop function private.qa_original_catalog_snapshot(uuid,jsonb)');}
});
