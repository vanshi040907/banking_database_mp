import mysql from 'mysql2/promise';
import { verifyTransferPin } from './transactionPinService.js';
import { createRazorpayTestClient } from './razorpayTestClient.js';
import { validatePayoutInput, nextPayoutState } from './razorpayPayoutRules.js';

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, waitForConnections:true, connectionLimit:10, supportBigNumbers:true, bigNumberStrings:true });
function provider() {
  if (process.env.RAZORPAYX_TEST_ENABLED !== 'true') throw Object.assign(new Error('RazorpayX test payouts are not configured.'), { status:503 });
  try { return createRazorpayTestClient({ keyId:process.env.RAZORPAYX_KEY_ID, keySecret:process.env.RAZORPAYX_KEY_SECRET, accountNumber:process.env.RAZORPAYX_ACCOUNT_NUMBER }); }
  catch { throw Object.assign(new Error('RazorpayX test payouts are not configured.'), { status:503 }); }
}
const publicRow = row => ({ requestId:row.request_id, account:row.from_acc_no, amountPaise:row.amount_paise, recipient:row.recipient_vpa, state:row.state, providerId:row.provider_id, createdAt:row.created_at });
async function find(customerId,id) {
  const [rows] = await pool.execute('SELECT * FROM razorpay_test_payout WHERE request_id = ? AND customer_id = ?', [id,customerId]);
  if (!rows.length) throw Object.assign(new Error('Payout not found.'),{status:404});
  return rows[0];
}
async function reconcile(customerId,id,data) {
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]=await conn.execute('SELECT * FROM razorpay_test_payout WHERE request_id=? AND customer_id=? FOR UPDATE',[id,customerId]);
    const row=rows[0];
    if (!row || !data || typeof data.id !== 'string' || !/^pout_[A-Za-z0-9]+$/.test(data.id) || (row.provider_id && row.provider_id !== data.id) || Number(data.amount) !== row.amount_paise || data.currency !== 'INR' || data.reference_id !== row.request_id) throw new Error('Provider response could not be matched to the payout.');
    const state=nextPayoutState(row.state,data.status);
    if (state === 'RELEASED' && row.state !== 'RELEASED') await conn.execute('UPDATE account SET balance = balance + ? / 100 WHERE acc_no = ?', [row.amount_paise,row.from_acc_no]);
    await conn.execute('UPDATE razorpay_test_payout SET state=?, provider_id=? WHERE request_id=?',[state,data.id,id]);
    await conn.commit();
    return publicRow({...row,state,provider_id:data.id});
  } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
export async function createTestPayout(customerId, raw) {
  const api=provider();
  const input=validatePayoutInput(raw);
  await verifyTransferPin({ customerId, accNo:input.fromAccNo, transactionPin:input.transactionPin });
  const conn=await pool.getConnection(); let existing;
  try {
    await conn.beginTransaction();
    const [accounts]=await conn.execute('SELECT acc_no, status, balance FROM account WHERE acc_no=? AND cust_id=? FOR UPDATE',[input.fromAccNo,customerId]);
    if (!accounts.length || accounts[0].status !== 'ACTIVE') throw Object.assign(new Error('Account not found or inactive.'),{status:400});
    const [rows]=await conn.execute('SELECT * FROM razorpay_test_payout WHERE request_id=? FOR UPDATE',[input.idempotencyKey]);
    if (rows.length) {
      const row=rows[0];
      if (row.customer_id !== customerId || row.from_acc_no !== input.fromAccNo || row.amount_paise !== input.amountPaise || row.recipient_vpa !== input.vpa || row.recipient_name !== input.name) throw Object.assign(new Error('Request ID already used for different details.'),{status:409});
      existing=publicRow(row);
    } else {
      const [updated]=await conn.execute('UPDATE account SET balance = balance - ? / 100 WHERE acc_no=? AND balance >= ? / 100',[input.amountPaise,input.fromAccNo,input.amountPaise]);
      if (updated.affectedRows !== 1) throw Object.assign(new Error('Insufficient balance.'),{status:400});
      await conn.execute('INSERT INTO razorpay_test_payout (request_id,customer_id,from_acc_no,amount_paise,recipient_vpa,recipient_name) VALUES (?,?,?,?,?,?)',[input.idempotencyKey,customerId,input.fromAccNo,input.amountPaise,input.vpa,input.name]);
    }
    await conn.commit();
  } catch(e) { await conn.rollback(); if (e.code === 'ER_DUP_ENTRY' || e.code === 'ER_LOCK_DEADLOCK') throw Object.assign(new Error('Request is already being processed. Check its status.'),{status:409}); throw e; } finally { conn.release(); }
  if (existing) return existing;
  try {
    const result=await api.createPayout({ idempotencyKey:input.idempotencyKey, amountPaise:input.amountPaise, vpa:input.vpa, name:input.name, referenceId:input.idempotencyKey });
    return await reconcile(customerId,input.idempotencyKey,result);
  } catch { return publicRow(await find(customerId,input.idempotencyKey)); }
}
export async function getTestPayout(customerId,id,refresh=false) {
  const row=await find(customerId,id);
  if (!refresh || !row.provider_id || row.state === 'RELEASED') return publicRow(row);
  try { return await reconcile(customerId,id,await provider().getPayout(row.provider_id)); }
  catch { return publicRow(row); }
}

export async function listTestPayouts(customerId) {
  const [rows] = await pool.execute('SELECT * FROM razorpay_test_payout WHERE customer_id=? ORDER BY created_at DESC LIMIT 20',[customerId]);
  return rows.map(publicRow);
}

// Fetch provider state independently; signed event data is a notification, not
// an instruction to modify balances. Matching and locking occur in reconcile.
export async function reconcileTestPayoutByReference(reference, payoutId) {
  if (typeof reference !== 'string' || !/^[0-9a-f-]{36}$/i.test(reference) || typeof payoutId !== 'string' || !/^pout_[A-Za-z0-9]+$/.test(payoutId)) return;
  const [rows] = await pool.execute('SELECT customer_id, provider_id FROM razorpay_test_payout WHERE request_id=?', [reference]);
  if (!rows.length || (rows[0].provider_id && rows[0].provider_id !== payoutId)) return;
  const data = await provider().getPayout(payoutId);
  await reconcile(rows[0].customer_id, reference, data);
}

export async function reconcilePendingTestPayouts() {
  if (process.env.RAZORPAYX_TEST_ENABLED !== 'true') return;
  const [rows] = await pool.execute("SELECT request_id, provider_id FROM razorpay_test_payout WHERE state='RESERVED' AND provider_id IS NOT NULL ORDER BY updated_at ASC LIMIT 50");
  for (const row of rows) {
    try { await reconcileTestPayoutByReference(row.request_id, row.provider_id); }
    catch { console.error('Unable to refresh a test payout; it remains reserved.'); }
  }
}
