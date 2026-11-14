import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {zipSync,strToU8,strFromU8} from 'fflate';
import {rowsFromSheet,validateImportRows,IMPORT_LIMITS} from '../../src/domain/catalog-import.js';
import {openCatalogFile,parseCatalogSheet,readBoundedZip,inspectWorksheet,parseCsv,scanXml} from '../../src/services/catalog-file-parser.js';
import {templateBytes,reportCsv} from '../../src/services/catalog-downloads.js';
import {workbookFixture} from '../helpers/catalog-files.js';
test('CSV handles BOM, quoting, delimiters and blank rows while preserving SKUs and source row numbers',()=>{
  const matrix=parseCsv('\uFEFFSKU;Product Name;Price;Description\r\n001;"Sample; shop";12.99;"Line one\nLine two"\r\n;;;\r\n002;Another;0;');
  const result=rowsFromSheet(matrix);assert.equal(result.errors.length,0);assert.equal(result.rows[0].sku,'001');assert.equal(result.rows[0].name,'Sample; shop');assert.equal(result.rows[0].description,'Line one\nLine two');assert.deepEqual(result.rows.map(row=>row.row_number),[2,4]);assert.equal(validateImportRows(result.rows).length,0);
});
test('header validation rejects duplicates, unknown/merchant columns and extra price-only fields',()=>{
  const input=rowsFromSheet([['SKU','sku','Price','Merchant ID'],['A','B','1','foreign']]);assert.ok(input.errors.some(error=>error.error_code==='duplicate_column'));assert.ok(input.errors.some(error=>error.error_code==='unknown_column'));assert.ok(input.errors.some(error=>error.column_name==='Product Name'));
  const price=rowsFromSheet([['SKU','Product Name','Price'],['001','Changed','1']],'price_only');assert.equal(price.errors[0].error_code,'price_only_column');
});
test('row validation reports duplicates, invalid money, booleans, dietary/unit/order values and formula-like text',()=>{
  const errors=validateImportRows([{row_number:2,sku:'001',name:'=cmd',price:'1.001',original_price:'-1',available:'perhaps',active:'yes',dietary_type:'vegan',unit:'x'.repeat(81),display_order:'1.5'},
    {row_number:3,sku:'001',name:'Okay',price:'0',original_price:'',unit:'',dietary_type:'',available:'',active:'',display_order:''}]);
  for(const key of ['sku','name','price','available','dietary_type','unit','display_order'])assert.ok(errors.some(error=>error.column_name===key));
  assert.equal(validateImportRows([{row_number:2,sku:'0001',name:'Sample',price:'999999999.99',original_price:'999999999.99',available:'TRUE',active:false}]).length,0);
});
test('empty, malformed, oversized and unsupported files fail with actionable errors',()=>{
  assert.throws(()=>parseCsv(''),/empty/);assert.throws(()=>parseCsv('SKU,Name,Price\n"unterminated'),/quoted/);assert.equal(rowsFromSheet([['SKU','Product Name','Price']]).errors[0].error_code,'empty_file');
});
test('file and row caps reject without reading arbitrary spreadsheet formats',()=>{
  assert.throws(()=>openCatalogFile(new ArrayBuffer(10),'catalog.xls'),/unsupported/);assert.throws(()=>openCatalogFile(new ArrayBuffer(IMPORT_LIMITS.bytes+1),'catalog.csv'),/5 MiB/);
  assert.throws(()=>rowsFromSheet(Array.from({length:1002},()=>['x'])),/1,000/);assert.throws(()=>rowsFromSheet([Array(33).fill('x')]),/32 columns/);
});
test('XLSX preserves text SKUs, exact price lexemes, blank rows and explicit worksheet selection',async()=>{
  const bytes=workbookFixture([{name:'Wrong sheet',rows:[['SKU','Price'],['wrong','1']]},{name:'Selected products',rows:[['SKU','Product Name','Price'],['001','Fictional sample',12.99],[],['002','Other',0]]}]);
  const state=openCatalogFile(bytes.buffer,'catalog.xlsx');assert.deepEqual(state.sheets.map(sheet=>sheet.name),['Wrong sheet','Selected products']);const result=await parseCatalogSheet(state,'Selected products','upsert');assert.equal(result.errors.length,0);assert.equal(result.rows[0].sku,'001');assert.equal(result.rows[0].price,'12.99');assert.deepEqual(result.rows.map(row=>row.row_number),[2,4]);
});
test('XLSX cached formulas, namespaced formulas, numeric SKUs, errors and sparse coordinates are rejected',async()=>{
  const formula=workbookFixture([{name:'Products',rows:[['SKU','Product Name','Price'],['001','Sample',{formula:'1+1',value:2}]]}]);await assert.rejects(parseCatalogSheet(openCatalogFile(formula.buffer,'catalog.xlsx'),'Products','upsert'),/formula/);
  assert.throws(()=>inspectWorksheet('<worksheet xmlns:x="urn:x"><sheetData><row r="2"><c r="A2"><x:f>1+1</x:f><v>2</v></c></row></sheetData></worksheet>'),/formula/);
  assert.throws(()=>inspectWorksheet('<worksheet><sheetData><row r="1001"><c r="XFD1001"><v>1</v></c></row></sheetData></worksheet>'),/32 columns/);
  const numeric=workbookFixture([{name:'Products',rows:[['SKU','Product Name','Price'],[123,'Sample',1]]}]);const result=await parseCatalogSheet(openCatalogFile(numeric.buffer,'catalog.xlsx'),'Products','upsert');assert.ok(result.errors.some(error=>error.column_name==='sku'));
});
test('ZIP preflight enforces actual expansion, declared caps, CRC, duplicate/unsafe paths and active content',()=>{
  const oversized=zipSync({'huge.xml':strToU8('a'.repeat(IMPORT_LIMITS.expandedBytes+1))},{level:9});assert.throws(()=>readBoundedZip(oversized),/16 MiB/);
  assert.throws(()=>readBoundedZip(zipSync({'../evil.xml':strToU8('bad')})),/unsafe/);assert.throws(()=>readBoundedZip(zipSync({'xl/vbaProject.bin':new Uint8Array([1])})),/macros/);
  const understated=zipSync({'file.xml':strToU8('a'.repeat(10000))},{level:9}),view=new DataView(understated.buffer);view.setUint32(22,1,true);for(let index=0;index<understated.length-46;index++)if(view.getUint32(index,true)===0x02014b50)view.setUint32(index+24,1,true);assert.throws(()=>readBoundedZip(understated),/declared size/);
  const corrupt=zipSync({'file.xml':strToU8('data')},{level:0});corrupt[38]^=1;assert.throws(()=>readBoundedZip(corrupt));
});
test('external relationships and XML entities never reach the spreadsheet parser',()=>{
  assert.throws(()=>scanXml('<!DOCTYPE x [<!ENTITY xx SYSTEM "https://bad.example/">]><x/>'),/entities/);
  const bytes=workbookFixture(undefined,files=>{files['xl/_rels/workbook.xml.rels']=strToU8(strFromU8(files['xl/_rels/workbook.xml.rels']).replace('Target="worksheets/sheet1.xml"','Target="https://bad.example/file" TargetMode="External"'));});assert.throws(()=>openCatalogFile(bytes.buffer,'catalog.xlsx'),/external links/);
});
test('namespace attribute collisions cannot make inspection and parsing select different worksheets or cells',async()=>{
  const bytes=workbookFixture([{name:'Visible',rows:[['SKU','Product Name','Price'],['001','Safe',1]]},{name:'Hidden formula',rows:[['SKU','Product Name','Price'],['002','Unexpected',{formula:'99',value:99}]]}],files=>{
    files['xl/workbook.xml']=strToU8(strFromU8(files['xl/workbook.xml']).replace('r:id="rId1"','id="rId1" r:id="rId2"'));
  });
  assert.throws(()=>openCatalogFile(bytes.buffer,'collision.xlsx'),/Conflicting XML attributes/);
  assert.throws(()=>inspectWorksheet('<worksheet xmlns:x="urn:x"><row r="2"><c r="A2" x:r="AF1001" t="inlineStr" x:t="n"><v>1</v></c></row></worksheet>'),/Conflicting XML attributes/);
  assert.doesNotThrow(()=>scanXml('<worksheet xmlns:r="urn:r"><row r="1"><c r="A1"/></row></worksheet>'));
});
test('out-of-order or misplaced worksheet cells cannot change source row/SKU interpretation',()=>{
  assert.throws(()=>inspectWorksheet('<worksheet><row r="2"><c r="A2"/></row><row r="1"><c r="A1"/></row></worksheet>'),/ascending/);
  assert.throws(()=>inspectWorksheet('<worksheet><row r="1"><c r="B1"/><c r="A1"/></row></worksheet>'),/ascending/);
  assert.throws(()=>inspectWorksheet('<worksheet><row r="1"/><c r="A1"/></worksheet>'),/cell positions/);
});
test('both download templates have the expected headers and XLSX preserves SKU text formatting',async()=>{
  for(const mode of ['upsert','price_only']){
    const csv=new TextDecoder().decode(templateBytes(mode,'csv')),matrix=parseCsv(csv);assert.equal(matrix[0][0],'SKU');assert.ok(matrix[0].includes('Price'));assert.equal(matrix[0].includes('Product Name'),mode==='upsert');
    const bytes=templateBytes(mode,'xlsx'),state=openCatalogFile(bytes.buffer,'template.xlsx');assert.equal(state.sheets[0].name,'Products');const parsed=await parseCatalogSheet(state,'Products',mode);assert.ok(parsed.errors.some(error=>error.error_code==='empty_file'));assert.match(strFromU8(state.files.get('xl/styles.xml')),/numFmtId="49"/);
  }
});
test('CSV error reports escape formula-leading names and preserve errors without executable cells',()=>{
  const csv=reportCsv({items:[{row_number:2,sku:'=HYPERLINK("bad")',action:'invalid',changes:[],error:{error_code:'formula',message:'Literal values required'}}],errors:[]});const data=Papa.parse(csv).data;assert.ok(data[1][1].startsWith("'="));assert.equal(data[1][6],'formula');
});
