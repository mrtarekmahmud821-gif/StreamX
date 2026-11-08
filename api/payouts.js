const { db, route, list, text, fail } = require('./_lib');
const METHODS = ['USDT (TRC20)', 'USDT (BEP20)', 'bKash', 'Nagad'], MIN = 5;
module.exports = route({
  GET: async (req, uid) => (await list(`payouts/${uid}`)).map(p => ({ date: p.date, amount: p.amount, method: p.method, status: p.status })),
  POST: async (req, uid) => {
    const b = req.body || {};
    const amount = Math.round(Number(b.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < MIN) fail(400, `Minimum payout is $${MIN}.`);
    if (!METHODS.includes(b.method)) fail(400, 'Invalid payout method.');
    const account = text(b.account, 6, 120, 'Account');
    if (!/^[\w.@:+\- ]+$/.test(account)) fail(400, 'Account contains invalid characters.');
    const pending = (await list(`payouts/${uid}`, 20)).filter(p => p.status === 'pending');
    if (pending.length >= 3) fail(429, 'You already have 3 pending payouts.');

    // Atomic deduction: the balance can never go negative, even with parallel requests.
    const tx = await db.ref(`users/${uid}/balance`).transaction(cur => ((cur || 0) >= amount ? Math.round(((cur || 0) - amount) * 1e6) / 1e6 : undefined));
    if (!tx.committed) fail(400, 'Not enough balance.');
    const payout = { amount, method: b.method, account, status: 'pending', date: new Date().toISOString().slice(0, 10), createdAt: Date.now() };
    try { await db.ref(`payouts/${uid}`).push(payout); }
    catch (e) { await db.ref(`users/${uid}/balance`).transaction(c => (c || 0) + amount); throw e; } // refund on failure
    return { date: payout.date, amount, method: payout.method, status: payout.status };
  }
});
