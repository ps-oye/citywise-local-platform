export function formatMoney(minorUnits, currency = 'INR') {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) throw new RangeError('Amount must be a non-negative safe integer in minor units.');
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minorUnits / 100);
}
