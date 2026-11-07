import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpiLink } from '../src/upi.js';

test('encodes a valid UPI payment request without altering its amount', () => {
  const url = new URL(createUpiLink({ vpa: 'person@bank', name: 'A & B', amount: '10.50' }));
  assert.equal(url.protocol, 'upi:');
  assert.equal(url.hostname, 'pay');
  assert.equal(url.searchParams.get('pa'), 'person@bank');
  assert.equal(url.searchParams.get('pn'), 'A & B');
  assert.equal(url.searchParams.get('am'), '10.50');
  assert.equal(url.searchParams.get('cu'), 'INR');
});

test('rejects malformed recipients and amounts', () => {
  for (const input of [
    { vpa: '1234567890', name: 'A', amount: '1' },
    { vpa: 'a@bank', name: '', amount: '1' },
    { vpa: 'a@bank', name: 'A', amount: '0' },
    { vpa: 'a@bank', name: 'A', amount: '1.001' },
  ]) assert.throws(() => createUpiLink(input));
});
