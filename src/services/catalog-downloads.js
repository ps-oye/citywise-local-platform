import Papa from 'papaparse';
import {zipSync,strToU8} from 'fflate';
import {CATALOG_COLUMNS,PRICE_COLUMNS,columnLabel} from '../domain/catalog-import.js';
import {escapeHtml} from '../utils/dom.js';
export function csvText(rows){return '\uFEFF'+Papa.unparse(rows,{quotes:true,escapeFormulae:/^[\s\uFEFF]*[=+\-@\t\r]/u,newline:'\r\n'});}
export function templateBytes(mode='upsert',format='csv') {
  const columns=mode==='price_only'?PRICE_COLUMNS:CATALOG_COLUMNS,headings=columns.map(([,label])=>label);
  if(format==='csv')return new TextEncoder().encode(csvText([headings]));
  const cellName=index=>String.fromCharCode(65+index);
  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF174D42"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':'<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+columns.map(([key],index)=>'<col min="'+(index+1)+'" max="'+(index+1)+'" width="'+(key==='description'?45:24)+'" customWidth="1"'+(key==='sku'?' style="2"':'')+'/>').join('')+'</cols><sheetData><row r="1">'+headings.map((label,index)=>'<c r="'+cellName(index)+'1" s="1" t="inlineStr"><is><t>'+escapeHtml(label)+'</t></is></c>').join('')+'</row></sheetData><autoFilter ref="A1:'+cellName(columns.length-1)+'1"/></worksheet>',
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,strToU8(text)])),{level:6});
}
export function reportCsv(report) {
  const rows=[['Row','SKU','Action','Column','Before','After','Error Code','Message']];
  for(const item of report.items||[]){
    const changes=item.changes?.length?item.changes:[{field:'',before:'',after:''}];
    for(const change of changes)rows.push([item.row_number,item.sku,item.action,columnLabel(change.field),change.before??'',change.after??'',item.error?.error_code||'',item.error?.message||'']);
  }
  for(const error of report.errors||[])if(!report.items?.some(item=>item.row_number===error.row_number&&item.error))rows.push([error.row_number,'','failed',columnLabel(error.column_name||''),'','',error.error_code,error.message]);
  return csvText(rows);
}
export function downloadBytes(bytes,filename,type='text/csv;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
