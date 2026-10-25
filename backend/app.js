import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';
import { dbMessage, HttpError } from './lib/util.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import staffRoutes from './routes/staff.js';

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

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/staff', staffRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// every error leaves as { error: "message" }
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  const msg = dbMessage(err) ?? err?.message ?? '';
  if (/Duplicate entry/.test(msg)) return res.status(400).json({ error: 'That value is already registered to someone else' });
  if (/foreign key constraint/i.test(msg)) return res.status(400).json({ error: 'One of the selected values is not valid. Please check the pincode, branch and role.' });
  if (dbMessage(err)) return res.status(400).json({ error: dbMessage(err) });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
