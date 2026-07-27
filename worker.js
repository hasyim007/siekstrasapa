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
 * Jadi Worker ini HANYA perlu menangani /api/data -- selebihnya (semua
 * file .html, .css, .js) otomatis dilayani sebagai aset statis tanpa
 * perlu ditulis kode apa pun di sini.
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

const ALLOWED_TYPES = ['kelas', 'ekskul', 'survey', 'siswa', 'gallery', 'usulan', 'settings', 'notif', 'saran'];

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function handleGet(env) {
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
  const data = body && body.data;

  if (!ALLOWED_TYPES.includes(type)) {
    return jsonResponse({ success: false, error: 'Tipe data tidak dikenal: ' + type }, 400);
  }
  if (!Array.isArray(data)) {
    return jsonResponse({ success: false, error: 'Data harus berupa array' }, 400);
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/data') {
      if (request.method === 'GET') return handleGet(env);
      if (request.method === 'POST') return handlePost(request, env);
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
