import jwt from 'jsonwebtoken';
import { HttpError, q, one } from './util.js';

function token(req) {
  const h = req.headers.authorization ?? '';
  try { return jwt.verify(h.replace(/^Bearer /, ''), process.env.JWT_SECRET); }
  catch { throw new HttpError(401, 'Please sign in again'); }
}

export async function requireCustomer(req, res, next) {
  const t = token(req);
  if (t.kind !== 'customer') throw new HttpError(403, 'Not a customer session');
  const c = await one("SELECT cust_id, name FROM customer WHERE cust_id = ? AND status = 'ACTIVE'", t.sub);
  if (!c) throw new HttpError(401, 'Please sign in again');
  req.cust = c;
  next();
}

export async function requireStaff(req, res, next) {
  const t = token(req);
  if (t.kind !== 'employee') throw new HttpError(403, 'Not a staff session');
  const e = await one(
    `SELECT e.emp_id, e.emp_name, e.designation, e.branch_ifsc, b.branch_name, r.role_name
       FROM employee e JOIN role r ON r.role_id = e.role_id JOIN branch b ON b.ifsc_code = e.branch_ifsc
      WHERE e.emp_id = ? AND e.status = 'ACTIVE'`, t.sub);
  if (!e) throw new HttpError(401, 'Please sign in again');
  const perms = await q(
    `SELECT p.perm_code FROM employee e JOIN role_permission rp ON rp.role_id = e.role_id
       JOIN permission p ON p.perm_id = rp.perm_id WHERE e.emp_id = ?`, e.emp_id);
  req.emp = e;
  req.perms = new Set(perms.map((p) => p.perm_code));
  req.allBranches = req.perms.has('ACCESS_ALL_BRANCHES');
  next();
}

export const need = (...codes) => (req, res, next) => {
  if (!codes.some((c) => req.perms.has(c))) throw new HttpError(403, 'Your role does not allow this');
  next();
};

// SQL fragment limiting rows to the employee's branch unless they may see all
export const branchWhere = (req, col) =>
  req.allBranches ? { sql: '1=1', args: [] } : { sql: `${col} = ?`, args: [req.emp.branch_ifsc] };
