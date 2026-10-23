import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

// reads "Authorization: Bearer <token>" and sets req.user
export function verifyJWT(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (claims.purpose) return res.status(401).json({ error: 'Invalid token' }); // OTP token is not a login token
    req.user = { type: claims.type, id: claims.id };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export const requireCustomer = (req, res, next) =>
  req.user?.type === 'CUSTOMER' ? next() : res.status(403).json({ error: 'Customers only' });

export const requireEmployee = (req, res, next) =>
  req.user?.type === 'EMPLOYEE' ? next() : res.status(403).json({ error: 'Employees only' });

// asks the database function fn_has_permission, so the rule lives in ONE place
export const requirePermission = (code) => async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`SELECT fn_has_permission(${req.user.id}, ${code}) AS ok`;
    if (Number(rows[0].ok) === 1) return next();
    res.status(403).json({ error: 'You do not have permission for this action' });
  } catch (err) {
    next(err);
  }
};

export async function requirePasswordChanged(req, res, next) {
  try {
    const isCustomer = req.user?.type === 'CUSTOMER';
    const isEmployee = req.user?.type === 'EMPLOYEE';

    if (!isCustomer && !isEmployee) {
      return res.status(401).json({ error: 'Invalid user type' });
    }

    const user = isCustomer
      ? await prisma.customer.findUnique({
          where: { cust_id: req.user.id }
        })
      : await prisma.employee.findUnique({
          where: { emp_id: req.user.id }
        });

    if (!user || user.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Account is not active'
      });
    }

    if (user.must_change_password) {
      return res.status(403).json({
        error: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}