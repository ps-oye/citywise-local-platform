import Papa from 'papaparse';
import {Inflate,zipSync} from 'fflate';
import {Parser} from 'saxen';
import {readSheet} from 'read-excel-file/universal';
import {IMPORT_LIMITS,rowsFromSheet,validateImportRows} from '../domain/catalog-import.js';

const utf8=new TextDecoder('utf-8',{fatal:true});
const local=name=>name.split(':').at(-1);
const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function safePath(name){return name&&name.length<=240&&!name.startsWith('/')&&!/[\\:\u0000-\u001f]/.test(name)&&!name.split('/').some(part=>part==='..'||part==='.')&&!/%/.test(name);}

// Parse the central directory before inflating anything; enforce actual byte limits during inflation.
export function readBoundedZip(input) {
  const data=input instanceof Uint8Array?input:new Uint8Array(input);
  if(data.length<22||data.length>IMPORT_LIMITS.bytes)throw new Error('Choose an XLSX file under 5 MiB.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let end=-1;
  for(let index=data.length-22;index>=Math.max(0,data.length-65557);index--)if(view.getUint32(index,true)===0x06054b50&&index+22+view.getUint16(index+20,true)===data.length){end=index;break;}
  if(end<0)throw new Error('This is not a supported XLSX ZIP archive.');
  const entries=view.getUint16(end+10,true),start=view.getUint32(end+16,true),directorySize=view.getUint32(end+12,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==entries||entries<1||entries>IMPORT_LIMITS.entries||start+directorySize!==end)throw new Error('Multi-disk, ZIP64 or oversized XLSX archives are unsupported.');
  let offset=start,declared=0,total=0;const files=new Map(),occupied=[];
  for(let index=0;index<entries;index++){
    if(offset+46>end||view.getUint32(offset,true)!==0x02014b50)throw new Error('The XLSX directory is malformed.');
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),crc=view.getUint32(offset+16,true),compressed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),disk=view.getUint16(offset+34,true),location=view.getUint32(offset+42,true);
    if(offset+46+nameLength+extra+comment>end)throw new Error('The XLSX entry is truncated.');
    const name=utf8.decode(data.subarray(offset+46,offset+46+nameLength));
    if(!safePath(name)||files.has(name)||disk||flags&~0x080e||![0,8].includes(method)||compressed===0xffffffff||size===0xffffffff||location+30>start)throw new Error('Encrypted, duplicate, unsafe or unsupported XLSX entries are not accepted.');
    if(/(?:vbaProject|activeX|embeddings|macrosheets|externalLinks|connections\.xml)/i.test(name))throw new Error('Remove macros, embedded objects and external connections before importing.');
    declared+=size;if(declared>IMPORT_LIMITS.expandedBytes)throw new Error('The expanded workbook exceeds 16 MiB. Split it into smaller files.');
    if(view.getUint32(location,true)!==0x04034b50||view.getUint16(location+6,true)!==flags||view.getUint16(location+8,true)!==method)throw new Error('The XLSX local header does not match its directory.');
    const localNameLength=view.getUint16(location+26,true),localExtra=view.getUint16(location+28,true),bodyStart=location+30+localNameLength+localExtra,bodyEnd=bodyStart+compressed;
    if(bodyEnd>start||bodyStart>start||utf8.decode(data.subarray(location+30,location+30+localNameLength))!==name||occupied.some(([from,to])=>location<to&&bodyEnd>from))throw new Error('The XLSX entries overlap or have invalid paths.');
    occupied.push([location,bodyEnd]);
    if(!(flags&8)&&(view.getUint32(location+14,true)!==crc||view.getUint32(location+18,true)!==compressed||view.getUint32(location+22,true)!==size))throw new Error('The XLSX entry sizes do not match.');
    const compressedBytes=data.subarray(bodyStart,bodyEnd),chunks=[];let actual=0;
    const accept=chunk=>{actual+=chunk.length;total+=chunk.length;if(actual>size||total>IMPORT_LIMITS.expandedBytes)throw new Error('The workbook expands beyond its declared size or 16 MiB limit.');chunks.push(chunk.slice());};
    if(method===0)accept(compressedBytes);else{
      const inflater=new Inflate(accept);for(let part=0;part<compressedBytes.length;part+=2048)inflater.push(compressedBytes.subarray(part,Math.min(part+2048,compressedBytes.length)),part+2048>=compressedBytes.length);
    }
    if(actual!==size)throw new Error('The workbook’s expanded size is invalid.');
    const bytes=new Uint8Array(actual);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}
    if(crc32(bytes)!==crc)throw new Error('The workbook contains a damaged entry.');files.set(name,bytes);offset+=46+nameLength+extra+comment;
  }
  if(offset!==end)throw new Error('The XLSX directory has unsupported data.');return files;
}
export function scanXml(xml,onOpen=()=>{},onText=()=>{},onClose=()=>{}) {
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw new Error('XML document types and entities are unsupported.');
  let depth=0,nodes=0;const parser=new Parser();
  parser.on('openTag',(name,getAttrs,decode)=>{
    if(++depth>50||++nodes>250000)throw new Error('The workbook XML is too complex.');
    const raw=getAttrs(),attrs={},seen=new Set();if(Object.keys(raw).length>100)throw new Error('The workbook has too many XML attributes.');
    for(const [key,value] of Object.entries(raw)){
      const namespace=key==='xmlns'||key.startsWith('xmlns:'),normalized=namespace?key:local(key);
      if(!namespace&&seen.has(normalized))throw new Error('Conflicting XML attributes could select different worksheet data. Remove duplicate attribute names.');
      if(!namespace)seen.add(normalized);attrs[normalized]=decode(value);
    }
    onOpen(local(name),attrs);
  });
  parser.on('closeTag',name=>{onClose(local(name));depth--;});parser.on('text',(value,decode)=>onText(decode(value)));
  parser.on('error',error=>{throw new Error('Malformed workbook XML: '+error.message);});parser.on('warn',()=>{throw new Error('The workbook contains malformed XML.');});
  parser.parse(xml);if(depth!==0)throw new Error('The workbook XML is incomplete.');
}
const attr=(attrs,key)=>attrs[key]??Object.entries(attrs).find(([name])=>local(name)===key)?.[1];
function worksheetPath(target){
  if(!target||/[\\:#?%]/.test(target))throw new Error('The worksheet destination is invalid.');
  const parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),result=[];
  for(const part of parts){if(part==='..'){if(!result.length)throw new Error('The worksheet path escapes the workbook.');result.pop();}else if(part&&part!=='.')result.push(part);}
  return result.join('/');
}
export function inspectWorkbook(files) {
  const book=files.get('xl/workbook.xml'),rels=files.get('xl/_rels/workbook.xml.rels');if(!book||!rels||!files.has('[Content_Types].xml'))throw new Error('The file does not contain an XLSX workbook.');
  const relations=new Map(),sheets=[];
  for(const [path,bytes] of files)if(/\.xml$|\.rels$/i.test(path)){
    const xml=utf8.decode(bytes);
    if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))throw new Error('Remove XML document types and entities from the workbook.');
    scanXml(xml,(tag,attrs)=>{if(path.endsWith('.rels')&&tag==='Relationship'&&String(attrs.TargetMode).toLowerCase()==='external')throw new Error('Remove external links and connections from this workbook.');});
    if(path==='[Content_Types].xml'&&/macroEnabled|vbaProject/i.test(xml))throw new Error('Macro-enabled workbooks are unsupported. Save a plain .xlsx file.');
  }
  scanXml(utf8.decode(rels),(tag,attrs)=>{if(tag==='Relationship')relations.set(attrs.Id,{target:attrs.Target,type:attrs.Type});});
  scanXml(utf8.decode(book),(tag,attrs)=>{if(tag==='sheet'){
    const relationship=relations.get(attr(attrs,'id'));if(!relationship||!relationship.type?.endsWith('/worksheet'))throw new Error('Only ordinary worksheets are supported.');
    const path=worksheetPath(relationship.target);if(!files.has(path)||!attrs.name||attrs.name.length>100||sheets.some(sheet=>sheet.name===attrs.name))throw new Error('The worksheet reference is missing or duplicated.');
    sheets.push({name:attrs.name,path});if(sheets.length>20)throw new Error('Use a workbook with at most 20 worksheets.');
  }});
  if(!sheets.length)throw new Error('The workbook contains no worksheets.');return sheets;
}
export function inspectWorksheet(xml,sheetName='Worksheet') {
  let row=0,rows=0,cells=0,cellText=0,cell='',insideCell=false,insideRow=false,lastColumn=0;const references=new Set(),rowNumbers=new Set(),numericCells=new Set();
  scanXml(xml,(tag,attrs)=>{
    if(tag==='row'){
      if(insideRow||!/^[1-9]\d{0,3}$/.test(attrs.r||'')||Number(attrs.r)>IMPORT_LIMITS.rows+1||Number(attrs.r)<=row||rowNumbers.has(Number(attrs.r))||++rows>IMPORT_LIMITS.rows+1)throw new Error('Use at most 1,000 data rows with unique ascending row positions.');
      row=Number(attrs.r);rowNumbers.add(row);insideRow=true;lastColumn=0;
    }
    if(tag==='c'){
      const ref=attrs.r,match=/^([A-Z]{1,3})([1-9]\d{0,3})$/.exec(ref||'');
      const column=match?.[1].split('').reduce((sum,char)=>sum*26+char.charCodeAt(0)-64,0);
      if(!insideRow||insideCell||!match||column<=lastColumn||column>IMPORT_LIMITS.columns||Number(match[2])!==row||references.has(ref)||++cells>(IMPORT_LIMITS.rows+1)*IMPORT_LIMITS.columns)throw new Error('Worksheet cell positions must be ascending within 32 columns and 1,001 rows.');
      references.add(ref);cell=ref;insideCell=true;cellText=0;lastColumn=column;if(!attrs.t||attrs.t==='n')numericCells.add(ref);
      if(attrs.t==='e')throw new Error(sheetName+' cell '+ref+' contains a spreadsheet error. Correct it before importing.');
    }
    if(tag==='f')throw new Error(sheetName+' cell '+cell+' contains a formula. Replace formulas with literal values before importing.');
    if(tag==='mergeCell')throw new Error('Unmerge cells in the selected worksheet before importing.');
  },text=>{if(insideCell&&(cellText+=text.length)>20000)throw new Error('A worksheet cell is too long. Use text under 20,000 characters.');},tag=>{if(tag==='c')insideCell=false;if(tag==='row')insideRow=false;});
  return {numericCells};
}
function validateSharedStrings(xml) {
  let count=0,length=0;
  scanXml(xml,tag=>{if(tag==='si'){length=0;if(++count>(IMPORT_LIMITS.rows+1)*IMPORT_LIMITS.columns)throw new Error('The workbook has too many shared strings.');}},text=>{length+=text.length;if(length>20000)throw new Error('A shared string exceeds 20,000 characters.');});
}
export function parseCsv(text) {
  if(!text.trim())throw new Error('This CSV file is empty.');
  const result=Papa.parse(text,{header:false,dynamicTyping:false,skipEmptyLines:false,delimitersToGuess:[',',';','\t'],preview:IMPORT_LIMITS.rows+2});
  if(result.errors.some(error=>error.type==='Quotes'))throw new Error('The CSV contains an unterminated or malformed quoted field.');
  while(result.data.length&&result.data.at(-1).every(value=>!String(value??'').trim()))result.data.pop();
  if(result.meta.truncated||result.data.length>IMPORT_LIMITS.rows+1)throw new Error('Split the file into at most 1,000 data rows.');
  return result.data;
}
export function openCatalogFile(buffer,name) {
  const type=/\.xlsx$/i.test(name)?'xlsx':/\.csv$/i.test(name)?'csv':null;
  if(!type)throw new Error('Choose an .xlsx or .csv file. Other formats, including .xls and .xlsm, are unsupported.');
  if(!buffer.byteLength||buffer.byteLength>IMPORT_LIMITS.bytes||name.length>180)throw new Error('Choose a non-empty file under 5 MiB with a filename under 180 characters.');
  if(type==='csv')return {type,matrix:parseCsv(utf8.decode(buffer)),sheets:[]};
  const files=readBoundedZip(buffer);return {type,files,sheets:inspectWorkbook(files)};
}
export async function parseCatalogSheet(state,sheet,mode) {
  let matrix=state.matrix;
  if(state.type==='xlsx'){
    const selected=state.sheets.find(item=>item.name===sheet);if(!selected)throw new Error('Select an available worksheet.');
    const {numericCells}=inspectWorksheet(utf8.decode(state.files.get(selected.path)),selected.name);
    const shared=state.files.get('xl/sharedStrings.xml');if(shared)validateSharedStrings(utf8.decode(shared));
    // Repack only bounded XML as stored entries. The library cannot create nested blob workers
    // for uncompressed entries, and its universal XML parser runs in our terminable worker.
    const safeFiles={};for(const [path,bytes] of state.files)if(/\.xml$|\.rels$/i.test(path))safeFiles[path]=bytes;
    const safeArchive=zipSync(safeFiles,{level:0});
    matrix=await readSheet(safeArchive.buffer.slice(safeArchive.byteOffset,safeArchive.byteOffset+safeArchive.byteLength),selected.name,{parseNumber:value=>value,trim:false});
    // Numeric SKUs have already lost leading-zero information in Excel. Require text cells.
    const headerIndex=matrix.findIndex(row=>row.some(value=>value!==null&&String(value).trim())),skuIndex=matrix[headerIndex]?.findIndex(value=>String(value??'').trim().toLowerCase()==='sku');
    if(skuIndex>=0){let letters='',column=skuIndex+1;while(column){letters=String.fromCharCode(65+(column-1)%26)+letters;column=Math.floor((column-1)/26);}for(let row=headerIndex+1;row<matrix.length;row++)if(numericCells.has(letters+(row+1))&&matrix[row]?.[skuIndex]!==null)matrix[row][skuIndex]={invalid_type:'numeric_sku'};}
  }
  const result=rowsFromSheet(matrix,mode);return {...result,errors:[...result.errors,...validateImportRows(result.rows,mode)]};
}
