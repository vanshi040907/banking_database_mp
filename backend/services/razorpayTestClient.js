const base = 'https://api.razorpay.com/v1/payouts';
export function createRazorpayTestClient({ keyId, keySecret, accountNumber, fetcher = fetch }) {
  if (typeof keyId !== 'string' || !/^rzp_test_[A-Za-z0-9]+$/.test(keyId) || !keySecret || !accountNumber) throw new Error('RazorpayX test credentials and test account identifier are required');
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  async function request(url, options) {
    const response = await fetcher(url, { ...options, redirect:'error', signal:AbortSignal.timeout(15000), headers:{ Authorization:auth, 'Content-Type':'application/json', ...options.headers } });
    if (!response.ok) throw new Error('RazorpayX did not confirm the payout');
    return response.json();
  }
  return {
    async createPayout({ idempotencyKey, amountPaise, vpa, name, referenceId }) {
      const body = { account_number:accountNumber, amount:amountPaise, currency:'INR', mode:'UPI', purpose:'payout', fund_account:{account_type:'vpa',vpa:{address:vpa},contact:{name,type:'customer'}}, queue_if_low_balance:false, reference_id:referenceId };
      try { return await request(base, { method:'POST', headers:{'X-Payout-Idempotency':idempotencyKey}, body:JSON.stringify(body) }); }
      catch { throw Object.assign(new Error('Payout outcome is unknown; check the same request before retrying.'), {code:'UNKNOWN_OUTCOME'}); }
    },
    async getPayout(id) {
      if (typeof id !== 'string' || !/^pout_[A-Za-z0-9]+$/.test(id)) throw new Error('Invalid payout ID');
      return request(`${base}/${id}`, { method:'GET' });
    }
  };
}
