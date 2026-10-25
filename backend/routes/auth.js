import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { q, one, exec, HttpError, issueOtp, checkOtp, signToken } from '../lib/util.js';

const r = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts, please wait a minute' } });
r.use(limiter);

const BAD = () => new HttpError(401, 'Invalid credentials');
const tooMany = async (col, id) => {
  const f = await one(
    `SELECT COUNT(*) AS n FROM login_attempt
      WHERE ${col} = ? AND success = FALSE AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`, id);
  return Number(f.n) >= 5;
};
const logAttempt = (col, id, ok, ip) =>
  exec(`INSERT INTO login_attempt (${col}, success, ip_address) VALUES (?, ?, ?)`, id, ok, ip ?? null);

const maskedPhone = (p) => (p ? `${p.slice(0, 3)} ••••• ${p.slice(-5)}` : 'your registered number');

r.post('/customer/login', async (req, res) => {
  const { acc_no, password } = req.body ?? {};
  if (!/^\d{6,12}$/.test(String(acc_no ?? '')) || !password) throw BAD();
  const c = await one(
    `SELECT c.cust_id, c.name, c.password_hash, c.status FROM account a
       JOIN customer c ON c.cust_id = a.cust_id WHERE a.acc_no = ?`, acc_no);
  if (!c) throw BAD();
  if (await tooMany('cust_id', c.cust_id)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
  const ok = c.status === 'ACTIVE' && (await bcrypt.compare(String(password), c.password_hash));
  await logAttempt('cust_id', c.cust_id, ok, req.ip);
  if (!ok) throw BAD();
  const ph = await one('SELECT ph_no FROM customer_phone WHERE cust_id = ? AND is_primary = TRUE', c.cust_id);
  const ch = await issueOtp({ custId: c.cust_id, purpose: 'LOGIN', label: c.name });
  res.json({ ...ch, sent_to: maskedPhone(ph?.ph_no), name: c.name.split(' ')[0] });
});

r.post('/customer/verify', async (req, res) => {
  const { challenge_id, otp } = req.body ?? {};
  const row = await checkOtp({ challengeId: challenge_id, otp, purpose: 'LOGIN' });
  if (!row.cust_id) throw new HttpError(401, 'That code is not valid or has expired');
  res.json({ token: signToken(row.cust_id, 'customer') });
});

r.post('/staff/login', async (req, res) => {
  const { emp_id, password } = req.body ?? {};
  if (!/^\d{1,6}$/.test(String(emp_id ?? '')) || !password) throw BAD();
  const e = await one('SELECT emp_id, emp_name, password_hash, status FROM employee WHERE emp_id = ?', emp_id);
  if (!e) throw BAD();
  if (await tooMany('emp_id', e.emp_id)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
  const ok = e.status === 'ACTIVE' && (await bcrypt.compare(String(password), e.password_hash));
  await logAttempt('emp_id', e.emp_id, ok, req.ip);
  if (!ok) throw BAD();
  const ph = await one('SELECT phone_no FROM employee_phone WHERE emp_id = ? LIMIT 1', e.emp_id);
  const ch = await issueOtp({ empId: e.emp_id, purpose: 'LOGIN', label: e.emp_name });
  res.json({ ...ch, sent_to: maskedPhone(ph?.phone_no), name: e.emp_name.split(' ')[0] });
});

r.post('/staff/verify', async (req, res) => {
  const { challenge_id, otp } = req.body ?? {};
  const row = await checkOtp({ challengeId: challenge_id, otp, purpose: 'LOGIN' });
  if (!row.emp_id) throw new HttpError(401, 'That code is not valid or has expired');
  await exec('UPDATE employee SET last_login = NOW() WHERE emp_id = ?', row.emp_id);
  res.json({ token: signToken(row.emp_id, 'employee') });
});

export default r;
