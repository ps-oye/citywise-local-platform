import {zipSync,strToU8} from 'fflate';
import {templateBytes} from '../../src/services/catalog-downloads.js';
import {readBoundedZip} from '../../src/services/catalog-file-parser.js';
import {escapeHtml as e} from '../../src/utils/dom.js';
export function workbookFixture(sheets=[{name:'Products',rows:[['SKU','Product Name','Price'],['001','Fictional sample','12.99']]}],mutate=()=>{}) {
  const files=Object.fromEntries(readBoundedZip(templateBytes('upsert','xlsx')));
  const names=[],relations=[];
  sheets.forEach((sheet,index)=>{
    names.push(`<sheet name="${e(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`);relations.push(`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`);
    const xml=`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet.rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,column)=>{
      const ref=String.fromCharCode(65+column)+(rowIndex+1);
      if(value&&typeof value==='object'&&value.formula!==undefined)return `<c r="${ref}"><f>${e(value.formula)}</f><v>${e(value.value??0)}</v></c>`;
      if(typeof value==='number')return `<c r="${ref}" t="n"><v>${value}</v></c>`;
      if(typeof value==='boolean')return `<c r="${ref}" t="b"><v>${value?1:0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${e(value??'')}</t></is></c>`;
    }).join('')}</row>`).join('')}</sheetData></worksheet>`;files[`xl/worksheets/sheet${index+1}.xml`]=strToU8(xml);
  });
  files['xl/workbook.xml']=strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.join('')}</sheets></workbook>`);
  files['xl/_rels/workbook.xml.rels']=strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations.join('')}</Relationships>`);
  mutate(files);return zipSync(files,{level:6});
}
