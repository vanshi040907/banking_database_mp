import { Router } from 'express';
import { createTestPayout, getTestPayout, listTestPayouts } from '../services/razorpayPayoutService.js';
import { PinError } from '../services/transactionPinService.js';
import { pinRateLimiter } from '../middleware/pinRateLimiter.js';
const router=Router();
router.post('/',pinRateLimiter,async (req,res,next)=>{
  try { res.status(202).json(await createTestPayout(req.user.id,req.body)); }
  catch(e) { if (e instanceof PinError) return res.status(422).json({error:e.message}); if (e.status) return res.status(e.status).json({error:e.message}); if (e.message?.startsWith('Check ') || e.message?.startsWith('Amount must')) return res.status(400).json({error:e.message}); next(e); }
});
router.get('/',async (req,res,next)=>{ try { res.json({payouts:await listTestPayouts(req.user.id)}); } catch(e) { next(e); } });
router.get('/:id',async (req,res,next)=>{ try { res.json(await getTestPayout(req.user.id,req.params.id,req.query.refresh === 'true')); } catch(e) { if (e.status) return res.status(e.status).json({error:e.message}); next(e); } });
export default router;
