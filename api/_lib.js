const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}
const db = admin.database();

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// Verifies Telegram WebApp initData (HMAC-SHA256 with the bot token). Returns the Telegram user or null.
function verifyInitData(initData) {
  if (!initData || !process.env.BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const calc = Buffer.from(crypto.createHmac('sha256', secret).update(check).digest('hex'));
  const given = Buffer.from(hash);
  if (calc.length !== given.length || !crypto.timingSafeEqual(calc, given)) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400) return null; // reject stale sessions
  try { return JSON.parse(params.get('user')); } catch { return null; }
}

// Best-effort per-instance rate limit (use Upstash/Vercel KV later for a global limit).
const hits = new Map();
function rateLimit(uid, max = 60, windowMs = 60000) {
  const now = Date.now();
  const arr = (hits.get(uid) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(uid, arr);
  if (arr.length > max) fail(429, 'Too many requests. Wait a minute and try again.');
}

async function ensureUser(user) {
  const ref = db.ref(`users/${user.id}`);
  await ref.transaction(cur => cur || {
    name: [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 60) || 'Publisher',
    username: user.username || '', balance: 0, earnings: 0, impressions: 0, clicks: 0, createdAt: Date.now()
  });
}

// route({ GET: fn, POST: fn }) -> Vercel handler. fn(req, uid, user) returns JSON-serialisable data.
const route = (handlers) => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const fn = handlers[req.method];
    if (!fn) fail(405, 'Method not allowed');
    const user = verifyInitData(req.headers['x-telegram-init-data']);
    if (!user) fail(401, 'Open this app from Telegram.');
    const uid = String(user.id);
    rateLimit(uid);
    await ensureUser(user);
    res.status(200).json(await fn(req, uid, user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Server error. Try again later.' });
  }
};

const list = async (path, limit = 100) => {
  const snap = await db.ref(path).limitToLast(limit).once('value');
  const out = []; snap.forEach(c => { out.push({ id: c.key, ...c.val() }); });
  return out.reverse();
};
const text = (v, min, max, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) fail(400, `${label} must be ${min}-${max} characters.`);
  return s;
};

module.exports = { db, route, list, text, fail };
