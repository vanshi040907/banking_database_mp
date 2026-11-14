import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import { loadEmployeeScope } from '../middleware/branchScope.js';

import {
  getAccountOpeningOptions,
  getCustomerAccounts,
  createEmployeeAccount
} from '../controllers/accountController.js';

import {
  getAccountFilters,
  listEmployeeAccounts,
  getEmployeeAccount,
  getEmployeeAccountTransactions,
  setEmployeeAccountStatus,
  closeEmployeeAccount
} from '../controllers/employeeAccountManagementController.js';

const router = Router();

router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  loadEmployeeScope
);

router.get(
  '/options',
  requirePermission('OPEN_ACCOUNT'),
  getAccountOpeningOptions
);

router.get(
  '/filters',
  requirePermission('VIEW_ACCOUNTS'),
  getAccountFilters
);

router.get(
  '/customer/:customerId',
  requirePermission('VIEW_ACCOUNTS'),
  getCustomerAccounts
);

router.get(
  '/',
  requirePermission('VIEW_ACCOUNTS'),
  listEmployeeAccounts
);

router.post(
  '/',
  requirePermission('OPEN_ACCOUNT'),
  createEmployeeAccount
);

router.get(
  '/:accNo/transactions',
  requirePermission('VIEW_ACCOUNTS'),
  requirePermission('VIEW_ALL_TRANSACTIONS'),
  getEmployeeAccountTransactions
);

router.patch(
  '/:accNo/status',
  requirePermission('FREEZE_ACCOUNT'),
  setEmployeeAccountStatus
);

router.patch(
  '/:accNo/close',
  requirePermission('CLOSE_ACCOUNT'),
  closeEmployeeAccount
);

router.get(
  '/:accNo',
  requirePermission('VIEW_ACCOUNTS'),
  getEmployeeAccount
);

export default router;