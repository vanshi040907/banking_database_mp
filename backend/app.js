import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { prisma } from './db.js';

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

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));