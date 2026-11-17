# Kasir Pecel Pincuk Mbo Suti

Aplikasi kasir (PWA) untuk HP dan laptop. Datanya disimpan di **Google Sheet milik Anda sendiri**, dan aplikasinya di-hosting gratis di **GitHub Pages**. Tidak ada biaya langganan.

```
HP kasir / laptop / HP admin  ──►  Google Apps Script (API)  ──►  Google Sheet (database)
        (GitHub Pages, gratis)          (gratis, akun Google Anda)
```

## Isi folder

| Folder | Isi |
|---|---|
| `app/` | Aplikasinya (HTML, JS, CSS, ikon). Folder inilah yang di-hosting. |
| `apps-script/Code.gs` | Backend. Ditempel ke Google Sheet lewat Apps Script. |
| `dev/` | Alat uji coba (simulasi Google Sheet + tes otomatis). Tidak perlu di-hosting. |
| `mockup/` | Mockup awal. |

---

## Langkah 1: Siapkan Google Sheet (sekitar 10 menit, sekali saja)

1. Buka [sheets.new](https://sheets.new) (login dengan akun Google warung). Beri nama, misalnya **Database Kasir Mbo Suti**.
2. Klik menu **Ekstensi → Apps Script**.
3. Hapus isi file `Code.gs` yang ada, lalu **tempel seluruh isi** file `apps-script/Code.gs`. Klik ikon **Simpan** (disket).
4. Di bagian atas editor, pilih fungsi **`setup`** lalu klik **Jalankan**.
   - Google akan minta izin. Klik **Tinjau izin → pilih akun → Lanjutan → Buka (tidak aman) → Izinkan**. Ini normal untuk skrip buatan sendiri.
   - Setelah selesai, kembali ke Sheet. Akan muncul tab: Menu, Stok, StokMasuk, Transaksi, TransaksiItem, Pembayaran, Kas, Pengguna, Pengaturan. Menu dan harga sudah terisi.
5. Klik **Terapkan (Deploy) → Deployment baru**.
   - Klik ikon roda gigi, pilih jenis **Aplikasi web**.
   - **Jalankan sebagai: Saya**
   - **Yang memiliki akses: Siapa saja** (wajib, supaya HP kasir bisa terhubung. Data tetap terkunci oleh login aplikasi.)
   - Klik **Terapkan**, lalu **salin URL Aplikasi web** (berakhiran `/exec`).

> Kalau nanti `Code.gs` diperbarui: tempel kode baru, Simpan, lalu **Terapkan → Kelola deployment → ikon pensil → Versi: Baru → Terapkan**. URL tetap sama.

## Langkah 2: Hosting gratis di GitHub Pages

1. Isi semua file folder ini ke repo GitHub `kasir-mbo-suti`.
2. Di repo: **Settings → Pages → Source: GitHub Actions**. Setiap ada perubahan di folder `app/`, aplikasi otomatis ter-update.
3. Alamat aplikasi: `https://<username>.github.io/kasir-mbo-suti/`

**URL server:** tempel URL `/exec` dari Langkah 1 ke `app/config.js` (bagian `API_URL`). Kalau dibiarkan kosong, setiap perangkat akan diminta menempel URL itu sekali saat pertama dibuka.

## Langkah 3: Login pertama & pengaturan awal

| Akun | Login awal | Wajib |
|---|---|---|
| Admin | email `admin@mbosuti.id`, sandi `mbosuti123` | **Segera ganti** sandi & email di menu Pengguna |
| Kasir 1 | pilih "Kasir 1", PIN `123456` | Ganti nama & PIN, tambah kasir lain |

Lalu sebagai Admin:
1. **Pengaturan → Gambar QRIS warung**: foto/screenshot QRIS statis yang sudah ada, unggah. Gambar ini muncul di layar kasir saat pelanggan bayar QRIS.
2. **Pengaturan → Saldo awal neraca**: isi kas tunai, saldo rekening, nilai peralatan, dan utang saat mulai pakai aplikasi.
3. **Pengaturan → Info rekening transfer**.
4. **Stok Masuk**: isi stok awal setiap menu (semua menu mulai dari 0 = Habis).

## Langkah 4: Pasang di HP

- **Android (Chrome)**: buka alamat aplikasi, ketuk menu ⋮ lalu **Tambahkan ke layar utama / Instal aplikasi**. Ikon logo Mbo Suti akan muncul seperti aplikasi biasa.
- **iPhone (Safari)**: ketuk Bagikan lalu **Tambah ke Layar Utama**.

## Printer Bluetooth thermal 58 mm

Atur di menu **Printer** (per HP):
- **Bluetooth langsung**: Chrome di Android + printer yang mendukung BLE. Tekan Tes cetak, pilih printer.
- **Lewat RawBT** (paling kompatibel): pasang aplikasi **RawBT** (gratis, Play Store), sambungkan printer sekali di RawBT, lalu pilih cara cetak ini.
- **Dialog cetak**: untuk laptop/PC, pilih ukuran kertas 58 mm.

Rangkap 1 atau 2 dipilih setiap selesai transaksi (2 rangkap = salinan pelanggan + arsip toko).

---

## Cara kerja penting

- **Sinkron stok**: setiap HP mengecek stok terbaru tiap 15 detik (dan saat aplikasi dibuka lagi). Jadi update stok dari Admin sampai ke kasir dalam ≤15 detik. Bisa diubah di `config.js` (`POLL_DETIK`).
- **Offline**: kalau sinyal putus, transaksi tetap bisa dan disimpan di HP (status "Offline · 1 antre"). Begitu online, otomatis terkirim. Nomor struk dibuat di HP, jadi tidak pernah dobel.
- **Stok per menu**: penjualan otomatis mengurangi stok menu tersebut. Admin bisa koreksi lewat Sisa Stok → Ubah (stok opname).
- **Laba rugi**: Penjualan − HPP (belanja kategori "Bahan baku") − beban operasional + pendapatan lain.
- **Neraca**: dihitung otomatis dari saldo awal + semua transaksi, selalu seimbang. Kategori khusus (Modal tambahan, Pinjaman masuk, Bayar utang, Beli peralatan, Ambil pribadi) masuk neraca, bukan laba rugi.
- **Batal transaksi**: hanya Admin (Riwayat → Batal). Stok dikembalikan, data tetap tersimpan dengan status VOID.
- **Unduh data**: menu Unduh Data (Excel/CSV), atau buka Sheet langsung lalu **File → Download → Microsoft Excel**.

## Batasan Google Sheets (perlu diketahui)

| Hal | Dampak untuk warung |
|---|---|
| **Kecepatan** | Setiap simpan butuh ±1–3 detik. Kasir tidak menunggu karena transaksi disimpan di HP dulu lalu dikirim di belakang layar. |
| **Bukan realtime murni** | Stok tersinkron tiap 15 detik, bukan seketika. Kasir juga tidak bisa menjual melebihi stok yang terlihat di HP-nya. |
| **Kuota gratis Google** | Cukup untuk beberapa HP kasir di 1 warung. Batas Google: ±20.000 panggilan/hari dan 30 permintaan bersamaan. Polling 3 HP selama 14 jam ≈ 10.000 panggilan. |
| **Ukuran data** | Sheet menampung 10 juta sel. Kira-kira cukup untuk 5+ tahun transaksi warung. Laporan setahun ke atas akan terasa lebih lambat. |
| **Keamanan** | Sandi & PIN disimpan dalam bentuk acak (hash), login memakai token yang kedaluwarsa 14 hari. Tapi **siapa pun yang punya akses edit ke Google Sheet bisa mengubah data langsung**, jadi jangan bagikan Sheet ke kasir. |
| **Jangan ubah struktur** | Jangan ganti nama tab/kolom di Sheet. Mengisi data langsung di Sheet boleh (misal koreksi harga), tapi lebih aman lewat aplikasi. |

## Untuk developer: uji coba lokal

```bash
node dev/test-backend.js         # tes logika backend dengan simulasi Google Sheet
node dev/server.js 8787          # jalankan aplikasi + simulasi di http://localhost:8787
node dev/test-e2e.js             # tes 2 perangkat (perlu Playwright), server harus jalan
```
