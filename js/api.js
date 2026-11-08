// API layer. Frontend never talks to Firebase directly - only to your Vercel backend (/api/*).
// The backend verifies Telegram initData, reads secrets from Vercel env vars, and talks to Firebase Admin SDK.
// While the backend does not exist yet, calls fall back to demo data so the UI works.
const API_BASE = '/api';
const tg = window.Telegram && Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const demo = {
  dash: { balance: 0, earnings: 0, impressions: 0, clicks: 0, series: [0, 0, 0, 0, 0, 0, 0] },
  links: [], sites: [], placements: [], stats: { impressions: 0, clicks: 0, days: [] }, payouts: [],
  me: { name: 'Publisher', id: '—', username: '' }
};
const demoRoutes = {
  'GET /dashboard': () => demo.dash,
  'GET /links': () => demo.links,
  'POST /links': (b) => { const l = { id: Date.now(), name: 'Smart link ' + (demo.links.length + 1), url: location.origin + '/s/' + Math.random().toString(36).slice(2, 8) }; demo.links.push(l); return l; },
  'GET /sites': () => demo.sites,
  'POST /sites': (b) => { const s = { url: b.url, status: 'pending' }; demo.sites.push(s); return s; },
  'GET /placements': () => demo.placements,
  'POST /placements': (b) => { const p = { name: b.name, status: 'active', type: b.type, format: b.format, impressions: 0, revenue: 0 }; demo.placements.push(p); return p; },
  'GET /stats': () => demo.stats,
  'GET /payouts': () => demo.payouts,
  'POST /payouts': (b) => { const p = { ...b, status: 'pending', date: new Date().toISOString().slice(0, 10) }; demo.payouts.unshift(p); return p; },
  'GET /me': () => demo.me
};

async function api(method, path, body) {
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg ? tg.initData : '' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
    return await res.json();
  } catch (e) {
    if (e instanceof TypeError || /Unexpected token|JSON/.test(e.message)) {
      const fn = demoRoutes[method + ' ' + path];
      if (fn) { api.demo = true; await new Promise(r => setTimeout(r, 350)); return fn(body); }
    }
    throw e;
  }
}
