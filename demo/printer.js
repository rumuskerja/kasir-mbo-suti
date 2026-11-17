/* Cetak struk ke printer thermal 58 mm (ESC/POS).
 * 3 cara: (1) Bluetooth langsung dari Chrome Android (printer BLE),
 *         (2) lewat aplikasi RawBT (printer Bluetooth biasa/Classic, paling kompatibel),
 *         (3) dialog cetak sistem (window.print) untuk laptop/USB. */
(function () {
  const COLS = 32; // 58 mm, Font A = 32 karakter per baris
  const enc = (s) => {
    const out = [];
    for (const ch of String(s)) { const c = ch.charCodeAt(0); out.push(c < 128 ? c : (c === 0x2013 || c === 0x2014 ? 45 : 63)); }
    return out;
  };
  const ESC = 0x1b, GS = 0x1d;

  function Builder() {
    const b = [];
    const api = {
      raw(a) { b.push(...a); return api; },
      init() { return api.raw([ESC, 0x40]); },
      align(a) { return api.raw([ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]); },
      bold(on) { return api.raw([ESC, 0x45, on ? 1 : 0]); },
      size(w, h) { return api.raw([GS, 0x21, ((w - 1) << 4) | (h - 1)]); },
      text(s) { return api.raw(enc(s)); },
      line(s = '') { return api.text(s).raw([0x0a]); },
      lr(l, r) { l = String(l); r = String(r); const sp = Math.max(1, COLS - l.length - r.length); if (l.length + r.length + 1 > COLS) return api.line(l).line(' '.repeat(Math.max(0, COLS - r.length)) + r); return api.line(l + ' '.repeat(sp) + r); },
      wrap(s) { const words = String(s).split(' '); let cur = ''; words.forEach(w => { if ((cur + ' ' + w).trim().length > COLS) { api.line(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) api.line(cur); return api; },
      hr() { return api.line('-'.repeat(COLS)); },
      feed(n = 3) { return api.raw([ESC, 0x64, n]); },
      cut() { return api.raw([GS, 0x56, 0x42, 0x00]); },
      image(img) { if (!img) return api; const { w, h, bytes } = img; return api.raw([GS, 0x76, 0x30, 0, (w / 8) & 255, ((w / 8) >> 8) & 255, h & 255, (h >> 8) & 255]).raw(bytes); },
      bytes() { return new Uint8Array(b); }
    };
    return api;
  }

  // Logo -> bitmap hitam putih (dithering) untuk ESC/POS
  let logoCache = null;
  async function logoBitmap(src, width = 160) {
    if (logoCache) return logoCache;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const w = width, h = Math.round(img.height / img.width * w);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data; const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const bytes = new Uint8Array((w / 8) * h);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const i = y * w + xx, old = g[i], nw = old < 140 ? 0 : 255, err = old - nw; g[i] = nw;
      if (nw === 0) bytes[y * (w / 8) + (xx >> 3)] |= (0x80 >> (xx & 7));
      if (xx + 1 < w) g[i + 1] += err * 7 / 16;
      if (y + 1 < h) { if (xx > 0) g[i + w - 1] += err * 3 / 16; g[i + w] += err * 5 / 16; if (xx + 1 < w) g[i + w + 1] += err / 16; }
    }
    logoCache = { w, h, bytes };
    return logoCache;
  }

  const rk = (n) => Math.round(n).toLocaleString('id-ID');

  async function buildReceipt(sale, opt) {
    const s = opt.settings || {};
    const labels = opt.copies === 2 ? ['UNTUK PELANGGAN', 'ARSIP TOKO'] : [null];
    let logo = null;
    try { logo = opt.logo ? await logoBitmap(opt.logo) : null; } catch (e) { logo = null; }
    const b = Builder().init();
    labels.forEach((label, idx) => {
      b.align('center');
      if (label) b.bold(true).line('[ ' + label + ' ]').bold(false);
      if (logo) b.image(logo).line();
      b.bold(true).line(s.nama_toko || 'PECEL PINCUK MBO SUTI').bold(false);
      if (s.subjudul) b.line(s.subjudul);
      if (s.telepon) b.line(s.telepon);
      b.align('left').hr();
      const d = new Date(sale.waktu);
      b.lr(sale.no, sale.tipe || '');
      b.lr(d.toLocaleDateString('id-ID') + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), sale.kasir || '');
      b.hr();
      sale.items.forEach(i => { b.wrap(i.nama); b.lr('  ' + i.qty + ' x ' + rk(i.harga), rk(i.qty * i.harga)); });
      b.hr().bold(true).lr('TOTAL', rk(sale.total)).bold(false);
      (sale.pays || []).forEach(p => b.lr(opt.methodLabel(p) , rk(p.m === 'tunai' && sale.pays.length === 1 ? (sale.dibayar || p.amt) : p.amt)));
      const kembali = (sale.pays || []).length === 1 && sale.pays[0].m === 'tunai' ? Math.max(0, (sale.dibayar || 0) - sale.total) : 0;
      if (kembali) b.lr('Kembali', rk(kembali));
      if (sale.status === 'VOID') b.align('center').bold(true).line('*** DIBATALKAN ***').bold(false);
      b.hr().align('center');
      if (s.footer) b.wrap(s.footer);
      b.feed(idx === labels.length - 1 ? 4 : 3).cut();
    });
    return b.bytes();
  }

  // ---------- Bluetooth langsung (Web Bluetooth, printer BLE) ----------
  const SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb'];
  let bt = { device: null, ch: null };
  async function btConnect(forcePick) {
    if (!navigator.bluetooth) throw new Error('Browser ini tidak mendukung Bluetooth langsung. Pakai Chrome di Android, atau pilih cara cetak "RawBT".');
    if (bt.ch && bt.device && bt.device.gatt.connected && !forcePick) return bt.ch;
    if (!bt.device || forcePick) bt.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    const server = await bt.device.gatt.connect();
    const services = await server.getPrimaryServices();
    for (const sv of services) {
      for (const ch of await sv.getCharacteristics()) {
        if (ch.properties.writeWithoutResponse || ch.properties.write) { bt.ch = ch; return ch; }
      }
    }
    throw new Error('Printer tidak punya jalur cetak yang dikenali. Coba cara cetak "RawBT".');
  }
  async function btPrint(bytes) {
    const ch = await btConnect();
    const CH = 180;
    for (let i = 0; i < bytes.length; i += CH) {
      const part = bytes.slice(i, i + CH);
      if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(part);
      else await ch.writeValue(part);
      await new Promise(r => setTimeout(r, 25));
    }
  }

  // ---------- RawBT (aplikasi Android gratis, untuk printer Bluetooth Classic) ----------
  function rawbtPrint(bytes) {
    let bin = ''; bytes.forEach(x => bin += String.fromCharCode(x));
    const b64 = btoa(bin);
    location.href = 'intent:base64,' + b64 + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
  }

  window.Printer = {
    buildReceipt, btConnect, btPrint, rawbtPrint,
    get btName() { return bt.device ? bt.device.name : ''; },
    hasBluetooth: () => !!navigator.bluetooth
  };
})();
