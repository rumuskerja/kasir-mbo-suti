/* Kasir Pecel Pincuk Mbo Suti — aplikasi PWA
 * Data disimpan di Google Sheets lewat Google Apps Script Web App. */
'use strict';

/* ======================= UTIL ======================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem('ms_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ms_' + k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem('ms_' + k); } catch (e) { } }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const rk = (n) => Math.round(n || 0).toLocaleString('id-ID');
const rkp = (n) => n < 0 ? '(' + rk(-n) + ')' : rk(n);
// Semua waktu disimpan sebagai teks WIB "YYYY-MM-DDTHH:mm:ss"
const nowWIB = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19);
const todayStr = () => nowWIB().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fDate = (s) => { s = String(s || ''); if (s.length < 10) return s; return +s.slice(8, 10) + ' ' + BULAN[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4); };
const fTime = (s) => String(s || '').slice(11, 16);
const METHODS = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', ewallet: 'E-Wallet', split: 'Split' };
const methodLabel = (p) => (METHODS[p.m] || p.m) + (p.detail ? ' ' + p.detail : '');

const CFG = window.KASIR_CONFIG || {};
const apiUrl = () => (CFG.API_URL || LS.get('api_url', '') || '').trim();

/* ======================= API ======================= */
async function api(action, payload = {}, { timeout = 30000 } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(apiUrl(), {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: S.token, ...payload })
    });
  } catch (e) {
    const err = new Error('Tidak bisa terhubung ke server. Cek internet.'); err.offline = true; throw err;
  } finally { clearTimeout(t); }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Jawaban server tidak dikenali. Cek URL Web App dan izin aksesnya ("Siapa saja").'); }
  if (!j.ok) {
    if (j.error === 'SESI_HABIS') { toast('Sesi berakhir, silakan login lagi'); logout(); }
    throw new Error(j.error);
  }
  return j.data;
}

/* ======================= STATE ======================= */
const S = {
  token: LS.get('token'), user: LS.get('user'),
  menu: LS.get('menu', []), stock: LS.get('stock', {}), version: LS.get('version', ''),
  settings: LS.get('settings', {}), sheetUrl: LS.get('sheet_url', ''),
  outbox: LS.get('outbox', []), lastSync: 0, online: true, syncing: false
};
const device = LS.get('device', null) || (() => { const d = { code: String.fromCharCode(65 + Math.random() * 26 | 0, 65 + Math.random() * 26 | 0), print: 'bluetooth', copies: 'tanya' }; LS.set('device', d); return d; })();
const saveDevice = () => LS.set('device', device);
const saveOutbox = () => LS.set('outbox', S.outbox);
const stockOf = (id) => (S.stock[id] ? S.stock[id].sisa : 0);
const minOf = (id) => (S.stock[id] ? S.stock[id].minimum : 5);
const isAdmin = () => S.user && S.user.peran === 'admin';

function setStock(stock, version) {
  if (!stock) return;
  // Kurangi lagi transaksi yang masih antre (belum sampai server)
  const st = JSON.parse(JSON.stringify(stock));
  S.outbox.forEach(o => o.items.forEach(i => { if (st[i.id]) st[i.id].sisa -= i.qty; }));
  S.stock = st; if (version) S.version = version;
  LS.set('stock', S.stock); LS.set('version', S.version);
}

/* ======================= TOAST / SHEET ======================= */
function toast(html, ms = 3000) {
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<span>${html}</span>`;
  document.body.appendChild(d); setTimeout(() => d.remove(), ms);
}
function openSheet(html) { $('#layer').innerHTML = `<div class="ov"><div class="sheet">${html}</div></div>`; $('#layer .ov').addEventListener('click', e => { if (e.target.classList.contains('ov')) closeSheet(); }); }
function closeSheet() { $('#layer').innerHTML = ''; }
const errBox = (m) => m ? `<div class="err-box">${esc(m)}</div>` : '';
async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.innerHTML; btn.innerHTML = '<span class="spin" style="width:16px;height:16px;border-width:2px;margin:0"></span>'; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.t; } }
}

/* ======================= ICONS ======================= */
const I = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  pos: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8"/>',
  chart: '<path d="M3 3v18h18M7 15l4-4 3 3 6-6"/>',
  dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/>',
  bank: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-7 10 7z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  split: '<path d="M16 3h5v5M8 3H3v5M21 3l-7 7M3 3l7 7M12 22V12"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
const ic = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;

/* ======================= BOOT ======================= */
function show(id) { ['setup', 'login', 'app'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id)); }

async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (!apiUrl()) return showSetup();
  if (S.token && S.user) { enterApp(); refreshBootstrap(); }
  else showLogin();
}

function showSetup(msg) {
  show('setup');
  $('#setup-url').value = apiUrl();
  $('#setup-err').innerHTML = errBox(msg);
  $('#setup-form').onsubmit = async (e) => {
    e.preventDefault();
    const url = $('#setup-url').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { $('#setup-err').innerHTML = errBox('URL harus dari script.google.com dan berakhiran /exec'); return; }
    LS.set('api_url', url);
    try { await busy(e.submitter, () => api('ping')); showLogin(); } catch (err) { $('#setup-err').innerHTML = errBox(err.message); }
  };
}

let loginRole = 'kasir';
async function showLogin(msg) {
  show('login');
  $('#login-err').innerHTML = errBox(msg);
  $$('.seg button').forEach(b => b.onclick = () => setLoginRole(b.dataset.role));
  setLoginRole(loginRole);
  $('#login-hint').innerHTML = apiUrl() && !CFG.API_URL ? `<a href="#" id="chg-url" style="color:var(--muted)">Ganti server</a>` : '';
  const cu = $('#chg-url'); if (cu) cu.onclick = (e) => { e.preventDefault(); showSetup(); };
  const sel = $('#lg-user');
  const fill = (list) => { sel.innerHTML = list.length ? list.map(k => `<option value="${esc(k.id)}">${esc(k.nama)}</option>`).join('') : '<option value="">Belum ada kasir</option>'; const last = LS.get('last_kasir'); if (last) sel.value = last; };
  fill(LS.get('kasir_list', []));
  try { const list = await api('kasirList'); LS.set('kasir_list', list); fill(list); } catch (e) { if (!LS.get('kasir_list', []).length) $('#login-err').innerHTML = errBox(e.message); }
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const payload = loginRole === 'admin' ? { role: 'admin', email: $('#lg-email').value, pin: $('#lg-pin').value } : { role: 'kasir', id: sel.value, pin: $('#lg-pin').value };
    try {
      const r = await busy($('#login-btn'), () => api('login', payload));
      S.token = r.token; S.user = r.user; LS.set('token', r.token); LS.set('user', r.user);
      if (loginRole === 'kasir') LS.set('last_kasir', sel.value); else LS.set('last_email', $('#lg-email').value);
      $('#lg-pin').value = '';
      await busy(null, refreshBootstrap);
      enterApp();
    } catch (err) { $('#login-err').innerHTML = errBox(err.message); }
  };
}
function setLoginRole(r) {
  loginRole = r;
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.role === r));
  $('#f-user').classList.toggle('hidden', r !== 'kasir'); $('#f-email').classList.toggle('hidden', r !== 'admin');
  $('#pin-l').textContent = r === 'kasir' ? 'PIN 6 angka' : 'Kata sandi';
  $('#lg-pin').inputMode = r === 'kasir' ? 'numeric' : 'text';
  if (r === 'admin') $('#lg-email').value = LS.get('last_email', '') || '';
}

async function refreshBootstrap() {
  try {
    const d = await api('bootstrap');
    S.menu = d.menu; S.settings = d.settings; S.user = d.user; S.sheetUrl = d.sheetUrl || '';
    LS.set('menu', S.menu); LS.set('settings', S.settings); LS.set('user', S.user); LS.set('sheet_url', S.sheetUrl);
    setStock(d.stock, d.version); markSync(true);
    if (!$('#app').classList.contains('hidden')) render();
  } catch (e) { if (e.offline) markSync(false); else if (!S.token) throw e; }
}

let route = 'kasir';
function enterApp() {
  show('app');
  $('#role-pill').textContent = isAdmin() ? 'Admin' : S.user.nama;
  $('#sub-l').textContent = isAdmin() ? 'Panel Admin' : 'Kasir';
  $('#logout-btn').onclick = logout;
  $('#sync').onclick = () => { syncNow(true); };
  buildNav();
  const h = (location.hash || '').slice(1);
  route = allowed(h) ? h : (isAdmin() ? 'dashboard' : 'kasir');
  go(route);
  startSync();
}
function logout() {
  if (S.outbox.length && !confirmLogout()) return;
  S.token = null; S.user = null; LS.del('token'); LS.del('user'); cart = [];
  stopSync(); closeSheet(); showLogin();
}
function confirmLogout() { toast(`Masih ada <b>${S.outbox.length}</b> transaksi belum terkirim. Tunggu online dulu sebelum keluar.`, 4000); return false; }

/* ======================= NAV ======================= */
const NAV = {
  admin: [['Ringkasan', [['dashboard', 'Dashboard', 'dash'], ['kasir', 'Kasir', 'pos'], ['riwayat', 'Riwayat Transaksi', 'hist']]],
  ['Stok', [['stok-masuk', 'Stok Masuk', 'plus'], ['sisa-stok', 'Sisa Stok', 'box'], ['menu', 'Menu & Harga', 'menu']]],
  ['Keuangan', [['kas', 'Pemasukan & Pengeluaran', 'wallet'], ['laba-rugi', 'Laba Rugi', 'chart'], ['neraca', 'Neraca', 'scale'], ['ekspor', 'Unduh Data', 'dl']]],
  ['Pengaturan', [['pengguna', 'Pengguna', 'users'], ['pengaturan', 'Pengaturan', 'gear'], ['printer', 'Printer', 'print']]]],
  kasir: [['Kasir', [['kasir', 'Kasir', 'pos'], ['riwayat', 'Riwayat Hari Ini', 'hist'], ['sisa-stok', 'Sisa Stok', 'box'], ['printer', 'Printer', 'print']]]]
};
const allowed = (r) => NAV[S.user.peran].some(([, items]) => items.some(i => i[0] === r));
function buildNav() {
  const groups = NAV[S.user.peran];
  const btn = ([r, l, i]) => `<button class="navbtn" data-r="${r}">${ic(i)}${l}</button>`;
  $('#nav-side').innerHTML = groups.map(([g, items]) => `<div class="grp">${g}</div>` + items.map(btn).join('')).join('');
  $('#nav-tabs').innerHTML = groups.flatMap(([, items]) => items).map(btn).join('');
  $$('.navbtn').forEach(b => b.onclick = () => go(b.dataset.r));
}
function go(r) {
  if (!allowed(r)) r = isAdmin() ? 'dashboard' : 'kasir';
  route = r; try { history.replaceState(null, '', '#' + r); } catch (e) { }
  closeSheet(); render(); window.scrollTo({ top: 0 });
  const t = $(`#nav-tabs [data-r="${r}"]`); t && t.scrollIntoView({ inline: 'center', block: 'nearest' });
  if (LOAD[r]) LOAD[r]();
}
function render() {
  $$('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.r === route));
  $('#main').innerHTML = (VIEWS[route] || VIEWS.kasir)();
  if (BIND[route]) BIND[route]();
}
const VIEWS = {}, LOAD = {}, BIND = {}, D = {};
const loading = () => `<div class="loading"><div><div class="spin"></div>Memuat data…</div></div>`;
// muat data lalu render ulang jika masih di halaman yang sama
async function load(r, key, fn) {
  D[key + '_err'] = '';
  try { D[key] = await fn(); } catch (e) { D[key + '_err'] = e.message; }
  if (route === r) render();
}

/* ======================= SINKRON ======================= */
let pollTimer = null;
function startSync() { stopSync(); pollTimer = setInterval(() => syncNow(false), (CFG.POLL_DETIK || 15) * 1000); syncNow(false); }
function stopSync() { clearInterval(pollTimer); pollTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token) syncNow(false); });
window.addEventListener('online', () => S.token && syncNow(false));

async function syncNow(manual) {
  if (S.syncing || !S.token) return; S.syncing = true;
  try {
    await flushOutbox();
    const r = await api('stock', { version: S.version });
    if (r.changed) {
      const before = JSON.stringify(S.stock); setStock(r.stock, r.version);
      if (before !== JSON.stringify(S.stock)) onStockChanged();
    }
    markSync(true);
    if (manual) toast('Data sudah terbaru');
  } catch (e) { markSync(false, e.offline ? '' : e.message); }
  finally { S.syncing = false; }
}
function markSync(ok, err) {
  S.online = ok; if (ok) S.lastSync = Date.now();
  const el = $('#sync'); if (!el) return;
  el.classList.toggle('off', !ok); el.classList.toggle('err', !!err); el.classList.toggle('live', ok && !S.outbox.length);
  const q = S.outbox.length;
  $('#sync-t').textContent = ok ? (q ? `Mengirim ${q}` : 'Live') : (q ? `Offline · ${q} antre` : 'Offline');
  el.title = err || (ok ? 'Tersinkron ' + new Date(S.lastSync).toLocaleTimeString('id-ID') : 'Tidak ada koneksi. Transaksi disimpan di HP dan dikirim otomatis saat online.');
}
function onStockChanged() {
  const s = $('#sync'); s && s.classList.add('flash'); setTimeout(() => s && s.classList.remove('flash'), 1500);
  if (route === 'kasir') { renderGrid(); refreshCartCount(); }
  else if (route === 'sisa-stok' || route === 'dashboard') render();
}

async function flushOutbox() {
  while (S.outbox.length) {
    const o = S.outbox[0];
    const r = await api('sale', { sale: o });
    S.outbox.shift(); saveOutbox();
    setStock(r.stock, r.version);
  }
}

/* ======================= KASIR ======================= */
let cart = [], cat = 'Semua', q = '', otype = 'Dine-in';
const cats = () => ['Semua', ...new Set(S.menu.map(m => m.kategori))];
const cartTotal = () => cart.reduce((s, x) => s + x.qty * x.harga, 0);
const cartCount = () => cart.reduce((s, x) => s + x.qty, 0);
VIEWS.kasir = () => `<div class="pos"><div>
  <div class="page-h" style="margin-bottom:10px"><div><h2>Kasir</h2><p>Ketuk menu untuk tambah ke pesanan. Sisa stok ikut update otomatis.</p></div></div>
  <div class="search"><input id="q" placeholder="Cari menu…" value="${esc(q)}"></div>
  <div class="chips">${cats().map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="menu-grid" id="grid"></div>
  </div><div class="cart-desk"><div class="card cart" id="cart-desk"></div></div></div>
  <button class="mbar hidden" id="mbar"></button>`;
BIND.kasir = () => {
  $('#q').oninput = (e) => { q = e.target.value; renderGrid(); };
  $$('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; render(); });
  $('#mbar').onclick = openCart;
  renderGrid(); refreshCart();
};
function renderGrid() {
  const g = $('#grid'); if (!g) return;
  const list = S.menu.filter(m => (cat === 'Semua' || m.kategori === cat) && m.nama.toLowerCase().includes(q.toLowerCase()));
  g.innerHTML = list.map(m => {
    const s = stockOf(m.id), inC = cart.find(c => c.id === m.id);
    return `<button class="item ${s <= 0 ? 'out' : ''}" data-add="${esc(m.id)}">${inC ? `<span class="qty">${inC.qty}</span>` : ''}
      <span class="nm">${esc(m.nama)}</span><span class="st" style="color:${s <= 0 ? 'var(--cabai)' : s <= minOf(m.id) ? 'var(--kacang)' : 'var(--muted)'}">${s <= 0 ? 'Habis' : 'Sisa ' + s}</span><span class="pr num">${rp(m.harga)}</span></button>`;
  }).join('') || '<div class="empty">Menu tidak ditemukan.</div>';
  $$('[data-add]', g).forEach(b => b.onclick = () => addCart(b.dataset.add));
}
function cartHTML() {
  const tot = cartTotal();
  return `<div class="cart-head"><h3>Pesanan</h3>${cart.length ? `<button class="btn btn-danger btn-sm" data-clear>Kosongkan</button>` : ''}</div>
  <div class="order-type">${['Dine-in', 'Bungkus', 'Online'].map(t => `<button class="${t === otype ? 'on' : ''}" data-ot="${t}">${t}</button>`).join('')}</div>
  <div class="cart-list">${cart.length ? cart.map(c => `<div class="cl"><div><div class="n">${esc(c.nama)}</div><div class="p num">${rp(c.harga)}</div></div>
   <div class="stepper"><button data-chg="${esc(c.id)}" data-d="-1">−</button><b class="num">${c.qty}</b><button data-chg="${esc(c.id)}" data-d="1">+</button></div><div></div><div class="t num">${rp(c.harga * c.qty)}</div></div>`).join('') : '<div class="empty">Belum ada pesanan.<br>Ketuk menu untuk menambah.</div>'}</div>
  <div class="totals"><div class="row grand"><span>Total</span><span class="num">${rp(tot)}</span></div>
   <button class="btn btn-primary btn-block" style="margin-top:12px;padding:14px" data-pay ${cart.length ? '' : 'disabled'}>Bayar ${cart.length ? rp(tot) : ''}</button></div>`;
}
function bindCart(root) {
  if (!root) return;
  $$('[data-chg]', root).forEach(b => b.onclick = () => chg(b.dataset.chg, +b.dataset.d));
  $$('[data-ot]', root).forEach(b => b.onclick = () => { otype = b.dataset.ot; refreshCart(); });
  const c = $('[data-clear]', root); if (c) c.onclick = () => { cart = []; closeSheet(); refreshCart(); renderGrid(); };
  const p = $('[data-pay]', root); if (p) p.onclick = openPay;
}
function refreshCart() {
  ['#cart-desk', '#cart-sheet'].forEach(sel => { const el = $(sel); if (el) { el.innerHTML = cartHTML(); bindCart(el); } });
  refreshCartCount();
}
function refreshCartCount() {
  const mb = $('#mbar'); if (!mb) return;
  const n = cartCount(); mb.classList.toggle('hidden', !n);
  mb.innerHTML = `<span class="c">${n} item</span><span class="t num">${rp(cartTotal())}</span><b>Pesanan →</b>`;
}
function addCart(id) {
  const m = S.menu.find(x => x.id === id); const c = cart.find(x => x.id === id);
  if ((c ? c.qty : 0) >= stockOf(id)) { toast(`Stok <b>${esc(m.nama)}</b> tinggal ${stockOf(id)}`); return; }
  c ? c.qty++ : cart.push({ id, nama: m.nama, harga: m.harga, qty: 1 });
  refreshCart(); renderGrid();
}
function chg(id, d) {
  const c = cart.find(x => x.id === id); if (!c) return;
  if (d > 0 && c.qty >= stockOf(id)) { toast('Stok tidak cukup'); return; }
  c.qty += d; if (c.qty <= 0) cart = cart.filter(x => x !== c);
  refreshCart(); renderGrid();
}
function openCart() { openSheet(`<div class="sheet-h"><h3>Pesanan</h3><button class="x" data-close>×</button></div><div id="cart-sheet"></div>`); $('[data-close]').onclick = closeSheet; refreshCart(); }

/* ======================= PEMBAYARAN ======================= */
let pay = {};
function openPay() {
  const tot = cartTotal(); const half = Math.round(tot / 2000) * 1000;
  pay = { m: 'tunai', cash: '', ew: 'GoPay', bank: '', confirmed: false, split: [{ m: 'tunai', amt: half }, { m: 'qris', amt: tot - half }] };
  paySheet();
}
function paySheet() {
  const tot = cartTotal(); const st = S.settings;
  const pm = [['tunai', 'Tunai', 'cash'], ['qris', 'QRIS', 'qr'], ['transfer', 'Transfer', 'bank'], ['ewallet', 'E-Wallet', 'phone'], ['split', 'Split', 'split']];
  const confirmBox = `<label style="display:flex;gap:8px;align-items:center;font-weight:700;margin-top:12px;padding:12px;background:var(--kunyit-tint);border-radius:11px"><input type="checkbox" id="pay-ok" ${pay.confirmed ? 'checked' : ''}> Uang sudah masuk (sudah dicek)</label>`;
  let body = '';
  if (pay.m === 'tunai') {
    const quick = [tot, Math.ceil(tot / 5000) * 5000, Math.ceil(tot / 10000) * 10000, Math.ceil(tot / 50000) * 50000, 100000].filter((v, i, a) => v >= tot && a.indexOf(v) === i);
    body = `<label class="field"><span>Uang diterima</span><input id="cash" type="number" inputmode="numeric" value="${pay.cash}" placeholder="kosongkan = uang pas"></label>
    <div class="quick">${quick.map(v => `<button data-cash="${v}">${v === tot ? 'Uang pas' : rp(v)}</button>`).join('')}</div>
    <div class="change"><span>Kembalian</span><span class="num" id="chg">${rp(Math.max(0, (+pay.cash || tot) - tot))}</span></div>`;
  }
  if (pay.m === 'qris') body = `<div class="qris">${st.qris_gambar ? `<img class="qris-img" src="${esc(st.qris_gambar)}" alt="QRIS">` : `<div class="note">Gambar QRIS belum diunggah. Admin bisa menambahkannya di menu Pengaturan.</div>`}
    <b>Scan QRIS · ${rp(tot)}</b><span class="muted small">Pelanggan scan, lalu cek notifikasi dana masuk di HP/aplikasi bank.</span></div>${confirmBox}`;
  if (pay.m === 'transfer') body = `<div class="card pad"><div class="muted small">Transfer ke</div><b>${esc(st.rekening || '-')}</b></div>
    <label class="field" style="margin-top:12px"><span>Bank pengirim (opsional)</span><input id="bank" value="${esc(pay.bank)}" placeholder="cth. BCA"></label>${confirmBox}`;
  if (pay.m === 'ewallet') body = `<div class="opts">${['GoPay', 'OVO', 'DANA', 'ShopeePay'].map(b => `<button class="${pay.ew === b ? 'on' : ''}" data-ew="${b}">${b}</button>`).join('')}</div>${confirmBox}`;
  if (pay.m === 'split') {
    const sum = pay.split.reduce((s, x) => s + (+x.amt || 0), 0);
    body = pay.split.map((r, i) => `<div class="split-row"><select data-sm="${i}">${['tunai', 'qris', 'transfer', 'ewallet'].map(k => `<option value="${k}" ${r.m === k ? 'selected' : ''}>${METHODS[k]}</option>`).join('')}</select>
      <input type="number" inputmode="numeric" value="${r.amt}" data-sa="${i}"><button class="btn btn-ghost btn-sm" data-sd="${i}">✕</button></div>`).join('') +
      `<button class="btn btn-ghost btn-sm" data-sadd>+ Tambah metode</button>
      <div class="change" style="margin-top:12px;${sum === tot ? '' : 'background:var(--cabai-tint);color:var(--cabai)'}"><span>${sum === tot ? 'Pas' : sum < tot ? 'Kurang' : 'Lebih'}</span><span class="num">${rp(Math.abs(tot - sum))}</span></div>${confirmBox}`;
  }
  openSheet(`<div class="sheet-h"><h3>Pembayaran</h3><button class="x" data-close>×</button></div>
   <div class="sheet-b"><div class="due"><span>Total tagihan</span><span class="v num">${rp(tot)}</span></div>
   <div class="pm">${pm.map(([k, l, i]) => `<button class="${pay.m === k ? 'on' : ''}" data-pm="${k}">${ic(i, 22)}${l}</button>`).join('')}</div>${body}<div id="pay-err"></div></div>
   <div class="sheet-f"><button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" style="flex:1" id="pay-done">Selesai &amp; Simpan</button></div>`);
  $$('[data-close]').forEach(b => b.onclick = closeSheet);
  $$('[data-pm]').forEach(b => b.onclick = () => { pay.m = b.dataset.pm; pay.confirmed = false; paySheet(); });
  $$('[data-cash]').forEach(b => b.onclick = () => { pay.cash = +b.dataset.cash; paySheet(); });
  $$('[data-ew]').forEach(b => b.onclick = () => { pay.ew = b.dataset.ew; paySheet(); });
  const cash = $('#cash'); if (cash) { cash.oninput = () => { pay.cash = cash.value; $('#chg').textContent = rp(Math.max(0, (+pay.cash || tot) - tot)); }; }
  const bank = $('#bank'); if (bank) bank.oninput = () => pay.bank = bank.value;
  const ok = $('#pay-ok'); if (ok) ok.onchange = () => pay.confirmed = ok.checked;
  $$('[data-sm]').forEach(s => s.onchange = () => pay.split[+s.dataset.sm].m = s.value);
  $$('[data-sa]').forEach(s => s.onchange = () => { pay.split[+s.dataset.sa].amt = +s.value; paySheet(); });
  $$('[data-sd]').forEach(b => b.onclick = () => { pay.split.splice(+b.dataset.sd, 1); paySheet(); });
  const sadd = $('[data-sadd]'); if (sadd) sadd.onclick = () => { const sum = pay.split.reduce((s, x) => s + (+x.amt || 0), 0); pay.split.push({ m: 'ewallet', amt: Math.max(0, tot - sum) }); paySheet(); };
  $('#pay-done').onclick = finishSale;
}
function nextNo() {
  const d = todayStr(); const k = 'seq_' + d; const n = (LS.get(k, 0) || 0) + 1; LS.set(k, n);
  return d.slice(2).replace(/-/g, '') + '-' + device.code + String(n).padStart(3, '0');
}
async function finishSale() {
  const tot = cartTotal(); const err = (m) => { $('#pay-err').innerHTML = errBox(m); };
  let pays, dibayar = tot;
  if (pay.m === 'split') {
    const rows = pay.split.filter(x => +x.amt > 0);
    const sum = rows.reduce((s, x) => s + (+x.amt), 0);
    if (sum !== tot) return err('Jumlah split harus sama dengan total ' + rp(tot));
    if (rows.some(r => r.m !== 'tunai') && !pay.confirmed) return err('Centang "Uang sudah masuk" setelah pembayaran non-tunai dicek');
    pays = rows.map(x => ({ m: x.m, amt: +x.amt }));
  } else if (pay.m === 'tunai') {
    dibayar = +pay.cash || tot;
    if (dibayar < tot) return err('Uang diterima kurang dari total');
    pays = [{ m: 'tunai', amt: tot }];
  } else {
    if (!pay.confirmed) return err('Centang "Uang sudah masuk" setelah pembayaran dicek');
    pays = [{ m: pay.m, amt: tot, detail: pay.m === 'ewallet' ? pay.ew : (pay.bank || '') }];
  }
  const sale = { no: nextNo(), waktu: nowWIB(), kasir: S.user.nama, tipe: otype, items: cart.map(c => ({ id: c.id, nama: c.nama, qty: c.qty, harga: c.harga })), total: tot, pays, dibayar, status: 'OK' };
  // simpan ke antrean dulu (aman kalau sinyal putus), kurangi stok di HP ini
  S.outbox.push(sale); saveOutbox();
  sale.items.forEach(i => { if (S.stock[i.id]) S.stock[i.id].sisa -= i.qty; }); LS.set('stock', S.stock);
  cart = []; closeSheet(); render();
  openReceipt(sale, true);
  syncNow(false);
}

/* ======================= STRUK ======================= */
let rc = { sale: null, copies: 1 };
function receiptHTML(s, label) {
  const st = S.settings; const kembali = s.pays.length === 1 && s.pays[0].m === 'tunai' ? Math.max(0, (s.dibayar || s.total) - s.total) : 0;
  return `<div class="receipt">${label ? `<div class="copy">${label}</div>` : ''}
  <img src="icons/logo.png" alt=""><div class="c ttl">${esc(st.nama_toko || 'PECEL PINCUK MBO SUTI')}</div><div class="c">${esc(st.subjudul || '')}<br>${esc(st.telepon || '')}</div><hr>
  <div class="ln"><span>${esc(s.no)}</span><span>${esc(s.tipe || '')}</span></div><div class="ln"><span>${fDate(s.waktu)} ${fTime(s.waktu)}</span><span>${esc(s.kasir || '')}</span></div><hr>
  ${s.items.map(i => `<div>${esc(i.nama)}</div><div class="ln"><span>&nbsp;${i.qty} x ${rk(i.harga)}</span><span>${rk(i.qty * i.harga)}</span></div>`).join('')}<hr>
  <div class="ln tot"><span>TOTAL</span><span>${rk(s.total)}</span></div>
  ${s.pays.map(p => `<div class="ln"><span>${esc(methodLabel(p))}</span><span>${rk(p.m === 'tunai' && s.pays.length === 1 ? (s.dibayar || p.amt) : p.amt)}</span></div>`).join('')}
  ${kembali ? `<div class="ln"><span>Kembali</span><span>${rk(kembali)}</span></div>` : ''}
  ${s.status === 'VOID' ? '<hr><div class="c ttl">*** DIBATALKAN ***</div>' : ''}<hr>
  <div class="c">${esc(st.footer || '')}</div></div>`;
}
function rcRender() {
  const s = rc.sale; const html = rc.copies === 2 ? [receiptHTML(s, 'UNTUK PELANGGAN'), receiptHTML(s, 'ARSIP TOKO')] : [receiptHTML(s)];
  $('#rc-prev').innerHTML = html.join(''); $('#print').innerHTML = html.join('');
  $$('[data-cp]').forEach(b => b.classList.toggle('on', +b.dataset.cp === rc.copies));
}
const PRINT_LABEL = { bluetooth: 'Bluetooth langsung', rawbt: 'Lewat aplikasi RawBT', sistem: 'Dialog cetak (laptop/USB)' };
function openReceipt(sale, fresh) {
  rc.sale = sale; rc.copies = device.copies === '2' ? 2 : 1;
  openSheet(`<div class="sheet-h"><h3>${fresh ? 'Transaksi Berhasil ✓' : 'Struk ' + esc(sale.no)}</h3><button class="x" data-close>×</button></div>
  <div class="sheet-b"><div class="field"><span>Jumlah rangkap</span></div>
   <div class="opts"><button data-cp="1">1 rangkap<br><small class="muted">untuk pelanggan</small></button><button data-cp="2">2 rangkap<br><small class="muted">pelanggan + arsip toko</small></button></div>
   <div class="rc-wrap" id="rc-prev"></div>
   <div class="small muted" style="margin-top:10px">Cara cetak: <b>${PRINT_LABEL[device.print]}</b> · <a href="#" id="rc-method" style="color:var(--leaf-2)">ganti</a></div>
   <div id="rc-err"></div></div>
  <div class="sheet-f"><button class="btn btn-ghost" data-close>${fresh ? 'Transaksi baru' : 'Tutup'}</button><button class="btn btn-primary" style="flex:1" id="rc-print">${ic('print')}Cetak Struk</button></div>`);
  $$('[data-close]').forEach(b => b.onclick = closeSheet);
  $$('[data-cp]').forEach(b => b.onclick = () => { rc.copies = +b.dataset.cp; rcRender(); });
  $('#rc-method').onclick = (e) => { e.preventDefault(); closeSheet(); go('printer'); };
  $('#rc-print').onclick = (e) => busy(e.currentTarget, () => doPrint(rc.sale, rc.copies));
  rcRender();
}
async function doPrint(sale, copies) {
  const errEl = $('#rc-err');
  try {
    if (device.print === 'sistem') { $('#print').innerHTML = (copies === 2 ? [receiptHTML(sale, 'UNTUK PELANGGAN'), receiptHTML(sale, 'ARSIP TOKO')] : [receiptHTML(sale)]).join(''); window.print(); return; }
    const bytes = await Printer.buildReceipt(sale, { copies, settings: S.settings, logo: device.logo === false ? null : 'icons/logo.png', methodLabel });
    if (device.print === 'rawbt') Printer.rawbtPrint(bytes);
    else { await Printer.btPrint(bytes); toast('Struk terkirim ke printer ' + esc(Printer.btName)); }
  } catch (e) { if (errEl) errEl.innerHTML = errBox(e.message); else toast(esc(e.message)); }
}

/* ======================= RIWAYAT ======================= */
let rwFrom = todayStr(), rwTo = todayStr();
VIEWS.riwayat = () => {
  const list = [...S.outbox.map(o => ({ ...o, pending: true })).reverse(), ...(D.sales || [])];
  const ok = list.filter(s => s.status !== 'VOID'); const tot = ok.reduce((a, s) => a + s.total, 0);
  return `<div class="page-h"><div><h2>${isAdmin() ? 'Riwayat Transaksi' : 'Riwayat Hari Ini'}</h2><p>${ok.length} transaksi · ${rp(tot)}</p></div>
   ${isAdmin() ? `<div class="period"><input type="date" class="chip" id="rw-from" value="${rwFrom}"><input type="date" class="chip" id="rw-to" value="${rwTo}"><button class="btn btn-yellow btn-sm" id="rw-xl">${ic('dl', 16)}Excel</button></div>` : ''}</div>
  ${errBox(D.sales_err)}${D.sales === undefined ? loading() : `
  <div class="card tbl-wrap"><table><thead><tr><th>No</th><th>Jam</th><th>Kasir</th><th>Item</th><th>Bayar</th><th class="r">Total</th><th></th></tr></thead><tbody>
  ${list.map(s => `<tr class="${s.status === 'VOID' ? 'void' : ''}"><td><b>${esc(s.no)}</b>${s.pending ? '<br><span class="badge b-low">Belum terkirim</span>' : ''}</td><td class="num">${isAdmin() && rwFrom !== rwTo ? fDate(s.waktu) + '<br>' : ''}${fTime(s.waktu)}</td><td>${esc(s.kasir)}</td>
   <td class="muted small" style="max-width:240px">${s.items.map(i => i.qty + '× ' + esc(i.nama)).join(', ')}</td><td><span class="badge b-ok">${s.pays.map(p => METHODS[p.m] || p.m).join(' + ')}</span></td>
   <td class="r num"><b>${rp(s.total)}</b></td><td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-rc="${esc(s.no)}" title="Cetak ulang">${ic('print', 15)}</button>
   ${isAdmin() && !s.pending && s.status !== 'VOID' ? `<button class="btn btn-danger btn-sm" data-void="${esc(s.no)}">Batal</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Belum ada transaksi.</td></tr>'}
  </tbody></table></div>`}`;
};
LOAD.riwayat = () => { D.sales = undefined; render(); load('riwayat', 'sales', () => api('sales', { from: rwFrom, to: rwTo })); };
BIND.riwayat = () => {
  const all = () => [...S.outbox, ...(D.sales || [])];
  $$('[data-rc]').forEach(b => b.onclick = () => openReceipt(all().find(x => x.no === b.dataset.rc)));
  $$('[data-void]').forEach(b => b.onclick = () => voidSheet(b.dataset.void));
  const f = $('#rw-from'), t = $('#rw-to');
  if (f) { f.onchange = () => { rwFrom = f.value; LOAD.riwayat(); }; t.onchange = () => { rwTo = t.value; LOAD.riwayat(); }; }
  const xl = $('#rw-xl'); if (xl) xl.onclick = () => exportSalesXlsx(D.sales || [], `penjualan-${rwFrom}_${rwTo}`);
};
function voidSheet(no) {
  openSheet(`<div class="sheet-h"><h3>Batalkan ${esc(no)}?</h3><button class="x" data-close>×</button></div>
  <div class="sheet-b"><p class="muted">Transaksi ditandai DIBATALKAN, tidak dihitung di laporan, dan stok dikembalikan. Data tetap tersimpan di Sheet.</p>
  <label class="field"><span>Alasan</span><input id="void-r" placeholder="cth. salah input"></label><div id="void-err"></div></div>
  <div class="sheet-f"><button class="btn btn-ghost" data-close>Tidak</button><button class="btn btn-danger" style="flex:1" id="void-ok">Ya, batalkan</button></div>`);
  $$('[data-close]').forEach(b => b.onclick = closeSheet);
  $('#void-ok').onclick = (e) => busy(e.currentTarget, async () => {
    try { const r = await api('voidSale', { no, alasan: $('#void-r').value }); setStock(r.stock, r.version); closeSheet(); toast('Transaksi dibatalkan, stok dikembalikan'); LOAD.riwayat(); }
    catch (err) { $('#void-err').innerHTML = errBox(err.message); }
  });
}

/* ======================= DASHBOARD ======================= */
VIEWS.dashboard = () => {
  const ts = (D.dash_sales || []).filter(s => s.status !== 'VOID'); const lr = D.dash_lr;
  const omzet = ts.reduce((s, x) => s + x.total, 0);
  const low = S.menu.filter(m => stockOf(m.id) <= minOf(m.id));
  const byM = {}; ts.forEach(s => s.pays.forEach(p => byM[p.m] = (byM[p.m] || 0) + p.amt));
  const top = {}; ts.forEach(s => s.items.forEach(i => top[i.nama] = (top[i.nama] || 0) + i.qty));
  const topL = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5); const mx = topL[0] ? topL[0][1] : 1;
  return `<div class="page-h"><div><h2>Halo, ${esc(S.user.nama)}</h2><p>${fDate(todayStr())} · ringkasan hari ini</p></div><button class="btn btn-yellow" data-go="ekspor">${ic('dl')}Unduh Data</button></div>
  ${errBox(D.dash_sales_err || D.dash_lr_err)}
  <div class="kpis">
   <div class="card kpi"><div class="l">Omzet hari ini</div><div class="v num">${D.dash_sales ? rp(omzet) : '…'}</div><div class="d muted">${ts.length} transaksi</div></div>
   <div class="card kpi"><div class="l">Rata-rata / transaksi</div><div class="v num">${rp(ts.length ? omzet / ts.length : 0)}</div></div>
   <div class="card kpi"><div class="l">Laba bersih bulan ini</div><div class="v num ${lr && lr.laba_bersih < 0 ? 'down' : 'up'}">${lr ? rp(lr.laba_bersih) : '…'}</div><div class="d muted">${lr ? 'omzet ' + rp(lr.penjualan) : ''}</div></div>
   <div class="card kpi"><div class="l">Stok menipis</div><div class="v num ${low.length ? 'down' : ''}">${low.length} menu</div><div class="d"><a href="#sisa-stok" data-go="sisa-stok" style="color:var(--leaf-2);font-weight:700">Lihat stok →</a></div></div>
  </div>
  <div class="grid g2">
   <div class="card pad"><h3 style="font-size:15px;margin-bottom:12px">Terlaris hari ini</h3>
    ${topL.map(([n, q]) => `<div style="display:grid;grid-template-columns:1fr 40px;gap:8px;align-items:center;margin-bottom:9px"><div><div style="font-size:13.5px;font-weight:600;margin-bottom:4px">${esc(n)}</div><div class="bar"><i style="width:${q / mx * 100}%"></i></div></div><b class="r num">${q}</b></div>`).join('') || '<span class="muted">Belum ada penjualan hari ini.</span>'}</div>
   <div class="card pad"><h3 style="font-size:15px;margin-bottom:12px">Per metode bayar (hari ini)</h3>
    <table><tbody>${['tunai', 'qris', 'transfer', 'ewallet'].map(k => `<tr><td>${METHODS[k]}</td><td class="r num"><b>${rp(byM[k] || 0)}</b></td></tr>`).join('')}</tbody></table></div>
  </div>
  <div class="card pad" style="margin-top:12px"><h3 style="font-size:15px;margin-bottom:10px">Stok perlu diisi</h3>
   ${low.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${low.map(m => `<span class="badge ${stockOf(m.id) <= 0 ? 'b-out' : 'b-low'}">${esc(m.nama)} · ${stockOf(m.id)}</span>`).join('')}</div>` : '<span class="muted">Semua stok aman.</span>'}
   <div style="margin-top:12px"><button class="btn btn-primary btn-sm" data-go="stok-masuk">${ic('plus', 16)}Input stok masuk</button></div></div>`;
};
LOAD.dashboard = () => { load('dashboard', 'dash_sales', () => api('sales', { from: todayStr(), to: todayStr() })); load('dashboard', 'dash_lr', () => api('report', { from: todayStr().slice(0, 8) + '01', to: todayStr() })); };
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); } });

/* ======================= STOK MASUK ======================= */
VIEWS['stok-masuk'] = () => `<div class="page-h"><div><h2>Stok Masuk</h2><p>Setelah disimpan, sisa stok di semua HP kasir ikut berubah (paling lama ${CFG.POLL_DETIK || 15} detik).</p></div></div>
  <div class="grid g2" style="align-items:start">
  <form class="card pad" id="in-form">
   <h3 style="font-size:15px;margin-bottom:12px">Input stok</h3>
   <label class="field"><span>Menu</span><select id="in-id">${S.menu.map(m => `<option value="${esc(m.id)}">${esc(m.nama)} (sisa ${stockOf(m.id)})</option>`).join('')}</select></label>
   <div class="form-grid"><label class="field"><span>Jumlah masuk (porsi)</span><input id="in-q" type="number" inputmode="numeric" min="1" required></label>
   <label class="field"><span>Modal / porsi (Rp)</span><input id="in-p" type="number" inputmode="numeric" placeholder="otomatis dari menu"></label></div>
   <label class="field"><span>Sumber</span><input id="in-s" list="in-src" value="Produksi dapur"><datalist id="in-src"><option>Produksi dapur</option><option>Pasar Keputran</option><option>Supplier</option></datalist></label>
   <label style="display:flex;gap:8px;align-items:center;font-size:13.5px;font-weight:600;margin:4px 0 6px"><input type="checkbox" id="in-k"> Catat juga sebagai pengeluaran bahan baku</label>
   <div class="small muted" style="margin-bottom:12px">Centang hanya kalau belanja bahannya belum dicatat di Pemasukan &amp; Pengeluaran, supaya tidak dobel.</div>
   <div id="in-err"></div>
   <button class="btn btn-primary btn-block" type="submit">${ic('plus', 16)}Simpan &amp; sinkronkan</button>
  </form>
  <div class="card"><div class="pad" style="padding-bottom:6px"><h3 style="font-size:15px">Riwayat stok masuk (30 hari)</h3></div>${errBox(D.masuk_err)}
   ${D.masuk === undefined ? loading() : `<div class="tbl-wrap"><table><thead><tr><th>Waktu</th><th>Menu</th><th class="r">Qty</th><th>Sumber</th></tr></thead><tbody>
   ${D.masuk.map(x => `<tr><td class="num small">${fDate(x.waktu)}<br>${fTime(x.waktu)}</td><td>${esc(x.nama)}</td><td class="r num"><b class="${x.qty < 0 ? 'down' : 'up'}">${x.qty > 0 ? '+' : ''}${x.qty}</b></td><td class="muted small">${esc(x.sumber)}<br>${esc(x.oleh)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Belum ada.</td></tr>'}
   </tbody></table></div>`}</div></div>`;
LOAD['stok-masuk'] = () => load('stok-masuk', 'masuk', () => api('stockInList'));
BIND['stok-masuk'] = () => {
  $('#in-form').onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => {
    const id = $('#in-id').value, qty = +$('#in-q').value;
    try {
      const r = await api('stockIn', { id, qty, harga: $('#in-p').value, sumber: $('#in-s').value, asExpense: $('#in-k').checked });
      setStock(r.stock, r.version); const m = S.menu.find(x => x.id === id);
      toast(`<b>${esc(m.nama)}</b> +${qty} tersimpan, terkirim ke semua kasir`); LOAD['stok-masuk']();
    } catch (err) { $('#in-err').innerHTML = errBox(err.message); }
  }); };
};

/* ======================= SISA STOK ======================= */
let stF = 'Semua';
VIEWS['sisa-stok'] = () => {
  const list = S.menu.filter(m => { const s = stockOf(m.id); return stF === 'Semua' || (stF === 'Menipis' && s > 0 && s <= minOf(m.id)) || (stF === 'Habis' && s <= 0); });
  const mx = Math.max(10, ...S.menu.map(m => stockOf(m.id)));
  return `<div class="page-h"><div><h2>Sisa Stok</h2><p>Sinkron otomatis tiap ${CFG.POLL_DETIK || 15} detik · terakhir ${S.lastSync ? new Date(S.lastSync).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}</p></div>
  <div class="period">${['Semua', 'Menipis', 'Habis'].map(f => `<button class="chip ${f === stF ? 'on' : ''}" data-stf="${f}">${f}</button>`).join('')}</div></div>
  <div class="card tbl-wrap"><table><thead><tr><th>Menu</th><th>Kategori</th><th class="r">Sisa</th><th style="width:22%"></th><th>Status</th>${isAdmin() ? '<th></th>' : ''}</tr></thead><tbody>
  ${list.map(m => { const s = stockOf(m.id), mn = minOf(m.id); return `<tr><td><b>${esc(m.nama)}</b></td><td class="muted">${esc(m.kategori)}</td><td class="r num"><b>${s}</b></td>
   <td><div class="bar"><i class="${s <= 0 ? 'out' : s <= mn ? 'low' : ''}" style="width:${Math.max(0, Math.min(100, s / mx * 100))}%"></i></div></td>
   <td>${s <= 0 ? '<span class="badge b-out">Habis</span>' : s <= mn ? '<span class="badge b-low">Menipis</span>' : '<span class="badge b-ok">Aman</span>'}</td>
   ${isAdmin() ? `<td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-opn="${esc(m.id)}">Ubah</button></div></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="6" class="empty">Tidak ada.</td></tr>'}
  </tbody></table></div>`;
};
BIND['sisa-stok'] = () => {
  $$('[data-stf]').forEach(b => b.onclick = () => { stF = b.dataset.stf; render(); });
  $$('[data-opn]').forEach(b => b.onclick = () => opnameSheet(b.dataset.opn));
};
LOAD['sisa-stok'] = () => syncNow(false);
function opnameSheet(id) {
  const m = S.menu.find(x => x.id === id);
  openSheet(`<div class="sheet-h"><h3>${esc(m.nama)}</h3><button class="x" data-close>×</button></div>
  <form class="sheet-b" id="opn"><p class="muted small">Stok opname: isi jumlah sebenarnya yang ada sekarang. Untuk barang baru masuk, pakai menu Stok Masuk.</p>
   <div class="form-grid"><label class="field"><span>Sisa sebenarnya</span><input id="op-q" type="number" inputmode="numeric" value="${stockOf(id)}" required></label>
   <label class="field"><span>Batas menipis</span><input id="op-m" type="number" inputmode="numeric" value="${minOf(id)}"></label></div>
   <div id="op-err"></div><button class="btn btn-primary btn-block" type="submit">Simpan</button></form>`);
  $('[data-close]').onclick = closeSheet;
  $('#opn').onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => {
    try { const r = await api('stockSet', { id, qty: +$('#op-q').value, minimum: $('#op-m').value }); setStock(r.stock, r.version); closeSheet(); render(); toast('Stok diperbarui'); }
    catch (err) { $('#op-err').innerHTML = errBox(err.message); }
  }); };
}

/* ======================= PERIODE ======================= */
const PERIODS = {
  'Hari ini': () => [todayStr(), todayStr()],
  '7 hari': () => [addDays(todayStr(), -6), todayStr()],
  'Bulan ini': () => [todayStr().slice(0, 8) + '01', todayStr()],
  'Bulan lalu': () => { const first = todayStr().slice(0, 8) + '01'; const end = addDays(first, -1); return [end.slice(0, 8) + '01', end]; }
};
function periodBar(state, onChange, id) {
  setTimeout(() => {
    $$(`[data-pr="${id}"]`).forEach(b => b.onclick = () => { state.p = b.dataset.p; [state.from, state.to] = PERIODS[state.p](); onChange(); });
    const f = $(`#${id}-from`), t = $(`#${id}-to`);
    if (f) { f.onchange = () => { state.p = ''; state.from = f.value; onChange(); }; t.onchange = () => { state.p = ''; state.to = t.value; onChange(); }; }
  });
  return `<div class="period">${Object.keys(PERIODS).map(p => `<button class="chip ${state.p === p ? 'on' : ''}" data-pr="${id}" data-p="${p}">${p}</button>`).join('')}
   <input type="date" class="chip" id="${id}-from" value="${state.from}"><input type="date" class="chip" id="${id}-to" value="${state.to}"></div>`;
}
const mkPeriod = (p) => { const [from, to] = PERIODS[p](); return { p, from, to }; };

/* ======================= KAS ======================= */
const kasP = mkPeriod('Bulan ini'); let kasF = 'Semua';
const KAT_KELUAR = ['Bahan baku', 'Gaji', 'Kemasan', 'Gas & listrik', 'Air', 'Sewa', 'Transport', 'Perawatan', 'Lain-lain', 'Beli peralatan', 'Bayar utang', 'Ambil pribadi (prive)'];
const KAT_MASUK = ['Pesanan katering', 'Lain-lain', 'Modal tambahan', 'Pinjaman masuk'];
VIEWS.kas = () => {
  const all = D.kas || []; const list = all.filter(k => kasF === 'Semua' || (kasF === 'Pemasukan' && k.jenis === 'masuk') || (kasF === 'Pengeluaran' && k.jenis === 'keluar'));
  const inn = all.filter(k => k.jenis === 'masuk').reduce((s, k) => s + k.jumlah, 0), out = all.filter(k => k.jenis === 'keluar').reduce((s, k) => s + k.jumlah, 0);
  return `<div class="page-h"><div><h2>Pemasukan &amp; Pengeluaran</h2><p>Penjualan masuk otomatis per hari &amp; metode. Pengeluaran dicatat di sini.</p></div>
   <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" data-kf="keluar">− Pengeluaran</button><button class="btn btn-yellow btn-sm" data-kf="masuk">+ Pemasukan lain</button></div></div>
  ${periodBar(kasP, LOAD.kas, 'kp')}<div style="height:10px"></div>
  <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
   <div class="card kpi"><div class="l">Pemasukan</div><div class="v num up">${rp(inn)}</div></div>
   <div class="card kpi"><div class="l">Pengeluaran</div><div class="v num down">${rp(out)}</div></div>
   <div class="card kpi"><div class="l">Selisih</div><div class="v num">${rp(inn - out)}</div></div></div>
  <div class="period" style="margin-bottom:10px">${['Semua', 'Pemasukan', 'Pengeluaran'].map(f => `<button class="chip ${f === kasF ? 'on' : ''}" data-kasf="${f}">${f}</button>`).join('')}
   <span style="flex:1"></span><button class="btn btn-ghost btn-sm" id="kas-xl">${ic('dl', 15)}Excel</button></div>
  ${errBox(D.kas_err)}${D.kas === undefined ? loading() : `<div class="card tbl-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th>Metode</th><th class="r">Jumlah</th></tr></thead><tbody>
   ${list.map(k => `<tr><td class="num small" style="white-space:nowrap">${fDate(k.tanggal)}${k.auto ? '' : '<br><span class="muted">' + fTime(k.waktu) + '</span>'}</td><td><span class="badge ${k.jenis === 'masuk' ? 'b-in' : 'b-outflow'}">${k.jenis === 'masuk' ? 'Masuk' : 'Keluar'}</span></td>
    <td>${esc(k.kategori)}${k.auto ? '<span class="tag-auto">AUTO</span>' : ''}</td><td class="muted small">${esc(k.keterangan)}</td><td class="small">${esc(k.metode)}</td><td class="r num"><b class="${k.jenis === 'masuk' ? 'up' : 'down'}">${k.jenis === 'masuk' ? '+' : '−'}${rk(k.jumlah)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Belum ada data di periode ini.</td></tr>'}
  </tbody></table></div>`}`;
};
LOAD.kas = () => { D.kas = undefined; render(); load('kas', 'kas', () => api('kasList', { from: kasP.from, to: kasP.to })); };
BIND.kas = () => {
  $$('[data-kasf]').forEach(b => b.onclick = () => { kasF = b.dataset.kasf; render(); });
  $$('[data-kf]').forEach(b => b.onclick = () => kasForm(b.dataset.kf));
  $('#kas-xl').onclick = () => xlsx([['Kas', (D.kas || []).slice().reverse().map(k => ({ Tanggal: k.tanggal, Jam: k.auto ? '' : fTime(k.waktu), Jenis: k.jenis === 'masuk' ? 'Pemasukan' : 'Pengeluaran', Kategori: k.kategori, Keterangan: k.keterangan, Metode: k.metode, Masuk: k.jenis === 'masuk' ? k.jumlah : 0, Keluar: k.jenis === 'keluar' ? k.jumlah : 0, Oleh: k.oleh }))]], `kas-${kasP.from}_${kasP.to}`);
};
function kasForm(t) {
  const kat = t === 'masuk' ? KAT_MASUK : KAT_KELUAR;
  openSheet(`<div class="sheet-h"><h3>${t === 'masuk' ? 'Pemasukan lain' : 'Catat pengeluaran'}</h3><button class="x" data-close>×</button></div>
  <form class="sheet-b" id="kas-f">
   <label class="field"><span>Kategori</span><select id="k-c">${kat.map(x => `<option>${x}</option>`).join('')}</select></label>
   <div class="small muted" id="k-hint" style="margin:-6px 0 10px"></div>
   <label class="field"><span>Keterangan</span><input id="k-d" placeholder="cth. Beli gas 2 tabung" required></label>
   <div class="form-grid"><label class="field"><span>Jumlah (Rp)</span><input id="k-a" type="number" inputmode="numeric" min="1" required></label>
   <label class="field"><span>Metode</span><select id="k-m"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>E-Wallet</option></select></label></div>
   <label class="field"><span>Tanggal</span><input id="k-t" type="date" value="${todayStr()}"></label>
   <div id="k-err"></div><button class="btn btn-primary btn-block" type="submit">Simpan</button></form>`);
  $('[data-close]').onclick = closeSheet;
  const hint = () => { const c = $('#k-c').value; $('#k-hint').textContent = ({ 'Beli peralatan': 'Masuk ke aset peralatan di neraca, bukan beban.', 'Bayar utang': 'Mengurangi utang di neraca, bukan beban.', 'Ambil pribadi (prive)': 'Mengurangi modal pemilik, bukan beban.', 'Modal tambahan': 'Menambah modal pemilik, bukan pendapatan.', 'Pinjaman masuk': 'Menambah utang, bukan pendapatan.', 'Bahan baku': 'Dihitung sebagai HPP di laba rugi.' })[c] || ''; };
  $('#k-c').onchange = hint; hint();
  $('#kas-f').onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => {
    try { await api('kasAdd', { jenis: t, kategori: $('#k-c').value, keterangan: $('#k-d').value, jumlah: +$('#k-a').value, metode: $('#k-m').value, tanggal: $('#k-t').value }); closeSheet(); toast('Tersimpan'); LOAD.kas(); }
    catch (err) { $('#k-err').innerHTML = errBox(err.message); }
  }); };
}

/* ======================= LABA RUGI ======================= */
const lrP = mkPeriod('Bulan ini');
VIEWS['laba-rugi'] = () => {
  const d = D.lr; const row = (l, v, c = '', cls = '') => `<tr class="${cls}"><td class="${c}">${l}</td><td class="r num">${v === '' ? '' : rkp(v)}</td></tr>`;
  return `<div class="page-h"><div><h2>Laporan Laba Rugi</h2><p>${fDate(lrP.from)} – ${fDate(lrP.to)}</p></div><button class="btn btn-yellow btn-sm" id="lr-xl">${ic('dl', 15)}Excel</button></div>
  ${periodBar(lrP, LOAD['laba-rugi'], 'lp')}<div style="height:12px"></div>${errBox(D.lr_err)}
  ${!d ? loading() : `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="card kpi"><div class="l">Penjualan</div><div class="v num">${rp(d.penjualan)}</div><div class="d muted">${d.transaksi} transaksi</div></div><div class="card kpi"><div class="l">Laba kotor</div><div class="v num">${rp(d.laba_kotor)}</div></div><div class="card kpi"><div class="l">Laba bersih</div><div class="v num ${d.laba_bersih >= 0 ? 'up' : 'down'}">${rp(d.laba_bersih)}</div></div></div>
  <div class="card tbl-wrap fin"><table><tbody>
   ${row('PENDAPATAN', '', '', 'head')}${row('Penjualan', d.penjualan, 'lv1')}${row('HPP (belanja bahan baku)', -d.hpp, 'lv1')}${row('Laba kotor', d.laba_kotor, '', 'sum')}
   ${Object.entries(d.pendapatan_lain).map(([k, v]) => row('Pendapatan lain: ' + esc(k), v, 'lv1')).join('')}
   ${row('BEBAN OPERASIONAL', '', '', 'head')}${Object.entries(d.beban).map(([k, v]) => row(esc(k), -v, 'lv1')).join('') || row('(belum ada)', 0, 'lv1')}
   ${row('Total beban', -d.total_beban, '', 'sum')}${row('LABA BERSIH', d.laba_bersih, '', 'grand')}
  </tbody></table></div>
  <div class="note" style="margin-top:12px">HPP dihitung dari belanja bahan baku pada periode ini (kategori "Bahan baku"). Sebagai pembanding, taksiran HPP dari modal per menu × porsi terjual = <b>${rp(d.hpp_taksiran)}</b>.</div>`}`;
};
LOAD['laba-rugi'] = () => { D.lr = undefined; render(); load('laba-rugi', 'lr', () => api('report', { from: lrP.from, to: lrP.to })); };
BIND['laba-rugi'] = () => { $('#lr-xl').onclick = () => { const d = D.lr; if (!d) return; xlsx([['Laba Rugi', lrRows(d)]], `laba-rugi-${lrP.from}_${lrP.to}`); }; };
const lrRows = (d) => [{ Pos: 'Penjualan', Jumlah: d.penjualan }, { Pos: 'HPP (belanja bahan baku)', Jumlah: -d.hpp }, { Pos: 'Laba kotor', Jumlah: d.laba_kotor },
  ...Object.entries(d.pendapatan_lain).map(([k, v]) => ({ Pos: 'Pendapatan lain: ' + k, Jumlah: v })), ...Object.entries(d.beban).map(([k, v]) => ({ Pos: 'Beban: ' + k, Jumlah: -v })),
  { Pos: 'Total beban', Jumlah: -d.total_beban }, { Pos: 'LABA BERSIH', Jumlah: d.laba_bersih }, { Pos: '' }, { Pos: 'Periode', Jumlah: d.from + ' s/d ' + d.to }];

/* ======================= NERACA ======================= */
let nrTo = todayStr();
VIEWS.neraca = () => {
  const n = D.nr; const row = (l, v, c = '', cls = '') => `<tr class="${cls}"><td class="${c}">${l}</td><td class="r num">${v === '' ? '' : rkp(v)}</td></tr>`;
  return `<div class="page-h"><div><h2>Neraca</h2><p>Posisi per ${fDate(nrTo)}</p></div><div class="period"><input type="date" class="chip" id="nr-to" value="${nrTo}"><button class="btn btn-yellow btn-sm" id="nr-xl">${ic('dl', 15)}Excel</button></div></div>
  ${errBox(D.nr_err)}${!n ? loading() : `<div class="grid g2" style="align-items:start">
   <div class="card tbl-wrap fin"><table><tbody>${row('ASET', '', '', 'head')}${row('Kas tunai', n.aset.kas_tunai, 'lv1')}${row('Bank / QRIS / e-wallet', n.aset.bank_nontunai, 'lv1')}
    ${row('Peralatan', n.aset.peralatan, 'lv1')}${row('Akumulasi penyusutan', n.aset.akum_penyusutan, 'lv1')}${row('TOTAL ASET', n.aset.total, '', 'grand')}</tbody></table></div>
   <div class="card tbl-wrap fin"><table><tbody>${row('KEWAJIBAN', '', '', 'head')}${row('Utang', n.kewajiban.utang, 'lv1')}${row('Total kewajiban', n.kewajiban.total, '', 'sum')}
    ${row('EKUITAS', '', '', 'head')}${row('Modal awal', n.ekuitas.modal_awal, 'lv1')}${row('Modal tambahan', n.ekuitas.modal_tambahan, 'lv1')}${row('Ambil pribadi (prive)', n.ekuitas.prive, 'lv1')}
    ${row('Laba ditahan (sejak mulai)', n.ekuitas.laba_ditahan, 'lv1')}${row('Penyusutan', n.ekuitas.penyusutan, 'lv1')}${row('Total ekuitas', n.ekuitas.total, '', 'sum')}
    ${row('TOTAL KEWAJIBAN + EKUITAS', n.kewajiban.total + n.ekuitas.total, '', 'grand')}</tbody></table></div></div>
  <div class="note" style="margin-top:12px"><span class="badge ${n.seimbang ? 'b-ok' : 'b-out'}">${n.seimbang ? 'Seimbang ✓' : 'Tidak seimbang'}</span> Saldo awal (kas, peralatan, utang) diisi Admin di <a href="#pengaturan" data-go="pengaturan" style="color:var(--leaf-2);font-weight:700">Pengaturan</a>. Info: nilai stok saat ini (taksiran modal) ${rp(n.info_nilai_stok)}, tidak dimasukkan ke neraca karena belanja bahan sudah dihitung sebagai HPP.</div>`}`;
};
LOAD.neraca = () => { D.nr = undefined; render(); load('neraca', 'nr', () => api('neraca', { to: nrTo })); };
BIND.neraca = () => {
  $('#nr-to').onchange = (e) => { nrTo = e.target.value; LOAD.neraca(); };
  $('#nr-xl').onclick = () => { const n = D.nr; if (!n) return; xlsx([['Neraca', [
    { Pos: 'Kas tunai', Jumlah: n.aset.kas_tunai }, { Pos: 'Bank / QRIS / e-wallet', Jumlah: n.aset.bank_nontunai }, { Pos: 'Peralatan', Jumlah: n.aset.peralatan }, { Pos: 'Akumulasi penyusutan', Jumlah: n.aset.akum_penyusutan }, { Pos: 'TOTAL ASET', Jumlah: n.aset.total }, { Pos: '' },
    { Pos: 'Utang', Jumlah: n.kewajiban.utang }, { Pos: 'Modal awal', Jumlah: n.ekuitas.modal_awal }, { Pos: 'Modal tambahan', Jumlah: n.ekuitas.modal_tambahan }, { Pos: 'Prive', Jumlah: n.ekuitas.prive },
    { Pos: 'Laba ditahan', Jumlah: n.ekuitas.laba_ditahan }, { Pos: 'Penyusutan', Jumlah: n.ekuitas.penyusutan }, { Pos: 'TOTAL KEWAJIBAN + EKUITAS', Jumlah: n.kewajiban.total + n.ekuitas.total }, { Pos: 'Per tanggal', Jumlah: n.per }]]], `neraca-${nrTo}`); };
};

/* ======================= EKSPOR ======================= */
const exP = mkPeriod('Bulan ini');
function xlsx(sheets, name) {
  if (!window.XLSX) { toast('Modul Excel belum termuat, coba lagi sebentar'); return; }
  const wb = XLSX.utils.book_new();
  sheets.forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Tidak ada data' }]), n.slice(0, 31)));
  XLSX.writeFile(wb, name + '.xlsx');
}
function csv(rows, name) {
  const head = Object.keys(rows[0] || { Info: '' });
  const body = [head.join(','), ...rows.map(r => head.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv' })); a.download = name + '.csv'; a.click();
}
const salesItemRows = (sales) => sales.flatMap(s => s.items.map(i => ({ No: s.no, Tanggal: s.waktu.slice(0, 10), Jam: fTime(s.waktu), Kasir: s.kasir, Tipe: s.tipe, Menu: i.nama, Qty: i.qty, Harga: i.harga, Subtotal: i.qty * i.harga, Status: s.status })));
const salesRows = (sales) => sales.map(s => ({ No: s.no, Tanggal: s.waktu.slice(0, 10), Jam: fTime(s.waktu), Kasir: s.kasir, Tipe: s.tipe, Total: s.total, Bayar: s.pays.map(p => methodLabel(p) + ' ' + p.amt).join(' + '), Status: s.status }));
function exportSalesXlsx(sales, name) { xlsx([['Transaksi', salesRows(sales)], ['Item Terjual', salesItemRows(sales)]], name); }
VIEWS.ekspor = () => {
  const c = (ico, bg, col, t, p, btns) => `<div class="card export-card"><div class="ic" style="background:${bg};color:${col}">${ic(ico, 24)}</div><div><h4>${t}</h4><p>${p}</p></div><div class="sp"></div><div class="row-actions">${btns}</div></div>`;
  return `<div class="page-h"><div><h2>Unduh Data</h2><p>Semua data juga otomatis tersimpan di Google Sheet, jadi bisa dibuka langsung di Google Sheets.</p></div></div>
  ${periodBar(exP, render, 'ep')}<div style="height:12px"></div><div id="ex-err"></div>
  <div class="grid">
   ${c('sheet', 'var(--leaf-tint)', 'var(--leaf-2)', 'Laporan lengkap (Excel)', 'Satu file berisi: transaksi, item terjual, pembayaran, pemasukan &amp; pengeluaran, stok masuk, sisa stok, laba rugi.', `<button class="btn btn-primary btn-sm" data-ex="all">Excel .xlsx</button>`)}
   ${c('pos', 'var(--kunyit-tint)', 'var(--kacang)', 'Data penjualan', 'Per transaksi dan per item.', `<button class="btn btn-primary btn-sm" data-ex="sales">Excel</button><button class="btn btn-ghost btn-sm" data-ex="sales-csv">CSV</button>`)}
   ${c('wallet', 'var(--leaf-tint)', 'var(--leaf-2)', 'Pemasukan &amp; pengeluaran', 'Buku kas termasuk penjualan harian.', `<button class="btn btn-primary btn-sm" data-ex="kas">Excel</button><button class="btn btn-ghost btn-sm" data-ex="kas-csv">CSV</button>`)}
   ${c('sheet', '#E3F1E6', '#188038', 'Buka di Google Sheets', 'Database aplikasi ini. Bisa langsung dibuat grafik, difilter, atau diunduh dari menu File.', S.sheetUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">Buka Sheet ↗</a>` : '<span class="muted small">Login sebagai Admin</span>')}
  </div>`;
};
BIND.ekspor = () => $$('[data-ex]').forEach(b => b.onclick = () => busy(b, async () => {
  try {
    const k = b.dataset.ex, tag = `${exP.from}_${exP.to}`;
    if (k.startsWith('sales')) { const s = await api('sales', { from: exP.from, to: exP.to }); k === 'sales' ? exportSalesXlsx(s, 'penjualan-' + tag) : csv(salesItemRows(s), 'penjualan-' + tag); return; }
    if (k.startsWith('kas')) { const ks = await api('kasList', { from: exP.from, to: exP.to }); const rows = ks.reverse().map(x => ({ Tanggal: x.tanggal, Jenis: x.jenis, Kategori: x.kategori, Keterangan: x.keterangan, Metode: x.metode, Jumlah: x.jumlah })); k === 'kas' ? xlsx([['Kas', rows]], 'kas-' + tag) : csv(rows, 'kas-' + tag); return; }
    const [all, s, lr] = await Promise.all([api('exportAll', { from: exP.from, to: exP.to }), api('sales', { from: exP.from, to: exP.to }), api('report', { from: exP.from, to: exP.to })]);
    xlsx([['Transaksi', salesRows(s)], ['Item Terjual', salesItemRows(s)], ['Pembayaran', all.Pembayaran], ['Kas', all.Kas], ['Stok Masuk', all.StokMasuk], ['Sisa Stok', all.Stok], ['Laba Rugi', lrRows(lr)]], 'laporan-mbo-suti-' + tag);
  } catch (e) { $('#ex-err').innerHTML = errBox(e.message); }
}));

/* ======================= MENU & HARGA ======================= */
VIEWS.menu = () => `<div class="page-h"><div><h2>Menu &amp; Harga</h2><p>Perubahan langsung terkirim ke semua kasir.</p></div><button class="btn btn-primary btn-sm" data-menu-new>+ Menu baru</button></div>
  ${errBox(D.menuAll_err)}${D.menuAll === undefined ? loading() : `<div class="card tbl-wrap"><table><thead><tr><th>Menu</th><th>Kategori</th><th class="r">Harga</th><th class="r">Modal</th><th>Status</th><th></th></tr></thead><tbody>
  ${D.menuAll.map(m => `<tr class="${m.aktif ? '' : 'void'}"><td><b>${esc(m.nama)}</b></td><td class="muted">${esc(m.kategori)}</td><td class="r num">${rk(m.harga)}</td><td class="r num muted">${rk(m.modal)}</td><td>${m.aktif ? '<span class="badge b-ok">Dijual</span>' : '<span class="badge b-low">Disembunyikan</span>'}</td><td><button class="btn btn-ghost btn-sm" data-menu-edit="${esc(m.id)}">Ubah</button></td></tr>`).join('')}
  </tbody></table></div>`}`;
LOAD.menu = () => load('menu', 'menuAll', () => api('menuAll'));
BIND.menu = () => {
  const n = $('[data-menu-new]'); if (n) n.onclick = () => menuSheet({ aktif: true });
  $$('[data-menu-edit]').forEach(b => b.onclick = () => menuSheet(D.menuAll.find(m => m.id === b.dataset.menuEdit)));
};
function menuSheet(m) {
  const katList = [...new Set((D.menuAll || []).map(x => x.kategori))];
  openSheet(`<div class="sheet-h"><h3>${m.id ? 'Ubah menu' : 'Menu baru'}</h3><button class="x" data-close>×</button></div>
  <form class="sheet-b" id="mn-f"><label class="field"><span>Nama</span><input id="mn-n" value="${esc(m.nama || '')}" required></label>
   <label class="field"><span>Kategori</span><input id="mn-k" list="mn-kl" value="${esc(m.kategori || '')}" required><datalist id="mn-kl">${katList.map(k => `<option>${esc(k)}</option>`).join('')}</datalist></label>
   <div class="form-grid"><label class="field"><span>Harga jual</span><input id="mn-h" type="number" inputmode="numeric" value="${m.harga || ''}" required></label>
   <label class="field"><span>Modal / porsi (taksiran)</span><input id="mn-m" type="number" inputmode="numeric" value="${m.modal || ''}"></label></div>
   <label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:14px"><input type="checkbox" id="mn-a" ${m.aktif ? 'checked' : ''}> Tampilkan di kasir</label>
   <div id="mn-err"></div><button class="btn btn-primary btn-block" type="submit">Simpan</button></form>`);
  $('[data-close]').onclick = closeSheet;
  $('#mn-f').onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => {
    try { await api('menuSave', { menu: { id: m.id, nama: $('#mn-n').value, kategori: $('#mn-k').value, harga: +$('#mn-h').value, modal: +$('#mn-m').value, aktif: $('#mn-a').checked } }); closeSheet(); toast('Menu tersimpan'); await refreshBootstrap(); LOAD.menu(); }
    catch (err) { $('#mn-err').innerHTML = errBox(err.message); }
  }); };
}

/* ======================= PENGGUNA ======================= */
VIEWS.pengguna = () => `<div class="page-h"><div><h2>Pengguna</h2><p>1 akun Admin. Kasir masuk pakai nama + PIN 6 angka.</p></div><button class="btn btn-primary btn-sm" data-u-new>+ Tambah kasir</button></div>
  ${errBox(D.users_err)}${D.users === undefined ? loading() : `<div class="card tbl-wrap"><table><thead><tr><th>Nama</th><th>Peran</th><th>Status</th><th></th></tr></thead><tbody>
  ${D.users.map(u => `<tr class="${u.aktif ? '' : 'void'}"><td><b>${esc(u.nama)}</b>${u.email ? `<br><span class="muted small">${esc(u.email)}</span>` : ''}</td><td>${u.peran === 'admin' ? '<span class="role-pill">Admin</span>' : '<span class="badge b-low">Kasir</span>'}</td>
   <td>${u.aktif ? '<span class="badge b-ok">Aktif</span>' : '<span class="badge b-out">Nonaktif</span>'}</td><td><button class="btn btn-ghost btn-sm" data-u-edit="${esc(u.id)}">Ubah</button></td></tr>`).join('')}
  </tbody></table></div>`}`;
LOAD.pengguna = () => load('pengguna', 'users', () => api('userList'));
BIND.pengguna = () => {
  const n = $('[data-u-new]'); if (n) n.onclick = () => userSheet({ peran: 'kasir', aktif: true });
  $$('[data-u-edit]').forEach(b => b.onclick = () => userSheet(D.users.find(u => u.id === b.dataset.uEdit)));
};
function userSheet(u) {
  const adm = u.peran === 'admin';
  openSheet(`<div class="sheet-h"><h3>${u.id ? 'Ubah ' + esc(u.nama) : 'Kasir baru'}</h3><button class="x" data-close>×</button></div>
  <form class="sheet-b" id="u-f"><label class="field"><span>Nama</span><input id="u-n" value="${esc(u.nama || '')}" required></label>
   ${adm ? `<label class="field"><span>Email login</span><input id="u-e" type="email" value="${esc(u.email || '')}"></label>` : ''}
   <label class="field"><span>${adm ? 'Kata sandi baru (min. 8 karakter)' : 'PIN 6 angka'}${u.id ? ' · kosongkan jika tidak diganti' : ''}</span><input id="u-p" type="password" ${adm ? '' : 'inputmode="numeric" maxlength="6"'} ${u.id ? '' : 'required'}></label>
   ${u.id && !adm ? `<label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:14px"><input type="checkbox" id="u-a" ${u.aktif ? 'checked' : ''}> Aktif</label>` : ''}
   <div class="small muted" style="margin-bottom:12px">${adm ? 'Setelah sandi diganti, perangkat lain yang login sebagai Admin otomatis keluar.' : 'Ganti PIN atau nonaktifkan akan membuat kasir ini otomatis keluar dari semua HP.'}</div>
   <div id="u-err"></div><button class="btn btn-primary btn-block" type="submit">Simpan</button></form>`);
  $('[data-close]').onclick = closeSheet;
  $('#u-f').onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => {
    const a = $('#u-a'), em = $('#u-e');
    try {
      await api('userSave', { user: { id: u.id, nama: $('#u-n').value, pin: $('#u-p').value || undefined, aktif: a ? a.checked : undefined, email: em ? em.value : undefined } });
      closeSheet(); toast('Tersimpan');
      if (u.id === S.user.id) { toast('Sandi diganti, silakan login lagi'); return logout(); }
      LOAD.pengguna();
    } catch (err) { $('#u-err').innerHTML = errBox(err.message); }
  }); };
}

/* ======================= PENGATURAN (ADMIN) ======================= */
const SET_FIELDS = [
  ['Struk', [['nama_toko', 'Nama toko'], ['subjudul', 'Baris kedua'], ['telepon', 'Kontak'], ['footer', 'Catatan kaki']]],
  ['Pembayaran', [['rekening', 'Info rekening transfer']]],
  ['Stok', [['min_stok', 'Batas stok menipis (porsi)', 'number']]],
  ['Saldo awal neraca', [['tanggal_mulai', 'Tanggal mulai pakai aplikasi', 'date'], ['kas_awal', 'Kas tunai awal', 'number'], ['bank_awal', 'Saldo bank/QRIS/e-wallet awal', 'number'], ['peralatan_awal', 'Nilai peralatan', 'number'], ['akum_penyusutan', 'Akumulasi penyusutan', 'number'], ['utang_awal', 'Utang awal', 'number']]]
];
VIEWS.pengaturan = () => `<div class="page-h"><div><h2>Pengaturan</h2><p>Berlaku untuk semua perangkat.</p></div></div>
  <form id="set-f" class="grid g2" style="align-items:start">
  ${SET_FIELDS.map(([g, fs]) => `<div class="card pad settings-sec"><h3>${g}</h3>${fs.map(([k, l, t]) => `<label class="field"><span>${l}</span><input data-set="${k}" type="${t || 'text'}" ${t === 'number' ? 'inputmode="numeric"' : ''} value="${esc(S.settings[k] || '')}"></label>`).join('')}</div>`).join('')}
  <div class="card pad settings-sec"><h3>Gambar QRIS warung</h3>
   ${S.settings.qris_gambar ? `<img class="qris-img" src="${esc(S.settings.qris_gambar)}" alt="QRIS" style="margin-bottom:10px">` : '<p class="muted small">Belum ada. Foto atau screenshot QRIS statis warung, lalu pilih di sini.</p>'}
   <label class="field"><span>Pilih gambar</span><input type="file" accept="image/*" id="qris-file"></label>
   ${S.settings.qris_gambar ? '<button type="button" class="btn btn-danger btn-sm" id="qris-del">Hapus gambar</button>' : ''}</div>
  <div class="card pad settings-sec"><h3>Perangkat ini</h3><p class="muted small">Kode perangkat <b>${device.code}</b> (dipakai di nomor struk). Server: <span style="word-break:break-all">${esc(apiUrl().slice(0, 60))}…</span></p>
   ${CFG.API_URL ? '' : '<button type="button" class="btn btn-ghost btn-sm" id="chg-srv">Ganti server</button>'}</div>
  <div style="grid-column:1/-1"><div id="set-err"></div><button class="btn btn-primary" type="submit">Simpan pengaturan</button></div></form>`;
BIND.pengaturan = () => {
  $('#set-f').onsubmit = (e) => { e.preventDefault(); busy(e.submitter, async () => {
    const s = {}; $$('[data-set]').forEach(i => s[i.dataset.set] = i.value);
    try { S.settings = await api('settingsSave', { settings: s }); LS.set('settings', S.settings); toast('Pengaturan tersimpan'); }
    catch (err) { $('#set-err').innerHTML = errBox(err.message); }
  }); };
  $('#qris-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = await shrinkImage(f);
      S.settings = await api('settingsSave', { settings: { qris_gambar: data } }); LS.set('settings', S.settings); toast('Gambar QRIS tersimpan'); render();
    } catch (err) { $('#set-err').innerHTML = errBox(err.message); }
  };
  const del = $('#qris-del'); if (del) del.onclick = async () => { S.settings = await api('settingsSave', { settings: { qris_gambar: '' } }); LS.set('settings', S.settings); render(); };
  const cs = $('#chg-srv'); if (cs) cs.onclick = () => { logout(); showSetup(); };
};
// Perkecil gambar QRIS supaya muat di 1 sel Google Sheet (maks ±49 ribu karakter)
async function shrinkImage(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Gambar tidak bisa dibaca')); i.src = URL.createObjectURL(file); });
  for (const w of [520, 440, 380, 320]) {
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(img.height / img.width * w);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.65, 0.5]) { const d = c.toDataURL('image/jpeg', q); if (d.length < 48000) return d; }
  }
  throw new Error('Gambar terlalu besar. Potong (crop) bagian QR saja lalu coba lagi.');
}

/* ======================= PRINTER (PERANGKAT) ======================= */
VIEWS.printer = () => `<div class="page-h"><div><h2>Printer Struk</h2><p>Pengaturan ini hanya untuk perangkat ini.</p></div></div>
  <div class="grid g2" style="align-items:start"><div class="card pad settings-sec"><h3>Cara cetak</h3>
   ${[['bluetooth', 'Bluetooth langsung', 'Chrome di Android + printer thermal Bluetooth (BLE). Tanpa aplikasi tambahan.'],
    ['rawbt', 'Lewat aplikasi RawBT', 'Untuk printer Bluetooth yang tidak terdeteksi langsung. Pasang RawBT (gratis) dari Play Store, sambungkan printer sekali di RawBT.'],
    ['sistem', 'Dialog cetak (laptop/USB)', 'Pakai printer yang terpasang di laptop/PC. Pilih ukuran kertas 58 mm.']].map(([k, l, d]) =>
    `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1.5px solid ${device.print === k ? 'var(--leaf)' : 'var(--rule)'};border-radius:12px;margin-bottom:8px;background:#fff"><input type="radio" name="pm" value="${k}" ${device.print === k ? 'checked' : ''} style="margin-top:4px"><span><b>${l}</b><br><span class="muted small">${d}</span></span></label>`).join('')}
   <label class="field" style="margin-top:12px"><span>Rangkap bawaan</span><select id="pr-cp"><option value="tanya" ${device.copies === 'tanya' ? 'selected' : ''}>1 rangkap (bisa diganti saat cetak)</option><option value="2" ${device.copies === '2' ? 'selected' : ''}>2 rangkap (pelanggan + arsip)</option></select></label>
   <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="pr-logo" ${device.logo === false ? '' : 'checked'}> Cetak logo di struk</label></div>
  <div class="card pad settings-sec"><h3>Tes</h3><p class="muted small">${device.print === 'bluetooth' ? (Printer.hasBluetooth() ? 'Tekan Tes cetak, lalu pilih printer dari daftar (nyalakan printer &amp; Bluetooth HP dulu).' : 'Browser ini tidak mendukung Bluetooth langsung. Pakai Chrome di Android, atau pilih RawBT.') : ''}</p>
   <div id="pr-err"></div><button class="btn btn-primary" id="pr-test">${ic('print', 16)}Tes cetak</button>
   ${device.print === 'bluetooth' && Printer.hasBluetooth() ? '<button class="btn btn-ghost" id="pr-pick" style="margin-left:6px">Pilih printer lain</button>' : ''}
   ${Printer.btName ? `<p class="small" style="margin-top:10px">Tersambung: <b>${esc(Printer.btName)}</b></p>` : ''}</div></div>`;
BIND.printer = () => {
  $$('[name=pm]').forEach(r => r.onchange = () => { device.print = r.value; saveDevice(); render(); });
  $('#pr-cp').onchange = (e) => { device.copies = e.target.value; saveDevice(); };
  $('#pr-logo').onchange = (e) => { device.logo = e.target.checked; saveDevice(); };
  const test = { no: 'TES-001', waktu: nowWIB(), kasir: S.user.nama, tipe: 'Tes', items: [{ nama: 'Nasi Pecel Pincuk Campur', qty: 1, harga: 15000 }], total: 15000, pays: [{ m: 'tunai', amt: 15000 }], dibayar: 20000, status: 'OK' };
  $('#pr-test').onclick = (e) => busy(e.currentTarget, async () => { try { if (device.print === 'sistem') { $('#print').innerHTML = receiptHTML(test); window.print(); } else { await doPrintRaw(test); render(); } } catch (err) { $('#pr-err').innerHTML = errBox(err.message); } });
  const pick = $('#pr-pick'); if (pick) pick.onclick = () => Printer.btConnect(true).then(() => { toast('Printer tersambung'); render(); }).catch(err => $('#pr-err').innerHTML = errBox(err.message));
};
async function doPrintRaw(sale) {
  const bytes = await Printer.buildReceipt(sale, { copies: 1, settings: S.settings, logo: device.logo === false ? null : 'icons/logo.png', methodLabel });
  if (device.print === 'rawbt') Printer.rawbtPrint(bytes); else { await Printer.btPrint(bytes); toast('Tes cetak terkirim'); }
}

boot();
