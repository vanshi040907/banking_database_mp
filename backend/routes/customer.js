import { Router } from 'express';
import { q, one, dt, d, bad, HttpError, callProc, issueOtp, checkOtp, money } from '../lib/util.js';
import { requireCustomer } from '../lib/auth.js';

const r = Router();
r.use(requireCustomer);

const pending = new Map(); // challenge_id -> transfer details waiting for the OTP

async function ownAccount(req, acc) {
  const a = await one(
    `SELECT a.acc_no, a.balance, a.status, a.is_primary, a.branch_ifsc, b.branch_name, t.type_name,
            t.min_balance, t.interest_rate, t.daily_txn_limit, ${d('a.creation_date')} AS creation_date
       FROM account a JOIN branch b ON b.ifsc_code = a.branch_ifsc
       JOIN account_type t ON t.type_id = a.type_id
      WHERE a.acc_no = ? AND a.cust_id = ?`, acc, req.cust.cust_id);
  if (!a) throw new HttpError(404, 'Account not found');
  return a;
}
const firstAndInitial = (n) => { const p = String(n).split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };

r.get('/me', async (req, res) => {
  const c = await one(
    `SELECT c.cust_id, c.name, ${d('c.dob')} AS dob, c.gender, c.address_line, c.pincode, l.city, l.state,
            c.kyc_status, c.pan_no, ${d('c.created_at')} AS member_since
       FROM customer c JOIN location l ON l.pincode = c.pincode WHERE c.cust_id = ?`, req.cust.cust_id);
  const phones = await q('SELECT ph_no, is_primary FROM customer_phone WHERE cust_id = ?', req.cust.cust_id);
  const emails = await q('SELECT mail, is_primary FROM customer_email WHERE cust_id = ?', req.cust.cust_id);
  res.json({ ...c, phones, emails });
});

r.get('/accounts', async (req, res) => {
  const rows = await q(
    `SELECT a.acc_no, a.balance, a.status, a.is_primary, b.branch_name, a.branch_ifsc, t.type_name,
            ${d('a.creation_date')} AS creation_date
       FROM account a JOIN branch b ON b.ifsc_code = a.branch_ifsc JOIN account_type t ON t.type_id = a.type_id
      WHERE a.cust_id = ? AND a.status <> 'CLOSED' ORDER BY a.is_primary DESC, a.acc_no`, req.cust.cust_id);
  res.json(rows);
});

r.get('/accounts/:acc', async (req, res) => res.json(await ownAccount(req, req.params.acc)));

r.get('/accounts/:acc/transactions', async (req, res) => {
  await ownAccount(req, req.params.acc);
  const dir = ['DEBIT', 'CREDIT'].includes(req.query.direction) ? req.query.direction : null;
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = await q(
    `SELECT h.trans_id, h.reference_no, ${dt('h.trans_date')} AS trans_date, h.trans_type, h.trans_mode,
            h.amount, h.trans_status, h.remarks, h.direction, h.counterparty_acc_no, c.name AS counterparty_name
       FROM v_transaction_history h
       LEFT JOIN account cp ON cp.acc_no = h.counterparty_acc_no
       LEFT JOIN customer c ON c.cust_id = cp.cust_id
      WHERE h.acc_no = ? ${dir ? 'AND h.direction = ?' : ''}
      ORDER BY h.trans_date DESC, h.trans_id DESC LIMIT ${limit} OFFSET ${offset}`,
    ...[req.params.acc, ...(dir ? [dir] : [])]);
  res.json(rows);
});

r.get('/accounts/:acc/summary', async (req, res) => {
  await ownAccount(req, req.params.acc);
  const out = {};
  for (const [k, days] of [['week', 7], ['month', 30], ['year', 365]]) {
    const s = await one(
      `SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount END),0) AS credits,
              COALESCE(SUM(CASE WHEN direction='DEBIT'  THEN amount END),0) AS debits
         FROM v_transaction_history
        WHERE acc_no = ? AND trans_status = 'SUCCESS' AND trans_date > DATE_SUB(NOW(), INTERVAL ${days} DAY)`,
      req.params.acc);
    out[k] = { credits: money(s.credits), debits: money(s.debits), saved: money(s.credits - s.debits) };
  }
  res.json(out);
});

r.post('/primary', async (req, res) => {
  await callProc('sp_set_primary_account', [req.cust.cust_id, req.body?.acc_no], { out: false });
  res.json({ ok: true });
});

// ---------- payees ----------
r.get('/payees', async (req, res) => {
  const rows = await q(
    `SELECT h.counterparty_acc_no AS acc_no, c.name, COUNT(*) AS times, ${dt('MAX(h.trans_date)')} AS last_paid
       FROM v_transaction_history h
       JOIN account mine ON mine.acc_no = h.acc_no AND mine.cust_id = ?
       JOIN account cp   ON cp.acc_no = h.counterparty_acc_no AND cp.cust_id <> ?
       JOIN customer c   ON c.cust_id = cp.cust_id
      WHERE h.direction = 'DEBIT' AND h.trans_type = 'TRANSFER' AND h.trans_status = 'SUCCESS'
      GROUP BY h.counterparty_acc_no, c.name`, req.cust.cust_id, req.cust.cust_id);
  const recent = [...rows].sort((a, b) => b.last_paid.localeCompare(a.last_paid)).slice(0, 5);
  const frequent = [...rows].sort((a, b) => Number(b.times) - Number(a.times)).slice(0, 5);
  res.json({ recent, frequent });
});

r.post('/lookup', async (req, res) => {
  const { type, value } = req.body ?? {};
  let row;
  if (type === 'mobile') {
    let m = String(value ?? '').replace(/[\s-]/g, '');
    if (/^\d{10}$/.test(m)) m = `+91${m}`;
    row = await one(
      `SELECT a.acc_no, c.name, b.branch_name FROM customer_phone p JOIN account a ON a.cust_id = p.cust_id
         AND a.is_primary = TRUE AND a.status = 'ACTIVE' JOIN customer c ON c.cust_id = a.cust_id
         JOIN branch b ON b.ifsc_code = a.branch_ifsc WHERE p.ph_no = ?`, m);
  } else {
    if (!/^\d{6,12}$/.test(String(value ?? ''))) throw bad('Enter a valid account number');
    row = await one(
      `SELECT a.acc_no, c.name, b.branch_name FROM account a JOIN customer c ON c.cust_id = a.cust_id
         JOIN branch b ON b.ifsc_code = a.branch_ifsc WHERE a.acc_no = ? AND a.status = 'ACTIVE'`, value);
  }
  if (!row) throw new HttpError(404, 'We could not find an active account for that');
  res.json({ acc_no: row.acc_no, name: firstAndInitial(row.name), branch_name: row.branch_name });
});

// ---------- transfer: step 1 validate + send OTP, step 2 confirm ----------
r.post('/transfer/start', async (req, res) => {
  const { from, to, amount, mode, remarks } = req.body ?? {};
  const amt = money(amount);
  if (!(amt > 0)) throw bad('Enter an amount greater than zero');
  if (!['UPI', 'NEFT', 'IMPS'].includes(mode)) throw bad('Choose a payment mode');
  if (String(from) === String(to)) throw bad('You cannot send money to the same account');
  const a = await ownAccount(req, from);
  if (a.status !== 'ACTIVE') throw bad('This account is not active');
  if (Number(a.balance) < amt) throw bad('Insufficient balance');
  const dest = await one(
    `SELECT a.acc_no, c.name FROM account a JOIN customer c ON c.cust_id = a.cust_id
      WHERE a.acc_no = ? AND a.status = 'ACTIVE'`, to);
  if (!dest) throw bad('The receiving account is not available');
  const ch = await issueOtp({ custId: req.cust.cust_id, purpose: 'TRANSFER', label: req.cust.name });
  pending.set(ch.challenge_id, { cust: req.cust.cust_id, from, to, amt, mode, remarks: (remarks ?? '').slice(0, 255) || null });
  res.json({ ...ch, to_name: firstAndInitial(dest.name) });
});

r.post('/transfer/confirm', async (req, res) => {
  const { challenge_id, otp } = req.body ?? {};
  const p = pending.get(String(challenge_id));
  if (!p || p.cust !== req.cust.cust_id) throw new HttpError(400, 'This transfer request has expired. Please start again.');
  await checkOtp({ challengeId: challenge_id, otp, purpose: 'TRANSFER', custId: req.cust.cust_id });
  pending.delete(String(challenge_id));
  const id = await callProc('sp_transfer', [req.cust.cust_id, p.from, p.to, p.amt, p.mode, p.remarks]);
  const t = await one(
    `SELECT t.trans_id, t.reference_no, ${dt('t.trans_date')} AS trans_date, t.amount, t.trans_mode, c.name AS to_name
       FROM bank_transaction t JOIN account a ON a.acc_no = t.to_acc_no JOIN customer c ON c.cust_id = a.cust_id
      WHERE t.trans_id = ?`, id);
  res.json({ ...t, to_name: firstAndInitial(t.to_name), to_acc_no: p.to, from_acc_no: p.from });
});

// ---------- cards, deposits, loans ----------
r.get('/cards', async (req, res) => {
  res.json(await q(
    `SELECT k.card_id, k.acc_no, k.card_no, k.card_type, ${d('k.issue_date')} AS issue_date,
            ${d('k.expiry_date')} AS expiry_date, k.status, k.daily_limit
       FROM card k JOIN account a ON a.acc_no = k.acc_no WHERE a.cust_id = ? ORDER BY k.status, k.card_id`,
    req.cust.cust_id));
});

r.get('/deposits', async (req, res) => {
  const fds = await q(
    `SELECT fd_id, linked_acc_no, amount, int_rate_fd, duration_months, ${d('start_date')} AS start_date,
            ${d('DATE_ADD(start_date, INTERVAL duration_months MONTH)')} AS maturity_date, payout_type, status
       FROM fixed_deposit WHERE cust_id = ? ORDER BY start_date DESC`, req.cust.cust_id);
  for (const f of fds) {
    const principal = Number(f.amount), rate = Number(f.int_rate_fd) / 100, yrs = f.duration_months / 12;
    f.maturity_amount = money(f.payout_type === 'AT_MATURITY'
      ? principal * Math.pow(1 + rate / 4, 4 * yrs) : principal);
    f.paid_out = money((await one('SELECT COALESCE(SUM(amount),0) AS s FROM fd_payout WHERE fd_id = ?', f.fd_id)).s);
  }
  res.json(fds);
});

r.get('/loans', async (req, res) => {
  const loans = await q(
    `SELECT loan_id, loantype, principle_amt, int_rate, tenure_months, ${d('start_date')} AS start_date,
            outstanding_amount, status FROM loan WHERE cust_id = ? ORDER BY start_date DESC`, req.cust.cust_id);
  for (const l of loans) {
    l.next_emi = await one(
      `SELECT installment_no, ${d('due_date')} AS due_date, emi_amount FROM loan_emi_schedule
        WHERE loan_id = ? AND status <> 'PAID' ORDER BY installment_no LIMIT 1`, l.loan_id);
    const p = await one("SELECT COUNT(*) AS n FROM loan_emi_schedule WHERE loan_id = ? AND status = 'PAID'", l.loan_id);
    l.paid_installments = Number(p.n);
  }
  res.json(loans);
});

r.get('/loans/:id/schedule', async (req, res) => {
  const l = await one('SELECT loan_id FROM loan WHERE loan_id = ? AND cust_id = ?', req.params.id, req.cust.cust_id);
  if (!l) throw new HttpError(404, 'Loan not found');
  res.json(await q(
    `SELECT installment_no, ${d('due_date')} AS due_date, emi_amount, principal_part, interest_part, status
       FROM loan_emi_schedule WHERE loan_id = ? ORDER BY installment_no`, req.params.id));
});

export default r;
