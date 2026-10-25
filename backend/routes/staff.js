import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { q, one, exec, dt, d, bad, HttpError, callProc, money, tempPassword } from '../lib/util.js';
import { requireStaff, need, branchWhere } from '../lib/auth.js';
import { naturalSearch } from '../lib/nlsearch.js';

const r = Router();
r.use(requireStaff);

const audit = (empId, action, table, id, details, oldV = null, newV = null) =>
  exec(`INSERT INTO audit_log (emp_id, action, table_name, record_id, old_value, new_value, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, empId, action, table, String(id), oldV, newV, details);

async function accountInScope(req, acc) {
  const a = await one('SELECT acc_no, branch_ifsc, cust_id, status, balance FROM account WHERE acc_no = ?', acc);
  if (!a || (!req.allBranches && a.branch_ifsc !== req.emp.branch_ifsc)) throw new HttpError(404, 'Account not found');
  return a;
}
const like = (s) => `%${String(s ?? '').trim().replace(/[%_]/g, '')}%`;

r.get('/me', (req, res) => res.json({
  ...req.emp, permissions: [...req.perms], all_branches: req.allBranches,
}));

r.get('/lookups', async (req, res) => {
  res.json({
    branches: await q("SELECT ifsc_code, branch_name FROM branch WHERE status = 'ACTIVE' ORDER BY branch_name"),
    account_types: await q('SELECT type_id, type_name, min_balance, interest_rate, daily_txn_limit FROM account_type'),
    roles: await q('SELECT role_id, role_name, description FROM role ORDER BY role_name'),
    locations: await q('SELECT pincode, city, state FROM location ORDER BY city'),
  });
});

// ---------- dashboard ----------
r.get('/dashboard', async (req, res) => {
  const out = {};
  const bw = branchWhere(req, 'ifsc_code');
  out.branches = await q(
    `SELECT ifsc_code, branch_name, total_accounts, branch_deposits FROM v_branch_deposits WHERE ${bw.sql}`, ...bw.args);
  if (req.perms.has('VIEW_ACCOUNTS')) {
    const w = branchWhere(req, 'branch_ifsc');
    out.accounts = await q(`SELECT status, COUNT(*) AS n FROM account WHERE ${w.sql} GROUP BY status`, ...w.args);
  }
  if (req.perms.has('VIEW_ALL_TRANSACTIONS')) {
    const w = branchWhere(req, 'COALESCE(fa.branch_ifsc, ta.branch_ifsc)');
    out.today = await one(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.amount),0) AS volume FROM bank_transaction t
         LEFT JOIN account fa ON fa.acc_no = t.from_acc_no LEFT JOIN account ta ON ta.acc_no = t.to_acc_no
        WHERE DATE(t.trans_date) = CURRENT_DATE AND ${w.sql}`, ...w.args);
    out.recent = await q(
      `SELECT t.trans_id, ${dt('t.trans_date')} AS trans_date, t.trans_type, t.trans_mode, t.amount,
              t.from_acc_no, t.to_acc_no, t.trans_status
         FROM bank_transaction t LEFT JOIN account fa ON fa.acc_no = t.from_acc_no
         LEFT JOIN account ta ON ta.acc_no = t.to_acc_no
        WHERE ${w.sql} ORDER BY t.trans_date DESC, t.trans_id DESC LIMIT 8`, ...w.args);
  }
  if (req.perms.has('CASH_DEPOSIT') || req.perms.has('CASH_WITHDRAW')) {
    out.my_cash = await one(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN trans_type='DEPOSIT' THEN amount END),0) AS deposited,
              COALESCE(SUM(CASE WHEN trans_type='WITHDRAWAL' THEN amount END),0) AS withdrawn
         FROM bank_transaction WHERE initiated_by = ? AND DATE(trans_date) = CURRENT_DATE`, req.emp.emp_id);
  }
  if (req.perms.has('VIEW_EMPLOYEE_ROLES')) {
    const w = branchWhere(req, 'branch_ifsc');
    out.staff = await one(`SELECT COUNT(*) AS n FROM employee WHERE status = 'ACTIVE' AND ${w.sql}`, ...w.args);
  }
  if (req.perms.has('VIEW_PERSONAL_INFO')) {
    out.pending_kyc = await one("SELECT COUNT(*) AS n FROM customer WHERE kyc_status = 'PENDING'");
  }
  res.json(out);
});

// ---------- accounts ----------
r.get('/accounts', need('VIEW_ACCOUNTS'), async (req, res) => {
  const personal = req.perms.has('VIEW_PERSONAL_INFO');
  const w = branchWhere(req, 'a.branch_ifsc');
  const args = [...w.args];
  let extra = '';
  if (req.query.q) {
    extra += personal ? ' AND (CAST(a.acc_no AS CHAR) LIKE ? OR c.name LIKE ?)' : ' AND CAST(a.acc_no AS CHAR) LIKE ?';
    args.push(like(req.query.q)); if (personal) args.push(like(req.query.q));
  }
  if (['ACTIVE', 'FROZEN', 'CLOSED'].includes(req.query.status)) { extra += ' AND a.status = ?'; args.push(req.query.status); }
  const rows = await q(
    `SELECT a.acc_no, ${personal ? 'c.name AS customer_name, a.cust_id,' : ''} b.branch_name, t.type_name,
            a.balance, a.status, a.is_primary, ${d('a.creation_date')} AS creation_date
       FROM account a JOIN branch b ON b.ifsc_code = a.branch_ifsc JOIN account_type t ON t.type_id = a.type_id
       ${personal ? 'JOIN customer c ON c.cust_id = a.cust_id' : ''}
      WHERE ${w.sql} ${extra} ORDER BY a.acc_no LIMIT 200`, ...args);
  res.json(rows);
});

r.get('/accounts/:acc', need('VIEW_ACCOUNTS'), async (req, res) => {
  await accountInScope(req, req.params.acc);
  const personal = req.perms.has('VIEW_PERSONAL_INFO');
  const a = await one(
    `SELECT a.acc_no, a.cust_id, b.branch_name, a.branch_ifsc, t.type_name, t.min_balance, t.daily_txn_limit,
            a.balance, a.status, a.is_primary, ${d('a.creation_date')} AS creation_date,
            ${d('a.closed_date')} AS closed_date
       FROM account a JOIN branch b ON b.ifsc_code = a.branch_ifsc JOIN account_type t ON t.type_id = a.type_id
      WHERE a.acc_no = ?`, req.params.acc);
  if (!personal) delete a.cust_id;
  else a.customer = await one('SELECT name FROM customer WHERE cust_id = ?', a.cust_id);
  if (req.perms.has('VIEW_ALL_TRANSACTIONS')) {
    a.transactions = await q(
      `SELECT trans_id, ${dt('trans_date')} AS trans_date, trans_type, trans_mode, amount, direction,
              counterparty_acc_no, trans_status, remarks
         FROM v_transaction_history WHERE acc_no = ? ORDER BY trans_date DESC, trans_id DESC LIMIT 50`, req.params.acc);
  }
  if (req.perms.has('VIEW_AUDIT_LOG')) {
    a.audit = await q(
      `SELECT l.log_id, ${dt('l.created_at')} AS created_at, l.action, l.old_value, l.new_value, l.details, e.emp_name
         FROM audit_log l LEFT JOIN employee e ON e.emp_id = l.emp_id
        WHERE l.table_name = 'account' AND l.record_id = ? ORDER BY l.log_id DESC LIMIT 20`, req.params.acc);
  }
  res.json(a);
});

r.post('/accounts', need('OPEN_ACCOUNT'), async (req, res) => {
  const { cust_id, branch_ifsc, type_id, opening } = req.body ?? {};
  const branch = req.allBranches ? branch_ifsc : req.emp.branch_ifsc;
  const id = await callProc('sp_open_account', [cust_id, branch, type_id, money(opening ?? 0), req.emp.emp_id]);
  res.json({ acc_no: id });
});

r.post('/accounts/:acc/close', need('CLOSE_ACCOUNT'), async (req, res) => {
  await accountInScope(req, req.params.acc);
  await callProc('sp_close_account', [req.params.acc, req.emp.emp_id, req.body?.reason ?? ''], { out: false });
  res.json({ ok: true });
});

r.post('/accounts/:acc/status', need('FREEZE_ACCOUNT'), async (req, res) => {
  await accountInScope(req, req.params.acc);
  await callProc('sp_set_account_status', [req.params.acc, req.body?.status, req.emp.emp_id, req.body?.reason ?? ''], { out: false });
  res.json({ ok: true });
});

// ---------- cash counter ----------
r.post('/cash', async (req, res) => {
  const { acc_no, kind, amount, remarks } = req.body ?? {};
  const code = kind === 'withdraw' ? 'CASH_WITHDRAW' : 'CASH_DEPOSIT';
  if (!req.perms.has(code)) throw new HttpError(403, 'Your role does not allow this');
  const acc = await accountInScope(req, acc_no);
  const proc = kind === 'withdraw' ? 'sp_cash_withdraw' : 'sp_cash_deposit';
  const tid = await callProc(proc, [req.emp.emp_id, acc.acc_no, money(amount), remarks || null]);
  const t = await one(
    `SELECT t.trans_id, t.reference_no, ${dt('t.trans_date')} AS trans_date, t.amount, t.trans_type, a.balance
       FROM bank_transaction t JOIN account a ON a.acc_no = ? WHERE t.trans_id = ?`, acc.acc_no, tid);
  res.json(t);
});

// ---------- transactions ----------
r.get('/transactions', need('VIEW_ALL_TRANSACTIONS'), async (req, res) => {
  const w = branchWhere(req, 'COALESCE(fa.branch_ifsc, ta.branch_ifsc)');
  const args = [...w.args]; let extra = '';
  if (req.query.type && ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'].includes(req.query.type)) { extra += ' AND t.trans_type = ?'; args.push(req.query.type); }
  if (req.query.q) { extra += ' AND (CAST(t.from_acc_no AS CHAR) LIKE ? OR CAST(t.to_acc_no AS CHAR) LIKE ? OR t.reference_no LIKE ?)'; args.push(like(req.query.q), like(req.query.q), like(req.query.q)); }
  res.json(await q(
    `SELECT t.trans_id, t.reference_no, ${dt('t.trans_date')} AS trans_date, t.trans_type, t.trans_mode, t.amount,
            t.from_acc_no, t.to_acc_no, t.trans_status, t.remarks
       FROM bank_transaction t LEFT JOIN account fa ON fa.acc_no = t.from_acc_no
       LEFT JOIN account ta ON ta.acc_no = t.to_acc_no
      WHERE ${w.sql} ${extra} ORDER BY t.trans_date DESC, t.trans_id DESC LIMIT 200`, ...args));
});

// ---------- customers ----------
r.get('/customers', need('VIEW_PERSONAL_INFO'), async (req, res) => {
  const args = []; let extra = '';
  if (req.query.q) { extra = 'AND (c.name LIKE ? OR p.ph_no LIKE ? OR CAST(c.cust_id AS CHAR) = ?)'; args.push(like(req.query.q), like(req.query.q), String(req.query.q).trim()); }
  const scope = req.allBranches ? '1=1'
    : '(EXISTS (SELECT 1 FROM account x WHERE x.cust_id = c.cust_id AND x.branch_ifsc = ?) OR NOT EXISTS (SELECT 1 FROM account y WHERE y.cust_id = c.cust_id))';
  if (!req.allBranches) args.unshift(req.emp.branch_ifsc);
  res.json(await q(
    `SELECT c.cust_id, c.name, c.kyc_status, c.status, p.ph_no AS phone, m.mail AS email, l.city,
            (SELECT COUNT(*) FROM account a WHERE a.cust_id = c.cust_id AND a.status <> 'CLOSED') AS accounts
       FROM customer c LEFT JOIN customer_phone p ON p.cust_id = c.cust_id AND p.is_primary
       LEFT JOIN customer_email m ON m.cust_id = c.cust_id AND m.is_primary
       JOIN location l ON l.pincode = c.pincode
      WHERE ${scope} ${extra} ORDER BY c.cust_id LIMIT 200`, ...args.length ? args : []));
});

r.get('/customers/:id', need('VIEW_PERSONAL_INFO'), async (req, res) => {
  const c = await one(
    `SELECT c.cust_id, c.name, ${d('c.dob')} AS dob, c.gender, c.address_line, c.pincode, l.city, l.state,
            c.id_proof_type, c.pan_no, c.kyc_status, c.status, ${d('c.created_at')} AS created
       FROM customer c JOIN location l ON l.pincode = c.pincode WHERE c.cust_id = ?`, req.params.id);
  if (!c) throw new HttpError(404, 'Customer not found');
  c.phones = await q('SELECT ph_no, is_primary FROM customer_phone WHERE cust_id = ?', c.cust_id);
  c.emails = await q('SELECT mail, is_primary FROM customer_email WHERE cust_id = ?', c.cust_id);
  const w = branchWhere(req, 'a.branch_ifsc');
  c.accounts = await q(
    `SELECT a.acc_no, t.type_name, b.branch_name, a.balance, a.status, a.is_primary FROM account a
       JOIN account_type t ON t.type_id = a.type_id JOIN branch b ON b.ifsc_code = a.branch_ifsc
      WHERE a.cust_id = ? AND ${w.sql} ORDER BY a.acc_no`, c.cust_id, ...w.args);
  res.json(c);
});

r.post('/customers', need('REGISTER_CUSTOMER'), async (req, res) => {
  const b = req.body ?? {};
  const must = ['name', 'dob', 'gender', 'address_line', 'pincode', 'id_proof_type', 'id_proof_no', 'phone', 'email'];
  for (const k of must) if (!String(b[k] ?? '').trim()) throw bad(`Please fill in ${k.replace(/_/g, ' ')}`);
  if (!/^\+?\d{10,14}$/.test(b.phone.replace(/\s/g, ''))) throw bad('Enter a valid phone number');
  if (!/^\S+@\S+\.\S+$/.test(b.email)) throw bad('Enter a valid email address');
  const phone = b.phone.replace(/\s/g, '').replace(/^(\d{10})$/, '+91$1');
  const temp = tempPassword();
  const hash = await bcrypt.hash(temp, 10);
  const id = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO customer (name, dob, gender, address_line, pincode, id_proof_type, id_proof_no, pan_no, kyc_status, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?)`,
      b.name.trim(), b.dob, b.gender, b.address_line.trim(), b.pincode, b.id_proof_type, b.id_proof_no.trim(),
      b.pan_no?.trim() || null, hash);
    const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
    await tx.$executeRawUnsafe('INSERT INTO customer_phone (cust_id, ph_no, is_primary) VALUES (?, ?, TRUE)', id, phone);
    await tx.$executeRawUnsafe('INSERT INTO customer_email (cust_id, mail, is_primary) VALUES (?, ?, TRUE)', id, b.email.trim());
    return Number(id);
  });
  await audit(req.emp.emp_id, 'CUSTOMER_REGISTER', 'customer', id, `Registered ${b.name.trim()}`);
  res.json({ cust_id: id, temp_password: temp });
});

r.patch('/customers/:id', need('EDIT_CUSTOMER_DETAILS'), async (req, res) => {
  const { address_line, pincode, phone, email } = req.body ?? {};
  const c = await one('SELECT cust_id, address_line, pincode FROM customer WHERE cust_id = ?', req.params.id);
  if (!c) throw new HttpError(404, 'Customer not found');
  await prisma.$transaction(async (tx) => {
    if (address_line || pincode)
      await tx.$executeRawUnsafe('UPDATE customer SET address_line = ?, pincode = ? WHERE cust_id = ?',
        (address_line ?? c.address_line).trim(), pincode ?? c.pincode, c.cust_id);
    if (phone) await tx.$executeRawUnsafe('UPDATE customer_phone SET ph_no = ? WHERE cust_id = ? AND is_primary = TRUE',
      phone.replace(/\s/g, '').replace(/^(\d{10})$/, '+91$1'), c.cust_id);
    if (email) await tx.$executeRawUnsafe('UPDATE customer_email SET mail = ? WHERE cust_id = ? AND is_primary = TRUE', email.trim(), c.cust_id);
  });
  await audit(req.emp.emp_id, 'CUSTOMER_EDIT', 'customer', c.cust_id, 'Contact details updated');
  res.json({ ok: true });
});

// ---------- employees ----------
r.get('/employees', need('VIEW_EMPLOYEE_ROLES'), async (req, res) => {
  const w = branchWhere(req, 'e.branch_ifsc');
  res.json(await q(
    `SELECT e.emp_id, e.emp_name, e.designation, r.role_name, r.role_id, b.branch_name, e.status,
            ${d('e.join_date')} AS join_date, ${dt('e.last_login')} AS last_login,
            (SELECT mail FROM employee_email m WHERE m.emp_id = e.emp_id LIMIT 1) AS email
       FROM employee e JOIN role r ON r.role_id = e.role_id JOIN branch b ON b.ifsc_code = e.branch_ifsc
      WHERE ${w.sql} ORDER BY e.emp_id`, ...w.args));
});

r.post('/employees', need('MANAGE_EMPLOYEES'), async (req, res) => {
  const b = req.body ?? {};
  for (const k of ['branch_ifsc', 'role_id', 'emp_name', 'gender', 'dob', 'designation', 'salary', 'phone', 'email'])
    if (!String(b[k] ?? '').trim()) throw bad(`Please fill in ${k.replace(/_/g, ' ')}`);
  const temp = tempPassword();
  const hash = await bcrypt.hash(temp, 10);
  const id = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO employee (branch_ifsc, role_id, emp_name, gender, dob, designation, salary, join_date, password_hash, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?, TRUE)`,
      b.branch_ifsc, b.role_id, b.emp_name.trim(), b.gender, b.dob, b.designation.trim(), money(b.salary), hash);
    const [{ id }] = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
    await tx.$executeRawUnsafe('INSERT INTO employee_phone (emp_id, phone_no) VALUES (?, ?)', id, b.phone.replace(/\s/g, ''));
    await tx.$executeRawUnsafe('INSERT INTO employee_email (emp_id, mail) VALUES (?, ?)', id, b.email.trim());
    return Number(id);
  });
  await audit(req.emp.emp_id, 'EMPLOYEE_CREATE', 'employee', id, `Created ${b.emp_name.trim()}`);
  res.json({ emp_id: id, temp_password: temp });
});

r.patch('/employees/:id', need('MANAGE_EMPLOYEES'), async (req, res) => {
  const { role_id, status, reset_password } = req.body ?? {};
  const e = await one('SELECT emp_id, role_id, status FROM employee WHERE emp_id = ?', req.params.id);
  if (!e) throw new HttpError(404, 'Employee not found');
  if (e.emp_id === req.emp.emp_id && (status && status !== 'ACTIVE' || role_id)) throw bad('You cannot change your own role or status');
  let temp;
  if (role_id) { await exec('UPDATE employee SET role_id = ? WHERE emp_id = ?', role_id, e.emp_id);
    await audit(req.emp.emp_id, 'ROLE_CHANGE', 'employee', e.emp_id, 'Role reassigned', String(e.role_id), String(role_id)); }
  if (['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) { await exec('UPDATE employee SET status = ? WHERE emp_id = ?', status, e.emp_id);
    await audit(req.emp.emp_id, 'EMPLOYEE_STATUS', 'employee', e.emp_id, 'Status changed', e.status, status); }
  if (reset_password) { temp = tempPassword();
    await exec('UPDATE employee SET password_hash = ?, must_change_password = TRUE WHERE emp_id = ?', await bcrypt.hash(temp, 10), e.emp_id);
    await audit(req.emp.emp_id, 'PASSWORD_RESET', 'employee', e.emp_id, 'Temporary password issued'); }
  res.json({ ok: true, temp_password: temp });
});

// ---------- audit + plain-English search ----------
r.get('/audit', need('VIEW_AUDIT_LOG'), async (req, res) => {
  res.json(await q(
    `SELECT l.log_id, ${dt('l.created_at')} AS created_at, l.action, l.table_name, l.record_id,
            l.old_value, l.new_value, l.details, e.emp_name
       FROM audit_log l LEFT JOIN employee e ON e.emp_id = l.emp_id ORDER BY l.log_id DESC LIMIT 200`));
});

r.post('/search', need('USE_NL_SEARCH'), async (req, res) => {
  res.json(await naturalSearch(String(req.body?.text ?? ''), req));
});

export default r;
