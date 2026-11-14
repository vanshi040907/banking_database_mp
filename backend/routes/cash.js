import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged
} from '../middleware/auth.js';

import { loadEmployeeScope } from '../middleware/branchScope.js';

import {
  requireCashAccess,
  getCashAccount,
  createCashOperation,
  getRecentCash
} from '../controllers/cashController.js';

const router = Router();

router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  loadEmployeeScope,
  requireCashAccess
);

router.get('/accounts/:accNo', getCashAccount);
router.get('/recent', getRecentCash);
router.post('/operations', createCashOperation);

export default router;