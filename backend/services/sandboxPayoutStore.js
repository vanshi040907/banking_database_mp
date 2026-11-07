import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createCashfreeClient } from './cashfreeSandbox.js';
import { createSandboxPayoutService } from './sandboxPayoutService.js';

dotenv.config({ path: fileURLToPath(new URL('../.env.cashfree', import.meta.url)), quiet: true });
const pool = mysql.createPool({ uri: process.env.DATABASE_URL, waitForConnections: true, connectionLimit: 10 });
const store = {
  async reserve(r) {
    try { await pool.execute('INSERT INTO sandbox_phone_payout (transfer_id, cust_id, fingerprint, status) VALUES (?, ?, ?, ?)', [r.id, r.customerId, r.fingerprint, r.status]); return true; }
    catch (err) { if (err.code === 'ER_DUP_ENTRY') return false; throw err; }
  },
  async find(id) {
    const [rows] = await pool.execute('SELECT transfer_id AS id, cust_id AS customerId, fingerprint, status FROM sandbox_phone_payout WHERE transfer_id = ?', [id]);
    return rows[0];
  },
  async update(id, status) { await pool.execute("UPDATE sandbox_phone_payout SET status = CASE WHEN status IN ('SUCCESS','FAILED','REJECTED','REVERSED') AND ? IN ('PENDING','UNKNOWN') THEN status ELSE ? END WHERE transfer_id = ?", [status, status, id]); }
};
export function getSandboxPayoutService() {
  const client = createCashfreeClient({ clientId: process.env.CASHFREE_CLIENT_ID, clientSecret: process.env.CASHFREE_CLIENT_SECRET });
  return createSandboxPayoutService({ store, client });
}
