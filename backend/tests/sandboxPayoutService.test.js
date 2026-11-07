import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxPayoutService } from '../services/sandboxPayoutService.js';

function fixture() {
  const records = new Map(); let calls = 0;
  const store = {
    async reserve(record) { if (records.has(record.id)) return false; records.set(record.id, { ...record }); return true; },
    async find(id) { return records.get(id); },
    async update(id, status) { records.get(id).status = status; }
  };
  const client = { async sendUpi() { calls++; return { status: 'PENDING' }; }, async status() { return { status: 'SUCCESS', status_code: 'COMPLETED' }; } };
  return { service: createSandboxPayoutService({ store, client }), getCalls: () => calls };
}
const payload = { requestId: '11111111-1111-4111-8111-111111111111', amount: '10.00', name: 'Test User', phone: '9000000001', email: 'test@example.com', vpa: 'success@upi' };

test('repeating a request never submits a second payout', async () => {
  const { service, getCalls } = fixture();
  const a = await service.create(1, payload);
  const b = await service.create(1, payload);
  assert.equal(a.id, b.id); assert.equal(getCalls(), 1); assert.equal(b.status, 'PENDING');
});

test('rejects reuse of the same request id for different details', async () => {
  const { service } = fixture(); await service.create(1, payload);
  await assert.rejects(service.create(1, { ...payload, amount: '20.00' }), { code: 'CONFLICT' });
});

test('only the owner can check payout status', async () => {
  const { service } = fixture(); const result = await service.create(1, payload);
  await assert.rejects(service.refresh(2, result.id), { code: 'NOT_FOUND' });
  assert.equal((await service.refresh(1, result.id)).status, 'SUCCESS');
});

test('does not resubmit after an uncertain provider outcome', async () => {
  const records = new Map(); let calls = 0;
  const store = { async reserve(r) { if (records.has(r.id)) return false; records.set(r.id, { ...r }); return true; }, async find(id) { return records.get(id); }, async update(id, status) { records.get(id).status = status; } };
  const client = { async sendUpi() { calls++; throw new Error('timeout'); } };
  const service = createSandboxPayoutService({ store, client });
  assert.equal((await service.create(1, payload)).status, 'UNKNOWN');
  assert.equal((await service.create(1, payload)).status, 'UNKNOWN');
  assert.equal(calls, 1);
});

test('a successful submission remains pending until status is checked', async () => {
  const records = new Map();
  const store = { async reserve(r) { records.set(r.id, r); return true; }, async update(id, status) { records.get(id).status = status; } };
  const service = createSandboxPayoutService({ store, client: { async sendUpi() { return { status: 'SUCCESS' }; } } });
  assert.equal((await service.create(1, payload)).status, 'PENDING');
});

test('includes a safe provider reason code when checking status', async () => {
  const { service } = fixture(); const created = await service.create(1, payload);
  // The provider status is supplied by the client; use an isolated service for the same record.
  const record = { id: created.id, customerId: 1, status: 'PENDING' };
  const other = createSandboxPayoutService({ store: { async find() { return record; }, async update() {} }, client: { async status() { return { status: 'REJECTED', status_code: 'ERROR_SELECTING_FUND_SOURCE' }; } } });
  assert.equal((await other.refresh(1, created.id)).reasonCode, 'ERROR_SELECTING_FUND_SOURCE');
});

test('does not mark a payout successful while beneficiary processing is pending', async () => {
  const id = 'p' + 'a'.repeat(31);
  const store = { async find() { return { id, customerId: 1 }; }, async update() {} };
  const client = { async status() { return { status: 'SUCCESS', status_code: 'SENT_TO_BENEFICIARY' }; } };
  const result = await createSandboxPayoutService({ store, client }).refresh(1, id);
  assert.equal(result.status, 'PENDING');
});
