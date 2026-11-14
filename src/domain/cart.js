import { isUuid } from './discovery.js';

export const MAX_CART_LINES = 30;
export const MAX_QUANTITY = 99;
export const MAX_MONEY = 99999999999;
export function validQuantity(value, { allowZero = false } = {}) {
  return Number.isInteger(value) && value >= (allowZero ? 0 : 1) && value <= MAX_QUANTITY;
}
export function cartItems(lines) {
  return lines.map(line => ({ product_id: line.product_id, quantity: line.quantity }));
}
export function calculateCart(lines) {
  let totalMinor = 0, quantity = 0;
  for (const line of lines) {
    if (!isUuid(line.product_id) || !validQuantity(line.quantity) || !Number.isSafeInteger(line.price_minor) || line.price_minor < 0 || line.price_minor > MAX_MONEY) throw new TypeError('Invalid cart line');
    totalMinor += line.price_minor * line.quantity;
    quantity += line.quantity;
  }
  return { totalMinor, quantity, withinLimit: totalMinor <= MAX_MONEY, available: lines.every(line => line.available !== false) };
}
export function readStoredCart(raw, merchantId) {
  if (typeof raw !== 'string' || raw.length > 65536) return [];
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || value.merchant_id !== merchantId || !Array.isArray(value.items) || value.items.length > MAX_CART_LINES) return [];
    const seen = new Set();
    return value.items.flatMap(item => {
      if (!isUuid(item?.product_id) || seen.has(item.product_id) || !validQuantity(item.quantity)
        || !Number.isSafeInteger(item.price_minor) || item.price_minor < 0 || item.price_minor > MAX_MONEY
        || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 180) return [];
      seen.add(item.product_id);
      return [{ product_id: item.product_id, quantity: item.quantity, name: item.name, unit: typeof item.unit === 'string' ? item.unit.slice(0,80) : 'item', price_minor: item.price_minor, available: item.available !== false }];
    });
  } catch { return []; }
}
export function reconcileCart(lines, quote) {
  const current = new Map((quote.items || []).map(line => [line.product_id,line]));
  const changes = [];
  const items = lines.map(previous => {
    const line = current.get(previous.product_id);
    if (!line?.name || !line.available) {
      changes.push({ id: previous.product_id, kind: 'unavailable', name: previous.name });
      return { ...previous, available: false };
    }
    if (Number(line.price_minor) !== previous.price_minor) changes.push({ id: previous.product_id, kind: 'price', name: line.name, previous: previous.price_minor, current: Number(line.price_minor) });
    return { product_id: line.product_id, quantity: previous.quantity, name: line.name, unit: line.unit, price_minor: Number(line.price_minor), available: true };
  });
  return { items, changes };
}
