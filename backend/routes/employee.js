import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import { loadEmployeeScope } from '../middleware/branchScope.js';

import {
  getCustomerOptions,
  listCustomers,
  getCustomer,
  registerCustomer,
  updateCustomerContacts,
  reviewCustomerKyc
} from '../controllers/employeeCustomerController.js';

const router = Router();

router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission('VIEW_PERSONAL_INFO'),
  loadEmployeeScope
);

router.get('/customer-options', getCustomerOptions);

router.get('/customers', listCustomers);
router.get('/customers/:customerId', getCustomer);

router.post(
  '/customers',
  requirePermission('REGISTER_CUSTOMER'),
  registerCustomer
);

router.patch(
  '/customers/:customerId/contacts',
  requirePermission('EDIT_CUSTOMER_DETAILS'),
  updateCustomerContacts
);

router.patch(
  '/customers/:customerId/kyc',
  requirePermission('REGISTER_CUSTOMER'),
  reviewCustomerKyc
);

export default router;