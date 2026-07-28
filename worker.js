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
      if (request.method === 'GET') return handleGet(env);
      if (request.method === 'POST') return handlePost(request, env);
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
