import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import { loadEmployeeScope } from '../middleware/branchScope.js';

import {
  getTransactionFilters,
  listEmployeeTransactions
} from '../controllers/transactionController.js';

const router = Router();

router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission('VIEW_ALL_TRANSACTIONS'),
  loadEmployeeScope
);

router.get('/filters', getTransactionFilters);
router.get('/', listEmployeeTransactions);

export default router;