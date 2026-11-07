import test from 'node:test';
import assert from 'node:assert/strict';
import { createRazorpayTestClient } from '../services/razorpayTestClient.js';
const input = { idempotencyKey: 'db201812-0000-4000-8000-000000000001', amountPaise: 1250, vpa:'test@upi', name:'Test Recipient', referenceId:'test_123' };
test('sends a test-only UPI payout with the supplied idempotency key', async () => {
  let sent;
  const client = createRazorpayTestClient({ keyId:'rzp_test_123', keySecret:'test_secret', accountNumber:'test_1234', fetcher: async (url, options) => { sent = { url, options }; return { ok:true, json:async () => ({id:'pout_123',status:'processing'}) }; } });
  assert.equal((await client.createPayout(input)).status, 'processing');
  assert.equal(sent.url, 'https://api.razorpay.com/v1/payouts');
  assert.equal(sent.options.headers['X-Payout-Idempotency'], input.idempotencyKey);
  const body = JSON.parse(sent.options.body);
  assert.equal(body.amount,1250); assert.equal(body.mode,'UPI'); assert.equal(body.fund_account.vpa.address,'test@upi');
});
test('rejects live keys and missing configuration before making a request', () => {
  assert.throws(() => createRazorpayTestClient({keyId:'rzp_live_123',keySecret:'s',accountNumber:'123'}));
  assert.throws(() => createRazorpayTestClient({keyId:'rzp_test_123',keySecret:'',accountNumber:'123'}));
});
test('network error does not retry or falsely report failure', async () => {
  let calls=0;
  const client=createRazorpayTestClient({keyId:'rzp_test_123',keySecret:'s',accountNumber:'123',fetcher:async()=>{ calls++; throw new Error('timeout'); }});
  await assert.rejects(client.createPayout(input), {code:'UNKNOWN_OUTCOME'}); assert.equal(calls,1);
});
