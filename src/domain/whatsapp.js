import { formatMoney } from '../utils/format.js';
import {deliveryAddress,deliveryInstructions} from './delivery.js';

const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
export function buildWhatsAppMessage(receipt) {
  if(!Array.isArray(receipt.items)||!receipt.items.length||receipt.items.length>30||!/^(RB|SO)-[A-Z0-9]{8,20}$/.test(receipt.reference))throw new TypeError('Invalid enquiry');
  const lines=receipt.items.map((item,index)=>{
    const price=Number(item.price_minor),total=Number(item.line_total_minor);
    if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99||!Number.isSafeInteger(price)||price<0||total!==price*item.quantity)throw new TypeError('Invalid enquiry line');
    return `${index+1}. ${clean(item.name)} (${clean(item.unit)}) x ${item.quantity} — ${formatMoney(price)} each = ${formatMoney(total)}`;
  });
  const total=receipt.items.reduce((sum,item)=>sum+Number(item.line_total_minor),0);
  if(!Number.isSafeInteger(total)||total!==Number(receipt.total_minor)||total>99999999999)throw new TypeError('Invalid enquiry total');
  if(receipt.fulfilment==='delivery'){
    const address=deliveryAddress(receipt.delivery_address),instructions=deliveryInstructions(receipt.instructions||'');
    if(address.error||instructions.error)throw new TypeError('Valid delivery details required');
    return ['Hello, I would like to place an order from ShaharOne.','','Shop: '+clean(receipt.merchant_name),
      'Order Reference: '+receipt.reference,'','Order Details:',...lines,'','Estimated Total: '+formatMoney(total),'',
      'Delivery Address:',address.value,...instructions.value?['','Delivery Instructions:',instructions.value]:[],
      '','Please confirm product availability, final price, delivery charges and estimated delivery time.',
      'This is a delivery enquiry, not a confirmed order. ShaharOne does not collect payment.','Ordered via ShaharOne.in'].join('\n');
  }
  return ['Hello '+clean(receipt.merchant_name)+',','','I would like to enquire about the following:','Enquiry Ref: '+receipt.reference,'',...lines,'',
    'Estimated total: '+formatMoney(total),'Preference: '+({pickup:'Pickup',delivery:'Delivery',enquiry:'Enquiry only'}[receipt.fulfilment]||'Enquiry only'),
    ...(receipt.instructions?['Note: '+clean(receipt.instructions)]:[]),'',
    'Please confirm availability, final prices and fulfilment. This is an enquiry, not a confirmed order.','Sent via ShaharOne.'].join('\n');
}
export function buildWhatsAppUrl(receipt) {
  if(!/^\+[1-9][0-9]{7,14}$/.test(receipt.whatsapp_number||''))throw new TypeError('No verified WhatsApp contact');
  const url='https://wa.me/'+receipt.whatsapp_number.slice(1)+'?text='+encodeURIComponent(buildWhatsAppMessage(receipt));
  if(url.length>19000)throw new RangeError('This enquiry is too long. Please use fewer different items.');
  return url;
}
