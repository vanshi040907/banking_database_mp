import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadinessRequest, createPaymentRequest, runTestCheckout } from '../src/googlePayTest.js';

test('Google Pay checkout uses the test gateway and a fixed demo amount', () => {
  const request = createPaymentRequest();
  assert.equal(request.allowedPaymentMethods[0].type, 'CARD');
  assert.equal(request.allowedPaymentMethods[0].tokenizationSpecification.parameters.gateway, 'example');
  assert.equal(request.transactionInfo.currencyCode, 'USD');
  assert.equal(request.transactionInfo.totalPrice, '19.99');
  assert.equal(createReadinessRequest().allowedPaymentMethods[0].type, 'CARD');
});

test('completed demo does not return or expose payment data', async () => {
  let received;
  const client = { async loadPaymentData(request) { received = request; return { paymentMethodData: { tokenizationData: { token: 'test-token' } } }; } };
  assert.deepEqual(await runTestCheckout(client), { completed: true });
  assert.equal(received.transactionInfo.totalPrice, '19.99');
});

test('cancelled or failed Google Pay requests propagate to the caller', async () => {
  const cancelled = Object.assign(new Error('Cancelled'), { statusCode: 'CANCELED' });
  await assert.rejects(runTestCheckout({ async loadPaymentData() { throw cancelled; } }), { statusCode: 'CANCELED' });
});
