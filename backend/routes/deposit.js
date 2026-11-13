
import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import {
  createCashDeposit,
  getBranchDeposits,
  getDepositReceipt,
  getBranchDepositSummary
} from '../controllers/depositController.js';

const router = Router();

// Require employee authentication for all deposit APIs
router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged
);

// Process a cash deposit
// POST /api/employee/deposits
router.post(
  '/',
  requirePermission('CASH_DEPOSIT'),
  createCashDeposit
);

// View deposit history for employee's branch
// GET /api/employee/deposits
router.get(
  '/',
  requirePermission('CASH_DEPOSIT'),
  getBranchDeposits
);

// View branch cash deposit summary
// IMPORTANT: Register /summary before /:transId
router.get(
  '/summary',
  requirePermission('CASH_DEPOSIT'),
  getBranchDepositSummary
);

// View an individual deposit receipt
// GET /api/employee/deposits/:transId
router.get(
  '/:transId',
  requirePermission('CASH_DEPOSIT'),
  getDepositReceipt
);

export default router;
