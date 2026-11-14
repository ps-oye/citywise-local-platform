import {IMPORT_LIMITS} from '../domain/catalog-import.js';
export function createCatalogFileReader() {
  let worker,sequence=0;const pending=new Map();
  function stop(message='File reading cancelled.') {
    worker?.terminate();worker=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error(message));}pending.clear();
  }
  function request(payload,transfer=[]) {
    if(!worker)throw new Error('Choose a file first.');const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>stop('Reading took too long. Split the file into a smaller workbook and try again.'),IMPORT_LIMITS.timeout);pending.set(id,{resolve,reject,timer});worker.postMessage({id,...payload},transfer);
    });
  }
  return {
    async open(file){
      stop();if(!file||!file.size||file.size>IMPORT_LIMITS.bytes)throw new Error('Choose a non-empty .xlsx or .csv file under 5 MiB.');
      worker=new Worker(new URL('../workers/catalog.worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{const item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);if(data.error)item.reject(new Error(data.error));else item.resolve(data.result);};
      worker.onerror=()=>stop('The spreadsheet reader could not start or stopped unexpectedly. Try another file.');
      const active=worker,buffer=await file.arrayBuffer();if(worker!==active)throw new Error('File reading cancelled.');return request({operation:'open',buffer,name:file.name},[buffer]);
    },
    parse:(sheet,mode)=>request({operation:'parse',sheet,mode}),
    cancel:stop,
    destroy:()=>stop(),
  };
}
