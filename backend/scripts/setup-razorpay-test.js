import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = await readFile(new URL('../../database/razorpay_test_payout.sql', import.meta.url), 'utf8');
const db = await mysql.createConnection(process.env.DATABASE_URL);
try { await db.query(sql); console.log('RazorpayX test payout table is ready.'); } finally { await db.end(); }
