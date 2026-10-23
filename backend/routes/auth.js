import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { wrap } from '../utils/wrap.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();
const OTP_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 3;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

// ---------- helpers ----------
async function tooManyFailures(who) {
  const since = new Date(Date.now() - LOCK_MINUTES * 60 * 1000);
  const fails = await prisma.login_attempt.count({
    where: { ...who, success: false, attempted_at: { gte: since } },
  });
  return fails >= MAX_FAILS;
}

const logAttempt = (who, success, req) =>
  prisma.login_attempt.create({ data: { ...who, success, ip_address: req.ip } });

// creates an OTP, stores only its hash, returns a short-lived "otpToken"
async function issueOtp({ who, userType, userId, phone }) {
  const otp = String(crypto.randomInt(100000, 1000000));
  const row = await prisma.otp_verification.create({
    data: {
      ...who,
      purpose: 'LOGIN',
      otp_hash: await bcrypt.hash(otp, 8),
      expires_at: new Date(Date.now() + OTP_MINUTES * 60 * 1000),
    },
  });
  console.log(`[DEV ONLY] OTP for ${phone}: ${otp}`);   // Twilio replaces this later
  return jwt.sign(
    { purpose: 'otp', otpId: String(row.otp_id), userType, userId },
    process.env.JWT_SECRET,
    { expiresIn: `${OTP_MINUTES}m` }
  );
}

// ---------- step 1a: customer password check ----------
router.post('/customer/login', wrap(async (req, res) => {
  const { accNo, password } = req.body ?? {};
  if (!/^\d{6,15}$/.test(String(accNo ?? '')) || !password) {
    return res.status(400).json({ error: 'Account number and password are required' });
  }

  const account = await prisma.account.findUnique({ where: { acc_no: BigInt(accNo) } });
  const customer = account
    ? await prisma.customer.findUnique({ where: { cust_id: account.cust_id } })
    : null;
  // same message for "no such account" and "wrong password"
  if (!customer) return res.status(401).json({ error: 'Invalid credentials' });

  const who = { cust_id: customer.cust_id };
  if (await tooManyFailures(who)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }
  if (!(await bcrypt.compare(password, customer.password_hash))) {
    await logAttempt(who, false, req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (customer.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Your profile is not active. Contact your branch.' });
  }

  const phone = await prisma.customer_phone.findFirst({
    where: { cust_id: customer.cust_id, is_primary: true },
  });
  if (!phone) return res.status(400).json({ error: 'No registered mobile number found' });

  const otpToken = await issueOtp({
    who, userType: 'CUSTOMER', userId: customer.cust_id, phone: phone.ph_no,
  });
  res.json({ otpRequired: true, otpToken });
}));

// ---------- step 1b: employee password check ----------
router.post('/employee/login', wrap(async (req, res) => {
  const { empId, password } = req.body ?? {};
  if (!Number.isInteger(Number(empId)) || !password) {
    return res.status(400).json({ error: 'Employee ID and password are required' });
  }

  const employee = await prisma.employee.findUnique({ where: { emp_id: Number(empId) } });
  if (!employee) return res.status(401).json({ error: 'Invalid credentials' });

  const who = { emp_id: employee.emp_id };
  if (await tooManyFailures(who)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }
  if (!(await bcrypt.compare(password, employee.password_hash))) {
    await logAttempt(who, false, req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (employee.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'This employee account is not active' });
  }

  const phone = await prisma.employee_phone.findFirst({ where: { emp_id: employee.emp_id } });
  if (!phone) return res.status(400).json({ error: 'No registered mobile number found' });

  const otpToken = await issueOtp({
    who, userType: 'EMPLOYEE', userId: employee.emp_id, phone: phone.phone_no,
  });
  res.json({ otpRequired: true, otpToken });
}));

// ---------- step 2: OTP check, then hand out the real login token ----------
router.post('/verify-otp', wrap(async (req, res) => {
  const { otpToken, otp } = req.body ?? {};

  let claims;
  try {
    claims = jwt.verify(String(otpToken), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  if (claims.purpose !== 'otp') return res.status(401).json({ error: 'Invalid session' });

  const row = await prisma.otp_verification.findUnique({ where: { otp_id: BigInt(claims.otpId) } });
  if (!row || row.used || row.expires_at < new Date()) {
    return res.status(401).json({ error: 'OTP expired or already used' });
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many wrong OTPs. Please log in again.' });
  }

  const who = claims.userType === 'CUSTOMER' ? { cust_id: claims.userId } : { emp_id: claims.userId };

  if (!(await bcrypt.compare(String(otp ?? ''), row.otp_hash))) {
    await prisma.otp_verification.update({
      where: { otp_id: row.otp_id }, data: { attempts: { increment: 1 } },
    });
    await logAttempt(who, false, req);
    return res.status(401).json({ error: 'Wrong OTP' });
  }

  await prisma.otp_verification.update({ where: { otp_id: row.otp_id }, data: { used: true } });
  await logAttempt(who, true, req);

  let mustChangePassword = false;
  if (claims.userType === 'EMPLOYEE') {
    const e = await prisma.employee.update({
      where: { emp_id: claims.userId }, data: { last_login: new Date() },
    });
    mustChangePassword = e.must_change_password;
  } else {
    const c = await prisma.customer.findUnique({ where: { cust_id: claims.userId } });
    mustChangePassword = c.must_change_password;
  }

  const token = jwt.sign(
    { type: claims.userType, id: claims.userId },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  res.json({ token, userType: claims.userType, mustChangePassword });
}));

router.post('/change-password', verifyJWT, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    newPassword.length < 12 ||
    newPassword.length > 72
  ) {
    return res.status(400).json({
      error: 'New password must contain 12 to 72 characters'
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      error: 'New password must be different from the current password'
    });
  }

  const isCustomer = req.user.type === 'CUSTOMER';
  const model = isCustomer ? prisma.customer : prisma.employee;
  const idField = isCustomer ? 'cust_id' : 'emp_id';

  const where = { [idField]: req.user.id };

  const user = await model.findUnique({ where });

  if (!user || user.status !== 'ACTIVE') {
    return res.status(403).json({
      error: 'Account is not active'
    });
  }

  const correctPassword = await bcrypt.compare(
    currentPassword,
    user.password_hash
  );

  if (!correctPassword) {
    return res.status(401).json({
      error: 'Current password is incorrect'
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await model.update({
    where,
    data: {
      password_hash: passwordHash,
      must_change_password: false
    }
  });

  res.json({
    message: 'Password changed successfully. Please log in again.'
  });
}));

export default router;