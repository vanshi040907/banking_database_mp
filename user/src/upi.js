export function createUpiLink({ vpa, name, amount }) {
  if (typeof vpa !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/.test(vpa.trim())) throw new Error('Enter a valid UPI ID.');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Enter the recipient name.');
  if (typeof amount !== 'string' || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) throw new Error('Enter a positive amount with at most two decimal places.');
  const query = new URLSearchParams({ pa: vpa.trim(), pn: name.trim(), am: amount, cu: 'INR' });
  return `upi://pay?${query}`;
}
