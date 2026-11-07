const V2_BASE = 'https://sandbox.cashfree.com/payout';
const V1_BASE = 'https://payout-gamma.cashfree.com/payout';
export function createCashfreeClient({ clientId, clientSecret, fetcher = fetch }) {
  if (!clientId || !clientSecret) throw new Error('Cashfree sandbox credentials are required');
  const headers = { 'Content-Type': 'application/json', 'x-api-version': '2024-01-01', 'x-client-id': clientId, 'x-client-secret': clientSecret };
  return {
    async checkConnection() {
      const r = await fetcher(`${V1_BASE}/v1/authorize`, { method: 'POST', headers: { 'X-Client-Id': clientId, 'X-Client-Secret': clientSecret }, signal: AbortSignal.timeout(15000) });
      const data = await r.json(); if (!r.ok || data.status !== 'SUCCESS' || !data.data?.token) throw new Error('Cashfree sandbox authorization failed');
      return { connected: true };
    },
    async sendPhone() { throw Object.assign(new Error('Phone payout is unavailable: Cashfree retired the required API.'), { code: 'UNAVAILABLE' }); },
    async sendUpi({ transferId, amount, name, phone, email, vpa }) {
      if (typeof transferId !== 'string' || !/^[A-Za-z0-9_]{1,40}$/.test(transferId) || typeof amount !== 'string' || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(amount) || Number(amount) < 1 || typeof name !== 'string' || !/^[A-Za-z ]{1,100}$/.test(name) || !name.trim() || typeof phone !== 'string' || !/^\d{10}$/.test(phone) || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof vpa !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/.test(vpa)) throw new Error('Invalid sandbox payout details');
      const body = { transfer_id: transferId, transfer_amount: Number(amount), transfer_mode: 'upi', beneficiary_details: { beneficiary_name: name, beneficiary_instrument_details: { vpa }, beneficiary_contact_details: { beneficiary_phone: phone, beneficiary_email: email } } };
      try {
        const r = await fetcher(`${V2_BASE}/transfers`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        if (r.status >= 500) throw new Error('Provider unavailable');
        return await r.json();
      } catch { throw Object.assign(new Error('Payout outcome unknown. Check its status before retrying.'), { code: 'UNKNOWN_OUTCOME' }); }
    },
    async status(transferId) {
      const r = await fetcher(`${V2_BASE}/transfers?${new URLSearchParams({ transfer_id: transferId })}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error('Unable to check payout status');
      return r.json();
    }
  };
}
