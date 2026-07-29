# Panduan Deploy Survei Ekskul ke Cloudflare — Dari Nol

Panduan ini ditulis untuk orang yang **belum pernah sama sekali** pakai
Cloudflare, GitHub, atau database. Ikuti **TAHAP 1 sampai TAHAP 7 secara
berurutan, jangan ada yang dilompati**. Tiap tahap ada tanda **✅ CEK**
sebelum lanjut ke tahap berikutnya — jangan lanjut kalau tanda cek itu
belum terpenuhi.

Total waktu kalau diikuti pelan-pelan dan teliti: **±45-60 menit**.

---

## Sebelum Mulai: Kenapa Harus Diulang dari Awal?

Kalau sebelumnya Anda sempat mencoba dan menemui error, **sebaiknya mulai
benar-benar bersih** — hapus percobaan yang lama, supaya tidak ada file
atau pengaturan setengah jadi yang bikin bingung. Cara menghapusnya ada di
**TAHAP 0** di bawah. Kalau Anda memang benar-benar belum pernah mencoba
sama sekali, boleh langsung lompat ke **TAHAP 1**.

---

## TAHAP 0 — Bersihkan Percobaan Lama (kalau ada)

Lewati tahap ini kalau Anda belum pernah membuat apa pun sebelumnya.

### 0.1 Hapus Worker lama di Cloudflare
1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) → login.
2. Di sidebar kiri, klik **Workers & Pages**.
3. Klik nama Worker lama Anda (misal `siekstrasapa`).
4. Klik tab **Settings**.
5. Scroll ke paling bawah, ke bagian **General**.
6. Klik tombol merah **Delete**.
7. Akan muncul konfirmasi — ketik nama Worker-nya persis seperti diminta,
   lalu klik **Delete** lagi untuk konfirmasi final.

### 0.2 Hapus repository lama di GitHub
1. Buka [github.com](https://github.com) → login.
2. Buka repository lama Anda (misal `hasyim007/siekstrasapa`).
3. Klik tab **Settings** (tab paling kanan di repo, bukan settings akun).
4. Scroll ke paling bawah, ke bagian **Danger Zone**.
5. Klik **Delete this repository**.
6. Ikuti instruksi konfirmasi (biasanya diminta mengetik ulang nama
   repository-nya) → **I understand the consequences, delete this
   repository**.

✅ **CEK**: Worker lama sudah tidak ada lagi di daftar Workers & Pages, dan
repository lama sudah tidak ada lagi di daftar repository GitHub Anda.
Kalau sudah bersih, lanjut ke TAHAP 1.

---

## TAHAP 1 — Siapkan Akun

### 1.1 Akun GitHub (tempat menyimpan kode)
1. Buka [github.com/join](https://github.com/join).
2. Isi username, email, password → ikuti instruksi pendaftaran →
   verifikasi email Anda (cek inbox, klik link konfirmasi).
3. Setelah verifikasi berhasil, login ke [github.com](https://github.com).

### 1.2 Akun Cloudflare (tempat situs akan di-hosting)
1. Buka [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Isi email & password → daftar → verifikasi email Anda.
3. Login ke [dash.cloudflare.com](https://dash.cloudflare.com).

✅ **CEK**: Anda bisa login ke kedua situs (github.com dan
dash.cloudflare.com) tanpa masalah. Lanjut ke TAHAP 2.

---

## TAHAP 2 — Buat Repository Kosong di GitHub

Repository = folder tempat menyimpan semua file situs Anda.

1. Buka [github.com/new](https://github.com/new).
2. **Repository name**, ketik: `survei-ekskul-sdn01`
   *(Anda boleh pakai nama lain, tapi **ingat-ingat nama yang Anda pilih**,
   karena akan dipakai lagi di tahap berikutnya.)*
3. Pilih **Public** (lebih simpel) atau **Private** (kalau tidak mau orang
   lain melihat kode-nya — sama-sama bisa dipakai, tidak masalah).
4. **JANGAN centang** kotak "Add a README file".
5. Klik tombol hijau **Create repository**.
6. Anda akan diarahkan ke halaman repository yang masih kosong. **Biarkan
   tab browser ini terbuka**, kita akan kembali ke sini di TAHAP 4.

✅ **CEK**: Anda melihat halaman repository kosong dengan judul
`nama-anda / survei-ekskul-sdn01` di bagian atas, dan ada tulisan
"Quick setup — if you've done this kind of thing before" atau semacamnya.
Lanjut ke TAHAP 3.

---

## TAHAP 3 — Buat Worker di Cloudflare & Sambungkan ke Repository

Ini langkah yang paling sering bikin bingung sebelumnya, jadi ikuti
**persis** urutannya.

1. Buka tab baru, ke [dash.cloudflare.com](https://dash.cloudflare.com).
2. Sidebar kiri → klik **Workers & Pages**.
3. Klik tombol **Create** (biasanya di pojok kanan atas).
4. Anda akan melihat pilihan seperti **Import a repository** / **Deploy
   from Git** / **Connect to Git** (nama tombolnya bisa sedikit berbeda
   tergantung versi tampilan Cloudflare) — klik itu.
5. Kalau ini pertama kalinya, Cloudflare akan minta izin mengakses akun
   GitHub Anda:
   - Klik **Authorize Cloudflare Workers and Pages** (atau nama serupa).
   - Anda mungkin diminta memilih repository mana saja yang boleh diakses
     — pilih **"All repositories"**, atau kalau memilih manual, cari dan
     centang `survei-ekskul-sdn01`.
   - Klik **Install** / **Save**.
6. Kembali ke Cloudflare, sekarang Anda akan melihat daftar repository —
   **cari dan klik `survei-ekskul-sdn01`** (yang Anda buat di TAHAP 2).
7. Cloudflare akan menampilkan pengaturan project. **Perhatikan baik-baik
   nama project/Worker yang tertulis** — biasanya otomatis terisi sama
   dengan nama repository (`survei-ekskul-sdn01`). **Kalau ada kolom untuk
   mengedit nama, JANGAN diubah** — biarkan apa adanya, supaya gampang
   diingat.
8. Untuk pengaturan build (kalau muncul opsi seperti ini):
   - **Build command**: kosongkan.
   - **Deploy command**: biarkan default (`npx wrangler deploy`).
9. Klik **Save and Deploy** / **Deploy**.
10. Build pertama ini **PASTI GAGAL** — itu WAJAR dan SUDAH DIPERKIRAKAN,
    karena repository-nya masih kosong (belum ada file apa pun). **Jangan
    panik melihat tulisan merah "failed"**, itu memang seharusnya begitu di
    tahap ini.
11. Klik tab **Settings** di project ini → sub-bagian **General** → **catat
    baik-baik nama Worker yang tertulis di situ**. Contoh: kalau tertulis
    `Name: survei-ekskul-sdn01`, maka nama Worker Anda persis
    `survei-ekskul-sdn01`. **Tulis nama ini di suatu tempat**, akan dipakai
    di TAHAP 4.

✅ **CEK**: Anda sudah mencatat **nama Worker yang persis/asli** dari
halaman Settings → General. Lanjut ke TAHAP 4.

---

## TAHAP 4 — Siapkan File Project & Upload ke GitHub

Sekarang kita siapkan seluruh file situsnya, isi nama Worker yang benar,
lalu upload semua ke repository.

### 4.1 Isi nama Worker di `wrangler.toml`
1. Di folder project yang saya berikan (`survei-ekskul-cloudflare`), buka
   file **`wrangler.toml`** pakai text editor apa saja (Notepad, VS Code,
   dll).
2. Cari baris:
   ```
   name = "GANTI-DENGAN-NAMA-WORKER-ANDA"
   ```
3. Ganti tulisan `GANTI-DENGAN-NAMA-WORKER-ANDA` dengan nama Worker yang
   Anda catat di TAHAP 3 langkah 11. Contoh, kalau nama Worker Anda
   `survei-ekskul-sdn01`, baris ini jadi:
   ```
   name = "survei-ekskul-sdn01"
   ```
4. **Simpan file-nya** (Ctrl+S / Cmd+S).
5. Baris `database_id` di file yang sama **belum perlu diisi sekarang** —
   kita isi nanti di TAHAP 6. Biarkan dulu apa adanya.

### 4.2 Upload semua file ke GitHub
1. Kembali ke tab browser yang masih terbuka di halaman repository kosong
   (dari TAHAP 2). Kalau sudah tertutup, buka lagi:
   `github.com/USERNAME-ANDA/survei-ekskul-sdn01`
2. Cari dan klik link **"uploading an existing file"** (biasanya ada di
   tengah halaman).
3. **Buka folder `survei-ekskul-cloudflare` di komputer Anda** dengan File
   Explorer / Finder.
4. **Select semua isi folder itu** (klik 1 file, tekan Ctrl+A / Cmd+A untuk
   pilih semua), lalu **drag ke area upload** di halaman GitHub tadi.

   ⚠️ **SANGAT PENTING**: drag **isi** folder `survei-ekskul-cloudflare`
   (yaitu: folder `public`, file `worker.js`, `wrangler.toml`,
   `schema.sql`, `package.json`, dan file panduan ini) — **BUKAN** folder
   `survei-ekskul-cloudflare` itu sendiri. Kalau Anda drag foldernya utuh,
   nanti struktur di GitHub jadi `survei-ekskul-cloudflare/worker.js` (ada
   folder pembungkus tambahan) — ini **SALAH** dan situsnya tidak akan
   berfungsi.

   ✅ **Cara memastikan benar**: setelah di-drag, di area upload GitHub
   Anda harus melihat file-file ini SEJAJAR (bukan di dalam 1 folder
   pembungkus):
   ```
   public/
   worker.js
   wrangler.toml
   schema.sql
   package.json
   ```

5. Pastikan folder `public/` ikut ter-drag lengkap dengan isinya (semua
   file `.html` dan folder `assets/` di dalamnya). Browser modern
   (Chrome/Edge) mendukung drag folder utuh dan strukturnya tetap terjaga.

   > **Kalau drag folder tidak berhasil** (misal Anda pakai Safari versi
   > lama, atau strukturnya berantakan setelah di-drag): install
   > **[GitHub Desktop](https://desktop.github.com/)** (gratis, instalasi
   > tinggal Next-Next) → buka aplikasinya → **File → Add local
   > repository** → pilih folder `survei-ekskul-cloudflare` → klik
   > **Publish repository** → pilih repo `survei-ekskul-sdn01` yang sudah
   > ada. Ini otomatis meng-upload semua file dengan struktur folder yang
   > benar, jauh lebih andal untuk banyak file sekaligus.

6. Scroll ke bawah ke kolom **"Commit changes"**, isi pesan singkat
   misalnya `Upload awal`, lalu klik tombol hijau **Commit changes**.
7. Tunggu sampai proses upload selesai (untuk file sebanyak ini biasanya
   1-2 menit).

### 4.3 Periksa hasil upload
Setelah selesai, cek di halaman utama repository GitHub Anda — harus
terlihat daftar file/folder persis seperti ini (urutan boleh beda,
strukturnya yang penting sama):

```
📁 public
📄 worker.js
📄 wrangler.toml
📄 schema.sql
📄 package.json
📄 PANDUAN-DEPLOY-CLOUDFLARE.md
```

Klik masuk ke folder **`public`**, harus terlihat:
```
📁 assets
📄 _headers
📄 cetak.html
📄 dashboard.html
📄 galeri.html
📄 index.html
📄 kelas.html
📄 kelola.html
📄 pengaturan.html
📄 siswa.html
📄 spreadsheet.html
📄 survey.html
📄 tutorial.html
📄 usulan.html
```

Klik masuk ke folder **`public/assets`**, harus terlihat:
```
📄 app.js
📄 style.css
```

✅ **CEK**: Struktur file di GitHub sudah PERSIS seperti di atas — tidak
ada folder pembungkus tambahan, tidak ada file yang hilang. Kalau sudah
sesuai, lanjut ke TAHAP 5. **Kalau strukturnya salah, ulangi TAHAP 4.2**
sebelum lanjut — jangan dipaksakan lanjut kalau strukturnya belum benar,
karena semua tahap berikutnya akan gagal kalau ini salah.

---

## TAHAP 5 — Cloudflare Otomatis Deploy Ulang

1. Kembali ke tab Cloudflare, buka project Worker Anda (Workers & Pages →
   klik nama Worker Anda).
2. Klik tab **Deployments**.
3. Dalam 1-2 menit setelah upload di TAHAP 4, harusnya muncul deployment
   BARU yang otomatis berjalan (karena repository-nya baru saja
   di-update). Tunggu sampai statusnya berubah jadi **hijau/sukses**.
4. Kalau setelah 3 menit belum ada deployment baru yang muncul otomatis,
   klik tab **Settings** → cari bagian **Build** → klik ikon ✏️ di baris
   **Branch control**, pastikan **Production branch** terisi `main` — lalu
   coba trigger manual: kembali ke tab **Deployments**, cari tombol
   **Retry deployment** atau semacamnya di deployment paling atas.
5. Kalau deployment ini **masih gagal (merah)**, klik untuk melihat detail
   log-nya, baca pesan errornya — kemungkinan besar penyebabnya:
   - Nama di `wrangler.toml` tidak cocok dengan nama Worker asli (ulangi
     TAHAP 4.1, pastikan diketik PERSIS sama, huruf besar/kecil juga
     berpengaruh).
   - Struktur folder di GitHub tidak sesuai TAHAP 4.3.

✅ **CEK**: Deployment terbaru berstatus **sukses/hijau**. Lanjut ke
TAHAP 6. (Situsnya sudah bisa dibuka sekarang, tapi belum bisa menyimpan
data — itu wajar, database-nya belum kita siapkan.)

---

## TAHAP 6 — Buat & Sambungkan Database D1

### 6.1 Buat database
1. Dashboard Cloudflare → sidebar kiri → **Storage & Databases** →
   **D1 SQL Database**.
2. Klik **Create Database**.
3. **Database name**, ketik: `survei-ekskul-db`
4. Klik **Create**.
5. Setelah database dibuat, Anda akan berada di halaman detailnya. Cari
   dan **copy nilai "Database ID"** yang tertera di halaman ini (bentuknya
   deretan huruf-angka acak seperti
   `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

### 6.2 Isi Database ID ke `wrangler.toml`
1. Kembali ke file `wrangler.toml` di komputer Anda (yang sudah diedit di
   TAHAP 4.1).
2. Cari baris:
   ```
   database_id = "GANTI-DENGAN-DATABASE-ID-ANDA"
   ```
3. Ganti dengan Database ID yang Anda copy tadi, contoh:
   ```
   database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   ```
4. Simpan file-nya.
5. Upload ulang file `wrangler.toml` ini ke GitHub (menimpa yang lama):
   - Di repository GitHub Anda, klik file `wrangler.toml`.
   - Klik ikon pensil ✏️ (**Edit this file**).
   - **Hapus semua isinya**, lalu **paste isi baru** dari file
     `wrangler.toml` di komputer Anda yang sudah diedit.
   - Scroll bawah → **Commit changes**.

### 6.3 Sambungkan binding database ke Worker
1. Dashboard Cloudflare → buka project Worker Anda.
2. Klik tab **Bindings** (sejajar dengan tab Settings, Deployments, dll di
   bagian atas).
3. Klik **Add**.
4. Pilih **D1 database binding**.
5. Isi:
   - **Variable name**: ketik persis `DB` (huruf besar semua)
   - **D1 database**: pilih `survei-ekskul-db` dari dropdown
6. Klik **Save** / **Deploy**.
7. Setelah binding tersimpan, biasanya Cloudflare otomatis membuat
   deployment baru. Kalau tidak, buka tab **Deployments** → cari tombol
   **Retry deployment** di deployment terbaru.

### 6.4 Buat tabel-tabel di database
1. Kembali ke **Storage & Databases → D1 → `survei-ekskul-db`**.
2. Klik tab **Console** (kadang namanya **Explore Data**).
3. Buka file **`schema.sql`** (dari folder project ini) dengan text
   editor, **select semua isinya, copy**.
4. **Paste** ke kotak Console di Cloudflare.
5. Klik tombol **Run** / **Execute**.
6. Harus muncul konfirmasi berhasil (tanpa tulisan error merah).
7. Untuk memastikan, jalankan query cek terpisah di kotak yang sama:
   ```sql
   SELECT * FROM store;
   ```
   klik **Run** lagi — harus muncul **10 baris** (kelas, ekskul, survey,
   siswa, gallery, usulan, settings, notif, saran, arsip), semua kolom
   `data` isinya `[]`.
   
   > 💡 Butuh perintah D1 lain (tambah tabel baru, cek struktur kolom,
   > hapus data, backup, dll)? Semua ada di bagian **"REFERENSI CEPAT"**
   > di dalam file `schema.sql`, tinggal scroll ke bawah.

✅ **CEK**: Query `SELECT * FROM store;` menampilkan 7 baris seperti di
atas. Lanjut ke TAHAP 7 — tahap terakhir!

---

## TAHAP 7 — Pengujian Akhir

1. Dashboard Cloudflare → project Worker Anda → tab **Overview** (atau
   **Domains**) → cari dan klik URL situsnya (bentuknya
   `https://nama-worker-anda.SUBDOMAIN.workers.dev`).
2. Situs harus terbuka, menampilkan halaman **Beranda**.
3. Tekan **F12** di keyboard (buka DevTools browser) → klik tab
   **Network** → tekan **F5** untuk refresh halaman → cari baris bernama
   **`data`** di daftar request → klik → di panel kanan harus terlihat
   **Status: 200** dan responsnya berupa teks JSON yang diawali
   `{"success":true,...`.
   - Kalau **Status 500** → baca pesan error di responsnya, biasanya
     langsung menyebutkan penyebabnya (misal binding `DB` belum benar —
     ulangi TAHAP 6.3).
   - Kalau **Status 404** → berarti `worker.js` tidak terpasang dengan
     benar — cek lagi TAHAP 4.3 dan `main = "worker.js"` di
     `wrangler.toml`.
4. Klik **Login Admin** (biasanya ada di sidebar situs) → masukkan
   **Username: `admin`**, **Password: `admin`** → klik **Masuk**.
5. Buka menu **Master Kelas** → tambahkan 1 kelas percobaan, misalnya
   ketik `1A` → klik **Simpan**.
6. **Tekan F5 untuk refresh halaman** → kelas `1A` yang barusan
   ditambahkan **harus masih ada**. Ini bukti data benar-benar tersimpan
   ke database, bukan cuma tersimpan sementara di browser.
7. Sebagai pengecekan tambahan, buka lagi **Storage & Databases → D1 →
   `survei-ekskul-db` → Console**, jalankan:
   ```sql
   SELECT data FROM store WHERE type = 'kelas';
   ```
   Harus muncul teks JSON yang berisi kelas `1A` yang baru Anda tambahkan.
8. Buka menu **Dashboard** (analitik) di situs → klik tombol **"Buat
   Analisis AI"**. Setelah beberapa detik harus muncul teks analisis KPI.
   Fitur ini pakai **Cloudflare Workers AI** (binding `AI` di
   `wrangler.toml`) — tidak perlu API Key apa pun, otomatis aktif begitu
   Worker ini di-deploy. Kalau muncul pesan error soal binding `AI` tidak
   ditemukan, cek lagi bagian `[ai]` di `wrangler.toml` (lihat TAHAP 4.3),
   lalu commit ulang supaya Cloudflare deploy ulang.

✅ **CEK FINAL**: Semua langkah TAHAP 7 di atas berhasil tanpa error.
**Selamat, situs Anda sudah 100% berfungsi.**

---

## Cara Update Situs di Kemudian Hari

Kalau nanti mau ubah tampilan, tambah fitur, atau perbaiki sesuatu:

1. Edit file yang relevan (misalnya salah satu `.html` di folder `public/`,
   atau `public/assets/app.js`) — bisa langsung di GitHub (buka file →
   klik ✏️ **Edit** → ubah → **Commit changes**), atau di komputer lalu
   di-upload ulang lewat GitHub Desktop.
2. Cloudflare **otomatis mendeteksi perubahan dan deploy ulang sendiri**
   dalam 1-2 menit — tidak perlu klik apa pun di dashboard Cloudflare.
3. Kalau yang diubah adalah `schema.sql` (menambah tabel/kolom di masa
   depan), itu **tidak otomatis dijalankan** — copy-paste ulang isinya ke
   Console D1 seperti TAHAP 6.4.

---

## Troubleshooting

- **Build gagal terus, pesan "name mismatch" / soal `wrangler.toml`** →
  buka `wrangler.toml` di GitHub, pastikan baris `name = "..."` PERSIS
  sama dengan nama di Settings → General → Name Worker Anda (huruf
  besar/kecil, spasi, semuanya harus identik).
- **Situs terbuka tapi CSS/tampilan berantakan** → cek folder
  `public/assets/` di GitHub, pastikan ada `style.css` dan `app.js` di
  situ, sejajar dengan file HTML-nya di folder `public/`.
- **Klik menu di sidebar situs tapi halamannya 404** → cek semua file
  `.html` benar-benar ada langsung di dalam folder `public/` (bukan
  tercecer di root repo atau di sub-folder lain).
- **Form survei/kelas/dll tidak tersimpan setelah refresh** → cek DevTools
  (F12) tab Network, klik request `data`, baca pesan error-nya. Penyebab
  paling umum: binding D1 belum benar (TAHAP 6.3) atau `schema.sql` belum
  dijalankan (TAHAP 6.4).
- **Lupa password admin atau mau menggantinya** → edit
  `public/assets/app.js`, cari fungsi bernama `login`, di situ ada
  perbandingan `'admin'` untuk username dan password — ganti sesuai
  keinginan, commit ulang ke GitHub.
- **Mau melihat/backup semua data mentah** → Storage & Databases → D1 →
  `survei-ekskul-db` → Console → jalankan `SELECT * FROM store;`.
- **Mau reset semua data jadi kosong lagi** → Console D1, jalankan
  `UPDATE store SET data = '[]';`.
- **Masih bingung di satu langkah tertentu** → screenshot halaman yang
  membingungkan itu (jangan crop terlalu sempit, sertakan alamat URL di
  address bar dan tab-tab yang terlihat), lalu tanyakan — sebutkan Anda
  sedang di TAHAP berapa.
