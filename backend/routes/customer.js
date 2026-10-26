import { Router } from 'express';
import {
  verifyJWT,
  requireCustomer,
  requirePasswordChanged
} from '../middleware/auth.js';

import { getMyAccounts, getAccountTransactions } from '../controllers/customerController.js';
import { createTransfer } from '../controllers/transferController.js';

const router = Router();

router.use(verifyJWT, requireCustomer, requirePasswordChanged);

router.get('/accounts', getMyAccounts);
router.get('/accounts/:accNo/transactions', getAccountTransactions);
router.post('/transfers', createTransfer);
export default router;