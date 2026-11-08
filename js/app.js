const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toFixed(4);
const I = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  dashboard: I('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  links: I('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  sites: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  apps: I('<path d="M3 11v2l12 5V6zM15 8a4 4 0 0 1 0 8M6 14l1 6h3l-1-5"/>'),
  stats: I('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  withdraw: I('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>'),
  profile: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')
};
const ROUTES = [
  ['dashboard', 'Dashboard'], ['links', 'Direct Links'], ['sites', 'My Websites'],
  ['apps', 'Telegram Apps'], ['stats', 'Statistics'], ['withdraw', 'Withdraw'], ['profile', 'My Profile']
];

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function skeleton() { return '<div class="card"><div class="skel" style="width:60%"></div><br><div class="skel"></div><br><div class="skel" style="width:80%"></div></div>'; }
function table(heads, rows, empty) {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  return `<div class="tbl"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const pill = (s) => `<span class="pill ${{ active: 'ok', approved: 'ok', paid: 'ok', pending: 'warn', rejected: 'bad' }[s] || ''}">${esc(s)}</span>`;
async function busy(btn, fn) { btn.disabled = true; try { await fn(); } catch (e) { toast(e.message || 'Something went wrong. Try again.'); } finally { btn.disabled = false; } }

function spark(vals, w = 300, h = 100) {
  const max = Math.max(...vals, 1), step = w / Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - 8 - (v / max) * (h - 16)).toFixed(1)}`).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* ---------- Views ---------- */
const views = {
  async dashboard(el) {
    const d = await api('GET', '/dashboard');
    el.innerHTML = `
      <section class="hero">
        <svg class="spark" viewBox="0 0 300 100" preserveAspectRatio="none" style="color:#fff">${spark(d.series)}</svg>
        <small>Current balance</small><div class="num">${money(d.balance)}</div>
        <div class="row"><div><small>Total earnings</small><b>${money(d.earnings)}</b></div><div><small>Min. payout</small><b>$5.00</b></div></div>
      </section>
      <div class="grid">
        <div class="card"><div class="lbl">Impressions</div><div class="num">${d.impressions.toLocaleString()}</div></div>
        <div class="card"><div class="lbl">Clicks</div><div class="num">${d.clicks.toLocaleString()}</div></div>
      </div>
      <div class="card"><h3>Quick actions</h3><div class="stack">
        <button class="btn" data-go="links">Create smart link</button>
        <button class="btn ok" data-go="apps">Integrate Telegram mini app</button>
      </div></div>`;
  },

  async links(el) {
    el.innerHTML = `<div class="card" style="text-align:center"><h3>Smart link generator</h3><p class="lbl" style="margin-bottom:16px">No URL needed. Tap once and get your unique smart link.</p><button class="btn" id="gen">+ Generate new smart link</button></div><div class="card"><h3>Your active links</h3><div id="list">${skeleton()}</div></div>`;
    const render = async () => {
      const links = await api('GET', '/links');
      $('#list').innerHTML = table(['Name', 'Smart link', 'Action'], links.map(l => [esc(l.name), `<code>${esc(l.url)}</code>`, `<button class="btn ghost sm" data-copy="${esc(l.url)}">Copy</button>`]), 'No links yet. Generate your first smart link.');
    };
    $('#gen').onclick = (e) => busy(e.currentTarget, async () => { await api('POST', '/links'); toast('Smart link created'); await render(); });
    await render();
  },

  async sites(el) {
    el.innerHTML = `<div class="card"><h3>+ Add new website</h3><div class="stack"><input class="field" id="url" type="url" inputmode="url" placeholder="https://example.com"><button class="btn" id="add">Submit website</button></div></div><div class="card"><h3>Your websites</h3><div id="list">${skeleton()}</div></div>`;
    const render = async () => {
      const s = await api('GET', '/sites');
      $('#list').innerHTML = table(['Website', 'Status'], s.map(x => [esc(x.url), pill(x.status)]), 'No websites yet. Add one above and we review it for approval.');
    };
    $('#add').onclick = (e) => busy(e.currentTarget, async () => {
      const url = $('#url').value.trim();
      if (!/^https:\/\/[^\s.]+\.[^\s]+$/.test(url)) throw new Error('Enter a full URL starting with https://');
      await api('POST', '/sites', { url }); $('#url').value = ''; toast('Website submitted for review'); await render();
    });
    await render();
  },

  async apps(el) {
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>My placements</h2><button class="btn sm" id="new">+ New placement</button></div><div class="card" id="list">${skeleton()}</div>`;
    const render = async () => {
      const p = await api('GET', '/placements');
      $('#list').innerHTML = table(['Name', 'Status', 'Type', 'Ad format', 'Impressions', 'Revenue'], p.map(x => [esc(x.name), pill(x.status), esc(x.type), esc(x.format), x.impressions, money(x.revenue)]), 'No placements yet. Create one to start earning in your Telegram mini app.');
    };
    $('#new').onclick = () => openSheet(`<h3>New placement</h3><div class="stack" style="margin-top:12px">
      <input class="field" id="pn" placeholder="Placement name" maxlength="40">
      <select class="field" id="pt"><option>Telegram mini app</option><option>Website</option></select>
      <select class="field" id="pf"><option>Interstitial</option><option>Rewarded video</option><option>Banner</option></select>
      <button class="btn" id="save">Create placement</button></div>`, () => {
      $('#save').onclick = (e) => busy(e.currentTarget, async () => {
        const name = $('#pn').value.trim(); if (!name) throw new Error('Give your placement a name');
        await api('POST', '/placements', { name, type: $('#pt').value, format: $('#pf').value });
        closeSheet(); toast('Placement created'); await render();
      });
    });
    await render();
  },

  async stats(el) {
    const s = await api('GET', '/stats');
    el.innerHTML = `<div class="grid"><div class="card"><div class="lbl">Total impressions</div><div class="num">${s.impressions.toLocaleString()}</div></div><div class="card"><div class="lbl">Total clicks</div><div class="num">${s.clicks.toLocaleString()}</div></div></div>
      <div class="card"><h3>Daily performance</h3>${table(['Date', 'Imp', 'Clicks', 'CPM', 'Revenue'], s.days.map(d => [d.date, d.imp, d.clicks, money(d.cpm), money(d.revenue)]), 'No traffic yet. Stats appear once your placements serve ads.')}</div>`;
  },

  async withdraw(el) {
    el.innerHTML = `<div class="card"><h3>Withdraw balance</h3><div class="stack">
      <input class="field" id="amt" type="number" inputmode="decimal" min="5" step="0.01" placeholder="Amount ($), minimum $5">
      <select class="field" id="method"><option>USDT (TRC20)</option><option>USDT (BEP20)</option><option>bKash</option><option>Nagad</option></select>
      <input class="field" id="acc" autocomplete="off" placeholder="Wallet address / phone account number">
      <button class="btn" id="req">Request payout</button></div></div>
      <div class="card"><h3>Payout history</h3><div id="list">${skeleton()}</div></div>`;
    const render = async () => {
      const p = await api('GET', '/payouts');
      $('#list').innerHTML = table(['Date', 'Amount', 'Method', 'Status'], p.map(x => [esc(x.date), money(x.amount), esc(x.method), pill(x.status)]), 'No payouts yet. Your requests will show up here.');
    };
    $('#req').onclick = (e) => busy(e.currentTarget, async () => {
      const amount = parseFloat($('#amt').value), account = $('#acc').value.trim();
      if (!(amount >= 5)) throw new Error('Minimum payout is $5');
      if (account.length < 6) throw new Error('Enter a valid wallet address or account number');
      await api('POST', '/payouts', { amount, method: $('#method').value, account });
      $('#amt').value = ''; $('#acc').value = ''; toast('Payout requested'); await render();
    });
    await render();
  },

  async profile(el) {
    const m = await api('GET', '/me');
    el.innerHTML = `<div class="card" style="text-align:center"><div class="avatar" style="width:72px;height:72px;margin:0 auto 10px;font-size:28px">${esc((m.name || 'A')[0])}</div><h3>${esc(m.name)}</h3><p class="lbl">${m.username ? '@' + esc(m.username) : ''} Publisher ID: ${esc(m.id)}</p></div>
      <div class="card"><h3>Support</h3><p class="lbl">Questions about payouts or approvals? Contact us from the Telegram bot.</p></div>`;
  }
};

/* ---------- Shell ---------- */
function openSheet(html, after) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('open'); after && after(); }
function closeSheet() { $('#sheet').classList.remove('open'); }
function setDrawer(open) { $('#drawer').classList.toggle('open', open); }

async function route() {
  const key = (location.hash.slice(1) || 'dashboard');
  const name = views[key] ? key : 'dashboard';
  $('#nav').innerHTML = `<div class="brand">Adzentra<b>Ads</b></div>` + ROUTES.map(([k, l]) => `<a href="#${k}" class="${k === name ? 'on' : ''}">${ICONS[k]}${l}</a>`).join('');
  setDrawer(false);
  const el = $('#view'); el.innerHTML = skeleton();
  try { await views[name](el); if (api.demo && !route.warned) { route.warned = true; toast('Demo mode: backend not connected yet'); } }
  catch (e) { el.innerHTML = `<div class="card empty">Could not load this page. ${esc(e.message)}<br><br><button class="btn sm" onclick="route()">Try again</button></div>`; }
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'); if (go) location.hash = go.dataset.go;
  const cp = e.target.closest('[data-copy]'); if (cp) navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('Copied'), () => toast('Copy failed'));
  if (e.target.id === 'sheet') closeSheet();
});
$('#menuBtn').onclick = () => setDrawer(true);
$('#veil').onclick = () => setDrawer(false);
$('#themeBtn').onclick = () => { const r = document.documentElement; const dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches); r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('theme', r.dataset.theme); } catch (e) {} };
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
const u = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
if (u) $('#avatar').textContent = (u.first_name || 'A')[0];
addEventListener('hashchange', route);
route();
