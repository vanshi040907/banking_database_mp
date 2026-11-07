const BASE = 'https://payout-gamma.cashfree.com';

export function createCashfreeClient({ clientId, clientSecret, fetcher = fetch }) {
  if (!clientId || !clientSecret) throw new Error('Cashfree sandbox credentials are required');
  async function authorize() {
    const response = await fetcher(`${BASE}/payout/v1/authorize`, {
      method: 'POST', headers: { 'X-Client-Id': clientId, 'X-Client-Secret': clientSecret }, signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok || data.status !== 'SUCCESS' || !data.data?.token) throw new Error('Cashfree sandbox authorization failed');
    return data.data.token;
  }
  return {
    async checkConnection() { await authorize(); return { connected: true }; },
    async sendPhone({ transferId, amount, name, phone, email }) {
      if (typeof transferId !== 'string' || !/^[A-Za-z0-9_]{1,40}$/.test(transferId) ||
          typeof amount !== 'string' || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(amount) || Number(amount) < 1 ||
          typeof name !== 'string' || !/^[A-Za-z ]{1,100}$/.test(name) || !name.trim() ||
          typeof phone !== 'string' || !/^\d{10}$/.test(phone) ||
          typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid sandbox payout details');
      }
      const token = await authorize();
      let response;
      try {
        response = await fetcher(`${BASE}/payout/v1.2/directTransfer`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ transferId, amount, transferMode: 'phone', beneDetails: { name, phone, email, address1: 'Sandbox' } }),
          signal: AbortSignal.timeout(15000)
        });
        if (response.status >= 500) throw new Error('Provider unavailable');
        return await response.json();
      } catch {
        const err = new Error('Payout outcome unknown. Check the existing transfer ID before retrying.');
        err.code = 'UNKNOWN_OUTCOME';
        throw err;
      }
    },
    async status(transferId) {
      const token = await authorize();
      const response = await fetcher(`${BASE}/payout/v1.1/getTransferStatus?${new URLSearchParams({ transferId })}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('Unable to check payout status');
      return response.json();
    }
  };
}
