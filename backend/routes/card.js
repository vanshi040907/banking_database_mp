
import { Router } from 'express';

import {
  verifyJWT,
  requireEmployee,
  requirePasswordChanged,
  requirePermission
} from '../middleware/auth.js';

import {
  issueCard,
  updateCardLimit
} from '../controllers/cardIssuanceController.js';

import {
  listUnblockRequests,
  reviewUnblockRequest
} from '../controllers/cardUnblockController.js';

const router = Router();

router.use(
  verifyJWT,
  requireEmployee,
  requirePasswordChanged
);

router.get(
  '/unblock-requests',
  requirePermission('UNBLOCK_CARD'),
  listUnblockRequests
);

router.patch(
  '/unblock-requests/:requestId',
  requirePermission('UNBLOCK_CARD'),
  reviewUnblockRequest
);

router.post(
  '/',
  requirePermission('ISSUE_CARD'),
  issueCard
);

router.patch(
  '/:cardId/limit',
  requirePermission('UPDATE_CARD_LIMIT'),
  updateCardLimit
);

export default router;
