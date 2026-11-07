import { createHash } from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
const error = (code, message) => Object.assign(new Error(message), { code });
const states = new Set(['SUCCESS', 'PENDING', 'RECEIVED', 'FAILED', 'REJECTED', 'REVERSED']);
const safeStatus = value => states.has(value) ? value : 'UNKNOWN';
function validate(p) {
  if (!p || typeof p.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.requestId) ||
      typeof p.amount !== 'string' || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(p.amount) || Number(p.amount) < 1 ||
      typeof p.name !== 'string' || !/^[A-Za-z ]{1,100}$/.test(p.name) || !p.name.trim() ||
      typeof p.phone !== 'string' || !/^\d{10}$/.test(p.phone) || typeof p.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw error('INVALID', 'Invalid payout details');
}
export function createSandboxPayoutService({ store, client }) {
  return {
    async create(customerId, input) {
      validate(input);
      const id = 'p' + sha(`${customerId}:${input.requestId.toLowerCase()}`).slice(0, 31);
      const fingerprint = sha(JSON.stringify([input.amount, input.name, input.phone, input.email]));
      const reserved = await store.reserve({ id, customerId, fingerprint, status: 'UNKNOWN' });
      if (!reserved) {
        const record = await store.find(id);
        if (!record || Number(record.customerId) !== Number(customerId) || record.fingerprint !== fingerprint) throw error('CONFLICT', 'Request ID is already used for different details');
        return { id, status: record.status };
      }
      let status = 'UNKNOWN';
      try { const result = await client.sendPhone({ transferId: id, amount: input.amount, name: input.name, phone: input.phone, email: input.email }); status = ['SUCCESS', 'PENDING'].includes(result.status) ? 'PENDING' : 'UNKNOWN'; } catch { /* A submission outcome may be uncertain. */ }
      await store.update(id, status);
      return { id, status };
    },
    async refresh(customerId, id) {
      if (typeof id !== 'string' || !/^p[0-9a-f]{31}$/.test(id)) throw error('NOT_FOUND', 'Payout not found');
      const record = await store.find(id);
      if (!record || Number(record.customerId) !== Number(customerId)) throw error('NOT_FOUND', 'Payout not found');
      const result = await client.status(id);
      const status = safeStatus(result?.data?.transfer?.status);
      await store.update(id, status);
      return { id, status };
    }
  };
}
