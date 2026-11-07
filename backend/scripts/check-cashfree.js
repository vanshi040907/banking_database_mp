import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createCashfreeClient } from '../services/cashfreeSandbox.js';

dotenv.config({ path: fileURLToPath(new URL('../.env.cashfree', import.meta.url)), quiet: true });
try {
  const client = createCashfreeClient({ clientId: process.env.CASHFREE_CLIENT_ID, clientSecret: process.env.CASHFREE_CLIENT_SECRET });
  await client.checkConnection();
  console.log('Cashfree sandbox authentication succeeded.');
} catch (error) {
  console.error(`Cashfree sandbox authentication failed: ${error.message}`);
  process.exitCode = 1;
}
