import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validWebhookSignature } from '../services/razorpayWebhook.js';

test('authenticates the exact webhook bytes and rejects tampering', () => {
  const body = Buffer.from('{"event":"payout.processed"}');
  const signature = createHmac('sha256', 'test-secret').update(body).digest('hex');
  assert.equal(validWebhookSignature(body, signature, 'test-secret'), true);
  assert.equal(validWebhookSignature(Buffer.from('{}'), signature, 'test-secret'), false);
  assert.equal(validWebhookSignature(body, 'invalid', 'test-secret'), false);
  assert.equal(validWebhookSignature(body, signature, ''), false);
});
