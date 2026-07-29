/**
 * ============================================================
 *  SURVEI EKSKUL SDN 01 PAPAHAN - BACKEND (Cloudflare Worker + D1)
 * ============================================================
 * File ini adalah pengganti "Code.gs" (Google Apps Script) versi lama,
 * ditulis untuk arsitektur "Workers dengan Static Assets" (bukan Pages
 * klasik) -- ini format yang dipakai project Anda di Cloudflare sekarang.
 *
 * Cara routing-nya (diatur di wrangler.toml, bagian [assets]):
 *   - Kalau path URL yang diminta COCOK dengan file statis di folder
 *     public/ (mis. /index.html, /assets/app.js, /assets/style.css),
 *     Cloudflare LANGSUNG menyajikan file itu dari CDN -- kode Worker di
 *     bawah ini TIDAK dijalankan sama sekali untuk request semacam itu
 *     (jadi tetap secepat situs statis biasa).
 *   - Kalau path-nya TIDAK cocok dengan file statis manapun (contoh:
 *     /api/data), barulah kode fetch() di bawah ini yang dijalankan.
 *
 * Jadi Worker ini HANYA perlu menangani /api/data dan /api/ai-kpi --
 * selebihnya (semua file .html, .css, .js) otomatis dilayani sebagai aset
 * statis tanpa perlu ditulis kode apa pun di sini.
 *
 * /api/ai-kpi dipakai oleh fitur "KPI & Kesimpulan Berbasis AI" di
 * Dashboard, jalan lewat Cloudflare Workers AI (binding "AI") -- BUKAN lagi
 * Google Gemini. Tidak perlu API key apa pun dari admin karena Workers AI
 * berjalan langsung di dalam Worker ini.
 *
 * Database yang dipakai adalah Cloudflare D1 (SQLite), diakses lewat
 * "binding" bernama DB. Binding ini WAJIB disambungkan dulu dari
 * Dashboard Cloudflare (buka Worker ini -> tab Bindings -> Add -> D1
 * database binding, Variable name: DB) SEBELUM endpoint ini bisa
 * berfungsi. Lihat PANDUAN-DEPLOY-CLOUDFLARE.md TAHAP 6 untuk langkah
 * lengkap.
 *
 * Desain tabel: 1 baris per "type" (kelas/ekskul/survey/siswa/gallery/
 * usulan/settings), isinya JSON string dari SELURUH array data jenis
 * itu -- sengaja disamakan dengan pola lama (writeSheet() di Code.gs
 * yang selalu menimpa seluruh isi sheet), karena public/assets/app.js
 * memang mengirim array PENUH tiap kali menyimpan. Lihat schema.sql
 * untuk struktur tabelnya.
 * ============================================================
 */

const ALLOWED_TYPES = ['kelas', 'ekskul', 'survey', 'siswa', 'gallery', 'usulan', 'settings', 'notif', 'saran', 'arsip'];

// ------------------------------------------------------------
// PROTEKSI ADMIN (ditambahkan untuk menutup celah keamanan):
// Sebelumnya, SEMUA jenis data (termasuk "kelas", "ekskul", "settings" dkk)
// bisa ditulis lewat POST /api/data oleh SIAPA SAJA tanpa login sama sekali
// -- proteksi login yang ada di app.js cuma cek di browser, sedangkan
// endpoint API-nya sendiri tidak pernah memverifikasi apa pun. Ini berarti
// siapa pun yang tahu URL Worker ini (misalnya lewat tab Network browser)
// bisa langsung mengirim request POST manual (curl/Postman) untuk mengubah
// atau menghapus data sekolah tanpa perlu tahu password.
//
// Jenis data di bawah ini ("ADMIN_ONLY_TYPES") HANYA boleh ditulis kalau
// request menyertakan header "X-Admin-Password" yang cocok dengan password
// admin yang tersimpan (dicek oleh checkAdminAuth di bawah). Jenis data
// LAIN (survey/siswa/usulan/saran) sengaja TETAP terbuka tanpa login,
// karena itu memang alur normal wali murid mengisi pendaftaran/usulan/saran
// dari halaman publik -- mereka tidak login sebagai admin.
// Ditambahkan "siswa" ke daftar ini: dari pengecekan alur aplikasi, data siswa
// TERNYATA cuma pernah diubah lewat halaman Master Kelas (kelas.html, yang
// memang halaman admin) -- form publik (survey.html dkk) tidak pernah menulis
// ke tipe data ini. Jadi sudah sepatutnya "siswa" ikut diproteksi seperti
// kelas/ekskul, bukan dibiarkan terbuka.
const ADMIN_ONLY_TYPES = ['kelas', 'ekskul', 'gallery', 'notif', 'settings', 'arsip', 'siswa'];

// Jenis data ini SENGAJA tetap terbuka tanpa login (wali murid/siswa memang
// perlu mengisi survei/usulan/saran tanpa akun) -- TAPI supaya publik tidak
// bisa menghapus/menimpa/mengubah data yang SUDAH ADA (yang sebelumnya bisa
// terjadi karena endpoint ini menerima array PENUH dari klien), permintaan
// TANPA login untuk tipe ini HANYA diizinkan menambah entri baru. Lihat
// fungsi assertAppendOnly di bawah untuk detail validasinya. Kalau request
// datang DARI admin yang sudah login (X-Admin-Password valid), tetap boleh
// menimpa/menghapus seperti biasa -- ini dipakai fitur hapus/setujui/tolak
// usulan & kritik-saran di halaman admin.
const PUBLIC_APPEND_ONLY_TYPES = ['survey', 'usulan', 'saran'];

const DEFAULT_ADMIN_PASSWORD = 'admin'; // sama dengan default di app.js (DEFAULT_SETTINGS.adminPassword)

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// Ambil password admin yang sedang tersimpan di tabel "settings" pada D1.
// Kalau belum pernah diatur (baris belum ada / kosong), pakai default yang
// sama dengan bawaan aplikasi ('admin') supaya login pertama kali tetap bisa.
async function getStoredAdminPassword(env) {
  try {
    const row = await env.DB.prepare('SELECT data FROM store WHERE type = ?1').bind('settings').first();
    if (!row || !row.data) return DEFAULT_ADMIN_PASSWORD;
    const parsed = JSON.parse(row.data);
    const settingsObj = Array.isArray(parsed) ? parsed[0] : parsed;
    return (settingsObj && settingsObj.adminPassword) ? String(settingsObj.adminPassword) : DEFAULT_ADMIN_PASSWORD;
  } catch (err) {
    return DEFAULT_ADMIN_PASSWORD;
  }
}

// Cek apakah request datang dari admin yang valid, berdasarkan header
// "X-Admin-Password" yang harus persis sama dengan password tersimpan.
async function checkAdminAuth(request, env) {
  const sentPassword = request.headers.get('X-Admin-Password') || '';
  if (!sentPassword) return false;
  const realPassword = await getStoredAdminPassword(env);
  return sentPassword === realPassword;
}

// Menggabungkan data lama (yang sungguh-sungguh ada di server SAAT INI) dengan
// item-item BARU dari kiriman klien, TANPA pernah menghapus/menimpa item lama.
// PENTING: perhitungan "mana yang lama, mana yang baru" dilakukan di SINI
// (server), bukan cuma percaya array dari klien -- ini sengaja supaya tahan
// kondisi race: kalau ada 2 wali murid mengisi survei/usulan/saran hampir
// bersamaan, submission wali murid ke-2 tidak akan gagal cuma karena
// datanya belum tahu tentang submission wali murid ke-1 yang baru saja
// tersimpan. Server yang menggabungkan keduanya, bukan menolak salah satunya.
//
// Mengembalikan { merged, error }. Kalau ada item existing yang dikirim ulang
// oleh klien TAPI isinya sudah diubah (bukan cuma id yang sama), itu ditolak
// (error) -- karena wali murid/siswa tidak berhak mengubah data lama, cuma
// menambah baru.
function mergeAppendOnly(existingArr, clientArr) {
  if (!Array.isArray(existingArr)) existingArr = [];
  const existingById = new Map();
  for (const item of existingArr) {
    if (item && typeof item === 'object' && item.id) existingById.set(item.id, item);
  }

  const newItems = [];
  for (const item of clientArr) {
    const id = item && typeof item === 'object' ? item.id : undefined;
    if (id && existingById.has(id)) {
      // Item ini sudah ada di server -- pastikan isinya tidak diubah.
      if (JSON.stringify(item) !== JSON.stringify(existingById.get(id))) {
        return { merged: null, error: 'Permintaan ditolak: tidak diizinkan mengubah data yang sudah tersimpan. Wali murid/siswa hanya bisa menambah data baru. Silakan login sebagai admin untuk mengubah/menghapus data ini.' };
      }
      // Identik -> abaikan (sudah ada, tidak perlu ditambahkan lagi).
    } else {
      // Item baru (id belum pernah ada di server) -> akan ditambahkan.
      newItems.push(item);
    }
  }

  return { merged: existingArr.concat(newItems), error: null };
}

async function handleGet(request, env) {
  if (!env.DB) {
    return jsonResponse({
      success: false,
      error: 'Database D1 belum terhubung ke Worker ini (binding "DB" tidak ditemukan). ' +
             'Buka Cloudflare Dashboard > Workers & Pages > Worker ini > tab Bindings > ' +
             'Add > D1 database binding, Variable name: DB. ' +
             'Detail lengkap ada di PANDUAN-DEPLOY-CLOUDFLARE.md TAHAP 6.'
    }, 500);
  }

  try {
    const { results } = await env.DB.prepare('SELECT type, data FROM store').all();

    const data = {};
    ALLOWED_TYPES.forEach((t) => {
      const key = t === 'survey' ? 'surveys' : t;
      data[key] = [];
    });

    for (const row of results) {
      const key = row.type === 'survey' ? 'surveys' : row.type;
      try {
        data[key] = JSON.parse(row.data);
      } catch (err) {
        data[key] = [];
      }
    }

    // Data lain (kelas/ekskul/siswa/dst) memang wajar dibaca publik karena
    // dipakai halaman info ekskul yang tidak perlu login. TAPI khusus field
    // adminPassword di dalam "settings", ini rahasia -- jangan pernah ikut
    // dikirim ke browser kecuali yang minta memang sudah login sebagai admin
    // (mengirim X-Admin-Password yang valid). Sebelumnya field ini selalu
    // ikut terkirim ke SIAPA SAJA yang membuka /api/data, termasuk lewat
    // tab Network browser tanpa login -- itu celah keamanan yang ditutup di sini.
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin && Array.isArray(data.settings)) {
      data.settings = data.settings.map((s) => {
        if (!s || typeof s !== 'object') return s;
        const { adminPassword, ...rest } = s;
        return rest;
      });
    }

    return jsonResponse({ success: true, data });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Gagal membaca database: ' + err.message }, 500);
  }
}

async function handlePost(request, env) {
  if (!env.DB) {
    return jsonResponse({
      success: false,
      error: 'Database D1 belum terhubung ke project ini (binding "DB" tidak ditemukan).'
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ success: false, error: 'Body request bukan JSON yang valid.' }, 400);
  }

  const type = body && body.type;
  let data = body && body.data;

  if (!ALLOWED_TYPES.includes(type)) {
    return jsonResponse({ success: false, error: 'Tipe data tidak dikenal: ' + type }, 400);
  }
  if (!Array.isArray(data)) {
    return jsonResponse({ success: false, error: 'Data harus berupa array' }, 400);
  }

  // Tipe data admin-only (kelas/ekskul/gallery/notif/settings/arsip/siswa) WAJIB
  // datang dari admin yang sudah login -- dicek lewat header X-Admin-Password.
  // Tipe publik (survey/usulan/saran) sengaja tidak wajib login supaya wali
  // murid tetap bisa mengisi pendaftaran/usulan/saran tanpa akun.
  if (ADMIN_ONLY_TYPES.includes(type)) {
    const authorized = await checkAdminAuth(request, env);
    if (!authorized) {
      return jsonResponse({
        success: false,
        error: 'Akses ditolak: perlu login admin yang valid untuk mengubah data ini.'
      }, 401);
    }
  } else if (PUBLIC_APPEND_ONLY_TYPES.includes(type)) {
    // Kalau request ini datang DARI admin yang sudah login, tetap izinkan
    // menimpa/menghapus penuh (dipakai fitur hapus/setujui/tolak di halaman
    // admin) -- pakai persis array yang dikirim klien, seperti sebelumnya.
    // Kalau BUKAN dari admin (pengisian publik biasa), GABUNGKAN di server
    // (lihat mergeAppendOnly) alih-alih mempercayai array penuh dari klien --
    // ini supaya kiriman dari beberapa wali murid yang hampir bersamaan tetap
    // tergabung dengan benar, tidak saling menimpa atau saling ditolak.
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) {
      try {
        const existingRow = await env.DB.prepare('SELECT data FROM store WHERE type = ?1').bind(type).first();
        let existingArr = [];
        try { existingArr = existingRow && existingRow.data ? JSON.parse(existingRow.data) : []; } catch (e) { existingArr = []; }

        // Khusus type "survey": tolak kalau ada item BARU (id-nya belum pernah ada
        // di server) tapi idSiswa-nya ternyata SUDAH dipakai siswa lain sebelumnya.
        // Ini proteksi anti-duplikat yang benar-benar menentukan (di server, sumber
        // kebenaran) -- soalnya pengecekan "siswa sudah pernah isi" di app.js cuma
        // memakai data yang diambil browser SAAT HALAMAN DIBUKA, jadi kalau ada 2
        // wali murid (mis. ayah & ibu, dari 2 HP berbeda) yang submit untuk anak
        // yang sama hampir bersamaan, keduanya bisa lolos pengecekan di browser
        // masing-masing sebelum salah satu benar-benar tersimpan duluan di sini.
        if (type === 'survey') {
          const existingById = new Set(existingArr.filter(s => s && s.id).map(s => s.id));
          const existingIdSiswa = new Set(existingArr.filter(s => s && s.idSiswa).map(s => s.idSiswa));
          for (const item of data) {
            const sudahAda = item && item.id && existingById.has(item.id);
            if (!sudahAda && item && item.idSiswa && existingIdSiswa.has(item.idSiswa)) {
              return jsonResponse({
                success: false,
                error: 'Siswa ini sudah pernah mengisi pendaftaran peminatan (kemungkinan dikirim dari perangkat lain hampir bersamaan). Silakan cek kembali, tidak perlu mengisi ulang.'
              }, 409);
            }
          }
        }

        const { merged, error } = mergeAppendOnly(existingArr, data);
        if (error) {
          return jsonResponse({ success: false, error }, 403);
        }
        data = merged;
      } catch (err) {
        return jsonResponse({ success: false, error: 'Gagal memvalidasi data: ' + err.message }, 500);
      }
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO store (type, data, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(type, JSON.stringify(data), new Date().toISOString()).run();

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Gagal menyimpan ke database: ' + err.message }, 500);
  }
}

// Endpoint login: menerima {password} lewat body, membandingkan dengan
// password admin yang tersimpan di D1 (BUKAN dibandingkan di browser seperti
// sebelumnya). Sengaja tidak mengembalikan token/cookie session yang rumit --
// kalau password cocok, browser (app.js) menyimpan password itu sendiri di
// sessionStorage lalu mengirimkannya kembali lewat header X-Admin-Password
// tiap kali menyimpan data admin-only. Ini pola yang sederhana (cocok untuk
// skala 1 akun admin sekolah) tapi tetap jauh lebih aman daripada sebelumnya,
// karena sekarang SERVER yang menentukan sah/tidaknya, bukan JavaScript di
// browser yang bisa dilihat/dilewati siapa saja.
// ------------------------------------------------------------
// RATE-LIMIT LOGIN (mencegah tebak password berkali-kali / brute-force):
// Sebelumnya /api/login tidak punya batas percobaan sama sekali -- siapa pun
// bisa mencoba password berulang-ulang tanpa hambatan (berbahaya terutama
// kalau password masih default 'admin'). Sekarang setiap alamat IP yang
// gagal login 5x dalam 15 menit akan dikunci sementara (15 menit) sebelum
// bisa mencoba lagi. Data percobaan disimpan di tabel "store" yang sama
// (baris baru dengan type = 'login_attempts', TIDAK perlu ubah schema.sql
// sama sekali karena tabel ini memang generik key-value).
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;   // 15 menit -- jendela hitung percobaan gagal
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;  // 15 menit -- lama dikunci setelah kena limit

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

async function getLoginAttempts(env) {
  try {
    const row = await env.DB.prepare('SELECT data FROM store WHERE type = ?1').bind('login_attempts').first();
    if (!row || !row.data) return {};
    const parsed = JSON.parse(row.data);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    return {};
  }
}

async function saveLoginAttempts(env, attempts) {
  try {
    await env.DB.prepare(
      `INSERT INTO store (type, data, updated_at)
       VALUES ('login_attempts', ?1, ?2)
       ON CONFLICT(type) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(JSON.stringify(attempts), new Date().toISOString()).run();
  } catch (err) {
    // Gagal simpan rate-limit bukan hal fatal untuk login itu sendiri -- abaikan.
  }
}

async function handleLogin(request, env) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: 'Database D1 belum terhubung ke Worker ini.' }, 500);
  }

  const ip = getClientIp(request);
  const now = Date.now();
  const attempts = await getLoginAttempts(env);
  const entry = attempts[ip];

  if (entry && entry.lockedUntil && now < entry.lockedUntil) {
    const sisaMenit = Math.ceil((entry.lockedUntil - now) / 60000);
    return jsonResponse({
      success: false,
      error: `Terlalu banyak percobaan login gagal. Coba lagi dalam sekitar ${sisaMenit} menit.`
    }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ success: false, error: 'Body request bukan JSON yang valid.' }, 400);
  }

  const sentPassword = (body && typeof body.password === 'string') ? body.password : '';
  const realPassword = await getStoredAdminPassword(env);

  if (sentPassword && sentPassword === realPassword) {
    // Login berhasil -> hapus catatan percobaan gagal IP ini.
    if (attempts[ip]) {
      delete attempts[ip];
      await saveLoginAttempts(env, attempts);
    }
    return jsonResponse({ success: true });
  }

  // Login gagal -> catat/tambah hitungan percobaan untuk IP ini.
  let current = entry;
  if (!current || (now - current.windowStart) > LOGIN_WINDOW_MS) {
    current = { count: 0, windowStart: now, lockedUntil: null };
  }
  current.count += 1;
  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    current.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
  attempts[ip] = current;
  await saveLoginAttempts(env, attempts);

  if (current.lockedUntil) {
    return jsonResponse({
      success: false,
      error: `Password salah. Terlalu banyak percobaan gagal -- coba lagi dalam ${Math.ceil(LOGIN_LOCKOUT_MS / 60000)} menit.`
    }, 429);
  }

  const sisaPercobaan = LOGIN_MAX_ATTEMPTS - current.count;
  return jsonResponse({ success: false, error: `Password salah. Sisa percobaan sebelum dikunci sementara: ${sisaPercobaan}.` }, 401);
}

// Model teks Workers AI yang dipakai untuk fitur "KPI & Kesimpulan Berbasis
// AI" di Dashboard. Llama 3.3 70B cukup pintar untuk analisis singkat
// berbahasa Indonesia dan termasuk dalam paket gratis Workers AI (dengan
// limit harian neuron -- lihat PANDUAN-DEPLOY-CLOUDFLARE.md).
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

async function handleAiKpi(request, env) {
  if (!env.AI) {
    return jsonResponse({
      success: false,
      error: 'Workers AI belum terhubung ke Worker ini (binding "AI" tidak ditemukan). ' +
             'Tambahkan blok [ai] dengan binding = "AI" di wrangler.toml lalu deploy ulang. ' +
             'Detail lengkap ada di PANDUAN-DEPLOY-CLOUDFLARE.md.'
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ success: false, error: 'Body request bukan JSON yang valid.' }, 400);
  }

  const ringkasan = body && body.ringkasan;
  if (!ringkasan || typeof ringkasan !== 'object') {
    return jsonResponse({ success: false, error: 'Ringkasan data tidak ditemukan pada request.' }, 400);
  }

  const prompt = `Kamu adalah asisten analis data untuk admin sekolah dasar (SD). Berikut ringkasan data peminatan ekstrakurikuler siswa dalam format JSON:\n\n${JSON.stringify(ringkasan)}\n\nBuat analisis singkat dalam Bahasa Indonesia untuk admin sekolah, terdiri dari:\n1. 3-5 poin KPI (Key Performance Indicator) paling penting dari data ini.\n2. Kesimpulan singkat (2-3 kalimat).\n3. 2-3 saran tindak lanjut yang actionable untuk sekolah.\n\nGunakan format singkat dengan sub-judul jelas, tanpa markdown tebal/asterisk berlebihan, langsung to the point.`;

  try {
    const result = await env.AI.run(AI_MODEL, {
      messages: [{ role: 'user', content: prompt }]
    });

    const text = (result && result.response || '').trim();
    if (!text) {
      return jsonResponse({ success: false, error: 'AI tidak mengembalikan hasil. Coba lagi beberapa saat lagi.' }, 502);
    }

    return jsonResponse({ success: true, text });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Gagal menghubungi Workers AI: ' + err.message }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/data') {
      if (request.method === 'GET') return handleGet(request, env);
      if (request.method === 'POST') return handlePost(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
      return jsonResponse({ success: false, error: 'Method tidak didukung' }, 405);
    }

    if (url.pathname === '/api/login') {
      if (request.method === 'POST') return handleLogin(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
      return jsonResponse({ success: false, error: 'Method tidak didukung' }, 405);
    }

    if (url.pathname === '/api/ai-kpi') {
      if (request.method === 'POST') return handleAiKpi(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
      return jsonResponse({ success: false, error: 'Method tidak didukung' }, 405);
    }

    // Jalur ini seharusnya jarang tercapai (file statis yang match sudah
    // otomatis dilayani sebelum sampai ke Worker), tapi disediakan sebagai
    // jaring pengaman untuk path yang tidak dikenali (mis. typo URL) --
    // biar tetap dapat halaman 404 dari aset statis, bukan error Worker.
    return env.ASSETS.fetch(request);
  }
};
