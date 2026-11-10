import { Router, raw } from 'express';
import { validWebhookSignature } from '../services/razorpayWebhook.js';
import { reconcileTestPayoutByReference } from '../services/razorpayPayoutService.js';
const router = Router();
router.post('/', raw({ type:'application/json', limit:'128kb' }), async (req, res) => {
  if (process.env.RAZORPAYX_TEST_ENABLED !== 'true' || !process.env.RAZORPAYX_WEBHOOK_SECRET) return res.sendStatus(503);
  if (!validWebhookSignature(req.body, req.get('X-Razorpay-Signature'), process.env.RAZORPAYX_WEBHOOK_SECRET)) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  if (typeof event?.event !== 'string' || !event.event.startsWith('payout.')) return res.sendStatus(200);
  const payout = event.payload?.payout?.entity;
  if (!payout?.id || !payout?.reference_id) return res.sendStatus(400);
  try { await reconcileTestPayoutByReference(payout.reference_id, payout.id); return res.sendStatus(200); }
  catch { return res.sendStatus(503); }
});
export default router;
