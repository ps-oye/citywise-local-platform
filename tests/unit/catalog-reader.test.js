import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogFileReader} from '../../src/services/catalog-file-reader.js';
test('the file reader terminates a timed-out worker instead of leaving CPU work running',async t=>{
  const previous=globalThis.Worker,created=[];globalThis.Worker=class{constructor(){created.push(this);}postMessage(){}terminate(){this.terminated=true;}};
  t.mock.timers.enable({apis:['setTimeout']});const reader=createCatalogFileReader();
  try{const promise=reader.open({size:20,name:'file.csv',arrayBuffer:async()=>new ArrayBuffer(20)});await new Promise(setImmediate);t.mock.timers.tick(15001);await assert.rejects(promise,/too long/);assert.equal(created[0].terminated,true);}
  finally{reader.destroy();t.mock.timers.reset();globalThis.Worker=previous;}
});
test('a late file read cannot overwrite the worker created for a newer selection',async()=>{
  const previous=globalThis.Worker,created=[];let finishFirst;globalThis.Worker=class{constructor(){this.messages=[];created.push(this);}postMessage(data){this.messages.push(data);this.onmessage({data:{id:data.id,result:{type:'csv',sheets:[]}}});}terminate(){this.terminated=true;}};
  const reader=createCatalogFileReader();
  try{const first=reader.open({size:20,name:'first.csv',arrayBuffer:()=>new Promise(resolve=>{finishFirst=resolve;})});const second=await reader.open({size:20,name:'second.csv',arrayBuffer:async()=>new ArrayBuffer(20)});assert.equal(second.type,'csv');finishFirst(new ArrayBuffer(20));await assert.rejects(first,/cancelled/);assert.equal(created[0].messages.length,0);assert.equal(created[1].messages[0].name,'second.csv');}
  finally{reader.destroy();globalThis.Worker=previous;}
});
