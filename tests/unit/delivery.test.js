import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryAddress,deliveryInstructions,foodCatalogType} from '../../src/domain/delivery.js';
import {buildWhatsAppUrl} from '../../src/domain/whatsapp.js';
import {handleCheckout,deliveryFingerprint} from '../../src/server/checkout-handler.js';
import {formatMoneyExact} from '../../src/utils/format.js';

const merchant='70000000-0000-4000-8000-000000000001',product='71000000-0000-4000-8000-000000000001';
const address='House 25, Example Colony\nNear Main Market, Rawatbhata, Rajasthan';
const instructions='Near gate & ring once <please> 🙂';
const receipt={reference:'SO-1234ABCD5678EF90',merchant_name:'QA Kitchen',whatsapp_number:'+12025550123',total_minor:3000,fulfilment:'delivery',food_delivery:true,instructions:null,
  items:[{product_id:product,name:'Test & Thali',unit:'plate',quantity:2,price_minor:1500,line_total_minor:3000}]};
const input={merchant_id:merchant,items:[{product_id:product,quantity:2}],fulfilment:'delivery',instructions,delivery_address:address,quote_token:'a'.repeat(32),idempotency_key:'80000000-0000-4000-8000-000000000001'};
const request=body=>new Request('https://shaharone.in/api/checkout',{method:'POST',headers:{Origin:'https://shaharone.in','Content-Type':'application/json'},body:JSON.stringify(body)});

test('delivery addresses require meaningful content and normalize multiline Unicode without dropping special characters',()=>{
  for(const value of [undefined,null,'',' \n\t ','abcd','.............','a'.repeat(20),'House 25\u0000 Example Colony','x'.repeat(1001),'House 25 Example \ud800 Colony'])assert.ok(deliveryAddress(value).error,String(value));
  assert.equal(deliveryAddress('  House  25, Example Colony \r\n\n Near Main Market, Rawatbhata, Rajasthan  ').value,address);
  const hindi='मकान 25, नया बाजार\nरावतभाटा, राजस्थान';assert.equal(deliveryAddress(hindi).value,hindi);
  assert.equal(deliveryInstructions(instructions).value,instructions);assert.ok(deliveryInstructions('x'.repeat(501)).error);
});

test('delivery WhatsApp links use authoritative amounts, SO references, multiline address and correctly encoded customer text',()=>{
  const url=new URL(buildWhatsAppUrl({...receipt,delivery_address:address,instructions}));
  assert.equal(url.origin+url.pathname,'https://wa.me/12025550123');const message=url.searchParams.get('text');
  for(const value of [address,instructions,'SO-1234ABCD5678EF90','₹30.00','₹15.00','Ordered via ShaharOne.in','not a confirmed order'])assert.ok(message.includes(value),value);
  assert.ok(!message.includes('Pickup'));assert.ok(!message.includes('Enquiry only'));
  assert.throws(()=>buildWhatsAppUrl({...receipt,delivery_address:'  '}),/delivery/);
  const legacy=buildWhatsAppUrl({...receipt,reference:'RB-1234ABCD5678EF90',fulfilment:'pickup',food_delivery:false});assert.ok(new URL(legacy).searchParams.get('text').includes('RB-1234ABCD5678EF90'));
});

test('missing or incomplete delivery addresses are rejected before any quota or initiation RPC',async()=>{
  const client={rpc:()=>{throw new Error('Must not touch database');}};
  for(const delivery_address of [undefined,'','  \n ','Main']){
    const response=await handleCheckout(request({...input,delivery_address}),{client,identity:'127.0.0.1',secret:'s'.repeat(40)});
    assert.equal(response.status,400);assert.equal((await response.json()).code,'delivery_address_required');
  }
});

test('delivery boundary sends only a secret-keyed fingerprint to SQL and omits customer text from returned receipt',async()=>{
  const calls=[],client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='merchant_is_food'?true:name==='checkout_consume_limit'?{allowed:true}:name==='checkout_mark_handoff'?true:{status:'initiated',receipt,request_hash:'b'.repeat(64)}};}};
  const response=await handleCheckout(request(input),{client,identity:'127.0.0.1',secret:'s'.repeat(40)});assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.reference,receipt.reference);assert.ok(new URL(data.url).searchParams.get('text').includes(address));
  assert.deepEqual(calls.map(call=>call.name),['merchant_is_food','checkout_consume_limit','checkout_initiate_delivery','checkout_mark_handoff']);
  const args=calls[2].args;assert.match(args.p_delivery_fingerprint,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(calls).includes(address));assert.ok(!JSON.stringify(calls).includes(instructions));
  assert.equal(data.receipt.delivery_address,undefined);assert.equal(data.receipt.instructions,null);
  const first=await deliveryFingerprint(merchant,address,instructions,'s'.repeat(40));assert.equal(first,args.p_delivery_fingerprint);
  assert.notEqual(first,await deliveryFingerprint(merchant,address+' East',instructions,'s'.repeat(40)));
  assert.notEqual(first,await deliveryFingerprint(merchant,address,instructions,'z'.repeat(40)));
});

test('food form guidance inherits category capabilities, retains restaurants and handles parent cycles safely',()=>{
  const categories=[{id:'food',food_catalog:true},{id:'child',parent_id:'food'},{id:'a',parent_id:'b'},{id:'b',parent_id:'a'}];
  assert.equal(foodCatalogType('COMMERCE',['child'],categories),true);assert.equal(foodCatalogType('RESTAURANT',[],[]),true);
  assert.equal(foodCatalogType('COMMERCE',['a'],categories),false);assert.equal(foodCatalogType('HOTEL',[],categories),false);
});

test('aggregate monetary formatting preserves minor units beyond safe Number precision',()=>{
  assert.equal(formatMoneyExact('9007199254740993123').replace(/[^0-9.]/g,''),'90071992547409931.23');
  assert.equal(formatMoneyExact('0'),'₹0.00');assert.throws(()=>formatMoneyExact(Number.MAX_SAFE_INTEGER+1));assert.throws(()=>formatMoneyExact('-1'));
});
