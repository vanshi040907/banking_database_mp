
import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import {
  createFixedDeposit,
  matureFixedDeposit
} from '../controllers/fixedDepositController.js';

const router = Router();

// All FD management routes require employee login
router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged
);

// Create a Fixed Deposit
// POST /api/employee/fixed-deposits
router.post(
  '/',
  requirePermission('MANAGE_FD'),
  createFixedDeposit
);

// Process FD maturity
// POST /api/employee/fixed-deposits/:fdId/mature
router.post(
  '/:fdId/mature',
  requirePermission('MANAGE_FD'),
  matureFixedDeposit
);

export default router;
