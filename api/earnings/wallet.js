const bcrypt = require('bcryptjs');
const { db, FieldValue } = require('./firebase');
const { LOCK_DAYS, DAY_MS, MAX_OPEN_WITHDRAWALS } = require('../config/constants');
const { splitRevenue, withdrawalQuote, usd } = require('../utils/money');
const { fail } = require('../utils/errors');
const inc = (n) => FieldValue.increment(n);
const W = (uid) => db.collection('wallets').doc(uid);
const L = db.collection('walletLedger');

/* Wallet fields: pending = locked earnings, available = withdrawable, held = in open withdrawals, withdrawn = paid out.
   Every change to them is written together with a walletLedger entry inside ONE Firestore transaction. */

// Credit CONFIRMED network revenue for one publisher/day/ad unit. Idempotent: calling again with a corrected total posts only the difference.
async function creditEarning({ uid, date, source, provider, refKey, grossMicro }) {
  const { publisher, platform } = splitRevenue(grossMicro);
  const id = `earn_${uid}_${date}_${provider}_${refKey}`, ref = L.doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref), now = Date.now();
    if (!snap.exists) {
      tx.set(ref, { publisherId: uid, type: 'EARNING', amount: publisher, platformCut: platform, grossMicro, currency: 'USD', source, provider, refId: refKey, earnedDate: date, status: 'locked', createdAt: now, releaseAt: now + LOCK_DAYS * DAY_MS });
      tx.set(W(uid), { pending: inc(publisher), lifetime: inc(publisher) }, { merge: true });
      return;
    }
    const cur = snap.data(), delta = publisher - cur.amount; if (!delta) return;
    tx.update(ref, { amount: publisher, platformCut: platform, grossMicro });
    if (cur.status === 'locked') tx.set(W(uid), { pending: inc(delta), lifetime: inc(delta) }, { merge: true });
    else { // already released: post an adjustment against available
      tx.set(L.doc(`${id}_adj_${now}`), { publisherId: uid, type: 'ADJUSTMENT', amount: delta, currency: 'USD', source, provider, refId: id, status: 'released', createdAt: now });
      tx.set(W(uid), { available: inc(delta), lifetime: inc(delta) }, { merge: true });
    }
  });
}

async function releaseOne(ref) {
  return db.runTransaction(async tx => {
    const s = await tx.get(ref); if (!s.exists) return false;
    const e = s.data(); if (e.status !== 'locked' || e.releaseAt > Date.now()) return false; // re-check: safe against parallel runs
    tx.update(ref, { status: 'released', releasedAt: Date.now() });
    tx.set(W(e.publisherId), { pending: inc(-e.amount), available: inc(e.amount) }, { merge: true });
    return true;
  });
}
async function releaseDue(uid, limit = 200) { // called before every wallet read / withdrawal, so release is exact to the minute
  const q = await L.where('publisherId', '==', uid).where('status', '==', 'locked').where('releaseAt', '<=', Date.now()).limit(limit).get();
  let n = 0; for (const d of q.docs) if (await releaseOne(d.ref)) n++; return n;
}
async function releaseAllDue(limit = 300) { // cron sweep for all publishers
  const q = await L.where('status', '==', 'locked').where('releaseAt', '<=', Date.now()).orderBy('releaseAt').limit(limit).get();
  let n = 0; for (const d of q.docs) if (await releaseOne(d.ref)) n++; return { scanned: q.size, released: n };
}

async function getWallet(uid) {
  await releaseDue(uid);
  const [w, led] = await Promise.all([W(uid).get(), L.where('publisherId', '==', uid).orderBy('createdAt', 'desc').limit(30).get()]);
  const v = w.data() || {};
  return {
    available: usd(v.available), pending: usd(v.pending), held: usd(v.held), withdrawn: usd(v.withdrawn), lifetime: usd(v.lifetime),
    ledger: led.docs.map(d => { const e = d.data(); return { type: e.type, amount: usd(e.amount), status: e.status, date: e.createdAt, releaseAt: e.releaseAt || null }; })
  };
}

async function checkPassword(uid, password) {
  const ref = db.collection('publisherProfiles').doc(uid), p = (await ref.get()).data() || {};
  if (!p.withdrawPasswordHash) fail(403, 'Set a withdrawal password in My Profile first.');
  if (p.pwLockUntil > Date.now()) fail(429, 'Too many wrong passwords. Try again in 15 minutes.');
  if (!(await bcrypt.compare(String(password || ''), p.withdrawPasswordHash))) {
    const fails = (p.pwFails || 0) + 1;
    await ref.set(fails >= 5 ? { pwFails: 0, pwLockUntil: Date.now() + 15 * 60000 } : { pwFails: fails }, { merge: true });
    fail(403, 'Wrong withdrawal password.');
  }
  if (p.pwFails) await ref.set({ pwFails: 0 }, { merge: true });
}

async function requestWithdrawal({ uid, amountCents, address, password, key }) {
  if (!/^[A-Za-z0-9-]{16,64}$/.test(String(key || ''))) fail(400, 'Invalid request key.');
  const q = withdrawalQuote(amountCents);
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(address || ''))) fail(400, 'Enter a valid BEP20 (0x…) wallet address.');
  const wdRef = db.collection('withdrawals').doc(`wd_${uid}_${key}`);
  if ((await wdRef.get()).exists) return { duplicate: true };           // same request key = same request, never pays twice
  await checkPassword(uid, password);
  const open = await db.collection('withdrawals').where('publisherId', '==', uid).where('status', 'in', ['pending', 'processing']).limit(MAX_OPEN_WITHDRAWALS).get();
  if (open.size >= MAX_OPEN_WITHDRAWALS) fail(429, 'You already have 3 open withdrawals.');
  await releaseDue(uid);
  await db.runTransaction(async tx => {
    const [w, again] = await Promise.all([tx.get(W(uid)), tx.get(wdRef)]);
    if (again.exists) return;
    if (((w.data() || {}).available || 0) < q.grossMicro) fail(400, 'Not enough available balance.'); // locked earnings cannot be withdrawn
    const now = Date.now();
    tx.set(wdRef, { publisherId: uid, ...q, address, network: 'BEP20', currency: 'USDT', status: 'pending', createdAt: now });
    tx.set(L.doc(`${wdRef.id}_hold`), { publisherId: uid, type: 'WITHDRAW_HOLD', amount: -q.grossMicro, currency: 'USD', source: 'withdrawal', refId: wdRef.id, status: 'held', createdAt: now });
    tx.set(W(uid), { available: inc(-q.grossMicro), held: inc(q.grossMicro) }, { merge: true });
  });
  return { ok: true, fee: usd(q.feeMicro), net: usd(q.netMicro) };
}

async function listWithdrawals(uid) {
  const s = await db.collection('withdrawals').where('publisherId', '==', uid).orderBy('createdAt', 'desc').limit(50).get();
  return s.docs.map(d => { const x = d.data(); return { date: new Date(x.createdAt).toISOString().slice(0, 10), amount: usd(x.grossMicro), fee: usd(x.feeMicro), net: usd(x.netMicro), status: x.status, txHash: x.txHash || null }; });
}

// Operator actions (called only from the secret-protected operator endpoint)
async function settleWithdrawal({ withdrawalId, action, txHash, reason }) {
  const ref = db.collection('withdrawals').doc(String(withdrawalId));
  await db.runTransaction(async tx => {
    const s = await tx.get(ref); if (!s.exists) fail(404, 'Withdrawal not found.');
    const x = s.data(), now = Date.now(), open = ['pending', 'processing'].includes(x.status);
    if (!open) fail(409, 'Withdrawal is already finalised.');
    if (action === 'processing') { if (x.status !== 'pending') fail(409, 'Not pending.'); tx.update(ref, { status: 'processing', updatedAt: now }); return; }
    if (action === 'paid') {
      if (!/^0x[a-fA-F0-9]{64}$/.test(String(txHash || ''))) fail(400, 'A valid transaction hash is required.');
      tx.update(ref, { status: 'paid', txHash, paidAt: now });
      tx.set(L.doc(`${ref.id}_paid`), { publisherId: x.publisherId, type: 'WITHDRAW_PAID', amount: x.grossMicro, currency: 'USD', source: 'withdrawal', refId: ref.id, status: 'settled', createdAt: now });
      tx.set(W(x.publisherId), { held: inc(-x.grossMicro), withdrawn: inc(x.grossMicro) }, { merge: true });
    } else if (action === 'rejected') {
      tx.update(ref, { status: 'rejected', reason: String(reason || '').slice(0, 200), rejectedAt: now });
      tx.set(L.doc(`${ref.id}_refund`), { publisherId: x.publisherId, type: 'WITHDRAW_REFUND', amount: x.grossMicro, currency: 'USD', source: 'withdrawal', refId: ref.id, status: 'released', createdAt: now });
      tx.set(W(x.publisherId), { held: inc(-x.grossMicro), available: inc(x.grossMicro) }, { merge: true }); // hold returns to available
    } else fail(400, 'Unknown action.');
    tx.set(db.collection('auditLogs').doc(), { actor: 'operator', action, withdrawalId: ref.id, publisherId: x.publisherId, at: now });
  });
}
module.exports = { creditEarning, releaseDue, releaseAllDue, getWallet, requestWithdrawal, listWithdrawals, settleWithdrawal, checkPassword };
