const { safeEqual } = require('../../src/middleware/auth');
const { releaseAllDue } = require('../../src/services/wallet');
module.exports = async (req, res) => { // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  if (!safeEqual(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) return res.status(401).json({ error: 'Unauthorized' });
  try { res.status(200).json(await releaseAllDue()); } catch (e) { console.error('cron error:', e.code || e.name); res.status(500).json({ error: 'Server error' }); }
};
