RKB App - Karyamas Plantation (PWA + GAS)
=========================================

Struktur:
- index.html                 : PWA entry
- manifest.json, sw.js       : PWA manifest + service worker
- css/style.css              : tema light/dark, tabel, dsb
- js/utils.js                : helper (localStorage wrapper, toast, progress modal, format tanggal)
- js/auth.js                 : sesi (3 hari), API call ke GAS
- js/app.js                  : router, navbar, login, theme toggle
- js/pages/*                 : halaman Form RKB, Draft/Outbox, Approval Askep/Manager, KTU, Settings
- backend/Code.gs            : Google Apps Script (Web App)

Cara Pakai Singkat
------------------
1) FRONTEND
   - Host folder ini di Github Pages / Netlify / lokal (bisa dibuka langsung).
   - Buka index.html.
   - Klik menu "Setting", tempel URL Web App GAS pada kolom "GAS URL".

2) BACKEND (GAS + Google Sheets)
   - Buat Spreadsheet baru di Google Drive.
   - App Script > buat file baru, tempel isi `backend/Code.gs`.
   - Set Script Properties:
       TELEGRAM_BOT_TOKEN = <token bot>
       (opsional) TELEGRAM_CHAT_TEST = <chat id test>
   - Deploy Web App:
       - Execute As: Me
       - Who has access: Anyone with the link
   - Salin URL Web App dan tempel ke Frontend (Setting).

3) LOGIN
   - User default otomatis dibuat saat pertama login:
       username: admin
       password: user123
     (Jika sheet users belum ada)

4) MASTER DATA
   - Gunakan menu Setting > "Tarik Master & Data Aktual" untuk menarik data master.
   - Master yang didukung: yplant, yestate, yrayon, ydivisi, ykomplek, yblok, yactivity, ybahan, yorg_map, yrates.
   - Atur `yorg_map` untuk mapping user ke divisi/estate/telegram id/dsb.
   - Atur `users` untuk role user dan password (hash SHA-256). Admin bisa reset password user ke `user123` dengan action reset (endpoint tersedia).

5) FORM RKB (Asisten)
   - Periode via modal (input type=month).
   - No RKB otomatis: `RKB{DIVISI}{yymmddhhmmss}`.
   - Jenis Pekerjaan: autosuggest dari `yactivity`.
   - Lokasi: modal pilih dari `yblok`/`ykomplek`, otomatis hitung total luas (Ha) -> Volume.
   - HK/Unit: modal pengaturan %BHL, %SKU, %BHB (default 0/100/0).
   - Bahan: multi item, autosuggest dari `ybahan`.
   - Auto-save draft ke localStorage.
   - Submit (Sync) kirim ke GAS; jika offline/gagal -> masuk Outbox.

6) APPROVAL
   - Askep: review "submitted", bisa komentar (mengembalikan status ke draft) atau approve (status askep_approved).
   - Manager: review "askep_approved", bisa komentar (kembali draft) atau approve (full_approved).
   - Notifikasi Telegram untuk event submit/approve/komentar.

7) KTU
   - Melihat daftar RKB full_approved beserta total kebutuhan bahan.

8) OFFLINE
   - PWA caches assets; data master & actuals disimpan di localStorage.
   - Tabel no-wrap + horizontal scroll; tampilan responsif mobile.

Catatan
-------
- Pastikan mengisi `window.GAS_URL` di index.html atau pada halaman Settings.
- Untuk keamanan produksi, tambahkan validasi token lebih ketat dan pembatasan CORS.
- Anda bisa memperluas struktur sheet master sesuai kebutuhan (tambahkan kolom, tetap pastikan header baris 1).

Selamat mencoba!
