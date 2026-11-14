import { isUuid } from '../domain/discovery.js';
import { MAX_CART_LINES, validQuantity, readStoredCart } from '../domain/cart.js';

export function createCartStore({ storage, onPersistenceError = () => {} } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const memory = new Map(), subscribers = new Set();
  const key = id => 'rawatbhata:cart:v1:' + id;
  function get(id) {
    if (!isUuid(id)) return [];
    if (memory.has(id)) return structuredClone(memory.get(id));
    let items = [];
    try { items = readStoredCart(storage?.getItem(key(id)),id); } catch { onPersistenceError(); }
    memory.set(id,items);
    return structuredClone(items);
  }
  function save(id,items) {
    if (!isUuid(id)) throw new TypeError('Invalid merchant');
    const normalized = readStoredCart(JSON.stringify({ version:1,merchant_id:id,items }),id);
    if (normalized.length !== items.length) throw new TypeError('Invalid cart');
    memory.set(id,normalized);
    try {
      if (storage) { if(items.length) storage.setItem(key(id),JSON.stringify({ version:1,merchant_id:id,items:normalized })); else storage.removeItem(key(id)); }
      else onPersistenceError();
    } catch { onPersistenceError(); }
    for (const listener of subscribers) listener(id,get(id));
  }
  return {
    get, replace:save,
    add(id,product) {
      if (!isUuid(product.id) || product.merchant_id !== id || product.available === false) throw new TypeError('This product cannot be added');
      const items=get(id), previous=items.find(line=>line.product_id===product.id);
      if(previous) { if(!validQuantity(previous.quantity+1))throw new RangeError('Maximum quantity is 99');previous.quantity++; }
      else {
        if(items.length>=MAX_CART_LINES)throw new RangeError('A cart can contain up to 30 different items');
        items.push({ product_id:product.id,quantity:1,name:product.name,unit:product.unit,price_minor:Number(product.price_minor),available:true });
      }
      save(id,items);
    },
    quantity(id,productId,quantity) {
      if(!validQuantity(quantity,{allowZero:true}))throw new RangeError('Choose a quantity from 0 to 99');
      const items=get(id);
      if(!quantity)save(id,items.filter(line=>line.product_id!==productId));
      else { const line=items.find(item=>item.product_id===productId);if(line){line.quantity=quantity;save(id,items);} }
    },
    remove(id,productId){save(id,get(id).filter(line=>line.product_id!==productId));},
    clear(id){save(id,[]);},
    subscribe(listener){subscribers.add(listener);return()=>subscribers.delete(listener);},
    sync(event){if(event.key?.startsWith('rawatbhata:cart:v1:')){const id=event.key.slice('rawatbhata:cart:v1:'.length);if(isUuid(id)){memory.delete(id);for(const listener of subscribers)listener(id,get(id));}}},
  };
}
