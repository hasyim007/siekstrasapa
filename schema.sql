-- ============================================================
-- SKEMA DATABASE D1 - Survei Ekskul SDN 01 Papahan
-- ============================================================
-- File ini WAJIB dijalankan SATU KALI terhadap database D1 Anda
-- sebelum situs bisa menyimpan data. Cara menjalankannya ada di
-- PANDUAN-DEPLOY-CLOUDFLARE.md bagian D (lewat Dashboard, tanpa
-- perlu instal apa pun) atau lewat perintah:
--
--   wrangler d1 execute NAMA_DATABASE_ANDA --remote --file=./schema.sql
--
-- ------------------------------------------------------------
-- Kenapa cuma 1 tabel "store", bukan 7 tabel terpisah seperti
-- sheet Kelas/Ekskul/Survey/dst di versi Google Spreadsheet dulu?
--
-- Karena pola simpan di frontend (assets/app.js) selalu mengirim
-- SELURUH array data sekaligus tiap kali ada perubahan (bukan
-- simpan 1 baris/1 siswa/1 responden satu-satu). Jadi 1 baris di
-- tabel ini = 1 jenis data (kelas / ekskul / survey / siswa /
-- gallery / usulan / settings), isinya adalah teks JSON dari
-- SELURUH isi array itu. Ini paling sederhana, paling murah
-- (baca 1 baris per jenis data), dan paling mirip dengan cara
-- kerja Code.gs yang lama (writeSheet() = timpa semua isi sheet).
-- ============================================================

CREATE TABLE IF NOT EXISTS store (
  type       TEXT PRIMARY KEY,   -- 'kelas' | 'ekskul' | 'survey' | 'siswa' | 'gallery' | 'usulan' | 'settings'
  data       TEXT NOT NULL DEFAULT '[]',  -- JSON string dari array data jenis ini
  updated_at TEXT                 -- kapan terakhir disimpan (ISO 8601), buat referensi/debug saja
);

-- Baris awal (array kosong) untuk tiap jenis data, supaya tabel langsung
-- siap dipakai sejak pertama kali situs dibuka (tidak wajib -- endpoint
-- /api/data juga sudah aman kalau baris ini belum ada -- tapi lebih rapi
-- kalau langsung ada semua).
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('kelas',    '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('ekskul',   '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('survey',   '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('siswa',    '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('gallery',  '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('usulan',   '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('settings', '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('notif',    '[]', datetime('now'));
INSERT OR IGNORE INTO store (type, data, updated_at) VALUES ('saran',    '[]', datetime('now'));
