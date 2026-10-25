import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db.js';

export const q = (sql, ...params) => prisma.$queryRawUnsafe(sql, ...params);
export const one = async (sql, ...params) => (await q(sql, ...params))[0] ?? null;
export const exec = (sql, ...params) => prisma.$executeRawUnsafe(sql, ...params);

// MySQL DATETIME -> "2026-10-25T14:03:11" (no zone, so the browser shows local time as stored)
export const dt = (col) => `DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%s')`;
export const d = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);

// Prisma wraps a SIGNAL from a stored procedure: "...Message: `Insufficient balance`"
export function dbMessage(err) {
  const m = /Message: `([\s\S]*?)`/.exec(err?.message ?? '');
  return m ? m[1] : null;
}

// CALL a stored procedure on ONE connection so the @out variable survives.
export async function callProc(name, args, { out = true } = {}) {
  return prisma.$transaction(async (tx) => {
    const marks = args.map(() => '?').concat(out ? ['@out'] : []).join(', ');
    await tx.$executeRawUnsafe(`CALL ${name}(${marks})`, ...args);
    if (!out) return null;
    const [r] = await tx.$queryRawUnsafe('SELECT @out AS id');
    return r.id;
  });
}

export const signToken = (sub, kind) =>
  jwt.sign({ sub, kind }, process.env.JWT_SECRET, { expiresIn: '2h' });

// ---------- OTP ----------
export async function issueOtp({ custId = null, empId = null, purpose, label }) {
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const hash = await bcrypt.hash(otp, 8);
  await exec(
    `INSERT INTO otp_verification (cust_id, emp_id, purpose, otp_hash, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
    custId, empId, purpose, hash);
  const row = await one('SELECT LAST_INSERT_ID() AS id');
  console.log(`[DEV ONLY] OTP for ${label} (${purpose}): ${otp}`);
  return { challenge_id: String(row.id), dev_otp: process.env.DEV_SHOW_OTP === 'true' ? otp : undefined };
}

export async function checkOtp({ challengeId, otp, purpose, custId = null, empId = null }) {
  const row = await one(
    `SELECT otp_id, otp_hash, used, attempts, cust_id, emp_id, expires_at > NOW() AS live
       FROM otp_verification WHERE otp_id = ? AND purpose = ?`, challengeId, purpose);
  const fail = new HttpError(401, 'That code is not valid or has expired');
  if (!row || row.used || !row.live || row.attempts >= 3) throw fail;
  if (custId !== null && row.cust_id !== custId) throw fail;
  if (empId !== null && row.emp_id !== empId) throw fail;
  await exec('UPDATE otp_verification SET attempts = attempts + 1 WHERE otp_id = ?', challengeId);
  if (!(await bcrypt.compare(String(otp ?? ''), row.otp_hash))) throw fail;
  await exec('UPDATE otp_verification SET used = TRUE WHERE otp_id = ?', challengeId);
  return row;
}

export const money = (v) => Math.round(Number(v) * 100) / 100;
export const tempPassword = () => crypto.randomBytes(6).toString('base64url') + '#7';
