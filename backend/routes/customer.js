import { Router } from 'express';
import razorpayTestPayouts from './razorpayTestPayouts.js';
import {
  verifyJWT,
  requireCustomer,
  requirePasswordChanged
} from '../middleware/auth.js';

import { getMyAccounts, getAccountTransactions } from '../controllers/customerController.js';
import { createTransfer } from '../controllers/transferController.js';
import { setupTransactionPin, changeTransactionPin} from '../controllers/transactionPinController.js';
import { pinRateLimiter } from '../middleware/pinRateLimiter.js';

const router = Router();

router.use(verifyJWT, requireCustomer, requirePasswordChanged);

router.use('/test-upi-payouts', razorpayTestPayouts);
router.get('/accounts', getMyAccounts);
router.get('/accounts/:accNo/transactions', getAccountTransactions);
router.post('/transfers', pinRateLimiter, createTransfer);
router.post('/accounts/:accNo/pin/setup', pinRateLimiter, setupTransactionPin);
router.post('/accounts/:accNo/pin/change', pinRateLimiter, changeTransactionPin);
export default router;
