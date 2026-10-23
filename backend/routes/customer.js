import { Router } from 'express';
import {
  verifyJWT,
  requireCustomer,
  requirePasswordChanged
} from '../middleware/auth.js';

import { getMyAccounts } from '../controllers/customerController.js';

const router = Router();

router.use(verifyJWT, requireCustomer, requirePasswordChanged);

router.get('/accounts', getMyAccounts);

export default router;