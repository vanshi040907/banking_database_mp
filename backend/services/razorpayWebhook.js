import { createHmac, timingSafeEqual } from 'node:crypto';

export function validWebhookSignature(body, signature, secret) {
  if (!Buffer.isBuffer(body) || typeof secret !== 'string' || !secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
