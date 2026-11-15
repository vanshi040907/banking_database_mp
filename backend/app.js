import 'dotenv/config';

import loanRouter from './routes/loan.js';
import cardRouter from './routes/card.js';
import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import { verifyJWT, requireEmployee, requirePermission, requirePasswordChanged} from './middleware/auth.js';
import customerRouter from './routes/customer.js';

import depositRouter from './routes/deposit.js';
import fixedDepositRouter from './routes/fixedDeposit.js';

// account numbers are BigInt; JSON can't send BigInt unless we convert it
BigInt.prototype.toJSON = function () { return this.toString(); };
import { getSession } from './controllers/sessionController.js';
import employeeRouter from './routes/employee.js';
import accountRouter from './routes/account.js';
import cashRouter from './routes/cash.js';
import transactionRouter from './routes/transaction.js';
import staffRouter from './routes/staff.js';
import auditRouter from './routes/audit.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const branches = await prisma.branch.findMany();
    res.json({ status: 'ok', branches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// rate limit: max 30 auth requests per 15 minutes per IP
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), authRouter);

// two temporary routes to test the checks
app.get(
  '/api/me',
  verifyJWT,
  requirePasswordChanged,
  getSession
);

app.get('/api/test/freeze-permission', verifyJWT, requireEmployee, requirePasswordChanged,
  requirePermission('FREEZE_ACCOUNT'), (req, res) => res.json({ allowed: true }));

app.use('/api/customer', customerRouter); 
app.use('/api/employee/cards', cardRouter);
app.use('/api/employee/accounts', accountRouter);
app.use('/api/employee/cash', cashRouter);
app.use('/api/employee/transactions', transactionRouter);
app.use('/api/employee/staff', staffRouter);
app.use('/api/employee/audit', auditRouter);
app.use('/api/employee/loans', loanRouter);
app.use('/api/employee/deposits', depositRouter);
app.use('/api/employee/fixed-deposits', fixedDepositRouter);
app.use('/api/employee', employeeRouter);

// last: catches any error thrown inside a route
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));