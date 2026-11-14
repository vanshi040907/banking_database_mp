
import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import {
  createEmiSchedule,
  disburseLoan
} from '../controllers/employeeLoanController.js';

const router = Router();

// All employee loan endpoints require authentication
router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged
);

// Generate an EMI repayment schedule
// POST /api/employee/loans/:loanId/schedule
router.post(
  '/:loanId/schedule',
  requirePermission('APPROVE_LOAN'),
  createEmiSchedule
);

// Approve and disburse a loan
// POST /api/employee/loans/:loanId/disburse
router.post(
  '/:loanId/disburse',
  requirePermission('APPROVE_LOAN'),
  disburseLoan
);

export default router;
