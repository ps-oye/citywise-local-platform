import {openCatalogFile,parseCatalogSheet} from '../services/catalog-file-parser.js';
let state;
self.onmessage=async({data})=>{
  try{
    if(data.operation==='open'){state=openCatalogFile(data.buffer,data.name);self.postMessage({id:data.id,result:{type:state.type,sheets:state.sheets.map(sheet=>sheet.name)}});}
    else if(data.operation==='parse'&&state)self.postMessage({id:data.id,result:await parseCatalogSheet(state,data.sheet,data.mode)});
    else throw new Error('Choose a file before parsing.');
  }catch(error){self.postMessage({id:data.id,error:error.message||'The spreadsheet could not be read.'});}
};
