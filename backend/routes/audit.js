import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import { loadEmployeeScope } from '../middleware/branchScope.js';

import {
  getAuditFilters,
  listAuditEntries
} from '../controllers/auditController.js';

const router = Router();

router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission('VIEW_AUDIT_LOG'),
  loadEmployeeScope
);

router.get('/filters', getAuditFilters);
router.get('/', listAuditEntries);

export default router;