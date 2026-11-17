export function formatMoney(minorUnits, currency = 'INR') {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) throw new RangeError('Amount must be a non-negative safe integer in minor units.');
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minorUnits / 100);
}

// Aggregate checkout values can exceed Number.MAX_SAFE_INTEGER; never round them through Number.
export function formatMoneyExact(minorUnits,currency='INR'){
  const value=typeof minorUnits==='number'?(Number.isSafeInteger(minorUnits)?String(minorUnits):''):String(minorUnits);
  if(!/^[0-9]{1,60}$/.test(value))throw new RangeError('Invalid aggregate amount');
  const amount=BigInt(value),fraction=String(amount%100n).padStart(2,'0');
  return new Intl.NumberFormat('en-IN',{style:'currency',currency}).formatToParts(amount/100n)
    .map(part=>part.type==='fraction'?fraction:part.value).join('');
}
