import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashfreeClient } from '../services/cashfreeSandbox.js';
const input = { transferId: 'test_123', amount: '10.00', name: 'Test User', phone: '9999999999', email: 'test@example.com', vpa: 'success@upi' };
test('submits UPI payout using sandbox V2 and stable transfer ID', async () => {
  let call;
  const client = createCashfreeClient({ clientId: 'id', clientSecret: 'secret', fetcher: async (url, options) => { call = { url, options }; return { ok: true, json: async () => ({ status: 'RECEIVED' }) }; } });
  assert.equal((await client.sendUpi(input)).status, 'RECEIVED');
  assert.equal(call.url, 'https://sandbox.cashfree.com/payout/transfers');
  assert.equal(call.options.headers['x-api-version'], '2024-01-01');
  const body = JSON.parse(call.options.body);
  assert.equal(body.transfer_id, 'test_123'); assert.equal(body.transfer_mode, 'upi');
  assert.equal(body.beneficiary_details.beneficiary_instrument_details.vpa, 'success@upi');
});
test('unknown submission result is never automatically retried', async () => {
  let calls = 0;
  const client = createCashfreeClient({ clientId: 'id', clientSecret: 'secret', fetcher: async () => { calls++; throw new Error('timeout'); } });
  await assert.rejects(client.sendUpi(input), { code: 'UNKNOWN_OUTCOME' }); assert.equal(calls, 1);
});
test('fetches status by original transfer ID', async () => {
  let url; const client = createCashfreeClient({ clientId:'id', clientSecret:'secret', fetcher: async value => { url = value; return { ok:true, json:async () => ({ status:'SUCCESS' }) }; } });
  assert.equal((await client.status('test_123')).status, 'SUCCESS');
  assert.equal(new URL(url).searchParams.get('transfer_id'), 'test_123');
});
test('rejects invalid UPI requests without contacting provider', async () => {
  let called = false; const client = createCashfreeClient({ clientId:'id', clientSecret:'secret', fetcher: async () => { called = true; } });
  await assert.rejects(client.sendUpi({ ...input, vpa:'not-an-id' })); assert.equal(called, false);
});
test('phone payouts fail closed while provider API is unavailable', async () => {
  let called = false; const client = createCashfreeClient({ clientId:'id', clientSecret:'secret', fetcher: async () => { called = true; } });
  await assert.rejects(client.sendPhone(input), { code:'UNAVAILABLE' }); assert.equal(called, false);
});
