import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import { loadEmployeeScope } from '../middleware/branchScope.js';

import {
  requireStaffAccess,
  getStaffOptions,
  listStaff,
  getStaffMember,
  createStaffMember,
  updateStaffAccess
} from '../controllers/staffController.js';

const router = Router();

router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  loadEmployeeScope,
  requireStaffAccess
);

router.get('/options', getStaffOptions);
router.get('/', listStaff);

router.post(
  '/',
  requirePermission('MANAGE_EMPLOYEES'),
  createStaffMember
);

router.patch(
  '/:employeeId/access',
  requirePermission('MANAGE_EMPLOYEES'),
  updateStaffAccess
);

router.get('/:employeeId', getStaffMember);

export default router;