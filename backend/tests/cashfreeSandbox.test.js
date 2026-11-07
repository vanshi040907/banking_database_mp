import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashfreeClient } from '../services/cashfreeSandbox.js';

test('submits a phone payout to the sandbox with a stable transfer ID', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => calls.length === 1
      ? { status: 'SUCCESS', data: { token: 'test-token' } }
      : { status: 'PENDING', subCode: '201', data: { referenceId: '1' } } };
  };
  const client = createCashfreeClient({ clientId: 'id', clientSecret: 'secret', fetcher });
  const result = await client.sendPhone({ transferId: 'test_123', amount: '10.00', name: 'Test User', phone: '9000000001', email: 'test@example.com' });
  assert.equal(result.status, 'PENDING');
  assert.equal(calls[1].url, 'https://payout-gamma.cashfree.com/payout/v1.2/directTransfer');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.transferId, 'test_123');
  assert.equal(body.transferMode, 'phone');
  assert.equal(body.beneDetails.phone, '9000000001');
});

test('network failure after submission is reported as unknown, without retry', async () => {
  let calls = 0;
  const client = createCashfreeClient({ clientId: 'id', clientSecret: 'secret', fetcher: async () => {
    if (++calls === 1) return { ok: true, json: async () => ({ status: 'SUCCESS', data: { token: 't' } }) };
    throw new Error('timeout');
  }});
  await assert.rejects(client.sendPhone({ transferId: 'test_123', amount: '10.00', name: 'Test User', phone: '9000000001', email: 'test@example.com' }), { code: 'UNKNOWN_OUTCOME' });
  assert.equal(calls, 2);
});

test('checks sandbox credentials without revealing the token', async () => {
  const client = createCashfreeClient({ clientId: 'id', clientSecret: 'secret', fetcher: async () => ({ ok: true, json: async () => ({ status: 'SUCCESS', data: { token: 'secret-token' } }) }) });
  assert.deepEqual(await client.checkConnection(), { connected: true });
});

test('fetches status using the original transfer ID', async () => {
  let requestedUrl;
  const client = createCashfreeClient({ clientId: 'id', clientSecret: 'secret', fetcher: async (url) => {
    if (url.endsWith('/authorize')) return { ok: true, json: async () => ({ status: 'SUCCESS', data: { token: 't' } }) };
    requestedUrl = url;
    return { ok: true, json: async () => ({ status: 'SUCCESS', data: { transfer: { status: 'PENDING' } } }) };
  }});
  const result = await client.status('test_123');
  assert.equal(new URL(requestedUrl).searchParams.get('transferId'), 'test_123');
  assert.equal(result.data.transfer.status, 'PENDING');
});

test('rejects invalid phone requests before contacting Cashfree', async () => {
  let called = false;
  const client = createCashfreeClient({ clientId: 'id', clientSecret: 'secret', fetcher: async () => { called = true; } });
  await assert.rejects(client.sendPhone({ transferId: 'bad/id', amount: '0', name: '', phone: '123', email: '' }));
  assert.equal(called, false);
});
