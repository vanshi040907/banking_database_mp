export function validatePayoutInput(input) {
  const { fromAccNo, amount, vpa, name, transactionPin, idempotencyKey } = input ?? {};
  if (typeof fromAccNo !== 'string' || !/^\d{6,20}$/.test(fromAccNo) || typeof amount !== 'string' || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(amount) || typeof vpa !== 'string' || !/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9.-]{2,64}$/.test(vpa) || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100 || typeof transactionPin !== 'string' || !/^\d{6}$/.test(transactionPin) || typeof idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new Error('Check account, UPI ID, name, amount and PIN.');
  const [whole, fraction = ''] = amount.split('.');
  const amountPaise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amountPaise < 100 || amountPaise > 100000000) throw new Error('Amount must be between â‚¹1 and â‚¹10,00,000.');
  return { fromAccNo, amountPaise, vpa: vpa.toLowerCase(), name: name.trim(), transactionPin, idempotencyKey: idempotencyKey.toLowerCase() };
}
export function nextPayoutState(current, providerStatus) {
  if (current === 'RELEASED' || current === 'PROCESSED') return current;
  if (['rejected','cancelled','reversed','failed'].includes(providerStatus)) return 'RELEASED';
  if (current === 'PROCESSED' || providerStatus === 'processed') return 'PROCESSED';
  return 'RESERVED';
}
