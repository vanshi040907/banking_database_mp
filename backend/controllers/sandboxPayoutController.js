import { getSandboxPayoutService } from '../services/sandboxPayoutStore.js';

function fail(res, error) {
  if (error.code === 'INVALID') return res.status(400).json({ error: error.message });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: error.message });
  if (error.code === 'CONFLICT') return res.status(409).json({ error: error.message });
  return res.status(503).json({ error: 'Sandbox service unavailable. Check the setup and try status lookup before submitting again.' });
}
export async function createSandboxPayout(req, res) {
  try { const result = await getSandboxPayoutService().create(req.user.id, req.body); res.status(202).json(result); }
  catch (error) { fail(res, error); }
}
export async function getSandboxPayout(req, res) {
  try { res.json(await getSandboxPayoutService().refresh(req.user.id, req.params.id)); }
  catch (error) { fail(res, error); }
}
