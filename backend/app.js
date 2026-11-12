import 'dotenv/config';
import cardRouter from './routes/card.js';
import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import { verifyJWT, requireEmployee, requirePermission, requirePasswordChanged} from './middleware/auth.js';
import customerRouter from './routes/customer.js';
// account numbers are BigInt; JSON can't send BigInt unless we convert it
BigInt.prototype.toJSON = function () { return this.toString(); };

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
app.get('/api/me', verifyJWT, requirePasswordChanged, (req, res) => res.json(req.user));

app.use('/api/customer', customerRouter); 
app.use('/api/employee/cards', cardRouter);
app.get('/api/test/freeze-permission', verifyJWT, requireEmployee, requirePasswordChanged,
  requirePermission('FREEZE_ACCOUNT'), (req, res) => res.json({ allowed: true }));

// last: catches any error thrown inside a route
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));