// Manual payout workflow. Not for publishers: protected by OPERATOR_SECRET (call from your own admin tool / curl).
const { safeEqual } = require('../../src/middleware/auth');
const { settleWithdrawal } = require('../../src/services/wallet');
const { HttpError } = require('../../src/utils/errors');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!safeEqual(req.headers['x-operator-secret'], process.env.OPERATOR_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  try { const b = req.body || {}; await settleWithdrawal({ withdrawalId: b.withdrawalId, action: b.action, txHash: b.txHash, reason: b.reason }); res.status(200).json({ ok: true }); }
  catch (e) { if (e instanceof HttpError) return res.status(e.status).json({ error: e.message }); console.error('operator error:', e.code || e.name); res.status(500).json({ error: 'Server error' }); }
};
