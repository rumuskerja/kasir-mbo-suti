/**
 * KASIR MBO SUTI — backend Google Apps Script
 * Google Sheet = database. Skrip ini dipasang di Sheet (Ekstensi > Apps Script),
 * lalu di-deploy sebagai Web App. Aplikasi PWA memanggil URL Web App ini.
 *
 * Langkah pertama: jalankan fungsi `setup` sekali dari editor Apps Script.
 */

var TZ = 'Asia/Jakarta';
var TOKEN_DAYS = 14;

var SHEETS = {
  Menu:        ['id', 'nama', 'kategori', 'harga', 'modal', 'aktif', 'urut'],
  Stok:        ['menu_id', 'nama', 'sisa', 'minimum', 'diubah'],
  StokMasuk:   ['waktu', 'tanggal', 'menu_id', 'nama', 'qty', 'harga_beli', 'total', 'sumber', 'oleh'],
  Transaksi:   ['no', 'waktu', 'tanggal', 'kasir', 'tipe', 'total', 'hpp', 'metode', 'dibayar', 'kembali', 'status', 'catatan'],
  TransaksiItem: ['no', 'tanggal', 'menu_id', 'nama', 'qty', 'harga', 'subtotal', 'modal', 'hpp', 'status'],
  Pembayaran:  ['no', 'tanggal', 'metode', 'detail', 'jumlah', 'status'],
  Kas:         ['id', 'waktu', 'tanggal', 'jenis', 'kategori', 'keterangan', 'jumlah', 'metode', 'oleh'],
  Pengguna:    ['id', 'nama', 'peran', 'email', 'pin_hash', 'aktif'],
  Pengaturan:  ['kunci', 'nilai', 'keterangan']
};
// Kolom yang dipaksa teks supaya Sheets tidak mengubahnya jadi tanggal/angka
var TEXT_COLS = ['id', 'no', 'waktu', 'tanggal', 'menu_id', 'diubah', 'pin_hash', 'kunci', 'nilai', 'detail'];

var KAS_KHUSUS = {
  // kategori yang TIDAK masuk laba rugi (pergerakan neraca)
  'Modal tambahan': 'modal_in',
  'Pinjaman masuk': 'utang_in',
  'Bayar utang': 'utang_out',
  'Beli peralatan': 'alat_out',
  'Ambil pribadi (prive)': 'prive_out'
};

var DEFAULT_SETTINGS = [
  ['nama_toko', 'PECEL PINCUK MBO SUTI', 'Judul di struk'],
  ['subjudul', 'Pecel Pincuk khas Surabaya', 'Baris kedua struk'],
  ['telepon', 'WA 0811 1563 660', 'Kontak di struk'],
  ['footer', 'Matur nuwun, monggo mampir maneh!', 'Catatan kaki struk'],
  ['min_stok', '5', 'Batas stok menipis (porsi)'],
  ['kas_awal', '0', 'Saldo kas tunai saat mulai pakai aplikasi'],
  ['bank_awal', '0', 'Saldo rekening/QRIS/e-wallet saat mulai'],
  ['peralatan_awal', '0', 'Nilai peralatan dapur & etalase saat mulai'],
  ['akum_penyusutan', '0', 'Akumulasi penyusutan peralatan (isi manual)'],
  ['utang_awal', '0', 'Utang ke supplier/pihak lain saat mulai'],
  ['tanggal_mulai', '', 'Tanggal mulai pakai aplikasi'],
  ['qris_gambar', '', 'Gambar QRIS statis (diisi dari menu Pengaturan aplikasi)'],
  ['rekening', 'BCA 1234567890 a.n. Mbo Suti', 'Info transfer'],
  ['versi_stok', '1', 'Naik setiap stok berubah (dipakai untuk sinkron)']
];

var SEED_MENU = [
  ['n1','Nasi Pecel Pincuk Campur','Nasi',15000,6000],['n2','Nasi Pecel Pincuk Pisah','Nasi',17000,7000],['n3','Lontong Pecel Pincuk','Nasi',15000,6000],
  ['n4','Nasi Rawon','Nasi',30000,14000],['n5','Nasi Urap','Nasi',15000,6000],['n6','Nasi Rames','Nasi',10000,4500],['n7','Nasi Empal Daging','Nasi',17000,8000],['n8','Nasi Ayam Goreng','Nasi',17000,8000],
  ['p1','Paket Ayam Penyet','Paket',20000,9500],
  ['t1','Telur Bumbu Bali','Telur',5000,2200],['t2','Telur Dadar','Telur',5000,2000],['t3','Telur Ceplok','Telur',5000,2000],['t4','Telur Asin','Telur',6000,3000],
  ['s1','Sate Ati Ampela','Sate',8000,3500],['s2','Sate Kulit','Sate',6000,2500],['s3','Sate Usus','Sate',5000,2000],
  ['l1','Pecel Pincuk Sayur','Lauk',12000,4500],['l2','Urap Sayur','Lauk',12000,4500],['l3','Rawon','Lauk',25000,12000],['l4','Empal Daging','Lauk',12000,6000],['l5','Ayam Goreng','Lauk',12000,6000],
  ['l6','Tongkol Balado','Lauk',7000,3000],['l7','Cumi Jagung Manis','Lauk',10000,4500],['l8','Teri Kacang','Lauk',8000,3500],['l9','Terong Balado','Lauk',5000,2000],['l10','Perkedel Kentang','Lauk',3000,1200],
  ['l11','Tempe / Tahu Bacem','Lauk',3000,1200],['l12','Tahu Bumbu Bali','Lauk',3000,1300],['l13','Sambal Goreng Ati','Lauk',5000,2300],['l14','Kentang Mustofa','Lauk',5000,2000],
  ['m1','Kunyit Asam','Minuman',7000,2500],['m2','Teh Sereh Lemon','Minuman',7000,2500],
  ['x1','Nasi Putih','Tambahan',5000,1500],['x2','Kerupuk Kuning','Tambahan',5000,2000],['x3','Kerupuk Udang','Tambahan',3000,1200]
];

/* =========================== SETUP =========================== */

/** Jalankan SEKALI dari editor Apps Script. Membuat semua tab + akun admin. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = SHEETS[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#47701C').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
      head.forEach(function (h, i) {
        if (TEXT_COLS.indexOf(h) >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
      });
    }
  });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());

  if (sheet_('Pengaturan').getLastRow() < 2) {
    var st = DEFAULT_SETTINGS.map(function (r) { return r.slice(); });
    st.forEach(function (r) { if (r[0] === 'tanggal_mulai') r[1] = today_(); });
    append_('Pengaturan', st);
  }
  if (sheet_('Menu').getLastRow() < 2) {
    append_('Menu', SEED_MENU.map(function (m, i) { return [m[0], m[1], m[2], m[3], m[4], 'YA', i + 1]; }));
    append_('Stok', SEED_MENU.map(function (m) { return [m[0], m[1], 0, '', now_()]; }));
  }
  if (sheet_('Pengguna').getLastRow() < 2) {
    append_('Pengguna', [
      ['U1', 'Admin', 'admin', 'admin@mbosuti.id', hash_('U1', 'mbosuti123'), 'YA'],
      ['U2', 'Kasir 1', 'kasir', '', hash_('U2', '123456'), 'YA']
    ]);
  }
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  Logger.log('Setup selesai. Login admin: admin@mbosuti.id / mbosuti123 (segera ganti). Kasir 1 PIN 123456.');
}

/* =========================== HTTP =========================== */

function doGet(e) {
  return json_({ ok: true, app: 'kasir-mbo-suti', time: now_() });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Format permintaan salah' }); }
  try {
    var fn = ACTIONS[req.action];
    if (!fn) throw new Error('Aksi tidak dikenal: ' + req.action);
    var user = null;
    if (PUBLIC.indexOf(req.action) < 0) {
      user = verify_(req.token);
      if (ADMIN_ONLY.indexOf(req.action) >= 0 && user.peran !== 'admin') throw new Error('Khusus Admin');
    }
    var data = fn(req, user);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

var PUBLIC = ['kasirList', 'login', 'ping'];
var ADMIN_ONLY = ['stockIn', 'stockSet', 'kasAdd', 'kasList', 'report', 'neraca', 'menuSave', 'userSave', 'settingsSave', 'voidSale', 'exportAll'];

var ACTIONS = {
  ping: function () { return { time: now_() }; },

  kasirList: function () {
    return rows_('Pengguna').filter(function (u) { return u.peran === 'kasir' && u.aktif === 'YA'; })
      .map(function (u) { return { id: u.id, nama: u.nama }; });
  },

  login: function (req) {
    var users = rows_('Pengguna');
    var u = null;
    if (req.role === 'admin') {
      u = users.filter(function (x) { return x.peran === 'admin' && String(x.email).toLowerCase() === String(req.email || '').trim().toLowerCase(); })[0];
    } else {
      u = users.filter(function (x) { return x.peran === 'kasir' && x.id === req.id; })[0];
    }
    if (!u || u.aktif !== 'YA' || u.pin_hash !== hash_(u.id, String(req.pin || ''))) {
      Utilities.sleep(800);
      throw new Error(req.role === 'admin' ? 'Email atau kata sandi salah' : 'PIN salah');
    }
    return { token: sign_(u), user: { id: u.id, nama: u.nama, peran: u.peran } };
  },

  /** Data awal saat aplikasi dibuka */
  bootstrap: function (req, user) {
    var s = settings_();
    delete s.versi_stok;
    return {
      user: { id: user.id, nama: user.nama, peran: user.peran },
      menu: rows_('Menu').filter(function (m) { return m.aktif === 'YA'; })
        .sort(function (a, b) { return num_(a.urut) - num_(b.urut); })
        .map(function (m) { return { id: m.id, nama: m.nama, kategori: m.kategori, harga: num_(m.harga), modal: num_(m.modal) }; }),
      stock: stockMap_(),
      version: stockVersion_(),
      settings: s,
      sheetUrl: user.peran === 'admin' ? SpreadsheetApp.getActiveSpreadsheet().getUrl() : ''
    };
  },

  /** Dipanggil berkala (polling) untuk sinkron stok. Murah: cek versi dulu. */
  stock: function (req) {
    var v = stockVersion_();
    if (req.version && String(req.version) === String(v)) return { version: v, changed: false };
    return { version: v, changed: true, stock: stockMap_() };
  },

  /** Simpan penjualan. Idempoten berdasarkan nomor struk (aman untuk antrean offline). */
  sale: function (req, user) {
    var s = req.sale;
    if (!s || !s.no || !s.items || !s.items.length) throw new Error('Data transaksi tidak lengkap');
    return withLock_(function () {
      var exists = col_('Transaksi', 'no').indexOf(String(s.no)) >= 0;
      if (exists) return { no: s.no, duplicate: true, stock: stockMap_(), version: stockVersion_() };
      var menu = byId_(rows_('Menu'));
      var waktu = s.waktu || now_();
      var tgl = String(waktu).slice(0, 10);
      var total = 0, hpp = 0, itemRows = [];
      s.items.forEach(function (it) {
        var m = menu[it.id] || {};
        var qty = num_(it.qty), harga = num_(it.harga), modal = num_(m.modal);
        total += qty * harga; hpp += qty * modal;
        itemRows.push([s.no, tgl, it.id, it.nama || m.nama, qty, harga, qty * harga, modal, qty * modal, 'OK']);
      });
      var pays = (s.pays || []).map(function (p) { return [s.no, tgl, p.m, p.detail || '', num_(p.amt), 'OK']; });
      var paySum = pays.reduce(function (a, p) { return a + p[4]; }, 0);
      if (Math.abs(paySum - total) > 1) throw new Error('Total pembayaran (' + paySum + ') tidak sama dengan total belanja (' + total + ')');
      var dibayar = num_(s.dibayar) || total;
      var metode = pays.length > 1 ? 'split' : (pays[0] ? pays[0][2] : 'tunai');
      append_('Transaksi', [[s.no, waktu, tgl, user.nama, s.tipe || 'Dine-in', total, hpp, metode, dibayar, Math.max(0, dibayar - total), 'OK', s.catatan || '']]);
      append_('TransaksiItem', itemRows);
      append_('Pembayaran', pays);
      var delta = {};
      s.items.forEach(function (it) { delta[it.id] = (delta[it.id] || 0) - num_(it.qty); });
      adjustStock_(delta);
      return { no: s.no, stock: stockMap_(), version: stockVersion_() };
    });
  },

  /** Riwayat transaksi. Kasir: hanya hari ini. Admin: rentang tanggal. */
  sales: function (req, user) {
    var from = req.from || today_(), to = req.to || today_();
    if (user.peran !== 'admin') { from = today_(); to = today_(); }
    var tx = rows_('Transaksi').filter(function (t) { return inRange_(t.tanggal, from, to); });
    var nos = {}; tx.forEach(function (t) { nos[t.no] = true; });
    var items = {}, pays = {};
    rows_('TransaksiItem').forEach(function (i) { if (nos[i.no]) (items[i.no] = items[i.no] || []).push({ id: i.menu_id, nama: i.nama, qty: num_(i.qty), harga: num_(i.harga) }); });
    rows_('Pembayaran').forEach(function (p) { if (nos[p.no]) (pays[p.no] = pays[p.no] || []).push({ m: p.metode, detail: p.detail, amt: num_(p.jumlah) }); });
    return tx.reverse().map(function (t) {
      return { no: t.no, waktu: t.waktu, kasir: t.kasir, tipe: t.tipe, total: num_(t.total), hpp: num_(t.hpp), dibayar: num_(t.dibayar),
        status: t.status, items: items[t.no] || [], pays: pays[t.no] || [] };
    });
  },

  voidSale: function (req, user) {
    return withLock_(function () {
      var sh = sheet_('Transaksi'), data = sh.getDataRange().getValues(), h = data[0];
      var iNo = h.indexOf('no'), iSt = h.indexOf('status'), iCat = h.indexOf('catatan');
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][iNo]) === String(req.no)) {
          if (data[r][iSt] === 'VOID') throw new Error('Transaksi sudah dibatalkan');
          sh.getRange(r + 1, iSt + 1).setValue('VOID');
          sh.getRange(r + 1, iCat + 1).setValue('Dibatalkan ' + user.nama + ' ' + now_() + (req.alasan ? ': ' + req.alasan : ''));
          setStatusWhere_('TransaksiItem', req.no, 'VOID');
          setStatusWhere_('Pembayaran', req.no, 'VOID');
          var delta = {};
          rows_('TransaksiItem').forEach(function (i) { if (String(i.no) === String(req.no)) delta[i.menu_id] = (delta[i.menu_id] || 0) + num_(i.qty); });
          adjustStock_(delta);
          return { no: req.no, stock: stockMap_(), version: stockVersion_() };
        }
      }
      throw new Error('Transaksi tidak ditemukan');
    });
  },

  stockIn: function (req, user) {
    var qty = num_(req.qty);
    if (!req.id || qty === 0) throw new Error('Pilih menu dan isi jumlah');
    return withLock_(function () {
      var m = byId_(rows_('Menu'))[req.id];
      if (!m) throw new Error('Menu tidak ditemukan');
      var harga = req.harga === '' || req.harga == null ? num_(m.modal) : num_(req.harga);
      append_('StokMasuk', [[now_(), today_(), req.id, m.nama, qty, harga, qty * harga, req.sumber || '', user.nama]]);
      if (req.asExpense && qty * harga > 0) {
        append_('Kas', [[kasId_(), now_(), today_(), 'keluar', 'Bahan baku', 'Stok masuk ' + m.nama + ' x' + qty + (req.sumber ? ' (' + req.sumber + ')' : ''), qty * harga, req.metode || 'Tunai', user.nama]]);
      }
      var d = {}; d[req.id] = qty;
      adjustStock_(d);
      return { stock: stockMap_(), version: stockVersion_() };
    });
  },

  /** Stok opname: set sisa stok ke angka tertentu */
  stockSet: function (req, user) {
    return withLock_(function () {
      var cur = stockMap_();
      var d = {}; d[req.id] = num_(req.qty) - num_(cur[req.id] && cur[req.id].sisa);
      adjustStock_(d);
      if (req.minimum !== undefined) setStockMin_(req.id, req.minimum);
      return { stock: stockMap_(), version: stockVersion_() };
    });
  },

  stockInList: function (req) {
    return rows_('StokMasuk').filter(function (r) { return inRange_(r.tanggal, req.from || addDays_(today_(), -30), req.to || today_()); })
      .reverse().slice(0, 200).map(function (r) { return { waktu: r.waktu, nama: r.nama, qty: num_(r.qty), harga: num_(r.harga_beli), sumber: r.sumber, oleh: r.oleh }; });
  },

  kasAdd: function (req, user) {
    var jumlah = num_(req.jumlah);
    if (!jumlah || jumlah < 0) throw new Error('Jumlah harus diisi');
    if (req.jenis !== 'masuk' && req.jenis !== 'keluar') throw new Error('Jenis salah');
    append_('Kas', [[kasId_(), now_(), req.tanggal || today_(), req.jenis, req.kategori || 'Lain-lain', req.keterangan || '', jumlah, req.metode || 'Tunai', user.nama]]);
    return true;
  },

  kasList: function (req) {
    var from = req.from || addDays_(today_(), -30), to = req.to || today_();
    var out = rows_('Kas').filter(function (k) { return inRange_(k.tanggal, from, to); })
      .map(function (k) { return { id: k.id, waktu: k.waktu, tanggal: k.tanggal, jenis: k.jenis, kategori: k.kategori, keterangan: k.keterangan, jumlah: num_(k.jumlah), metode: k.metode, oleh: k.oleh }; });
    // Penjualan per hari dimasukkan otomatis sebagai pemasukan
    var daily = {};
    rows_('Pembayaran').forEach(function (p) {
      if (p.status !== 'OK' || !inRange_(p.tanggal, from, to)) return;
      var key = p.tanggal + '|' + p.metode;
      daily[key] = (daily[key] || 0) + num_(p.jumlah);
    });
    Object.keys(daily).forEach(function (key) {
      var t = key.split('|');
      out.push({ id: 'PJ-' + key, waktu: t[0] + 'T23:59:00', tanggal: t[0], jenis: 'masuk', kategori: 'Penjualan', keterangan: 'Total penjualan ' + METODE_LABEL[t[1]] , jumlah: daily[key], metode: METODE_LABEL[t[1]] || t[1], oleh: 'otomatis', auto: true });
    });
    out.sort(function (a, b) { return a.waktu < b.waktu ? 1 : -1; });
    return out;
  },

  report: function (req) { return labaRugi_(req.from || monthStart_(), req.to || today_()); },

  neraca: function (req) { return neraca_(req.to || today_()); },

  menuSave: function (req) {
    var m = req.menu;
    if (!m || !m.nama) throw new Error('Nama menu wajib');
    return withLock_(function () {
      if (!m.id) {
        m.id = 'M' + new Date().getTime().toString(36);
        append_('Menu', [[m.id, m.nama, m.kategori || 'Lain', num_(m.harga), num_(m.modal), m.aktif === false ? 'TIDAK' : 'YA', 999]]);
        append_('Stok', [[m.id, m.nama, 0, '', now_()]]);
      } else {
        updateRow_('Menu', 'id', m.id, { nama: m.nama, kategori: m.kategori, harga: num_(m.harga), modal: num_(m.modal), aktif: m.aktif === false ? 'TIDAK' : 'YA' });
        updateRow_('Stok', 'menu_id', m.id, { nama: m.nama });
      }
      bumpVersion_();
      return { id: m.id };
    });
  },

  menuAll: function () {
    var st = stockMap_();
    return rows_('Menu').map(function (m) { return { id: m.id, nama: m.nama, kategori: m.kategori, harga: num_(m.harga), modal: num_(m.modal), aktif: m.aktif === 'YA', sisa: st[m.id] ? st[m.id].sisa : 0, minimum: st[m.id] ? st[m.id].minimum : '' }; });
  },

  userList: function (req, user) {
    if (user.peran !== 'admin') throw new Error('Khusus Admin');
    return rows_('Pengguna').map(function (u) { return { id: u.id, nama: u.nama, peran: u.peran, email: u.email, aktif: u.aktif === 'YA' }; });
  },

  userSave: function (req, user) {
    var u = req.user;
    return withLock_(function () {
      if (!u.id) {
        if (!u.nama || !/^\d{6}$/.test(String(u.pin || ''))) throw new Error('Nama dan PIN 6 angka wajib');
        var id = 'U' + new Date().getTime().toString(36);
        append_('Pengguna', [[id, u.nama, 'kasir', '', hash_(id, String(u.pin)), 'YA']]);
        return { id: id };
      }
      var patch = {};
      if (u.nama) patch.nama = u.nama;
      if (u.aktif !== undefined) patch.aktif = u.aktif ? 'YA' : 'TIDAK';
      if (u.email) patch.email = u.email;
      if (u.pin) {
        var target = rows_('Pengguna').filter(function (x) { return x.id === u.id; })[0];
        if (!target) throw new Error('Pengguna tidak ditemukan');
        if (target.peran === 'kasir' && !/^\d{6}$/.test(String(u.pin))) throw new Error('PIN kasir harus 6 angka');
        if (target.peran === 'admin' && String(u.pin).length < 8) throw new Error('Kata sandi admin minimal 8 karakter');
        patch.pin_hash = hash_(u.id, String(u.pin));
      }
      if (u.id === user.id && patch.aktif === 'TIDAK') throw new Error('Admin tidak bisa menonaktifkan diri sendiri');
      updateRow_('Pengguna', 'id', u.id, patch);
      return { id: u.id };
    });
  },

  settingsSave: function (req) {
    var s = req.settings || {};
    Object.keys(s).forEach(function (k) {
      if (k === 'versi_stok') return;
      var v = String(s[k]);
      if (v.length > 49000) throw new Error('Isi pengaturan "' + k + '" terlalu besar');
      if (!updateRow_('Pengaturan', 'kunci', k, { nilai: v })) append_('Pengaturan', [[k, v, '']]);
    });
    return settings_();
  },

  /** Semua data mentah untuk unduh Excel */
  exportAll: function (req) {
    var from = req.from || '0000-00-00', to = req.to || '9999-99-99';
    var f = function (name) { return rows_(name).filter(function (r) { return !r.tanggal || inRange_(r.tanggal, from, to); }); };
    return { Transaksi: f('Transaksi'), TransaksiItem: f('TransaksiItem'), Pembayaran: f('Pembayaran'), Kas: f('Kas'), StokMasuk: f('StokMasuk'), Stok: rows_('Stok') };
  }
};

var METODE_LABEL = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', ewallet: 'E-Wallet' };

/* =========================== LAPORAN =========================== */

function labaRugi_(from, to) {
  var pend = 0, hpp = 0, n = 0;
  rows_('Transaksi').forEach(function (t) {
    if (t.status === 'OK' && inRange_(t.tanggal, from, to)) { pend += num_(t.total); hpp += num_(t.hpp); n++; }
  });
  var lain = {}, beban = {}, belanjaBahan = 0;
  rows_('Kas').forEach(function (k) {
    if (!inRange_(k.tanggal, from, to) || KAS_KHUSUS[k.kategori]) return;
    var j = num_(k.jumlah);
    if (k.jenis === 'masuk') lain[k.kategori] = (lain[k.kategori] || 0) + j;
    else if (k.kategori === 'Bahan baku') belanjaBahan += j;
    else beban[k.kategori] = (beban[k.kategori] || 0) + j;
  });
  var tLain = sum_(lain), tBeban = sum_(beban);
  // HPP = belanja bahan baku pada periode (dasar kas, paling sesuai untuk warung).
  // hpp_taksiran = modal per menu x porsi terjual, ditampilkan sebagai pembanding.
  var hppPakai = belanjaBahan;
  return {
    from: from, to: to, transaksi: n,
    penjualan: pend, hpp: hppPakai, hpp_taksiran: hpp,
    laba_kotor: pend - hppPakai,
    pendapatan_lain: lain, total_lain: tLain,
    beban: beban, total_beban: tBeban,
    laba_bersih: pend - hppPakai + tLain - tBeban
  };
}

function neraca_(to) {
  var s = settings_();
  var kasAwal = num_(s.kas_awal), bankAwal = num_(s.bank_awal), alatAwal = num_(s.peralatan_awal), utangAwal = num_(s.utang_awal), peny = num_(s.akum_penyusutan);
  var tunai = kasAwal, bank = bankAwal, alat = alatAwal, utang = utangAwal, modalTambah = 0, prive = 0, labaKum = 0;
  rows_('Pembayaran').forEach(function (p) {
    if (p.status !== 'OK' || p.tanggal > to) return;
    var j = num_(p.jumlah);
    if (p.metode === 'tunai') tunai += j; else bank += j;
    labaKum += j;
  });
  rows_('Kas').forEach(function (k) {
    if (k.tanggal > to) return;
    var j = num_(k.jumlah), sign = k.jenis === 'masuk' ? 1 : -1;
    if (String(k.metode).toLowerCase() === 'tunai') tunai += sign * j; else bank += sign * j;
    var kh = KAS_KHUSUS[k.kategori];
    if (kh === 'modal_in') modalTambah += j;
    else if (kh === 'utang_in') utang += j;
    else if (kh === 'utang_out') utang -= j;
    else if (kh === 'alat_out') alat += j;
    else if (kh === 'prive_out') prive += j;
    else labaKum += sign * j;
  });
  var nilaiStok = 0, st = stockMap_(), menu = byId_(rows_('Menu'));
  Object.keys(st).forEach(function (id) { if (menu[id]) nilaiStok += Math.max(0, st[id].sisa) * num_(menu[id].modal); });
  var modalAwal = kasAwal + bankAwal + alatAwal - utangAwal;
  var aset = tunai + bank + alat - peny;
  var ekuitas = modalAwal + modalTambah - prive + labaKum - peny;
  return {
    per: to,
    aset: { kas_tunai: tunai, bank_nontunai: bank, peralatan: alat, akum_penyusutan: -peny, total: aset },
    kewajiban: { utang: utang, total: utang },
    ekuitas: { modal_awal: modalAwal, modal_tambahan: modalTambah, prive: -prive, laba_ditahan: labaKum, penyusutan: -peny, total: ekuitas },
    seimbang: Math.abs(aset - (utang + ekuitas)) < 1,
    info_nilai_stok: nilaiStok
  };
}

/* =========================== STOK =========================== */

function stockMap_() {
  var out = {}, min = num_(settings_().min_stok) || 5;
  rows_('Stok').forEach(function (r) { out[r.menu_id] = { sisa: num_(r.sisa), minimum: r.minimum === '' ? min : num_(r.minimum) }; });
  return out;
}

function adjustStock_(delta) {
  var sh = sheet_('Stok'), data = sh.getDataRange().getValues(), h = data[0];
  var iId = h.indexOf('menu_id'), iS = h.indexOf('sisa'), iU = h.indexOf('diubah');
  var seen = {};
  for (var r = 1; r < data.length; r++) {
    var id = String(data[r][iId]);
    if (delta[id] !== undefined) {
      data[r][iS] = num_(data[r][iS]) + delta[id];
      data[r][iU] = now_();
      seen[id] = true;
    }
  }
  if (data.length > 1) sh.getRange(1, 1, data.length, h.length).setValues(data);
  var menu = byId_(rows_('Menu'));
  var missing = Object.keys(delta).filter(function (id) { return !seen[id]; })
    .map(function (id) { return [id, menu[id] ? menu[id].nama : id, delta[id], '', now_()]; });
  if (missing.length) append_('Stok', missing);
  bumpVersion_();
}

function setStockMin_(id, minimum) { updateRow_('Stok', 'menu_id', id, { minimum: minimum === '' ? '' : num_(minimum) }); }

function stockVersion_() {
  var c = CacheService.getScriptCache().get('versi_stok');
  if (c) return c;
  var v = settings_().versi_stok || '1';
  CacheService.getScriptCache().put('versi_stok', String(v), 21600);
  return String(v);
}

function bumpVersion_() {
  var v = String(new Date().getTime());
  updateRow_('Pengaturan', 'kunci', 'versi_stok', { nilai: v });
  CacheService.getScriptCache().put('versi_stok', v, 21600);
}

/* =========================== AUTH =========================== */

function hash_(id, pin) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET') || '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, secret + '|' + id + '|' + pin, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}

function sign_(u) {
  var exp = new Date().getTime() + TOKEN_DAYS * 864e5;
  var payload = u.id + '.' + u.peran + '.' + exp + '.' + String(u.pin_hash).slice(0, 8);
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, PropertiesService.getScriptProperties().getProperty('SECRET')));
  return payload + '.' + sig;
}

function verify_(token) {
  var p = String(token || '').split('.');
  if (p.length !== 5) throw new Error('SESI_HABIS');
  var payload = p.slice(0, 4).join('.');
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, PropertiesService.getScriptProperties().getProperty('SECRET')));
  if (sig !== p[4] || Number(p[2]) < new Date().getTime()) throw new Error('SESI_HABIS');
  var u = rows_('Pengguna').filter(function (x) { return x.id === p[0]; })[0];
  // Token otomatis batal kalau akun dinonaktifkan atau PIN/sandi diganti
  if (!u || u.aktif !== 'YA' || String(u.pin_hash).slice(0, 8) !== p[3]) throw new Error('SESI_HABIS');
  return { id: u.id, nama: u.nama, peran: u.peran };
}

/* =========================== UTIL SHEET =========================== */

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" belum ada. Jalankan setup() dulu.');
  return sh;
}

function rows_(name) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  var data = sh.getDataRange().getValues(), h = data[0];
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var o = {};
    for (var c = 0; c < h.length; c++) o[h[c]] = cell_(data[r][c], h[c]);
    out.push(o);
  }
  return out;
}

function cell_(v, head) {
  if (v instanceof Date) {
    return head === 'tanggal' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return typeof v === 'string' ? v : (v === null || v === undefined ? '' : (TEXT_COLS.indexOf(head) >= 0 ? String(v) : v));
}

function col_(name, head) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = h.indexOf(head);
  return sh.getRange(2, i + 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(cell_(r[0], head)); });
}

function append_(name, rows) {
  if (!rows.length) return;
  var sh = sheet_(name), last = sh.getLastRow();
  if (last + rows.length > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 500);
  sh.getRange(last + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function updateRow_(name, keyCol, key, patch) {
  var sh = sheet_(name), data = sh.getDataRange().getValues(), h = data[0], k = h.indexOf(keyCol);
  for (var r = 1; r < data.length; r++) {
    if (String(cell_(data[r][k], keyCol)) === String(key)) {
      Object.keys(patch).forEach(function (f) {
        var c = h.indexOf(f);
        if (c >= 0 && patch[f] !== undefined) sh.getRange(r + 1, c + 1).setValue(patch[f]);
      });
      return true;
    }
  }
  return false;
}

function setStatusWhere_(name, no, status) {
  var sh = sheet_(name), data = sh.getDataRange().getValues(), h = data[0];
  var iNo = h.indexOf('no'), iSt = h.indexOf('status');
  for (var r = 1; r < data.length; r++) if (String(data[r][iNo]) === String(no)) data[r][iSt] = status;
  if (data.length > 1) sh.getRange(1, 1, data.length, h.length).setValues(data);
}

function settings_() {
  var o = {};
  rows_('Pengaturan').forEach(function (r) { o[r.kunci] = String(r.nilai); });
  return o;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Server sibuk, coba lagi');
  try { return fn(); } finally { lock.releaseLock(); }
}

function byId_(rows) { var o = {}; rows.forEach(function (r) { o[r.id] = r; }); return o; }
function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function sum_(o) { return Object.keys(o).reduce(function (a, k) { return a + o[k]; }, 0); }
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function monthStart_() { return today_().slice(0, 8) + '01'; }
function addDays_(ymd, n) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function inRange_(t, from, to) { t = String(t).slice(0, 10); return t >= from && t <= to; }
function kasId_() { return 'K' + new Date().getTime().toString(36) + Math.floor(Math.random() * 100); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
