import { Router } from 'express';
import {
  verifyJWT,
  requireCustomer,
  requirePasswordChanged
} from '../middleware/auth.js';

import { getMyAccounts, getAccountTransactions } from '../controllers/customerController.js';
import {
  getMyCards,
  getCardDetails,
  blockMyCard
} from '../controllers/cardController.js';
import { createTransfer } from '../controllers/transferController.js';
import { setupTransactionPin, changeTransactionPin} from '../controllers/transactionPinController.js';
import { pinRateLimiter } from '../middleware/pinRateLimiter.js';

import {
  getMyLoans,
  getLoanDetails,
  getLoanEmis,
  getLoanPayments,
  applyForLoan,
  payLoanEmi
} from '../controllers/loanController.js';



import {
  getMyDeposits
} from '../controllers/depositController.js';
const router = Router();

import {
  getMyFixedDeposits,
  getFixedDepositDetails,
  getFdPayouts
} from '../controllers/fixedDepositController.js'; 

router.use(verifyJWT, requireCustomer, requirePasswordChanged);

router.get('/deposits', getMyDeposits);
// --------------------------------------------
// CUSTOMER FIXED DEPOSIT ROUTES
// --------------------------------------------

// List all Fixed Deposits belonging to customer
router.get(
  '/fixed-deposits',
  getMyFixedDeposits
);

// View details of a particular FD
router.get(
  '/fixed-deposits/:fdId',
  getFixedDepositDetails
);

// View FD payout history
router.get(
  '/fixed-deposits/:fdId/payouts',
  getFdPayouts
);

// ------------------------------------------
// CUSTOMER LOAN ROUTES
// ------------------------------------------

// List all loans belonging to the customer
router.get('/loans', getMyLoans);

// Submit a new loan application
router.post('/loans', applyForLoan);

// Get details of a specific loan
router.get('/loans/:loanId', getLoanDetails);

// View EMI repayment schedule
router.get('/loans/:loanId/emis', getLoanEmis);

// View EMI payment history
router.get('/loans/:loanId/payments', getLoanPayments);

// Pay an EMI for a loan
router.post('/loans/:loanId/pay-emi', payLoanEmi);

router.get('/accounts', getMyAccounts);
router.get('/cards', getMyCards);
router.get('/cards/:cardId', getCardDetails);
router.patch('/cards/:cardId/block', blockMyCard);
router.get('/accounts/:accNo/transactions', getAccountTransactions);
router.post('/transfers', pinRateLimiter, createTransfer);
router.post('/accounts/:accNo/pin/setup', pinRateLimiter, setupTransactionPin);
router.post('/accounts/:accNo/pin/change', pinRateLimiter, changeTransactionPin);
export default router;