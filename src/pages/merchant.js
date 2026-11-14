import { escapeHtml as e } from '../utils/dom.js';
import { formatMoney } from '../utils/format.js';
import { debounce } from '../utils/debounce.js';
import { applyBrand } from '../components/brand.js';
import { icon } from '../components/icons.js';
import { imageMarkup,emptyMarkup } from '../components/discovery-ui.js';
import { merchantPageMarkup,productMarkup,operatingMarkup } from '../components/merchant-ui.js';
import { catalogFilters,statusCopy,formatZonedDate } from '../domain/merchant.js';
import { cartItems,calculateCart,reconcileCart,MAX_QUANTITY } from '../domain/cart.js';
import {pageMetadata,applyPageMetadata} from '../domain/seo.js';

const reasons={demo:'This is a fictional demo. WhatsApp ordering is unavailable.',items_unavailable:'Some items are unavailable. Return to your cart and remove them before continuing.',
  closed:'This business is closed and is not accepting enquiries while closed.',disabled:'WhatsApp ordering is not enabled for this business.',unavailable:'This listing is no longer available.',
  unverified_contact:'A verified WhatsApp contact is not available.',fulfilment_unavailable:'This fulfilment option is no longer available.',empty:'Add something to your cart first.',total_limit:'This cart exceeds the supported total. Please reduce the quantities.'};
const errors={checkout_unconfigured:'WhatsApp enquiries are temporarily unavailable. Please try again later.',rate_limited:'Too many attempts. Please wait before trying again.',
  idempotency_conflict:'This attempt could not be reused. Review the cart and confirm again.',message_too_long:'This enquiry is too long. Please use fewer different items.'};

export async function mountMerchant({main,route,repository,cart,checkout,media,config,navigate,toast,signal,bootstrap,analytics}) {
  let merchant=bootstrap?.merchant||await repository.detail(route,signal);
  if(signal.aborted)return ()=>{};
  if(!merchant){main.innerHTML='<div class="container">'+emptyMarkup('This place is not available','It may have moved or been unpublished. Explore the other places in town.',{name:'explore',label:'Explore all places'},'h1')+'</div>';return ()=>{};}
  if(location.pathname.replace(/\/$/,'')!==merchant.canonical_path){navigate(merchant.canonical_path+location.search,{replace:true});return ()=>{};}
  applyBrand(config,merchant.name);
  let canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=(config.siteUrl||location.origin)+merchant.canonical_path;
  document.querySelector('meta[name="description"]')?.setAttribute('content',merchant.short_description||merchant.description.slice(0,160));
  function updateMetadata(){applyPageMetadata(pageMetadata({url:new URL(location.href),route,merchant,brandName:config.brandName,origin:document.documentElement.dataset.siteOrigin||config.siteUrl||location.origin,indexable:document.documentElement.dataset.siteIndexing==='enabled'}));}
  updateMetadata();
  const life=new AbortController(),productsById=new Map();
  let productsRequest,reviewRequest,statusTimer,mediaCleanup,galleryMediaCleanup;
  let filters=catalogFilters(new URL(location.href)),offset=0,productsVersion=0,reviewBusy=false,confirmBusy=false,reconciling=false;
  let fulfilment=merchant.actions?.pickup_available?'pickup':merchant.actions?.delivery_available?'delivery':'enquiry';
  let quote=null,instructions='',changeNotice='';
  const commerce=['COMMERCE','RESTAURANT'].includes(merchant.listing_type);
  main.innerHTML=merchantPageMarkup(merchant);
  const root=main.querySelector('[data-merchant-root]');
  root.classList.toggle('merchant-root-closed',statusCopy(merchant.status).closed);
  root.insertAdjacentHTML('beforeend','<dialog class="checkout-dialog" id="checkout-dialog" aria-labelledby="checkout-title"><div class="checkout-content" data-checkout-content></div></dialog><dialog class="gallery-dialog" id="gallery-dialog" aria-label="Business photographs"><div data-gallery-content></div></dialog>');
  const dialog=root.querySelector('#checkout-dialog'),galleryDialog=root.querySelector('#gallery-dialog');
  function hydrate(){mediaCleanup?.();mediaCleanup=media.hydrate(root);}
  function syncProductCounts(){
    const items=cart.get(merchant.id),totals=calculateCart(items);
    for(const node of root.querySelectorAll('[data-product-count]')){const quantity=items.find(line=>line.product_id===node.dataset.productCount)?.quantity||0;node.textContent=quantity?quantity+' in your cart':'';}
    for(const button of root.querySelectorAll('[data-add-product]')){const product=productsById.get(button.dataset.addProduct);button.disabled=!product?.available||(items.find(line=>line.product_id===product?.id)?.quantity||0)>=MAX_QUANTITY;}
    const mobile=root.querySelector('[data-mobile-cart]');
    if(mobile){mobile.hidden=!items.length;root.querySelector('[data-mobile-cart-items]').textContent=totals.quantity+' '+(totals.quantity===1?'item':'items');root.querySelector('[data-mobile-cart-total]').textContent=formatMoney(totals.totalMinor);root.querySelector('[data-cart-tab-count]').textContent=String(totals.quantity);}
  }
  function renderCart(){
    if(!commerce)return;
    const target=root.querySelector('[data-cart-content]'),items=cart.get(merchant.id),totals=calculateCart(items);
    const focused=target.contains(document.activeElement)?{action:document.activeElement.dataset.cartAction,id:document.activeElement.dataset.productId}:null;
    target.innerHTML='<div class="cart-heading"><h2>Your cart</h2>'+(items.length?'<button class="cart-clear" type="button" data-cart-action="clear">Clear cart</button>':'')+'</div><p class="cart-merchant-name">'+e(merchant.name)+'</p>'+(changeNotice?'<p class="cart-change-note" role="status">'+e(changeNotice)+'</p>':'')+(items.length?'<div class="cart-lines">'+items.map(line=>'<article class="cart-line"><div class="cart-line-title"><h3>'+e(line.name)+'</h3><button class="cart-remove" type="button" data-cart-action="remove" data-product-id="'+e(line.product_id)+'" aria-label="Remove '+e(line.name)+'">'+icon('close')+'</button></div><p class="cart-line-unit">'+e(formatMoney(line.price_minor))+' / '+e(line.unit)+'</p>'+(!line.available?'<p class="cart-unavailable">Unavailable — remove to continue</p>':'')+'<div class="cart-line-bottom"><div class="quantity-control"><button type="button" data-cart-action="decrease" data-product-id="'+e(line.product_id)+'" aria-label="Decrease quantity of '+e(line.name)+'">−</button><output aria-label="Quantity of '+e(line.name)+'">'+line.quantity+'</output><button type="button" data-cart-action="increase" data-product-id="'+e(line.product_id)+'" aria-label="Increase quantity of '+e(line.name)+'"'+(line.quantity>=MAX_QUANTITY?' disabled':'')+'>+</button></div><span class="cart-line-price">'+e(formatMoney(line.price_minor*line.quantity))+'</span></div></article>').join('')+'</div><div class="cart-estimate"><span>Estimated subtotal</span><strong>'+e(formatMoney(totals.totalMinor))+'</strong></div><p class="cart-note">Current prices and availability are checked before you confirm. No payment is collected here.</p><div class="cart-fulfilment"><label for="cart-fulfilment">Your preference</label><select id="cart-fulfilment" data-fulfilment><option value="enquiry"'+(fulfilment==='enquiry'?' selected':'')+'>Enquiry only</option>'+(merchant.actions?.pickup_available?'<option value="pickup"'+(fulfilment==='pickup'?' selected':'')+'>Pickup</option>':'')+(merchant.actions?.delivery_available?'<option value="delivery"'+(fulfilment==='delivery'?' selected':'')+'>Delivery</option>':'')+'</select></div><button class="button button-primary cart-review" type="button" data-merchant-action="review"'+(reviewBusy||!totals.withinLimit?' disabled':'')+'>'+(reviewBusy?'Checking current prices…':merchant.is_demo?'Review sample cart':'Review WhatsApp enquiry')+icon('arrow')+'</button>'+(merchant.is_demo?'<p class="cart-note">Fictional demo: no WhatsApp message can be opened.</p>':''):'<div class="cart-empty">'+icon('grid')+'<h3>A little room for your favourites</h3><p>Add an item from the catalog to get started.</p><a href="#catalog">Keep exploring '+icon('arrow')+'</a></div>');
    syncProductCounts();
    if(focused?.action){const selector='[data-cart-action="'+focused.action+'"]'+(focused.id?'[data-product-id="'+focused.id+'"]':'');(target.querySelector(selector)||root.querySelector('#merchant-cart'))?.focus({preventScroll:true});}
  }
  function applyQuote(fresh){
    const result=reconcileCart(cart.get(merchant.id),fresh);
    if(result.changes.length)changeNotice=result.changes.some(change=>change.kind==='unavailable')?'Some items are no longer available. Review your cart.':'Prices have changed. Your cart now shows the current prices; please review them.';
    reconciling=true;cart.replace(merchant.id,result.items);reconciling=false;quote=fresh;renderCart();
  }
  function renderConfirmation(message=''){
    if(!quote)return;
    const content=root.querySelector('[data-checkout-content]');
    content.innerHTML='<div class="dialog-heading"><div><p class="eyebrow">One last look</p><h2 id="checkout-title">'+(message?'Review your updated enquiry':'Review your enquiry')+'</h2></div><button class="icon-button" type="button" data-merchant-action="close-checkout" aria-label="Close enquiry review">'+icon('close')+'</button></div><p class="checkout-merchant">'+e(merchant.name)+'</p>'+(message?'<p class="cart-change-note" role="status">'+e(message)+'</p>':'')+'<ul class="checkout-lines">'+quote.items.map(line=>'<li><span>'+e(line.name||'Item no longer listed')+'<small>'+line.quantity+' × '+(line.price_minor!==null?e(formatMoney(Number(line.price_minor))):'Unavailable')+(line.unit?' / '+e(line.unit):'')+'</small>'+(!line.available?'<small class="cart-unavailable">Currently unavailable</small>':'')+'</span><strong>'+(line.line_total_minor!==null?e(formatMoney(Number(line.line_total_minor))):'—')+'</strong></li>').join('')+'</ul><div class="checkout-total"><span>Estimated total</span><strong>'+e(formatMoney(Number(quote.total_minor)))+'</strong></div><p class="checkout-preference">Preference: <strong>'+e({enquiry:'Enquiry only',pickup:'Pickup',delivery:'Delivery'}[fulfilment])+'</strong></p><div class="checkout-instructions"><label for="checkout-instructions">A note for the business <span>(optional)</span></label><textarea id="checkout-instructions" maxlength="500" placeholder="For example, a question about an item…">'+e(instructions)+'</textarea><small>Please avoid personal details such as your address or phone number.</small></div><p class="checkout-notice">'+(quote.can_checkout?(quote.enquiry_while_closed?'The business is closed. It accepts enquiries for later; this is not an immediate order. ':'')+'Final prices, stock and fulfilment are confirmed by the business. You will still need to send the message in WhatsApp.':e(reasons[quote.reason]||'WhatsApp enquiries are unavailable.'))+'</p>'+(!merchant.is_demo?'<p class="checkout-privacy">Confirming records the items, estimated prices, preference and optional note as an enquiry initiation. It does not confirm an order or that a message was sent.</p>':'')+'<p class="checkout-error" role="alert" data-checkout-error></p><div class="checkout-actions"><button class="button button-outline" type="button" data-merchant-action="close-checkout">Back to cart</button><button class="button button-primary" type="button" data-merchant-action="confirm"'+(!quote.can_checkout?' disabled':'')+'>'+(merchant.is_demo?'WhatsApp unavailable in demo':'Confirm & open WhatsApp')+icon('arrow')+'</button></div>';
    if(!dialog.open)dialog.showModal();
  }
  async function review(){
    if(reviewBusy||!cart.get(merchant.id).length)return;
    reviewRequest?.abort();const request=new AbortController();reviewRequest=request;
    const requestedFulfilment=fulfilment;reviewBusy=true;renderCart();
    try{
      const fresh=await repository.quote(merchant.id,cartItems(cart.get(merchant.id)),requestedFulfilment,AbortSignal.any([life.signal,request.signal]));
      if(life.signal.aborted||request.signal.aborted||reviewRequest!==request||requestedFulfilment!==fulfilment)return;
      applyQuote(fresh);renderConfirmation(changeNotice);
    }catch(error){if(error.name!=='AbortError'&&!life.signal.aborted&&!request.signal.aborted&&reviewRequest===request)toast('Current prices could not be checked. Your cart is saved; please try again.');}
    finally{if(reviewRequest===request){reviewRequest=null;reviewBusy=false;if(!life.signal.aborted)renderCart();}}
  }
  function invalidateReview(){reviewRequest?.abort();reviewRequest=null;reviewBusy=false;quote=null;if(dialog.open&&!confirmBusy)dialog.close();}
  async function confirm(){
    if(confirmBusy||!quote?.can_checkout)return;
    instructions=root.querySelector('#checkout-instructions')?.value||'';
    confirmBusy=true;
    const button=root.querySelector('[data-merchant-action="confirm"]');button.disabled=true;button.textContent='Preparing your enquiry…';
    root.querySelector('[data-checkout-error]').textContent='';
    let popup;
    try{
      popup=window.open('about:blank','_blank');
      if(popup){popup.opener=null;popup.document.title='Preparing your enquiry';popup.document.body.textContent='Preparing your WhatsApp enquiry. Please keep this window open.';}
    }catch{popup=null;}
    try{
      const result=await checkout.prepare({merchant_id:merchant.id,items:cartItems(cart.get(merchant.id)),fulfilment,instructions,quote_token:quote.quote_token});
      if(life.signal.aborted){popup?.close();return;}
      root.querySelector('[data-checkout-content]').innerHTML='<div class="checkout-success">'+icon('check')+'<h2 id="checkout-title">Your enquiry link is ready</h2><p>Your enquiry initiation and link preparation were recorded. The business has not accepted an order, and we cannot tell whether you send the WhatsApp message.</p><strong class="checkout-reference">'+e(result.reference)+'</strong><a class="button button-primary" href="'+e(result.url)+'" target="_blank" rel="noopener noreferrer">Open WhatsApp '+icon('arrow')+'</a><p>If WhatsApp did not open, use the link above. Your cart is still saved.</p><button class="button button-outline" type="button" data-merchant-action="close-checkout">Return to browsing</button></div>';
      if(popup&&!popup.closed)popup.location.replace(result.url);
    }catch(error){
      popup?.close();if(life.signal.aborted)return;
      if(error.quote){applyQuote(error.quote);renderConfirmation(error.code==='quote_changed'?'Prices or availability changed. Please review the updated details before confirming again.':reasons[error.quote.reason]||'The enquiry is currently unavailable.');}
      else root.querySelector('[data-checkout-error]').textContent=errors[error.code]||'The link could not be prepared. Your cart is saved. Please try again; retries reuse the same enquiry.';
    }finally{confirmBusy=false;const current=root.querySelector('[data-merchant-action="confirm"]');if(current){current.disabled=!quote?.can_checkout;current.innerHTML='Confirm & open WhatsApp '+icon('arrow');}}
  }
  function filterUrl({replace=false}={}){
    const url=new URL(location.href);
    for(const [name,value] of Object.entries({product_q:filters.query,product_category:filters.categoryId,diet:filters.dietary,available:filters.availableOnly?'1':'',product_sort:filters.sort==='featured'?'':filters.sort})){
      if(value)url.searchParams.set(name,value);else url.searchParams.delete(name);
    }
    history[replace?'replaceState':'pushState']({},'',url.pathname+url.search+url.hash);
    updateMetadata();
  }
  function readForm(){const form=root.querySelector('[data-catalog-form]');return {query:form.elements.product_q.value.trim().slice(0,100),categoryId:form.elements.product_category?.value||'',dietary:form.elements.diet?.value||'',availableOnly:form.elements.available.checked,sort:form.elements.product_sort.value};}
  async function loadProducts(initial=true,provided){
    productsRequest?.abort();productsRequest=new AbortController();const version=++productsVersion;
    const target=root.querySelector('[data-catalog-products]'),button=root.querySelector('[data-merchant-action="more-products"]');
    if(initial){offset=0;target.innerHTML='<p class="catalog-loading" role="status">Finding your favourites…</p>';button.hidden=true;}
    button.disabled=true;
    try{
      const result=provided||await repository.products(merchant.id,{...filters,offset},AbortSignal.any([life.signal,productsRequest.signal]));
      if(version!==productsVersion||life.signal.aborted)return;
      if(initial)target.innerHTML='';
      for(const product of result.items){productsById.set(product.id,product);target.insertAdjacentHTML('beforeend',productMarkup(product));}
      offset=result.next_offset;button.hidden=!result.has_more;
      root.querySelector('[data-catalog-count]').textContent=result.total+' '+(result.total===1?'item':'items');
      if(!result.total)target.innerHTML='<div class="catalog-empty"><h3>No items match this time</h3><p>Try a different search or preference.</p><button class="button button-outline" type="button" data-merchant-action="reset-products">Reset product filters</button></div>';
      hydrate();syncProductCounts();
    }catch(error){
      if(error.name==='AbortError'||version!==productsVersion||life.signal.aborted)return;
      if(initial){target.innerHTML='<div class="catalog-empty"><h3>The catalog could not be loaded</h3><p>Your cart is saved. Please try again.</p><button class="button button-outline" type="button" data-merchant-action="retry-products">Try again</button></div>';root.querySelector('[data-catalog-count]').textContent='Catalog unavailable';}
      else toast('More items could not be loaded. Please try again.');
    }finally{if(version===productsVersion)button.disabled=false;}
  }
  const search=debounce(()=>{filters=readForm();filterUrl({replace:true});loadProducts();},250);
  const gallery=[];
  if(merchant.demo_image_path)gallery.push({demo_image_path:merchant.demo_image_path,name:merchant.name,is_demo:merchant.is_demo});
  for(const image of merchant.gallery||[])if(!gallery.some(existing=>existing.media?.object_path===image.object_path))gallery.push({media:image,name:merchant.name});
  if(!gallery.length)gallery.push(merchant);
  let galleryIndex=0;
  function showGallery(index=0){
    galleryIndex=(index+gallery.length)%gallery.length;galleryMediaCleanup?.();
    root.querySelector('[data-gallery-content]').innerHTML='<div class="gallery-top"><span>'+e(merchant.name)+'</span><button class="icon-button" type="button" data-merchant-action="close-gallery" aria-label="Close photographs">'+icon('close')+'</button></div>'+imageMarkup(gallery[galleryIndex],{className:'gallery-image',eager:true})+'<div class="gallery-controls">'+(gallery.length>1?'<button class="icon-button previous" type="button" data-merchant-action="previous-photo" aria-label="Previous photograph">'+icon('chevron')+'</button>':'')+'<span role="status">Photo '+(galleryIndex+1)+' of '+gallery.length+'</span>'+(gallery.length>1?'<button class="icon-button" type="button" data-merchant-action="next-photo" aria-label="Next photograph">'+icon('chevron')+'</button>':'')+'</div>';
    if(!galleryDialog.open)galleryDialog.showModal();galleryMediaCleanup=media.hydrate(galleryDialog);
  }
  async function refreshStatus(){
    if(life.signal.aborted)return;
    try{if(!document.hidden){const fresh=await repository.detail(route,life.signal);if(!fresh){main.innerHTML='<div class="container">'+emptyMarkup('This place is no longer available','Browse the other published places in town.',{name:'explore',label:'Explore all places'},'h1')+'</div>';cleanup();return;}merchant=fresh;root.querySelector('[data-operating-status]').innerHTML=operatingMarkup(merchant);root.classList.toggle('merchant-root-closed',statusCopy(merchant.status).closed);const checked=root.querySelector('[data-status-checked]');if(checked)checked.textContent=formatZonedDate(merchant.status?.checked_at,merchant.timezone);}}
    catch(error){if(error.name!=='AbortError')root.querySelector('[data-operating-status]').innerHTML='<span class="merchant-status">Status could not be refreshed</span><span class="merchant-status-detail">Check with the business before visiting.</span>';}
    scheduleStatus();
  }
  function scheduleStatus(){clearTimeout(statusTimer);const next=Date.parse(merchant.status?.next_change_at);statusTimer=setTimeout(refreshStatus,Number.isFinite(next)?Math.max(1000,Math.min(60000,next-Date.now()+200)):60000);}
  root.addEventListener('click',event=>{
    const contact=event.target.closest('a[href]');
    if(contact){const href=contact.getAttribute('href');if(href.startsWith('tel:'))analytics?.track('phone_click',merchant.id);else if(href.startsWith('https://www.google.com/maps/'))analytics?.track('directions_click',merchant.id);else if(href.startsWith('https://wa.me/'))analytics?.track('whatsapp_click',merchant.id);}
    const add=event.target.closest('[data-add-product]');
    if(add){try{cart.add(merchant.id,productsById.get(add.dataset.addProduct));}catch(error){toast(error.message);}return;}
    const control=event.target.closest('[data-cart-action]');
    if(control){
      const id=control.dataset.productId,action=control.dataset.cartAction,line=cart.get(merchant.id).find(item=>item.product_id===id);
      if(action==='clear'){cart.clear(merchant.id);changeNotice='';renderCart();}
      if(action==='remove')cart.remove(merchant.id,id);
      if(line&&(action==='increase'||action==='decrease')){try{cart.quantity(merchant.id,id,line.quantity+(action==='increase'?1:-1));}catch(error){toast(error.message);}}
      return;
    }
    const action=event.target.closest('[data-merchant-action]')?.dataset.merchantAction;
    if(action==='review')review();if(action==='confirm')confirm();
    if(action==='close-checkout'&&!confirmBusy)dialog.close();
    if(action==='more-products')loadProducts(false);if(action==='retry-products')loadProducts();
    if(action==='reset-products'){root.querySelector('[data-catalog-form]').reset();filters=readForm();filterUrl();loadProducts();}
    if(action==='view-cart'){root.querySelector('#merchant-cart').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});root.querySelector('#merchant-cart').focus({preventScroll:true});}
    if(action==='gallery')showGallery();if(action==='close-gallery')galleryDialog.close();
    if(action==='previous-photo')showGallery(galleryIndex-1);if(action==='next-photo')showGallery(galleryIndex+1);
    if(action==='share'){if(navigator.clipboard)navigator.clipboard.writeText(location.origin+merchant.canonical_path).then(()=>toast('Merchant link copied.')).catch(()=>toast('Copy the page link from your address bar.'));else toast('Copy the page link from your address bar.');}
  },{signal:life.signal});
  root.addEventListener('input',event=>{if(event.target.matches('[name="product_q"]'))search();if(event.target.id==='checkout-instructions')instructions=event.target.value;},{signal:life.signal});
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-catalog-form] select,[data-catalog-form] [type="checkbox"]')){search.cancel();filters=readForm();filterUrl();loadProducts();}
    if(event.target.matches('[data-fulfilment]')){fulfilment=event.target.value;invalidateReview();renderCart();}
  },{signal:life.signal});
  root.querySelector('[data-catalog-form]')?.addEventListener('submit',event=>{event.preventDefault();search.cancel();filters=readForm();filterUrl();loadProducts();},{signal:life.signal});
  dialog.addEventListener('cancel',event=>{if(confirmBusy)event.preventDefault();},{signal:life.signal});
  galleryDialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();showGallery(galleryIndex+(event.key==='ArrowRight'?1:-1));}},{signal:life.signal});
  const unsubscribe=cart.subscribe(id=>{if(id===merchant.id){if(!reconciling)invalidateReview();renderCart();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){clearTimeout(statusTimer);refreshStatus();}},{signal:life.signal});
  function cleanup(){if(life.signal.aborted)return;life.abort();productsRequest?.abort();reviewRequest?.abort();search.cancel();clearTimeout(statusTimer);mediaCleanup?.();galleryMediaCleanup?.();unsubscribe();if(dialog.open)dialog.close();if(galleryDialog.open)galleryDialog.close();}
  signal.addEventListener('abort',cleanup,{once:true});
  if(commerce){
    const form=root.querySelector('[data-catalog-form]');form.elements.product_q.value=filters.query;if(form.elements.product_category)form.elements.product_category.value=filters.categoryId;if(form.elements.diet)form.elements.diet.value=filters.dietary;form.elements.available.checked=filters.availableOnly;form.elements.product_sort.value=filters.sort;
    renderCart();loadProducts(true,bootstrap?.products&&new URL(location.href).search===''?bootstrap.products:null);
    if(cart.get(merchant.id).length){const saved=cartItems(cart.get(merchant.id)),savedFulfilment=fulfilment;repository.quote(merchant.id,saved,savedFulfilment,life.signal).then(fresh=>{if(!life.signal.aborted&&!reviewBusy&&!dialog.open&&fulfilment===savedFulfilment&&JSON.stringify(saved)===JSON.stringify(cartItems(cart.get(merchant.id))))applyQuote(fresh);}).catch(()=>{/* Saved display snapshots stay explicitly estimated until the next successful review. */});}
  }
  hydrate();scheduleStatus();root.dataset.merchantReady='true';analytics?.view(merchant.id);return cleanup;
}
