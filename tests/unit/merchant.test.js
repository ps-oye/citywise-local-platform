import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCart,readStoredCart,reconcileCart,cartItems} from '../../src/domain/cart.js';
import {createCartStore} from '../../src/services/cart-store.js';
import {createCheckoutService} from '../../src/services/checkout-service.js';
import {buildWhatsAppMessage,buildWhatsAppUrl} from '../../src/domain/whatsapp.js';
import {catalogFilters,directionsUrl,merchantPath,statusCopy,verifiedTelephone} from '../../src/domain/merchant.js';
import {handleCheckout,clientFingerprint} from '../../src/server/checkout-handler.js';
import {serveMerchantPage} from '../../src/server/merchant-page.js';
const merchant='70000000-0000-4000-8000-000000000001',other='70000000-0000-4000-8000-000000000002';
const product='71000000-0000-4000-8000-000000000001';
const line={product_id:product,quantity:2,name:'Vegetable thali',unit:'plate',price_minor:12550,available:true};
const token='a'.repeat(32),key='74000000-0000-4000-8000-000000000001';
const receipt={reference:'RB-TEST000001',merchant_name:'Test Kitchen',whatsapp_number:'+12025550123',items:[{...line,line_total_minor:25100}],total_minor:25100,fulfilment:'pickup',instructions:'Less spice, please.'};
const memoryStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const input={merchant_id:merchant,items:cartItems([line]),fulfilment:'pickup',instructions:'',quote_token:token,idempotency_key:key};
const request=(body=input,options={})=>new Request('https://example.com/api/checkout',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json',...options.headers},body:JSON.stringify(body)});
const trusted={identity:'127.0.0.1',secret:'a_private_test_hmac_secret_at_least_32_characters'};

test('cart arithmetic uses integer minor units and detects aggregate limits and unavailable lines',()=>{
  assert.deepEqual(calculateCart([line,{...line,product_id:other,quantity:3,price_minor:1}]),{totalMinor:25103,quantity:5,withinLimit:true,available:true});
  assert.equal(calculateCart([{...line,price_minor:99999999999,quantity:99}]).withinLimit,false);
  assert.equal(calculateCart([{...line,available:false}]).available,false);
  for(const changed of [{quantity:1.2},{quantity:-1},{quantity:100},{price_minor:NaN},{price_minor:-1}])assert.throws(()=>calculateCart([{...line,...changed}]),TypeError);
});
test('cart storage is versioned, merchant-isolated, quantity-bounded and resilient to corruption',()=>{
  const storage=memoryStorage(),store=createCartStore({storage});
  store.add(merchant,{id:product,merchant_id:merchant,name:line.name,unit:line.unit,price_minor:line.price_minor,available:true});
  store.quantity(merchant,product,3);
  assert.equal(createCartStore({storage}).get(merchant)[0].quantity,3);assert.deepEqual(store.get(other),[]);
  assert.throws(()=>store.add(other,{id:product,merchant_id:merchant}),TypeError);
  assert.throws(()=>store.quantity(merchant,product,100),RangeError);
  assert.deepEqual(readStoredCart('{broken',merchant),[]);
  assert.deepEqual(readStoredCart(JSON.stringify({version:1,merchant_id:other,items:[line]}),merchant),[]);
  assert.deepEqual(readStoredCart(JSON.stringify({version:1,merchant_id:merchant,items:[{...line,quantity:1000000}]}),merchant),[]);
  store.quantity(merchant,product,0);assert.deepEqual(store.get(merchant),[]);
});
test('cart works in memory when browser storage is blocked and server quotes replace stale display prices',()=>{
  let warnings=0;const store=createCartStore({storage:{getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}},onPersistenceError:()=>warnings++});
  store.replace(merchant,[line]);assert.equal(store.get(merchant).length,1);assert.ok(warnings);
  const result=reconcileCart([line],{items:[{...line,price_minor:13000}]});
  assert.equal(result.items[0].price_minor,13000);assert.equal(result.changes[0].kind,'price');
  const unavailable=reconcileCart([line],{items:[]});assert.equal(unavailable.items[0].available,false);assert.equal(unavailable.changes[0].kind,'unavailable');
});
test('WhatsApp text is explicit about an enquiry and encodes only a verified database contact',()=>{
  const message=buildWhatsAppMessage(receipt),url=buildWhatsAppUrl(receipt);
  assert.match(message,/Enquiry Ref: RB-TEST000001/);assert.match(message,/Vegetable thali \(plate\) x 2/);assert.match(message,/not a confirmed order/);
  assert.equal(new URL(url).hostname,'wa.me');assert.equal(new URL(url).searchParams.get('text'),message);
  assert.throws(()=>buildWhatsAppUrl({...receipt,whatsapp_number:'javascript:alert(1)'}),TypeError);
  assert.throws(()=>buildWhatsAppMessage({...receipt,total_minor:1}),TypeError);
  assert.throws(()=>buildWhatsAppMessage({...receipt,items:[{...receipt.items[0],quantity:3}]}),TypeError);
});
test('merchant URLs, product filter state, schedule wording and directions avoid fabricated or executable destinations',()=>{
  assert.equal(merchantPath({slug:'sample',category_slug:'food'},'town'),'/town/food/sample');
  assert.equal(merchantPath({slug:'../sample',category_slug:'food'},'town'),null);
  const filters=catalogFilters(new URL('https://example.com/town/food/sample?product_q=tea&diet=egg&available=1&product_sort=price_desc&product_category=bad'));
  assert.equal(filters.query,'tea');assert.equal(filters.availableOnly,true);assert.equal(filters.categoryId,'');assert.equal(filters.sort,'price_desc');
  const real={is_demo:false,contact_verified_at:'2026-11-12',phone_number:'+12025550123',actions:{directions_enabled:true},latitude:24.5,longitude:75.6,name:'Test Kitchen'};
  assert.equal(verifiedTelephone(real),real.phone_number);assert.equal(directionsUrl({...real,is_demo:true}),null);
  assert.equal(new URL(directionsUrl(real)).searchParams.get('destination'),'24.5,75.6');
  assert.equal(statusCopy({state:'temporarily_closed'}).closed,true);assert.equal(statusCopy({state:'hours_unavailable'}).label,'Hours not provided');
});
test('checkout retries preserve their idempotency key across service instances and change it for a changed request',async()=>{
  const storage=memoryStorage(),calls=[];
  const fetcher=async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({status:'handoff_created',url:buildWhatsAppUrl(receipt)}),{headers:{'Content-Type':'application/json'}});};
  const body={...input};delete body.idempotency_key;
  await createCheckoutService({storage,fetcher}).prepare(body);
  await createCheckoutService({storage,fetcher}).prepare(body);
  const corrupted=JSON.parse(storage.getItem('rawatbhata:checkout:'+merchant));corrupted.key='-'.repeat(36);storage.setItem('rawatbhata:checkout:'+merchant,JSON.stringify(corrupted));
  await createCheckoutService({storage,fetcher}).prepare(body);
  assert.notEqual(calls[2].idempotency_key,corrupted.key);
  await createCheckoutService({storage,fetcher}).prepare({...body,instructions:'Different note'});
  assert.equal(calls[0].idempotency_key,calls[1].idempotency_key);assert.notEqual(calls[2].idempotency_key,calls[3].idempotency_key);
});
test('trusted checkout rejects cross-origin, malformed and oversized requests before any SQL call',async()=>{
  let calls=0;const client={rpc(){calls++;throw Error();}};
  assert.equal((await handleCheckout(request(input,{headers:{Origin:'https://evil.example'}}),{client,...trusted})).status,403);
  assert.equal((await handleCheckout(request({...input,total_minor:1}),{client,...trusted})).status,400);
  assert.equal((await handleCheckout(request({...input,instructions:'x'.repeat(17000)}),{client,...trusted})).status,413);
  assert.equal((await handleCheckout(request({...input,items:[{product_id:product,quantity:1,price_minor:1}]}),{client,...trusted})).status,400);
  assert.equal(calls,0);
});
test('checkout uses trusted identity, commits the limiter first and records handoff only after building the link',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='checkout_consume_limit'?{allowed:true}:name==='checkout_initiate'?{status:'initiated',receipt,request_hash:token}:true};}};
  const response=await handleCheckout(request(),{client,...trusted});assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.status,'handoff_created');assert.equal(result.url,buildWhatsAppUrl(receipt));assert.equal(result.request_hash,undefined);
  assert.deepEqual(calls.map(call=>call.name),['checkout_consume_limit','checkout_initiate','checkout_mark_handoff']);
  assert.match(calls[0].args.p_client_hash,/^[a-f0-9]{64}$/);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const noIdentity=await handleCheckout(request(),{client,secret:trusted.secret});assert.equal(noIdentity.status,503);
  assert.notEqual(await clientFingerprint('127.0.0.1',trusted.secret,new Date('2026-11-12')),await clientFingerprint('127.0.0.1',trusted.secret,new Date('2026-11-13')));
});
test('rate limits, quote changes and internal errors produce narrow responses without exposing database details',async()=>{
  const limited=await handleCheckout(request(),{...trusted,client:{rpc:async()=>({data:{allowed:false,retry_after:60}})}});assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
  const changed=await handleCheckout(request(),{...trusted,client:{rpc:async name=>({data:name==='checkout_consume_limit'?{allowed:true}:{status:'changed',quote:{total_minor:26000}}})}});assert.equal(changed.status,409);assert.equal((await changed.json()).code,'quote_changed');
  const failed=await handleCheckout(request(),{...trusted,client:{rpc:async()=>({error:{message:'private SQL detail'}})}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private SQL detail'));
});
test('merchant HTML exposes useful text without JavaScript and safely handles redirects and hidden listings',async()=>{
  const merchantData={id:merchant,slug:'test-kitchen',canonical_path:'/town/food/test-kitchen',name:'Test <Kitchen>',listing_type:'RESTAURANT',description:'A <script>plain text</script> description containing replacement tokens $& $` $\' $$',short_description:'Fresh $& sample food',city:{name:'Town',slug:'town'},category_slug:'food',category_name:'Food',product_categories:[],gallery:[],offerings:[],weekly_hours:[],special_hours:[],service_areas:[],timezone:'Asia/Kolkata',status:{state:'hours_unavailable',checked_at:'2026-11-12T12:00:00Z'}};
  const context={request:new Request('https://example.com/town/food/test-kitchen'),env:{VITE_SUPABASE_URL:'https://project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',ASSETS:{fetch:async()=>new Response('<html><head><title>Shell</title><meta name="description" content="Shell"></head><body><main>Loading</main></body></html>')}}};
  const fetcher=async url=>new Response(JSON.stringify(url.endsWith('merchant_detail')?merchantData:{items:[],total:0,has_more:false,next_offset:12}));
  const response=await serveMerchantPage(context,{citySlug:'town',categorySlug:'food',listingSlug:'test-kitchen'},{fetcher});
  const html=await response.text();assert.equal(response.status,200);assert.match(html,/<h1>Test &lt;Kitchen&gt;<\/h1>/);assert.match(html,/Contact & visiting information/);assert.ok(!html.includes('<script>plain text'));
  const embedded=JSON.parse(html.match(/id="merchant-bootstrap">([\s\S]*?)<\/script>/)[1]);assert.equal(embedded.merchant.name,merchantData.name);assert.equal(embedded.merchant.description,merchantData.description);
  assert.match(html,/id="merchant-bootstrap"/);assert.match(html,/\\u003cscript\\u003e/);
  const hidden=await serveMerchantPage(context,{}, {fetcher:async()=>new Response('null')});assert.equal(hidden.status,404);
  const moved=await serveMerchantPage({...context,request:new Request('https://example.com/town/food/old-kitchen')},{},{fetcher});assert.equal(moved.status,308);assert.equal(moved.headers.get('Location'),merchantData.canonical_path);
});
