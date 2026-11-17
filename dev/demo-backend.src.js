/* DEMO: menjalankan backend asli (Code.gs) di dalam browser dengan Google Sheet tiruan
 * yang disimpan di localStorage. Dipakai untuk link demo yang bisa dibagikan tanpa Google. */
(function () {
  const CODE = __CODE__;
  const KEY = 'ms_demo_db_v1';
  const W = window.KASIR_DEMO = window.KASIR_DEMO || {};

  function hashBytes(str) { // hash tiruan (bukan kriptografi, cukup untuk demo)
    const out = []; for (let k = 0; k < 32; k++) { let h = 2166136261 ^ (k * 16777619); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } out.push((h >>> (k % 24)) & 255); }
    return out;
  }
  function makeEnv(state) {
    const mkSheet = (name, s) => {
      s = s || { name, data: [], maxRows: 1000 }; state.sheets[name] = s;
      const range = (r, c, nr = 1, nc = 1) => {
        const R = {
          getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined || v === null ? '' : v); } out.push(row); } return out; },
          setValues: (v) => { for (let i = 0; i < nr; i++) { s.data[r - 1 + i] = s.data[r - 1 + i] || []; for (let j = 0; j < nc; j++) s.data[r - 1 + i][c - 1 + j] = v[i][j]; } return R; },
          setValue: (v) => R.setValues([[v]]), setFontWeight: () => R, setBackground: () => R, setFontColor: () => R, setNumberFormat: () => R
        };
        return R;
      };
      const lastRow = () => { let n = s.data.length; while (n > 0 && (!s.data[n - 1] || s.data[n - 1].every(x => x === '' || x == null))) n--; return n; };
      const lastCol = () => Math.max(0, ...s.data.map(r => (r || []).length));
      return { getRange: range, getLastRow: lastRow, getLastColumn: lastCol, getMaxRows: () => s.maxRows, insertRowsAfter: (_, n) => { s.maxRows += n; },
        getDataRange: () => range(1, 1, Math.max(1, lastRow()), Math.max(1, lastCol())), setFrozenRows: () => { }, getName: () => name };
    };
    const handles = {}; Object.keys(state.sheets).forEach(n => handles[n] = mkSheet(n, state.sheets[n]));
    const ss = { getSheetByName: n => handles[n] || null, insertSheet: n => (handles[n] = mkSheet(n)), getSheets: () => Object.values(handles), deleteSheet: () => { },
      setSpreadsheetTimeZone: () => { }, getUrl: () => 'https://docs.google.com/spreadsheets/' };
    const b64 = (arr) => btoa(String.fromCharCode(...arr.map(x => x & 255))).replace(/\+/g, '-').replace(/\//g, '_');
    return {
      SpreadsheetApp: { getActiveSpreadsheet: () => ss },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => state.props[k] ?? null, setProperty: (k, v) => { state.props[k] = v; } }) },
      CacheService: { getScriptCache: () => ({ get: () => null, put: () => { } }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } }) },
      Utilities: { DigestAlgorithm: {}, Charset: {}, computeDigest: (a, s) => hashBytes(s), computeHmacSha256Signature: (s, k) => hashBytes(k + '|' + s), base64EncodeWebSafe: b64,
        getUuid: () => Math.random().toString(36).slice(2) + Date.now().toString(36), sleep: () => { },
        formatDate: (d, tz, f) => { const t = new Date(d.getTime() + 7 * 3600e3).toISOString(); return f === 'yyyy-MM-dd' ? t.slice(0, 10) : t.slice(0, 19); } },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => ({ text: t }) }) },
      Logger: { log: () => { } }
    };
  }
  const NAMES = ['SpreadsheetApp', 'PropertiesService', 'CacheService', 'LockService', 'Utilities', 'ContentService', 'Logger'];
  const factory = new Function(...NAMES, CODE + '\nreturn { doPost: doPost, setup: setup };');
  function withDb(fn) {
    let state; try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    const fresh = !state; state = state || { sheets: {}, props: {} };
    const env = makeEnv(state); const gas = factory(...NAMES.map(n => env[n]));
    if (fresh) seed(gas);
    const r = fn(gas);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
    return r;
  }
  const call = (gas, body) => JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(body) } }).text);

  function seed(gas) {
    gas.setup();
    const A = call(gas, { action: 'login', role: 'admin', email: 'admin@mbosuti.id', pin: 'mbosuti123' }).data.token;
    const P = (action, o) => call(gas, Object.assign({ action, token: A }, o));
    P('userSave', { user: { id: 'U2', nama: 'Shely' } });
    P('userSave', { user: { nama: 'Rina', pin: '123456' } });
    const menu = P('bootstrap').data.menu;
    let rnd = 7; const R = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const day = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    P('settingsSave', { settings: { kas_awal: 2000000, bank_awal: 3500000, peralatan_awal: 8500000, akum_penyusutan: 400000, utang_awal: 1200000, tanggal_mulai: day(-13), rekening: 'BCA 1234567890 a.n. Mbo Suti (contoh)' } });
    menu.forEach(m => P('stockIn', { id: m.id, qty: 400, harga: m.modal, sumber: 'Stok awal' }));
    const popular = ['n1', 'n1', 'n1', 'n3', 'p1', 'n4', 'n2', 't1', 's1', 'l10', 'm1', 'm2', 'x2', 'n6', 'n8', 'l11', 'x1'];
    const meth = ['tunai', 'tunai', 'tunai', 'qris', 'qris', 'ewallet', 'transfer'];
    let seq = 0;
    for (let d = -13; d <= 0; d++) {
      const date = day(d), n = d === 0 ? 14 : 24 + Math.floor(R() * 14);
      for (let i = 0; i < n; i++) {
        const items = []; const k = 1 + Math.floor(R() * 3);
        for (let j = 0; j < k; j++) { const pid = popular[Math.floor(R() * popular.length)]; const m = menu.find(x => x.id === pid); const ex = items.find(z => z.id === m.id); ex ? ex.qty++ : items.push({ id: m.id, nama: m.nama, qty: 1 + (R() > .8 ? 1 : 0), harga: m.harga }); }
        const total = items.reduce((s, x) => s + x.qty * x.harga, 0); const mt = meth[Math.floor(R() * meth.length)];
        const hh = String(7 + Math.floor(i * 7 / n)).padStart(2, '0'), mm = String(Math.floor(R() * 60)).padStart(2, '0');
        P('sale', { sale: { no: date.slice(2).replace(/-/g, '') + '-DM' + String(++seq).padStart(3, '0'), waktu: `${date}T${hh}:${mm}:00`, tipe: R() > .4 ? 'Dine-in' : 'Bungkus',
          items, pays: [{ m: mt, amt: total, detail: mt === 'ewallet' ? 'GoPay' : '' }], dibayar: mt === 'tunai' ? Math.ceil(total / 10000) * 10000 : total } });
      }
    }
    const K = (d, jenis, kategori, keterangan, jumlah, metode) => P('kasAdd', { jenis, kategori, keterangan, jumlah, metode, tanggal: day(d) });
    [-13, -11, -9, -7, -5, -3, -1].forEach(d => K(d, 'keluar', 'Bahan baku', 'Belanja sayur, kacang, bumbu (Pasar Keputran)', 520000 + Math.floor(R() * 200) * 1000, 'Tunai'));
    [-12, -8, -4, 0].forEach(d => K(d, 'keluar', 'Bahan baku', 'Daging, ayam, telur', 650000 + Math.floor(R() * 150) * 1000, 'Transfer'));
    K(-8, 'keluar', 'Gaji', 'Gaji mingguan 2 karyawan', 1400000, 'Transfer'); K(-1, 'keluar', 'Gaji', 'Gaji mingguan 2 karyawan', 1400000, 'Transfer');
    K(-9, 'keluar', 'Gas & listrik', 'Gas LPG 3 tabung', 66000, 'Tunai'); K(-3, 'keluar', 'Gas & listrik', 'Token listrik', 200000, 'E-Wallet');
    K(-5, 'keluar', 'Kemasan', 'Daun pisang, kertas nasi, kantong', 145000, 'Tunai');
    K(-6, 'masuk', 'Pesanan katering', 'Nasi kotak 40 pcs arisan RT 05', 800000, 'Transfer');
    K(-2, 'keluar', 'Bayar utang', 'Cicilan utang supplier', 400000, 'Transfer');
    // gambar QRIS CONTOH (bukan QR pembayaran asli)
    let cells = ''; for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) { const f = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17); if (f) { const e = Math.max(Math.abs(x - (x < 7 ? 3 : 21)), Math.abs(y - (y < 7 ? 3 : 21))); if (e !== 2) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } else if (R() > .5) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -5 29 36"><rect x="-2" y="-5" width="29" height="36" fill="#fff"/><text x="12.5" y="-1.5" font-size="2.6" text-anchor="middle" font-family="Arial" font-weight="bold">QRIS MBO SUTI</text><g fill="#111">${cells}</g><rect x="4" y="10" width="17" height="5" fill="#C7361C"/><text x="12.5" y="13.6" font-size="2.8" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="bold">CONTOH</text><text x="12.5" y="29" font-size="1.5" text-anchor="middle" font-family="Arial">Ganti dengan QRIS asli di Pengaturan</text></svg>`;
    P('settingsSave', { settings: { qris_gambar: 'data:image/svg+xml;base64,' + btoa(svg) } });
    // beberapa stok dibuat menipis supaya terlihat peringatannya
    menu.forEach(m => P('stockSet', { id: m.id, qty: 12 + Math.floor(R() * 34) }));
    P('stockSet', { id: 't2', qty: 3 }); P('stockSet', { id: 's3', qty: 0 }); P('stockSet', { id: 'l13', qty: 4 });
  }

  W.reset = () => { try { localStorage.clear(); } catch (e) { } location.hash = ''; location.reload(); };
  const origFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    if (String(url) !== 'demo://api') return origFetch(url, opts);
    return new Promise((res, rej) => setTimeout(() => {
      if (W.offline) return rej(new TypeError('offline'));
      try { const out = withDb(gas => gas.doPost({ postData: { contents: opts.body } }).text); res(new Response(out, { headers: { 'Content-Type': 'application/json' } })); }
      catch (e) { res(new Response(JSON.stringify({ ok: false, error: String(e.message || e) }))); }
    }, 220));
  };
})();
