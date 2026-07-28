        // --- JARING PENGAMAN CDN ---
        // Kalau jaringan sekolah/browser memblokir CDN ikon (unpkg.com), variabel
        // `lucide` global tidak akan pernah ada -> setiap pemanggilan lucide.createIcons()
        // di file ini akan "ReferenceError" dan MENGHENTIKAN seluruh proses render
        // setelahnya (termasuk pengisian dropdown Kelas/Ekskul di form survei).
        // Stub kosong ini memastikan itu tidak terjadi -- ikon saja yang tidak muncul,
        // bukan seluruh halaman.
        if (typeof window.lucide === 'undefined') {
            window.lucide = { createIcons: function () { /* CDN ikon gagal dimuat, diabaikan */ } };
        }

        // --- KONEKSI BACKEND (Cloudflare Pages Functions + D1) ---
        // Endpoint API-nya ada di file functions/api/data.js pada project YANG SAMA
        // dengan situs ini. Karena Cloudflare Pages menyajikan file statis (.html,
        // assets/) dan Functions (folder functions/) dari 1 domain yang sama,
        // path relatif '/api/data' ini otomatis nyambung begitu situs sudah
        // di-deploy -- TIDAK ADA URL yang perlu ditempel manual seperti versi
        // Google Apps Script dulu.
        const API_URL = '/api/data';

        const api = {
            // Cache hasil fetchAll() di sessionStorage sebentar (bukan localStorage,
            // supaya otomatis bersih tiap sesi baru). Arsitektur situs ini MPA -- tiap
            // klik menu = reload halaman penuh = fetchAll() dipanggil lagi dari nol.
            // Tanpa cache ini, tiap satu klik menu = 1 request baru ke D1, padahal
            // datanya sering belum berubah sama sekali.
            CACHE_KEY: 'sdn01_remote_cache_v1',
            CACHE_TTL_MS: 20000, // 20 detik

            isConfigured() {
                // Selalu true: API 1 domain (same-origin) dengan situs ini begitu
                // di-deploy ke Cloudflare Pages, jadi tidak butuh URL manual lagi.
                return true;
            },
            readCache() {
                try {
                    const raw = sessionStorage.getItem(this.CACHE_KEY);
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    if (!parsed || (Date.now() - parsed.ts) > this.CACHE_TTL_MS) return null;
                    return parsed.data;
                } catch (err) { return null; }
            },
            writeCache(data) {
                try {
                    sessionStorage.setItem(this.CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
                } catch (err) { /* abaikan, misal storage penuh -- tidak fatal */ }
            },
            clearCache() {
                try { sessionStorage.removeItem(this.CACHE_KEY); } catch (err) { /* no-op */ }
            },
            async fetchAll() {
                if (!this.isConfigured()) return null;

                const cached = this.readCache();
                if (cached) return cached;

                try {
                    const res = await fetch(API_URL, { method: 'GET' });
                    const json = await res.json();
                    if (json && json.success) {
                        this.writeCache(json.data);
                        return json.data;
                    }
                    console.warn('Server merespons tapi gagal mengambil data:', json && json.error);
                    return null;
                } catch (err) {
                    console.warn('Gagal mengambil data dari server, memakai data lokal.', err);
                    return null;
                }
            },
            // Kirim tanpa menunggu (fire-and-forget) supaya UI tetap terasa instan.
            push(type, data) {
                if (!this.isConfigured()) return;
                // Buang cache lokal supaya navigasi berikutnya di tab ini mengambil data
                // terbaru dari server, bukan cache lama dari sebelum perubahan ini.
                this.clearCache();
                fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, data })
                }).then(async (res) => {
                    const json = await res.json().catch(() => null);
                    if (!json || !json.success) {
                        console.warn('Server menolak penyimpanan:', json && json.error);
                    }
                }).catch(err => console.warn('Gagal menyimpan ke server:', err));
            }
        };

        // --- DATA & CONFIG ---
        const DB_KEY_EKSKUL = 'sdn01_db_ekskul_v2';
        const DB_KEY_SURVEY = 'sdn01_db_survey_v2';
        const DB_KEY_SISWA = 'sdn01_db_siswa_v2';
        const DB_KEY_KELAS = 'sdn01_db_kelas_v2';
        const DB_KEY_GALLERY = 'sdn01_db_gallery_v2';
        const DB_KEY_USULAN = 'sdn01_db_usulan_v2';
        const DB_KEY_SETTINGS = 'sdn01_db_settings_v1';
        const DB_KEY_NOTIF = 'sdn01_db_notif_v1';
        const DB_KEY_SARAN = 'sdn01_db_saran_v1';
        const DB_KEY_ARSIP = 'sdn01_db_arsip_v1';

        const DEFAULT_SETTINGS = {
            id: 'main',
            logoUrl: '', // kosong = pakai ikon sekolah bawaan
            schoolName: 'SDN 01 PAPAHAN',
            heroTitle: 'Temukan Bakatmu, Kembangkan Potensimu!',
            heroDescription: 'Selamat datang di portal pendaftaran peminatan ekstrakurikuler SDN 01 PAPAHAN. Silakan eksplorasi kegiatan yang tersedia sebelum menentukan pilihan terbaikmu.',
            adminUsername: 'admin', // default tetap "admin" walau tulisan "admin" di form login disembunyikan
            adminPassword: 'admin',
            tahunAjaran: '', // label tahun ajaran aktif, mis. "2025/2026" -- kosong = belum diatur admin
            contactWa: '', // no. WA admin sekolah yang ditampilkan di Beranda untuk wali murid yang butuh bantuan
            contactAlamat: '' // alamat singkat sekolah, ditampilkan berdampingan dengan kontak WA di Beranda
            // Catatan: fitur "KPI & Kesimpulan Berbasis AI" di Dashboard sekarang jalan
            // lewat Cloudflare Workers AI (endpoint /api/ai-kpi di worker.js), jadi
            // sudah tidak perlu API key apa pun yang disimpan di sini.
        };

        // Data contoh sengaja dikosongkan -> spreadsheet/aplikasi mulai dari kosong.
        // (Kalau ingin ada beberapa contoh awal lagi, cukup isi array ini seperti biasa.)
        const DEFAULT_KELAS = [];
        const DEFAULT_EKSKUL = [];
        const DEFAULT_GALLERY = [];

        const state = {
            kelas: [],
            ekskul: [],
            surveys: [],
            siswa: [],
            gallery: [],
            usulan: [],
            notif: [],
            saran: [],
            arsip: [],
            activePage: 'beranda',
            isAdmin: false,
            settings: { ...DEFAULT_SETTINGS },
            chartInstances: { pie: null, bar: null, gender: null },
            // Filter pencarian di grid Kegiatan Tersedia (Beranda) -- reset tiap reload,
            // sengaja tidak disimpan ke storage supaya wali murid selalu lihat semua kegiatan dulu.
            berandaFilters: { cari: '', kelas: '', hari: '' }
        };

        // --- CORE SYSTEM ---
        const ADMIN_SESSION_KEY = 'sdn01_admin_session';

        const system = {
            async init() {
                const currentPage = document.body.dataset.page;

                // 0. Pulihkan status login admin (MPA = tiap halaman reload dokumen baru,
                //    jadi status admin disimpan di sessionStorage, bukan variabel JS saja).
                state.isAdmin = sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';

                // Proteksi halaman admin: kalau belum login tapi buka file admin langsung,
                // tendang ke Beranda. (Catatan: ini proteksi sisi tampilan saja, sama seperti
                // versi SPA sebelumnya -- bukan keamanan server-side yang sesungguhnya.)
                if (ADMIN_PAGES.includes(currentPage) && !state.isAdmin) {
                    window.location.href = 'index.html';
                    return;
                }

                this.applyAdminUI(state.isAdmin);

                // 1. Ambil data dari backend (Cloudflare Pages Functions + D1)
                const remote = await api.fetchAll();

                if (remote) {
                    // Backend berhasil diakses -> pakai data server sebagai sumber utama.
                    // PENTING: pakai Array.isArray, BUKAN cek panjang array — supaya kelas/ekskul/galeri
                    // yang memang sengaja dikosongkan admin (dihapus semua) tidak diisi ulang otomatis
                    // dengan data contoh (DEFAULT_KELAS/DEFAULT_EKSKUL/DEFAULT_GALLERY).
                    state.kelas = Array.isArray(remote.kelas) ? remote.kelas : DEFAULT_KELAS;
                    state.ekskul = Array.isArray(remote.ekskul) ? remote.ekskul : DEFAULT_EKSKUL;
                    state.surveys = remote.surveys || [];
                    state.siswa = remote.siswa || [];
                    state.gallery = Array.isArray(remote.gallery) ? remote.gallery : DEFAULT_GALLERY;
                    state.usulan = remote.usulan || [];
                    state.notif = remote.notif || [];
                    state.saran = remote.saran || [];
                    state.arsip = remote.arsip || [];
                    state.settings = (remote.settings && remote.settings.length) ? { ...DEFAULT_SETTINGS, ...remote.settings[0] } : DEFAULT_SETTINGS;
                    // Simpan juga ke localStorage sebagai cache offline
                    this.saveData('all', false);
                } else {
                    // 2. Fallback: pakai localStorage kalau ada (termasuk kalau isinya memang kosong []),
                    // baru pakai data contoh jika localStorage benar-benar belum pernah diisi (null).
                    const lsKelas = JSON.parse(localStorage.getItem(DB_KEY_KELAS));
                    const lsEkskul = JSON.parse(localStorage.getItem(DB_KEY_EKSKUL));
                    const lsGallery = JSON.parse(localStorage.getItem(DB_KEY_GALLERY));
                    state.kelas = Array.isArray(lsKelas) ? lsKelas : DEFAULT_KELAS;
                    state.ekskul = Array.isArray(lsEkskul) ? lsEkskul : DEFAULT_EKSKUL;
                    state.surveys = JSON.parse(localStorage.getItem(DB_KEY_SURVEY)) || [];
                    state.siswa = JSON.parse(localStorage.getItem(DB_KEY_SISWA)) || [];
                    state.gallery = Array.isArray(lsGallery) ? lsGallery : DEFAULT_GALLERY;
                    state.usulan = JSON.parse(localStorage.getItem(DB_KEY_USULAN)) || [];
                    state.notif = JSON.parse(localStorage.getItem(DB_KEY_NOTIF)) || [];
                    state.saran = JSON.parse(localStorage.getItem(DB_KEY_SARAN)) || [];
                    state.arsip = JSON.parse(localStorage.getItem(DB_KEY_ARSIP)) || [];
                    const localSettings = JSON.parse(localStorage.getItem(DB_KEY_SETTINGS));
                    state.settings = (localSettings && localSettings[0]) ? { ...DEFAULT_SETTINGS, ...localSettings[0] } : { ...DEFAULT_SETTINGS };
                    this.saveData('all', false);
                }

                this.applyBranding();

                // PENTING: tiap langkah render di bawah dibungkus try/catch masing-masing
                // dan dropdown form (Kelas/Ekskul) diletakkan PALING AWAL. Kalau ada satu
                // bagian yang gagal (mis. ikon dari CDN diblokir jaringan sekolah, atau
                // galeri error), bagian lain tetap lanjut jalan -- khususnya supaya form
                // Pendaftaran Peminatan tidak pernah ikut "mati total" gara-gara bagian
                // lain yang sebenarnya tidak krusial untuk isi survei.
                const initSteps = [
                    ['Isi dropdown Kelas', () => uiManager.populateKelasDropdowns()],
                    ['Isi dropdown Ekskul', () => uiManager.populateEkskulDropdowns()],
                    ['Isi checkbox Ekskul', () => uiManager.populateEkskulCheckboxes()],
                    ['Badge usulan ekskul', () => usulanManager.updateBadge()],
                    ['Badge kritik & saran', () => saranManager.updateBadge()],
                    ['Isi filter Kegiatan Beranda', () => uiManager.populateBerandaFilterOptions()],
                    ['Pasang event filter Kegiatan Beranda', () => uiManager.bindBerandaFilterEvents()],
                    ['Render kartu Beranda', () => uiManager.renderBerandaCards()],
                    ['Render statistik Beranda', () => uiManager.renderBerandaStats()],
                    ['Render jadwal mingguan Beranda', () => uiManager.renderBerandaJadwal()],
                    ['Render galeri', () => galleryManager.initSlideshow()],
                    ['Tampilkan tutorial pertama kali', () => uiManager.maybeShowTutorialOnFirstVisit()],
                    ['Tampilkan notifikasi custom berurutan', () => notifManager.maybeShowSequence()],
                    ['Render ikon', () => lucide.createIcons()],
                ];
                initSteps.forEach(([label, fn]) => {
                    try { fn(); } catch (err) { console.warn(`Gagal saat: ${label}`, err); }
                });

                appController.switchPage(currentPage, true);
            },

            // Terapkan logo, nama sekolah, judul & deskripsi beranda sesuai Pengaturan
            applyBranding() {
                const s = state.settings || DEFAULT_SETTINGS;

                document.querySelectorAll('.brand-school-name').forEach(el => {
                    el.textContent = s.schoolName || DEFAULT_SETTINGS.schoolName;
                });

                document.querySelectorAll('.brand-logo-slot').forEach(el => {
                    if (s.logoUrl) {
                        el.innerHTML = `<img src="${s.logoUrl}" alt="Logo Sekolah" class="w-full h-full object-cover">`;
                    } else {
                        const size = el.dataset.size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
                        el.innerHTML = `<i data-lucide="school" class="${size}"></i>`;
                    }
                });

                const heroTitleEl = document.getElementById('hero-title');
                const heroDescEl = document.getElementById('hero-description');
                if (heroTitleEl) heroTitleEl.textContent = s.heroTitle || DEFAULT_SETTINGS.heroTitle;
                if (heroDescEl) heroDescEl.textContent = s.heroDescription || DEFAULT_SETTINGS.heroDescription;

                // Tahun Ajaran Aktif -- sebelumnya cuma tampil di Dashboard Admin, sekarang
                // ditampilkan juga di Beranda publik supaya wali murid tahu data yang mereka
                // lihat berlaku untuk tahun ajaran yang mana (menghindari kebingungan kalau
                // sekolah baru saja ganti tahun ajaran tapi ada sisa data lama).
                const berandaTahunEl = document.getElementById('beranda-tahun-ajaran-badge');
                if (berandaTahunEl) {
                    berandaTahunEl.innerHTML = s.tahunAjaran
                        ? `<i data-lucide="calendar-check" class="w-3 h-3"></i> Tahun Ajaran ${s.tahunAjaran}`
                        : `<i data-lucide="calendar-check" class="w-3 h-3"></i> Tahun Ajaran Belum Diatur`;
                    lucide.createIcons({root: berandaTahunEl.parentElement});
                }

                // Kartu kontak sekolah di Beranda -- hanya tampil kalau admin sudah isi
                // WA dan/atau alamat di menu Pengaturan, supaya tidak ada kartu kosong.
                const kontakCard = document.getElementById('beranda-kontak-card');
                const statsGrid = document.getElementById('beranda-stats-grid');
                if (kontakCard) {
                    const wa = (s.contactWa || '').trim();
                    const alamat = (s.contactAlamat || '').trim();
                    if (wa || alamat) {
                        kontakCard.classList.remove('d-none');
                        // 4 kartu (statistik x3 + kontak) -> grid 4 kolom di desktop.
                        if (statsGrid) statsGrid.classList.replace('lg:grid-cols-3', 'lg:grid-cols-4');
                        const kontakWaLink = document.getElementById('kontak-wa-link');
                        const kontakAlamatText = document.getElementById('kontak-alamat-text');
                        if (kontakWaLink) {
                            if (wa) {
                                let waDigits = wa.replace(/[^0-9]/g, '');
                                if (waDigits.startsWith('0')) waDigits = '62' + waDigits.slice(1);
                                else if (waDigits && !waDigits.startsWith('62')) waDigits = '62' + waDigits;
                                kontakWaLink.href = `https://wa.me/${waDigits}`;
                                kontakWaLink.textContent = wa;
                            } else {
                                kontakWaLink.removeAttribute('href');
                                kontakWaLink.textContent = 'Hubungi Admin';
                            }
                        }
                        if (kontakAlamatText) kontakAlamatText.textContent = alamat || 'Hubungi via WhatsApp';
                    } else {
                        kontakCard.classList.add('d-none');
                        // Kartu kontak disembunyikan -> tersisa 3 kartu statistik, pakai grid
                        // 3 kolom di desktop supaya tidak ada slot kosong yang bikin tidak simetris.
                        if (statsGrid) statsGrid.classList.replace('lg:grid-cols-4', 'lg:grid-cols-3');
                    }
                }

                lucide.createIcons();
            },

            // Tampilkan/sembunyikan tombol Login vs Profil Admin & menu admin di sidebar
            applyAdminUI(isAdmin) {
                const btnLogin = document.getElementById('btn-login-trigger');
                const profile = document.getElementById('admin-profile');
                const menu = document.getElementById('admin-menu-section');
                if (!btnLogin || !profile || !menu) return;
                if (isAdmin) {
                    btnLogin.classList.add('d-none');
                    profile.classList.remove('d-none');
                    menu.classList.remove('d-none');
                } else {
                    btnLogin.classList.remove('d-none');
                    profile.classList.add('d-none');
                    menu.classList.add('d-none');
                }
            },
            
            // syncRemote = false artinya hanya simpan lokal, tidak kirim ke server
            // (dipakai saat sinkronisasi awal supaya tidak menimpa data server dengan data lokal lama)
            saveData(type, syncRemote = true) {
                if(type === 'kelas' || type === 'all') { localStorage.setItem(DB_KEY_KELAS, JSON.stringify(state.kelas)); if(syncRemote) api.push('kelas', state.kelas); }
                if(type === 'ekskul' || type === 'all') { localStorage.setItem(DB_KEY_EKSKUL, JSON.stringify(state.ekskul)); if(syncRemote) api.push('ekskul', state.ekskul); }
                if(type === 'survey' || type === 'all') { localStorage.setItem(DB_KEY_SURVEY, JSON.stringify(state.surveys)); if(syncRemote) api.push('survey', state.surveys); }
                if(type === 'siswa' || type === 'all') { localStorage.setItem(DB_KEY_SISWA, JSON.stringify(state.siswa)); if(syncRemote) api.push('siswa', state.siswa); }
                if(type === 'gallery' || type === 'all') { localStorage.setItem(DB_KEY_GALLERY, JSON.stringify(state.gallery)); if(syncRemote) api.push('gallery', state.gallery); }
                if(type === 'usulan' || type === 'all') { localStorage.setItem(DB_KEY_USULAN, JSON.stringify(state.usulan)); if(syncRemote) api.push('usulan', state.usulan); }
                if(type === 'settings' || type === 'all') { localStorage.setItem(DB_KEY_SETTINGS, JSON.stringify([state.settings])); if(syncRemote) api.push('settings', [state.settings]); }
                if(type === 'notif' || type === 'all') { localStorage.setItem(DB_KEY_NOTIF, JSON.stringify(state.notif)); if(syncRemote) api.push('notif', state.notif); }
                if(type === 'saran' || type === 'all') { localStorage.setItem(DB_KEY_SARAN, JSON.stringify(state.saran)); if(syncRemote) api.push('saran', state.saran); }
                if(type === 'arsip' || type === 'all') { localStorage.setItem(DB_KEY_ARSIP, JSON.stringify(state.arsip)); if(syncRemote) api.push('arsip', state.arsip); }
            },
            
            generateId(prefix) { return `${prefix}_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`; },

            // Normalisasi field yang sekarang bisa berisi banyak nilai (multi pelatih / multi jadwal),
            // tapi data lama di spreadsheet mungkin masih berupa 1 string tunggal -- supaya tetap kompatibel.
            toArr(v) {
                if (Array.isArray(v)) return v.filter(x => x !== undefined && x !== null && String(x).trim() !== '');
                if (v === undefined || v === null || String(v).trim() === '') return [];
                return [v];
            },

            // Ambil daftar "kelompok" (kelas boleh ikut + hari + link WA + keterangan) dari 1 ekskul.
            // Data lama (sebelum fitur kelompok ada) cuma punya jadwal[] + waLink tunggal tanpa
            // batasan kelas -> otomatis dimigrasi jadi 1 kelompok "umum" supaya tetap tampil normal.
            toGrupArr(item) {
                if (Array.isArray(item.grup)) return item.grup;
                const jadwalArr = this.toArr(item.jadwal);
                if (jadwalArr.length || item.waLink) {
                    return [{
                        id: 'legacy',
                        keterangan: '',
                        kelas: [],
                        hari: jadwalArr.join(' • '),
                        waLink: item.waLink || ''
                    }];
                }
                return [];
            },

            // Link "share" dari Google Drive (mis. https://drive.google.com/file/d/XXXX/view?usp=sharing)
            // TIDAK bisa langsung dipakai sebagai <img src>, itu link ke halaman preview, bukan file
            // gambarnya -- makanya sering lambat/gagal dimuat. Ini otomatis mengubahnya ke endpoint
            // thumbnail Google yang memang dirancang untuk hotlink & jauh lebih cepat.
            normalizeImageUrl(url) {
                if (!url) return url;
                const trimmed = String(url).trim();

                // Pola 1: https://drive.google.com/file/d/FILE_ID/view...
                let match = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                // Pola 2: https://drive.google.com/open?id=FILE_ID
                if (!match) match = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
                // Pola 3: https://drive.google.com/uc?id=FILE_ID&... (sudah setengah benar, tetap dirapikan)
                if (!match) match = trimmed.match(/drive\.google\.com\/uc\?(?:export=[a-zA-Z]+&)?id=([a-zA-Z0-9_-]+)/);

                if (match && match[1]) {
                    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
                }
                return trimmed;
            },

            formatDate(dateObj) {
                const pad = (n) => String(n).padStart(2, '0');
                return `${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
            },

            showToast(message, type = 'success') {
                const container = document.getElementById('toast-container');
                const toast = document.createElement('div');
                const isError = type === 'error';
                toast.className = `transform translate-x-full opacity-0 transition-all duration-300 ease-out flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${isError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`;
                toast.innerHTML = (isError ? `<i data-lucide="x-circle" class="w-5 h-5 text-rose-500"></i>` : `<i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500"></i>`) + `<p class="text-sm font-semibold">${message}</p>`;
                container.appendChild(toast);
                lucide.createIcons({root: toast});
                
                // Animate in
                requestAnimationFrame(() => {
                    toast.classList.remove('translate-x-full', 'opacity-0');
                });
                
                // Animate out
                setTimeout(() => {
                    toast.classList.add('opacity-0', 'translate-y-2');
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }
        };

        // --- APP CONTROLLER (versi MPA: setiap halaman = file .html sungguhan) ---
        const PAGE_FILES = {
            beranda: 'index.html', survey: 'survey.html', tutorial: 'tutorial.html', dashboard: 'dashboard.html',
            kelas: 'kelas.html', kelola: 'kelola.html', usulan: 'usulan.html',
            galeri: 'galeri.html', siswa: 'siswa.html', spreadsheet: 'spreadsheet.html',
            pengaturan: 'pengaturan.html', cetak: 'cetak.html', notifikasi: 'notifikasi.html', saran: 'saran.html'
        };
        // Halaman yang hanya boleh diakses setelah login admin
        const ADMIN_PAGES = ['dashboard', 'kelas', 'kelola', 'usulan', 'galeri', 'siswa', 'spreadsheet', 'pengaturan', 'cetak', 'notifikasi', 'saran'];

        const appController = {
            currentPage() { return document.body.dataset.page; },

            // force=true dipakai saat halaman baru selesai dimuat, agar dirender
            // tanpa memicu navigasi/reload (karena kita memang sudah di halaman itu).
            switchPage(targetPageId, force = false) {
                if (targetPageId === this.currentPage()) {
                    if (force) this.renderPage(targetPageId);
                    return;
                }
                window.location.href = PAGE_FILES[targetPageId] || 'index.html';
            },

            renderPage(targetPageId) {
                // Update tampilan aktif di sidebar
                ['beranda', 'survey', 'tutorial', 'dashboard', 'kelas', 'kelola', 'usulan', 'galeri', 'siswa', 'spreadsheet', 'pengaturan', 'cetak', 'notifikasi', 'saran'].forEach(id => {
                    const btn = document.getElementById(`btn-${id}`);
                    if(!btn) return;
                    if(id === targetPageId) {
                        btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 bg-indigo-600 text-white shadow-md shadow-indigo-200/50";
                        btn.querySelector('i')?.setAttribute('class', `w-5 h-5 text-white`);
                    } else {
                        btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 text-slate-600 hover:bg-white/60 hover:text-indigo-700 hover:shadow-sm";
                        btn.querySelector('i')?.setAttribute('class', `w-5 h-5 text-slate-500`);
                    }
                });
                lucide.createIcons({ root: document.getElementById('sidebar-menu') });

                state.activePage = targetPageId;

                // Render konten khusus halaman ini (dibungkus try/catch supaya kalau satu
                // gagal, mis. Chart.js diblokir jaringan sekolah di halaman Dashboard,
                // tidak ikut merusak render halaman lain)
                try {
                    if(targetPageId === 'tutorial') uiManager.renderTutorialSteps('tutorial-steps-container');
                    if(targetPageId === 'dashboard') dashboardManager.init();
                    if(targetPageId === 'kelas') classManager.renderTable();
                    if(targetPageId === 'kelola') masterDataManager.renderTable();
                    if(targetPageId === 'usulan') usulanManager.renderTable();
                    if(targetPageId === 'galeri') galleryManager.renderAdminTable();
                    if(targetPageId === 'siswa') studentManager.renderTable();
                    if(targetPageId === 'spreadsheet') spreadsheetManager.render();
                    if(targetPageId === 'pengaturan') settingsManager.renderForm();
                    if(targetPageId === 'cetak') cetakManager.init();
                    if(targetPageId === 'notifikasi') notifManager.renderTable();
                    if(targetPageId === 'saran') saranManager.renderTable();
                } catch (err) {
                    console.warn(`Gagal merender konten halaman ${targetPageId}:`, err);
                }

                // Slideshow galeri publik hanya jalan di Beranda
                if(targetPageId === 'beranda') galleryManager.startSlideshow();
                else galleryManager.stopSlideshow();

                if(window.innerWidth < 1024) uiManager.toggleMobileSidebar(false);
            }
        };

        const uiManager = {
            toggleMobileSidebar(show) {
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('mobile-overlay');
                if (show) {
                    sidebar.classList.add('open'); overlay.classList.add('active');
                } else {
                    sidebar.classList.remove('open'); overlay.classList.remove('active');
                }
            },

            // Custom Dialogs Replacement
            confirm(message, callback) {
                const m = document.getElementById('modal-confirm'), c = document.getElementById('modal-confirm-card');
                document.getElementById('confirm-message').innerText = message;
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                
                const btnOk = document.getElementById('btn-confirm-ok');
                const btnCancel = document.getElementById('btn-confirm-cancel');
                
                const cleanup = () => {
                    m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
                    btnOk.replaceWith(btnOk.cloneNode(true)); btnCancel.replaceWith(btnCancel.cloneNode(true));
                };
                
                btnOk.onclick = () => { cleanup(); callback(); };
                btnCancel.onclick = cleanup;
            },

            prompt(message, placeholder, expectedValue, callback) {
                const m = document.getElementById('modal-prompt'), c = document.getElementById('modal-prompt-card');
                document.getElementById('prompt-message').innerText = message;
                const input = document.getElementById('prompt-input');
                input.value = ''; input.placeholder = placeholder;
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                setTimeout(() => input.focus(), 100);
                
                const btnOk = document.getElementById('btn-prompt-ok');
                const btnCancel = document.getElementById('btn-prompt-cancel');
                
                const cleanup = () => {
                    m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
                    btnOk.replaceWith(btnOk.cloneNode(true)); btnCancel.replaceWith(btnCancel.cloneNode(true));
                };
                
                btnOk.onclick = () => { 
                    if(input.value.trim().toUpperCase() === expectedValue.toUpperCase()) { cleanup(); callback(); }
                    else { system.showToast('Kata kunci perlindungan salah!', 'error'); input.focus(); }
                };
                btnCancel.onclick = cleanup;
            },

            renderBerandaCards() {
                const container = document.getElementById('container-ekskul-beranda');
                const emptyHint = document.getElementById('filter-ekskul-empty-hint');
                if(state.ekskul.length === 0) {
                    container.innerHTML = `<div class="col-span-full p-8 text-center bg-white/40 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm">Belum ada data ekstrakurikuler yang aktif.</div>`;
                    if (emptyHint) emptyHint.classList.add('hidden');
                    return;
                }

                // Terapkan filter pencarian / kelas / hari (lihat populateBerandaFilterOptions
                // & bindBerandaFilterEvents) supaya wali murid tidak perlu scroll semua kartu
                // satu-satu kalau daftar ekskul-nya banyak.
                const f = state.berandaFilters || { cari: '', kelas: '', hari: '' };
                const cari = (f.cari || '').trim().toLowerCase();
                // Pola \b (word boundary) sama seperti di renderBerandaJadwal, supaya filter
                // hari "Minggu" tidak ikut ke-trigger oleh kata seperti "seminggu"/"mingguan".
                const hariPattern = f.hari ? new RegExp(`\\b${f.hari.replace("Jumat", "Jum\\'?at")}\\b`, 'i') : null;
                const list = state.ekskul.filter(item => {
                    if (cari && !item.nama.toLowerCase().includes(cari)) return false;
                    if (f.kelas || f.hari) {
                        const grupArr = system.toGrupArr(item);
                        const matchKelas = !f.kelas || grupArr.some(g => system.toArr(g.kelas).includes(f.kelas));
                        const matchHari = !hariPattern || grupArr.some(g => hariPattern.test(g.hari || ''));
                        if (!matchKelas || !matchHari) return false;
                    }
                    return true;
                });

                if (list.length === 0) {
                    container.innerHTML = '';
                    if (emptyHint) emptyHint.classList.remove('hidden');
                    return;
                }
                if (emptyHint) emptyHint.classList.add('hidden');

                container.innerHTML = list.map(item => {
                    const grupArr = system.toGrupArr(item);
                    const pembimbingArr = system.toArr(item.pembimbing);

                    // Status kuota real-time, dihitung dari jumlah siswa yang sudah memilih
                    // ekskul ini di data survey -- dipakai sama seperti di form pendaftaran
                    // (populateEkskulCheckboxes) supaya wali murid tahu status sebelum daftar.
                    const kuota = Number(item.kuota) || 0;
                    const terisi = state.surveys.filter(s => (s.pilihanEkskul || [s.ekskul1, s.ekskul2].filter(Boolean)).includes(item.nama)).length;
                    const penuh = kuota > 0 && terisi >= kuota;
                    const sisa = kuota - terisi;
                    const hampirPenuh = kuota > 0 && !penuh && sisa <= Math.max(1, Math.ceil(kuota * 0.15));
                    let statusBadge;
                    if (penuh) {
                        statusBadge = `<span class="px-2.5 py-1 text-[10px] font-bold bg-rose-100 text-rose-700 rounded-lg uppercase">Kuota Penuh</span>`;
                    } else if (kuota > 0) {
                        statusBadge = `<span class="px-2.5 py-1 text-[10px] font-bold ${hampirPenuh ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} rounded-lg uppercase">Sisa ${sisa} Kursi</span>`;
                    } else {
                        statusBadge = `<span class="px-2.5 py-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-lg uppercase">Buka Pendaftaran</span>`;
                    }
                    const terdaftarInfo = `<p class="text-[10px] text-slate-500 font-medium mb-3">${terisi} siswa telah mendaftar${kuota > 0 ? ` dari ${kuota} kursi` : ''}</p>`;

                    // Kartu per kelompok kelas & hari, mis: "Kelas 3 • Sabtu, 14:00" & "Kelas 4 • Minggu, 09:00"
                    const grupBadges = grupArr.length ? `<div class="space-y-1.5 mb-4">${grupArr.map(g => {
                        const kelasArr = system.toArr(g.kelas);
                        const kelasLabel = kelasArr.length ? kelasArr.join(', ') : 'Semua Kelas';
                        const label = [g.keterangan, kelasLabel].filter(Boolean).join(' — ');
                        return `<div class="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-semibold border border-slate-200">
                            <i data-lucide="users-round" class="w-3 h-3 flex-shrink-0"></i> <span class="truncate">${label || kelasLabel}</span>
                            ${g.hari ? `<span class="mx-0.5 text-slate-300">•</span><i data-lucide="clock" class="w-3 h-3 flex-shrink-0"></i> <span class="truncate">${g.hari}</span>` : ''}
                        </div>`;
                    }).join('')}</div>` : '';
                    return `
                    <div class="glass-card p-5 md:p-6 rounded-2xl h-full flex flex-col justify-between group">
                        <div>
                            <div class="flex items-center justify-between mb-4">
                                <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600"><i data-lucide="award" class="w-5 h-5"></i></div>
                                ${statusBadge}
                            </div>
                            <h4 class="font-extrabold text-lg text-slate-900 mb-2">${item.nama}</h4>
                            <p class="text-xs text-slate-600 line-clamp-3 mb-2 leading-relaxed">${item.deskripsi}</p>
                            <button onclick="uiManager.openEkskulDetailModal('${item.id}')" class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 mb-3 inline-flex items-center gap-1">Lihat Selengkapnya <i data-lucide="chevron-right" class="w-3 h-3"></i></button>
                            ${terdaftarInfo}
                            ${grupBadges}
                        </div>
                        <div class="pt-4 border-t border-slate-200/60 mt-auto flex items-center gap-3">
                            <div class="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0"><i data-lucide="user" class="w-4 h-4 text-slate-500"></i></div>
                            <div class="min-w-0">
                                <p class="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Pembina / Pelatih</p>
                                <p class="text-xs font-semibold text-slate-800">${pembimbingArr.length ? pembimbingArr.map(p => `<span class="block truncate">${p}</span>`).join('') : '-'}</p>
                            </div>
                        </div>
                    </div>`;
                }).join('');
                lucide.createIcons({root: container});
            },

            // Isi opsi dropdown filter Kelas & Hari di grid "Pilihan Kegiatan Tersedia"
            // berdasarkan data ekskul yang benar-benar ada, supaya tidak ada opsi kosong.
            populateBerandaFilterOptions() {
                const kelasSel = document.getElementById('filter-ekskul-kelas');
                const hariSel = document.getElementById('filter-ekskul-hari');
                if (!kelasSel || !hariSel) return;

                const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
                const HARI_PATTERNS = { Senin: '\\bSenin\\b', Selasa: '\\bSelasa\\b', Rabu: '\\bRabu\\b', Kamis: '\\bKamis\\b', Jumat: "\\bJum\\'?at\\b", Sabtu: '\\bSabtu\\b', Minggu: '\\bMinggu\\b' };

                const kelasSet = new Set();
                const hariSet = new Set();
                state.ekskul.forEach(item => {
                    system.toGrupArr(item).forEach(g => {
                        system.toArr(g.kelas).forEach(k => kelasSet.add(k));
                        const hariStr = String(g.hari || '');
                        HARI_LIST.forEach(h => { if (new RegExp(HARI_PATTERNS[h], 'i').test(hariStr)) hariSet.add(h); });
                    });
                });

                const prevKelas = kelasSel.value;
                kelasSel.innerHTML = '<option value="">Semua Kelas</option>' +
                    Array.from(kelasSet).sort().map(k => `<option value="${k}">${k}</option>`).join('');
                if (kelasSet.has(prevKelas)) kelasSel.value = prevKelas; else state.berandaFilters.kelas = '';

                const prevHari = hariSel.value;
                hariSel.innerHTML = '<option value="">Semua Hari</option>' +
                    HARI_LIST.filter(h => hariSet.has(h)).map(h => `<option value="${h}">${h}</option>`).join('');
                if (hariSet.has(prevHari)) hariSel.value = prevHari; else state.berandaFilters.hari = '';
            },

            // Pasang event listener untuk input pencarian & dropdown filter (sekali saja,
            // dicek lewat dataset.bound supaya tidak dobel-pasang tiap kali data ekskul berubah).
            bindBerandaFilterEvents() {
                const cariEl = document.getElementById('filter-ekskul-cari');
                const kelasEl = document.getElementById('filter-ekskul-kelas');
                const hariEl = document.getElementById('filter-ekskul-hari');
                const resetBtn = document.getElementById('filter-ekskul-reset');
                if (!cariEl || cariEl.dataset.bound) return;
                cariEl.dataset.bound = '1';

                let debounceTimer = null;
                cariEl.addEventListener('input', () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        state.berandaFilters.cari = cariEl.value;
                        this.renderBerandaCards();
                    }, 200);
                });
                kelasEl.addEventListener('change', () => {
                    state.berandaFilters.kelas = kelasEl.value;
                    this.renderBerandaCards();
                });
                hariEl.addEventListener('change', () => {
                    state.berandaFilters.hari = hariEl.value;
                    this.renderBerandaCards();
                });
                resetBtn.addEventListener('click', () => {
                    cariEl.value = ''; kelasEl.value = ''; hariEl.value = '';
                    state.berandaFilters = { cari: '', kelas: '', hari: '' };
                    this.renderBerandaCards();
                });
            },

            // Ringkasan statistik publik di Beranda: total kegiatan, total siswa yang
            // sudah mendaftar, dan kegiatan paling banyak diminati (social proof buat wali murid).
            renderBerandaStats() {
                const totalEkskulEl = document.getElementById('stat-total-ekskul');
                const totalPendaftarEl = document.getElementById('stat-total-pendaftar');
                const terpopulerEl = document.getElementById('stat-ekskul-terpopuler');
                if (totalEkskulEl) totalEkskulEl.textContent = state.ekskul.length;
                if (totalPendaftarEl) totalPendaftarEl.textContent = state.surveys.length;
                if (terpopulerEl) {
                    const counts = {};
                    state.ekskul.forEach(ek => counts[ek.nama] = 0);
                    state.surveys.forEach(sv => {
                        const pilihan = sv.pilihanEkskul || [sv.ekskul1, sv.ekskul2].filter(Boolean);
                        pilihan.forEach(nm => { if (counts[nm] !== undefined) counts[nm]++; });
                    });
                    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                    terpopulerEl.textContent = (top && top[1] > 0) ? top[0] : '-';
                }
            },

            // Breakdown jadwal mingguan (Senin - Minggu) supaya wali murid bisa langsung
            // cek potensi bentrok jadwal antar kegiatan tanpa harus buka satu-satu.
            // Setiap kelompok bisa punya beberapa baris jadwal yang digabung ' • ' (mis.
            // "Sabtu, 14:00 - 15:30 • Minggu, 09:00"), jadi dipecah per baris dulu supaya
            // hari & jam yang terdeteksi sesuai barisnya masing-masing, tidak tercampur.
            renderBerandaJadwal() {
                const container = document.getElementById('container-jadwal-mingguan');
                if (!container) return;

                const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
                // \b (word boundary) WAJIB dipakai -- tanpa ini, kata sehari-hari seperti
                // "seminggu" atau "mingguan" akan salah terdeteksi sebagai hari "Minggu"
                // karena secara teks memang mengandung substring "minggu".
                const HARI_PATTERNS = { Senin: '\\bSenin\\b', Selasa: '\\bSelasa\\b', Rabu: '\\bRabu\\b', Kamis: '\\bKamis\\b', Jumat: "\\bJum\\'?at\\b", Sabtu: '\\bSabtu\\b', Minggu: '\\bMinggu\\b' };
                // Jam ditampilkan penuh kalau ada rentang (14:00 - 15:30), dipakai juga buat urutkan tiap hari
                // berdasarkan jam mulai, dan menerima pemisah ':' atau '.' (mis. 14.00) sesuai gaya input admin.
                const JAM_TAMPIL_RE = /\d{1,2}[.:]\d{2}(?:\s*(?:-|–|s\.?d\.?)\s*\d{1,2}[.:]\d{2})?/i;
                const JAM_MULAI_RE = /(\d{1,2})[.:](\d{2})/;

                const buckets = {}; HARI_LIST.forEach(h => buckets[h] = new Map()); // key: "nama|jam" -> {nama, jam, sortKey}
                const lainnya = new Set();

                state.ekskul.forEach(item => {
                    const grupArr = system.toGrupArr(item);
                    grupArr.forEach(g => {
                        const hariStr = String(g.hari || '').trim();
                        if (!hariStr) return;

                        const barisList = hariStr.split('•').map(s => s.trim()).filter(Boolean);
                        (barisList.length ? barisList : [hariStr]).forEach(baris => {
                            let matched = false;
                            HARI_LIST.forEach(h => {
                                if (!new RegExp(HARI_PATTERNS[h], 'i').test(baris)) return;
                                matched = true;
                                const jamTampilMatch = baris.match(JAM_TAMPIL_RE);
                                const jamMulaiMatch = baris.match(JAM_MULAI_RE);
                                const jam = jamTampilMatch ? jamTampilMatch[0] : '';
                                const sortKey = jamMulaiMatch ? (parseInt(jamMulaiMatch[1], 10) * 60 + parseInt(jamMulaiMatch[2], 10)) : 9999;
                                buckets[h].set(`${item.nama}|${jam}`, { nama: item.nama, jam, sortKey });
                            });
                            if (!matched) lainnya.add(item.nama);
                        });
                    });
                });

                const adaJadwal = HARI_LIST.some(h => buckets[h].size > 0) || lainnya.size > 0;
                if (!adaJadwal) {
                    container.innerHTML = `<div class="col-span-full p-6 text-center bg-white/40 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs">Jadwal ekstrakurikuler belum diisi oleh admin.</div>`;
                    return;
                }

                const hariCardsHtml = HARI_LIST.map(h => {
                    const list = Array.from(buckets[h].values()).sort((a, b) => a.sortKey - b.sortKey);
                    return `
                    <div class="glass-card p-4 rounded-2xl min-h-[110px]">
                        <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-2">${h}</p>
                        ${list.length ? `<div class="space-y-2">${list.map(x => `
                            <div>
                                <p class="text-[11px] font-semibold text-slate-700 leading-snug">${x.nama}</p>
                                ${x.jam ? `<p class="text-[9px] font-medium text-slate-400">${x.jam}</p>` : ''}
                            </div>`).join('')}</div>` : `<p class="text-[10px] text-slate-400 italic">Tidak ada jadwal</p>`}
                    </div>`;
                }).join('');

                const lainnyaHtml = lainnya.size ? `
                    <div class="glass-card p-4 rounded-2xl min-h-[80px] col-span-2 sm:col-span-3 lg:col-span-7">
                        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Jadwal Lainnya / Belum Ditentukan Harinya</p>
                        <div class="flex flex-wrap gap-2">${Array.from(lainnya).map(n => `<span class="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-semibold">${n}</span>`).join('')}</div>
                    </div>` : '';

                container.innerHTML = hariCardsHtml + lainnyaHtml;
                lucide.createIcons({ root: container });
            },

            populateKelasDropdowns() {
                const dropdowns = document.querySelectorAll('.select-kelas-options');
                const sortedKelas = [...state.kelas].sort((a,b) => a.nama.localeCompare(b.nama));
                
                dropdowns.forEach(select => {
                    const currentVal = select.value;
                    const isFilter = select.id.includes('filter');
                    select.innerHTML = isFilter ? '<option value="">Semua Kelas</option>' : '<option value="" disabled selected>-- Pilih Kelas --</option>';
                    sortedKelas.forEach(k => select.innerHTML += `<option value="${k.nama}">${k.nama}</option>`);
                    if(currentVal && sortedKelas.some(k => k.nama === currentVal)) select.value = currentVal;
                });
            },

            populateEkskulDropdowns() {
                const dropdowns = document.querySelectorAll('.select-ekskul-options');
                dropdowns.forEach(select => {
                    const currentVal = select.value;
                    if(select.id === 'filter-ekskul') select.innerHTML = '<option value="">Semua Pilihan Ekskul</option>';
                    else select.innerHTML = '<option value="" disabled selected>-- Silakan Pilih Kegiatan --</option>';

                    state.ekskul.forEach(ek => select.innerHTML += `<option value="${ek.nama}">${ek.nama}</option>`);
                    if(currentVal && state.ekskul.some(e => e.nama === currentVal)) select.value = currentVal;
                });
            },

            populateEkskulCheckboxes() {
                const container = document.getElementById('sv-ekskul-checkboxes');
                if(!container) return;
                container.innerHTML = state.ekskul.map(ek => {
                    const kuota = Number(ek.kuota) || 0;
                    const terisi = state.surveys.filter(s => (s.pilihanEkskul || [s.ekskul1, s.ekskul2].filter(Boolean)).includes(ek.nama)).length;
                    const penuh = kuota > 0 && terisi >= kuota;
                    const sisaBadge = kuota > 0
                        ? `<span class="text-[10px] font-bold ${penuh ? 'text-rose-600' : 'text-emerald-600'}">${penuh ? 'Kuota penuh' : `Sisa ${kuota - terisi} kursi`}</span>`
                        : '';
                    return `
                    <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white transition-colors has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50 ${penuh ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}">
                        <div class="flex-shrink-0 pt-0.5">
                            <input type="checkbox" name="sv-ekskul" value="${ek.nama}" ${penuh ? 'disabled' : ''} class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
                        </div>
                        <div class="flex-1">
                            <div class="text-sm font-semibold text-slate-700 leading-tight">${ek.nama}</div>
                            ${sisaBadge}
                        </div>
                    </label>
                `;
                }).join('');
            },

            openEkskulDetailModal(id) {
                const item = state.ekskul.find(e => e.id === id);
                if (!item) return;
                const m = document.getElementById('modal-ekskul-detail'), c = document.getElementById('modal-ekskul-detail-card');

                const grupArr = system.toGrupArr(item);
                const pembimbingArr = system.toArr(item.pembimbing);

                document.getElementById('detail-ekskul-nama').textContent = item.nama;
                document.getElementById('detail-ekskul-deskripsi').textContent = item.deskripsi;
                document.getElementById('detail-ekskul-pembimbing').innerHTML = pembimbingArr.length ? pembimbingArr.map(p => `<span class="block">${p}</span>`).join('') : '-';

                // Tampilkan tiap kelompok (kelas boleh ikut + hari + grup WA-nya sendiri),
                // supaya walimurid langsung tahu jadwal & grup WA yang relevan buat kelas anaknya.
                const grupListEl = document.getElementById('detail-ekskul-grup-list');
                if (grupArr.length) {
                    grupListEl.innerHTML = grupArr.map(g => {
                        const kelasArr = system.toArr(g.kelas);
                        const kelasLabel = kelasArr.length ? kelasArr.join(', ') : 'Semua Kelas';
                        return `
                        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                ${g.keterangan ? `<p class="text-xs font-bold text-slate-800 mb-1">${g.keterangan}</p>` : ''}
                                <p class="text-[11px] text-slate-500 flex items-center gap-1.5 mb-0.5"><i data-lucide="users-round" class="w-3 h-3 flex-shrink-0"></i> Peserta: ${kelasLabel}</p>
                                ${g.hari ? `<p class="text-[11px] text-slate-500 flex items-center gap-1.5"><i data-lucide="clock" class="w-3 h-3 flex-shrink-0"></i> ${g.hari}</p>` : ''}
                            </div>
                            ${g.waLink ? `<a href="${g.waLink}" target="_blank" class="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold shadow-sm"><i data-lucide="message-circle" class="w-3 h-3"></i> WA</a>` : ''}
                        </div>`;
                    }).join('');
                    grupListEl.classList.remove('d-none');
                } else {
                    grupListEl.innerHTML = '';
                    grupListEl.classList.add('d-none');
                }

                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                lucide.createIcons({ root: m });
            },

            closeEkskulDetailModal() {
                const m = document.getElementById('modal-ekskul-detail'), c = document.getElementById('modal-ekskul-detail-card');
                m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
            },

            toggleLoginModal(show) {
                const m = document.getElementById('modal-login'), c = document.getElementById('modal-login-card');
                if(show) {
                    document.getElementById('login-error-msg').classList.add('d-none');
                    document.getElementById('login-username').value = ''; document.getElementById('login-password').value = '';
                    m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                } else {
                    m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
                }
            },

            openKelasModal(id = null) {
                const m = document.getElementById('modal-kelas'), c = document.getElementById('modal-kelas-card');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                
                if(id) {
                    document.getElementById('modal-kelas-title').innerText = "Ubah Data Kelas";
                    const item = state.kelas.find(k => k.id === id);
                    if(item) { document.getElementById('kelas-id').value = item.id; document.getElementById('kelas-nama').value = item.nama; document.getElementById('kelas-wa').value = item.waWaliKelas || ''; }
                } else {
                    document.getElementById('modal-kelas-title').innerText = "Tambah Kelas Baru";
                    document.getElementById('kelas-id').value = ''; document.getElementById('kelas-nama').value = ''; document.getElementById('kelas-wa').value = '';
                }
                document.getElementById('kelas-siswa-import').value = ''; // Selalu kosongkan untuk form baru
            },

            closeKelasModal() {
                const m = document.getElementById('modal-kelas'), c = document.getElementById('modal-kelas-card');
                m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
            },

            openEkskulModal(id = null) {
                const m = document.getElementById('modal-ekskul'), c = document.getElementById('modal-ekskul-card');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                if(id) {
                    document.getElementById('modal-ekskul-title').innerText = "Edit Ekstrakurikuler";
                    const item = state.ekskul.find(e => e.id === id);
                    if(item) {
                        document.getElementById('ekskul-id').value = item.id; document.getElementById('ekskul-nama').value = item.nama;
                        document.getElementById('ekskul-kuota').value = item.kuota ? item.kuota : '';
                        document.getElementById('ekskul-deskripsi').value = item.deskripsi;
                        const pembimbingArr = system.toArr(item.pembimbing);
                        const grupArr = system.toGrupArr(item);
                        masterDataManager.resetDynamicFields();
                        (pembimbingArr.length ? pembimbingArr : ['']).forEach(v => masterDataManager.addPembimbingField(v));
                        (grupArr.length ? grupArr : [{}]).forEach(g => masterDataManager.addGrupField(g));
                    }
                } else {
                    document.getElementById('modal-ekskul-title').innerText = "Buat Ekstrakurikuler Baru";
                    document.getElementById('ekskul-id').value = ''; document.getElementById('ekskul-nama').value = ''; document.getElementById('ekskul-kuota').value = ''; document.getElementById('ekskul-deskripsi').value = '';
                    masterDataManager.resetDynamicFields();
                    masterDataManager.addPembimbingField();
                    masterDataManager.addGrupField();
                }
                lucide.createIcons({ root: c });
            },

            closeEkskulModal() {
                const m = document.getElementById('modal-ekskul'), c = document.getElementById('modal-ekskul-card');
                m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
            },

            openGaleriModal(id = null) {
                const m = document.getElementById('modal-galeri'), c = document.getElementById('modal-galeri-card');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                if(id) {
                    document.getElementById('modal-galeri-title').innerText = "Edit Foto Galeri";
                    const item = state.gallery.find(e => e.id === id);
                    if(item) { 
                        document.getElementById('galeri-id').value = item.id; 
                        document.getElementById('galeri-url').value = item.url; 
                        document.getElementById('galeri-caption').value = item.caption || ''; 
                        document.getElementById('galeri-aktif').checked = item.aktif; 
                    }
                } else {
                    document.getElementById('modal-galeri-title').innerText = "Tambah Foto Baru";
                    document.getElementById('galeri-id').value = ''; 
                    document.getElementById('galeri-url').value = ''; 
                    document.getElementById('galeri-caption').value = ''; 
                    document.getElementById('galeri-aktif').checked = true;
                }
            },

            closeGaleriModal() {
                const m = document.getElementById('modal-galeri'), c = document.getElementById('modal-galeri-card');
                m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
            },

            openSuccessModal() {
                const m = document.getElementById('modal-success-survey'), c = document.getElementById('modal-success-card');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
            },

            closeSuccessModal() {
                const m = document.getElementById('modal-success-survey'), c = document.getElementById('modal-success-card');
                m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
                appController.switchPage('beranda');
            },

            // --- Tutorial Pendaftaran (untuk Wali Murid/Siswa) ---
            TUTORIAL_STEPS: [
                { icon: 'compass', title: '1. Lihat Info Ekskul', text: 'Buka menu "Info Ekskul" di sidebar untuk melihat semua kegiatan ekstrakurikuler yang tersedia, lengkap dengan jadwal latihan dan nama pelatih/pembinanya.' },
                { icon: 'clipboard-pen', title: '2. Buka Menu Pendaftaran', text: 'Klik menu "Pendaftaran Peminatan" di sidebar untuk membuka formulir peminatan.' },
                { icon: 'school', title: '3. Pilih Kelas & Nama Siswa', text: 'Pilih kelas terlebih dahulu, lalu pilih nama siswa dari daftar yang muncul. Jika nama belum ada di daftar, hubungi wali kelas.' },
                { icon: 'list-checks', title: '4. Centang Ekstrakurikuler Pilihan', text: 'Centang satu atau lebih ekstrakurikuler yang diminati. Boleh memilih lebih dari satu kegiatan.' },
                { icon: 'lightbulb', title: '5. (Opsional) Usulkan Ekskul Baru', text: 'Jika ekskul yang diinginkan belum ada di daftar, centang kotak "Ekskul yang saya inginkan belum ada di daftar" lalu isi nama & alasan usulannya. Usulan akan langsung masuk ke menu Admin Sekolah.' },
                { icon: 'send', title: '6. Kirim Pendaftaran', text: 'Isi alasan/motivasi singkat (opsional), lalu klik tombol "Kirim Pilihan Saya" untuk menyimpan pendaftaran.' },
                { icon: 'message-circle', title: '7. Gabung Grup WhatsApp', text: 'Setelah berhasil, akan muncul konfirmasi dan tombol untuk bergabung ke grup WhatsApp kegiatan yang dipilih (jika tersedia).' }
            ],

            renderTutorialSteps(containerId) {
                const container = document.getElementById(containerId);
                if (!container) return;
                container.innerHTML = this.TUTORIAL_STEPS.map(step => `
                    <div class="glass-card p-4 md:p-5 rounded-2xl flex items-start gap-4">
                        <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0"><i data-lucide="${step.icon}" class="w-5 h-5"></i></div>
                        <div>
                            <h4 class="text-sm font-extrabold text-slate-900 mb-1">${step.title}</h4>
                            <p class="text-xs md:text-sm text-slate-600 leading-relaxed">${step.text}</p>
                        </div>
                    </div>
                `).join('');
                lucide.createIcons({ root: container });
            },

            openTutorialModal() {
                const m = document.getElementById('modal-tutorial'), c = document.getElementById('modal-tutorial-card');
                if (!m || !c) return;
                this.renderTutorialSteps('tutorial-modal-steps-container');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                lucide.createIcons({ root: m });
            },

            closeTutorialModal(markSeen = true) {
                const m = document.getElementById('modal-tutorial'), c = document.getElementById('modal-tutorial-card');
                if (!m || !c) return;
                m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
                if (markSeen) { try { localStorage.setItem('sdn01_tutorial_seen', '1'); } catch (err) { /* no-op */ } }
            },

            // Dipanggil sekali saat Beranda dibuka pertama kali (per perangkat/browser)
            maybeShowTutorialOnFirstVisit() {
                if (document.body.dataset.page !== 'beranda') return;
                if (!document.getElementById('modal-tutorial')) return;
                let seen = false;
                try { seen = localStorage.getItem('sdn01_tutorial_seen') === '1'; } catch (err) { /* no-op */ }
                if (!seen) setTimeout(() => uiManager.openTutorialModal(), 600);
            }
        };

        // --- STREAMING_CHUNK:Implementing Data Management Logics (Classes, Surveys, Data)... ---
        const settingsManager = {
            pendingLogoDataUrl: null, // menampung hasil upload sebelum tombol "Simpan" ditekan

            renderForm() {
                const s = state.settings || DEFAULT_SETTINGS;
                this.pendingLogoDataUrl = null;

                document.getElementById('setting-school-name').value = s.schoolName || '';
                document.getElementById('setting-hero-title').value = s.heroTitle || '';
                document.getElementById('setting-hero-desc').value = s.heroDescription || '';
                document.getElementById('setting-logo-input').value = '';
                this.renderLogoPreview(s.logoUrl || '');

                const contactWaEl = document.getElementById('setting-contact-wa');
                const contactAlamatEl = document.getElementById('setting-contact-alamat');
                if (contactWaEl) contactWaEl.value = s.contactWa || '';
                if (contactAlamatEl) contactAlamatEl.value = s.contactAlamat || '';

                const userEl = document.getElementById('setting-admin-username');
                const passEl = document.getElementById('setting-admin-password');
                if (userEl) userEl.value = s.adminUsername || DEFAULT_SETTINGS.adminUsername;
                if (passEl) passEl.value = s.adminPassword || DEFAULT_SETTINGS.adminPassword;

                const tahunEl = document.getElementById('setting-tahun-ajaran');
                if (tahunEl) tahunEl.value = s.tahunAjaran || '';
                const tahunBaruEl = document.getElementById('arsip-tahun-baru');
                if (tahunBaruEl) tahunBaruEl.value = '';

                if (typeof arsipManager !== 'undefined') arsipManager.renderList();
            },

            // Simpan label Tahun Ajaran Aktif saja (tanpa mengarsipkan apa pun) --
            // dipakai untuk pengaturan awal/koreksi label, bukan pergantian tahun ajaran.
            saveTahunAjaran() {
                const el = document.getElementById('setting-tahun-ajaran');
                const val = el ? el.value.trim() : '';
                if (val === '') return system.showToast('Isi label Tahun Ajaran terlebih dahulu.', 'error');
                state.settings = { ...state.settings, tahunAjaran: val };
                system.saveData('settings');
                system.showToast('Label Tahun Ajaran Aktif disimpan.', 'success');
            },

            renderLogoPreview(url) {
                const preview = document.getElementById('setting-logo-preview');
                if (url) {
                    preview.innerHTML = `<img src="${url}" alt="Logo" class="w-full h-full object-cover">`;
                } else {
                    preview.innerHTML = `<i data-lucide="school" class="w-8 h-8 text-slate-400"></i>`;
                }
                lucide.createIcons({ root: preview });
            },

            // Kompres & resize gambar di browser (canvas) supaya cukup kecil untuk
            // disimpan sebagai 1 sel di Google Sheets (batas ±50.000 karakter/sel).
            handleLogoUpload(input) {
                const file = input.files && input.files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    system.showToast('File harus berupa gambar (PNG/JPG).', 'error');
                    input.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const MAX_DIM = 256;
                        let { width, height } = img;
                        if (width > height && width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
                        else if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }

                        const canvas = document.createElement('canvas');
                        canvas.width = width; canvas.height = height;
                        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                        // Coba beberapa tingkat kualitas sampai ukurannya aman
                        let dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        if (dataUrl.length > 45000) dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                        if (dataUrl.length > 45000) dataUrl = canvas.toDataURL('image/jpeg', 0.4);

                        if (dataUrl.length > 45000) {
                            system.showToast('Gambar masih terlalu besar, coba pakai gambar lain yang lebih sederhana.', 'error');
                            return;
                        }

                        this.pendingLogoDataUrl = dataUrl;
                        this.renderLogoPreview(dataUrl);
                        system.showToast('Logo siap. Klik "Simpan Pengaturan" untuk menerapkan.', 'success');
                    };
                    img.onerror = () => system.showToast('Gagal membaca gambar.', 'error');
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            },

            resetLogo() {
                this.pendingLogoDataUrl = ''; // string kosong = tandai "hapus logo" saat disimpan
                this.renderLogoPreview('');
                system.showToast('Logo akan dikembalikan ke ikon bawaan setelah disimpan.', 'success');
            },

            save() {
                const schoolName = document.getElementById('setting-school-name').value.trim();
                const heroTitle = document.getElementById('setting-hero-title').value.trim();
                const heroDesc = document.getElementById('setting-hero-desc').value.trim();

                const userEl = document.getElementById('setting-admin-username');
                const passEl = document.getElementById('setting-admin-password');
                const adminUsername = userEl ? userEl.value.trim() : (state.settings.adminUsername || DEFAULT_SETTINGS.adminUsername);
                const adminPassword = passEl ? passEl.value.trim() : (state.settings.adminPassword || DEFAULT_SETTINGS.adminPassword);

                const contactWaEl = document.getElementById('setting-contact-wa');
                const contactAlamatEl = document.getElementById('setting-contact-alamat');
                const contactWa = contactWaEl ? contactWaEl.value.trim() : (state.settings.contactWa || '');
                const contactAlamat = contactAlamatEl ? contactAlamatEl.value.trim() : (state.settings.contactAlamat || '');

                state.settings = {
                    id: 'main',
                    logoUrl: (this.pendingLogoDataUrl !== null) ? this.pendingLogoDataUrl : (state.settings.logoUrl || ''),
                    schoolName: schoolName || DEFAULT_SETTINGS.schoolName,
                    heroTitle: heroTitle || DEFAULT_SETTINGS.heroTitle,
                    heroDescription: heroDesc || DEFAULT_SETTINGS.heroDescription,
                    adminUsername: adminUsername || DEFAULT_SETTINGS.adminUsername,
                    adminPassword: adminPassword || DEFAULT_SETTINGS.adminPassword,
                    tahunAjaran: state.settings.tahunAjaran || '',
                    contactWa: contactWa,
                    contactAlamat: contactAlamat
                };

                system.saveData('settings');
                system.applyBranding();
                system.showToast('Pengaturan berhasil disimpan.', 'success');
            }
        };

        // --- ARSIP TAHUN AJARAN ---
        // Karena arsitektur backend cuma simpan 1 blob JSON per jenis data (lihat
        // worker.js), "arsip tahun ajaran" diimplementasikan sebagai jenis data baru
        // ('arsip') berisi array snapshot: tiap kali admin "Ganti Tahun Ajaran &
        // Arsipkan", seluruh data responden survei + usulan ekskul + kritik&saran
        // SAAT INI dibungkus jadi 1 snapshot bertanggal dan disimpan ke state.arsip,
        // lalu data survey/usulan/saran yang aktif dikosongkan supaya tahun ajaran
        // baru mulai bersih. Data Master Kelas, Data Siswa, dan daftar Ekskul TIDAK
        // ikut diarsipkan/dikosongkan karena biasanya tetap dipakai lintas tahun ajaran.
        const arsipManager = {
            archiveAndReset() {
                const inputBaru = document.getElementById('arsip-tahun-baru');
                const tahunBaru = inputBaru ? inputBaru.value.trim() : '';
                if (tahunBaru === '') {
                    return system.showToast('Isi label Tahun Ajaran baru terlebih dahulu, mis. "2026/2027".', 'error');
                }
                if (tahunBaru === (state.settings.tahunAjaran || '')) {
                    return system.showToast('Tahun ajaran baru harus berbeda dari tahun ajaran aktif saat ini.', 'error');
                }
                if (state.surveys.length === 0 && state.usulan.length === 0 && state.saran.length === 0) {
                    return system.showToast('Belum ada data responden/usulan/saran untuk diarsipkan. Cukup ubah label Tahun Ajaran saja.', 'error');
                }

                const tahunLama = state.settings.tahunAjaran || 'Sebelum Diberi Label';
                uiManager.confirm(
                    `Arsipkan seluruh data responden (${state.surveys.length}), usulan ekskul (${state.usulan.length}), dan kritik&saran (${state.saran.length}) dari "${tahunLama}", lalu mulai "${tahunBaru}" dengan data kosong? Data Master Kelas, Data Siswa, dan daftar Ekskul TIDAK ikut terhapus. Tindakan ini tidak bisa dibatalkan.`,
                    () => {
                        state.arsip.push({
                            id: system.generateId('arsip'),
                            tahunAjaran: tahunLama,
                            archivedAt: system.formatDate(new Date()),
                            surveys: state.surveys,
                            usulan: state.usulan,
                            saran: state.saran
                        });

                        state.surveys = [];
                        state.usulan = [];
                        state.saran = [];
                        state.settings = { ...state.settings, tahunAjaran: tahunBaru };

                        system.saveData('arsip');
                        system.saveData('survey');
                        system.saveData('usulan');
                        system.saveData('saran');
                        system.saveData('settings');

                        this.renderList();
                        settingsManager.renderForm();
                        system.showToast(`Data "${tahunLama}" diarsipkan. Tahun ajaran aktif sekarang "${tahunBaru}".`, 'success');
                    }
                );
            },

            renderList() {
                const container = document.getElementById('arsip-list-container');
                if (!container) return;

                if (state.arsip.length === 0) {
                    container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-3">Belum ada arsip tahun ajaran sebelumnya.</p>`;
                    return;
                }

                container.innerHTML = [...state.arsip].reverse().map((a) => {
                    const idx = state.arsip.findIndex(x => x.id === a.id);
                    return `
                    <div class="flex items-center justify-between gap-3 border border-slate-200 rounded-xl p-3.5 bg-white/60">
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-slate-800 truncate">${a.tahunAjaran}</p>
                            <p class="text-[10px] text-slate-500">Diarsipkan ${a.archivedAt} &bull; ${(a.surveys||[]).length} responden, ${(a.usulan||[]).length} usulan, ${(a.saran||[]).length} saran</p>
                        </div>
                        <button onclick="arsipManager.exportCSV('${a.id}')" class="flex-shrink-0 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold shadow-sm flex items-center gap-1.5">
                            <i data-lucide="download" class="w-3.5 h-3.5"></i> Unduh CSV
                        </button>
                    </div>`;
                }).join('');
                lucide.createIcons({ root: container });
            },

            exportCSV(id) {
                const arsip = state.arsip.find(a => a.id === id);
                if (!arsip || !(arsip.surveys || []).length) return system.showToast('Arsip ini tidak punya data responden untuk diekspor.', 'error');

                let csv = "ID Data,Waktu Input,Nama Siswa,Kelas,Jenis Kelamin,Nama Orang Tua,No. WhatsApp,Pilihan Ekstrakurikuler,Alasan Memilih\n";
                arsip.surveys.forEach(r => {
                    const pilihanStr = r.pilihanEkskul ? r.pilihanEkskul.join(', ') : [r.ekskul1, r.ekskul2].filter(Boolean).join(', ');
                    const jkLabel = r.jenisKelamin === 'P' ? 'Perempuan' : (r.jenisKelamin === 'L' ? 'Laki-laki' : '-');
                    const row = [r.id, r.timestamp, r.nama, r.kelas, jkLabel, (r.namaOrtu || '-'), (r.waOrtu || '-'), pilihanStr.replace(/"/g,'""'), (r.alasan||'').replace(/"/g,'""')];
                    csv += `"${row.join('","')}"\n`;
                });
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `Arsip_${String(arsip.tahunAjaran).replace(/[^a-zA-Z0-9]/g,'_')}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        };

        const backupManager = {
            downloadBackup() {
                const payload = {
                    _meta: {
                        app: 'Survei Ekskul ' + (state.settings?.schoolName || DEFAULT_SETTINGS.schoolName),
                        exportedAt: system.formatDate(new Date()),
                        version: 1
                    },
                    kelas: state.kelas,
                    ekskul: state.ekskul,
                    surveys: state.surveys,
                    siswa: state.siswa,
                    gallery: state.gallery,
                    usulan: state.usulan,
                    arsip: state.arsip,
                    settings: [state.settings]
                };

                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const tanggal = new Date().toISOString().slice(0, 10);
                a.href = url;
                a.download = `backup-survei-ekskul-${tanggal}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                system.showToast('Backup berhasil diunduh.', 'success');
            },

            handleRestoreFile(input) {
                const file = input.files && input.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    let parsed;
                    try {
                        parsed = JSON.parse(e.target.result);
                    } catch (err) {
                        system.showToast('File bukan JSON yang valid.', 'error');
                        input.value = '';
                        return;
                    }

                    const requiredKeys = ['kelas', 'ekskul', 'surveys', 'siswa'];
                    const isValid = requiredKeys.every(k => Array.isArray(parsed[k]));
                    if (!isValid) {
                        system.showToast('Struktur file backup tidak dikenali.', 'error');
                        input.value = '';
                        return;
                    }

                    uiManager.confirm('Restore akan MENIMPA seluruh data saat ini (kelas, ekskul, siswa, survei, usulan, galeri, pengaturan) dengan isi file backup ini. Lanjutkan?', () => {
                        this.applyRestore(parsed);
                        input.value = '';
                    });
                };
                reader.onerror = () => system.showToast('Gagal membaca file.', 'error');
                reader.readAsText(file);
            },

            applyRestore(parsed) {
                state.kelas = Array.isArray(parsed.kelas) ? parsed.kelas : [];
                state.ekskul = Array.isArray(parsed.ekskul) ? parsed.ekskul : [];
                state.surveys = Array.isArray(parsed.surveys) ? parsed.surveys : [];
                state.siswa = Array.isArray(parsed.siswa) ? parsed.siswa : [];
                state.gallery = Array.isArray(parsed.gallery) ? parsed.gallery : [];
                state.usulan = Array.isArray(parsed.usulan) ? parsed.usulan : [];
                state.arsip = Array.isArray(parsed.arsip) ? parsed.arsip : state.arsip;
                state.settings = (Array.isArray(parsed.settings) && parsed.settings[0]) ? { ...DEFAULT_SETTINGS, ...parsed.settings[0] } : state.settings;

                system.saveData('all');
                system.applyBranding();
                settingsManager.renderForm();
                system.showToast('Data berhasil dipulihkan dari backup.', 'success');
            }
        };

        const authManager = {
            login(e) {
                e.preventDefault();
                const s = state.settings || DEFAULT_SETTINGS;
                const validUser = (s.adminUsername || DEFAULT_SETTINGS.adminUsername);
                const validPass = (s.adminPassword || DEFAULT_SETTINGS.adminPassword);
                if(document.getElementById('login-username').value === validUser && document.getElementById('login-password').value === validPass) {
                    state.isAdmin = true;
                    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
                    uiManager.toggleLoginModal(false);
                    system.applyAdminUI(true);
                    system.showToast('Login Administrator Berhasil', 'success');
                    appController.switchPage('dashboard');
                } else {
                    document.getElementById('login-error-msg').classList.remove('d-none');
                }
            },
            logout() {
                uiManager.confirm('Apakah Anda yakin ingin keluar dari sesi Admin?', () => {
                    state.isAdmin = false;
                    sessionStorage.removeItem(ADMIN_SESSION_KEY);
                    system.applyAdminUI(false);
                    system.showToast('Logout berhasil.', 'success');
                    if(ADMIN_PAGES.includes(state.activePage)) appController.switchPage('beranda');
                });
            }
        };

        const surveyManager = {
            toggleUsulanBox(checked) {
                const box = document.getElementById('sv-usulan-fields');
                if(checked) { box.classList.remove('d-none'); }
                else { box.classList.add('d-none'); document.getElementById('sv-usulan-nama').value=''; document.getElementById('sv-usulan-alasan').value=''; }
            },

            onKelasChange(kelasVal) {
                const elNama = document.getElementById('sv-nama');
                elNama.innerHTML = '<option value="" disabled selected>-- Pilih Nama Siswa --</option>';
                const filtered = state.siswa.filter(s => s.kelas === kelasVal).sort((a,b) => a.nama.localeCompare(b.nama));
                if(filtered.length > 0) {
                    elNama.disabled = false;
                    filtered.forEach(s => elNama.innerHTML += `<option value="${s.id}">${s.nama}</option>`);
                } else {
                    elNama.innerHTML = '<option value="" disabled selected>-- Data Siswa Kosong --</option>'; elNama.disabled = true;
                }
            },
            
            submitSurvey(e) {
                e.preventDefault();
                const idSiswa = document.getElementById('sv-nama').value;
                const siswaObj = state.siswa.find(s => s.id === idSiswa);
                if(!siswaObj) return system.showToast('Pilih nama siswa terlebih dahulu!', 'error');

                // Cek apakah siswa sudah mengisi
                if(state.surveys.some(s => s.idSiswa === idSiswa)) {
                    return system.showToast('Siswa ini sudah pernah mengisi pendaftaran peminatan.', 'error');
                }

                // Data orang tua/wali yang mengisi formulir
                const jenisKelamin = document.getElementById('sv-jenis-kelamin').value;
                if(jenisKelamin === '') {
                    return system.showToast('Pilih jenis kelamin siswa.', 'error');
                }
                const namaOrtu = document.getElementById('sv-nama-ortu').value.trim();
                const waOrtu = document.getElementById('sv-wa-ortu').value.trim();
                if(namaOrtu === '') {
                    return system.showToast('Isi nama orang tua/wali yang mengisi formulir.', 'error');
                }
                if(waOrtu === '') {
                    return system.showToast('Isi no. WhatsApp aktif orang tua/wali.', 'error');
                }

                // Ambil pilihan checkbox
                const checkboxes = document.querySelectorAll('input[name="sv-ekskul"]:checked');
                const selectedEkskul = Array.from(checkboxes).map(cb => cb.value);
                
                if(selectedEkskul.length === 0) {
                    return system.showToast('Pilih minimal satu ekstrakurikuler!', 'error');
                }

                // Cek ulang kuota tepat sebelum disimpan (jaga-jaga kalau ada pendaftar lain
                // yang masuk lebih dulu di antara waktu form dibuka dan disubmit).
                for (const eksName of selectedEkskul) {
                    const eksObj = state.ekskul.find(ek => ek.nama === eksName);
                    const kuota = eksObj ? (Number(eksObj.kuota) || 0) : 0;
                    if (kuota > 0) {
                        const terisi = state.surveys.filter(s => (s.pilihanEkskul || [s.ekskul1, s.ekskul2].filter(Boolean)).includes(eksName)).length;
                        if (terisi >= kuota) {
                            uiManager.populateEkskulCheckboxes();
                            return system.showToast(`Mohon maaf, kuota "${eksName}" baru saja penuh. Silakan pilih ekstrakurikuler lain.`, 'error');
                        }
                    }
                }

                // Validasi usulan ekskul baru (jika diaktifkan)
                const usulanAktif = document.getElementById('sv-usulan-toggle').checked;
                const usulanNama = document.getElementById('sv-usulan-nama').value.trim();
                if(usulanAktif && usulanNama === '') {
                    return system.showToast('Isi nama ekskul yang ingin diusulkan, atau batalkan centang usulan.', 'error');
                }

                const payload = {
                    id: system.generateId('sv'), 
                    idSiswa: idSiswa,
                    timestamp: system.formatDate(new Date()),
                    nama: siswaObj.nama,
                    kelas: document.getElementById('sv-kelas').value,
                    jenisKelamin: jenisKelamin,
                    namaOrtu: namaOrtu,
                    waOrtu: waOrtu,
                    pilihanEkskul: selectedEkskul,
                    alasan: document.getElementById('sv-alasan').value
                };

                state.surveys.push(payload); 
                system.saveData('survey'); 
                uiManager.populateBerandaFilterOptions(); uiManager.renderBerandaCards(); uiManager.renderBerandaStats(); uiManager.populateEkskulCheckboxes();

                // Simpan usulan ekskul baru ke database terpisah, akan tampil di Dashboard Admin
                let usulanTerkirim = false;
                if(usulanAktif && usulanNama !== '') {
                    state.usulan.push({
                        id: system.generateId('us'),
                        timestamp: system.formatDate(new Date()),
                        nama: siswaObj.nama,
                        kelas: document.getElementById('sv-kelas').value,
                        usulanNama: usulanNama,
                        usulanAlasan: document.getElementById('sv-usulan-alasan').value.trim()
                    });
                    system.saveData('usulan');
                    usulanManager.updateBadge();
                    usulanTerkirim = true;
                }

                document.getElementById('form-survei').reset();
                document.getElementById('sv-nama').disabled = true; // reset disabled state
                document.getElementById('sv-usulan-fields').classList.add('d-none');
                
                // Refresh dashboards if admin is active
                if(state.isAdmin) {
                    if(state.activePage === 'dashboard') dashboardManager.init(); 
                    if(state.activePage === 'spreadsheet') spreadsheetManager.render();
                    if(state.activePage === 'usulan') usulanManager.renderTable();
                }

                // Cek dan pasang link WA multiple
                const waContainer = document.getElementById('success-wa-container');
                const waList = document.getElementById('success-wa-list');
                waList.innerHTML = '';
                
                let hasWA = false;
                const kelasSiswa = payload.kelas;
                selectedEkskul.forEach(eksName => {
                    const eksObj = state.ekskul.find(ek => ek.nama === eksName);
                    if(!eksObj) return;
                    // Cuma tampilkan grup WA dari kelompok yang relevan buat kelas siswa ini
                    // (kelompok tanpa batasan kelas = kosong -> dianggap berlaku untuk semua kelas).
                    const grupRelevan = system.toGrupArr(eksObj).filter(g => {
                        if(!g.waLink || g.waLink.trim() === '') return false;
                        const kelasArr = system.toArr(g.kelas);
                        return kelasArr.length === 0 || kelasArr.includes(kelasSiswa);
                    });
                    grupRelevan.forEach(g => {
                        hasWA = true;
                        const label = g.keterangan ? `${eksObj.nama} — ${g.keterangan}` : eksObj.nama;
                        waList.innerHTML += `
                            <a href="${g.waLink}" target="_blank" class="w-full px-4 py-3 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl text-sm font-bold flex items-center justify-between gap-2 transition-all shadow-md shadow-[#25D366]/30 mb-2 last:mb-0">
                                <span class="truncate">Grup: ${label}</span>
                                <i data-lucide="message-circle" class="w-5 h-5 flex-shrink-0"></i>
                            </a>
                        `;
                    });
                });

                if(hasWA) {
                    waContainer.classList.remove('hidden'); waContainer.classList.add('block');
                } else {
                    waContainer.classList.remove('block'); waContainer.classList.add('hidden');
                }
                
                const usulanNote = document.getElementById('success-usulan-note');
                if(usulanTerkirim) usulanNote.classList.remove('hidden'); else usulanNote.classList.add('hidden');

                uiManager.openSuccessModal();
                lucide.createIcons({ root: document.getElementById('modal-success-survey') });
            }
        };

        const classManager = {
            renderTable() {
                const tbody = document.getElementById('table-body-kelas');
                tbody.innerHTML = '';
                
                if(state.kelas.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-8 text-center text-slate-500 text-sm">Belum ada kelas yang terdaftar.</td></tr>`; return;
                }

                const sorted = [...state.kelas].sort((a,b) => a.nama.localeCompare(b.nama));
                sorted.forEach((item, index) => {
                    const studentCount = state.siswa.filter(s => s.kelas === item.nama).length;
                    tbody.innerHTML += `
                        <tr class="hover:bg-indigo-50/40 transition-colors">
                            <td class="px-6 py-4 font-mono text-slate-400 text-xs">${index + 1}</td>
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-800">${item.nama}</div>
                                <div class="text-[10px] text-slate-500 mt-1">${studentCount} Siswa terdaftar${item.waWaliKelas ? ' &bull; <span class="text-emerald-600 font-semibold"><i data-lucide="message-circle" class="w-2.5 h-2.5 inline pb-0.5"></i> WA wali kelas tersimpan</span>' : ''}</div>
                            </td>
                            <td class="px-6 py-4 text-center space-x-1">
                                <button onclick="uiManager.openKelasModal('${item.id}')" class="text-slate-500 hover:text-indigo-600 bg-white p-2 border rounded-lg shadow-sm" title="Edit"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                                <button onclick="classManager.deleteKelas('${item.id}', '${item.nama}')" class="text-slate-500 hover:text-rose-600 bg-white p-2 border rounded-lg shadow-sm" title="Hapus"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </td>
                        </tr>
                    `;
                });
                lucide.createIcons({root: tbody});
            },

            saveKelas(e) {
                e.preventDefault();
                const id = document.getElementById('kelas-id').value;
                const nama = document.getElementById('kelas-nama').value.trim();
                const waWaliKelas = document.getElementById('kelas-wa').value.trim();
                const siswaText = document.getElementById('kelas-siswa-import').value;

                if(state.kelas.some(k => k.nama.toLowerCase() === nama.toLowerCase() && k.id !== id)) {
                    system.showToast('Nama kelas sudah digunakan!', 'error'); return;
                }

                if(id) {
                    const idx = state.kelas.findIndex(k => k.id === id);
                    if(idx !== -1) {
                        const oldName = state.kelas[idx].nama;
                        // Cascade update
                        state.siswa.forEach(s => { if(s.kelas === oldName) s.kelas = nama; });
                        state.surveys.forEach(s => { if(s.kelas === oldName) s.kelas = nama; });
                        state.kelas[idx].nama = nama;
                        state.kelas[idx].waWaliKelas = waWaliKelas;
                        system.showToast('Data kelas diperbarui.');
                    }
                } else {
                    state.kelas.push({ id: system.generateId('kls'), nama, waWaliKelas });
                    system.showToast('Kelas baru berhasil ditambahkan.');
                }

                // Proses Paste Data Siswa Massal
                if(siswaText.trim() !== '') {
                    const lines = siswaText.split('\n');
                    let count = 0;
                    lines.forEach(line => {
                        let s_nama = line.trim();
                        // Hanya insert jika ada isi dan belum terdaftar di kelas ini
                        if(s_nama && !state.siswa.some(s => s.nama.toLowerCase() === s_nama.toLowerCase() && s.kelas === nama)) {
                            state.siswa.push({id: system.generateId('sw'), nama: s_nama, kelas: nama});
                            count++;
                        }
                    });
                    if(count > 0) system.showToast(`${count} nama siswa berhasil diimpor ke ${nama}.`);
                }

                system.saveData('all'); // simpan semua krn cascade
                uiManager.closeKelasModal(); 
                this.renderTable(); 
                uiManager.populateKelasDropdowns();
                if(state.activePage === 'siswa') studentManager.renderTable();
            },

            deleteKelas(id, nama) {
                uiManager.confirm(`Hapus master kelas "${nama}"? Data siswa di dalamnya juga akan terhapus.`, () => {
                    state.kelas = state.kelas.filter(k => k.id !== id);
                    // Hapus siswa bersangkutan
                    state.siswa = state.siswa.filter(s => s.kelas !== nama);
                    system.saveData('kelas'); system.saveData('siswa');
                    system.showToast('Kelas dan siswanya telah dihapus.', 'success');
                    this.renderTable(); uiManager.populateKelasDropdowns();
                });
            }
        };

        const masterDataManager = {
            renderTable() {
                const tbody = document.getElementById('table-body-ekskul'); tbody.innerHTML = '';
                if(state.ekskul.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-sm text-slate-500">Belum ada daftar ekstrakurikuler.</td></tr>`; return; }
                state.ekskul.forEach(item => {
                    const pembimbingArr = system.toArr(item.pembimbing);
                    const grupArr = system.toGrupArr(item);
                    const kuota = Number(item.kuota) || 0;
                    const terisi = state.surveys.filter(s => (s.pilihanEkskul || [s.ekskul1, s.ekskul2].filter(Boolean)).includes(item.nama)).length;
                    const penuh = kuota > 0 && terisi >= kuota;
                    const kuotaBadge = kuota > 0
                        ? `<span class="text-[11px] font-bold px-2 py-1 rounded-md border ${penuh ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}">${terisi} / ${kuota}${penuh ? ' &bull; PENUH' : ''}</span>`
                        : `<span class="text-[11px] font-semibold text-slate-400">${terisi} &bull; Tanpa batas</span>`;
                    tbody.innerHTML += `
                        <tr class="hover:bg-indigo-50/40 border-b border-slate-100 last:border-0">
                            <td class="px-6 py-4 font-bold text-slate-800">${item.nama}</td>
                            <td class="px-6 py-4">
                                <p class="text-xs font-semibold text-slate-700 space-y-0.5">${pembimbingArr.length ? pembimbingArr.map(p => `<span class="block">${p}</span>`).join('') : '-'}</p>
                                <div class="text-[10px] text-indigo-600 mt-1.5 space-y-1">${grupArr.length ? grupArr.map(g => {
                                    const kelasArr = system.toArr(g.kelas);
                                    const kelasLabel = kelasArr.length ? kelasArr.join(', ') : 'Semua Kelas';
                                    return `<div class="whitespace-nowrap">
                                        <i data-lucide="calendar-clock" class="w-3 h-3 inline pb-0.5"></i> ${g.keterangan ? `<span class="font-bold">${g.keterangan}</span> &bull; ` : ''}${kelasLabel}${g.hari ? ` &bull; ${g.hari}` : ''}
                                        ${g.waLink ? `<i data-lucide="link" class="w-3 h-3 inline pb-0.5 text-emerald-600"></i>` : ''}
                                    </div>`;
                                }).join('') : '<span class="text-slate-400">-</span>'}</div>
                            </td>
                            <td class="px-6 py-4">${kuotaBadge}</td>
                            <td class="px-6 py-4 text-xs text-slate-500 max-w-xs">
                                <div class="line-clamp-2" title="${item.deskripsi}">${item.deskripsi}</div>
                            </td>
                            <td class="px-6 py-4 text-center space-x-1 whitespace-nowrap">
                                <button onclick="uiManager.openEkskulModal('${item.id}')" class="text-slate-500 hover:text-indigo-600 bg-white p-2 border rounded-lg shadow-sm"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                                <button onclick="masterDataManager.deleteEkskul('${item.id}', '${item.nama}')" class="text-slate-500 hover:text-rose-600 bg-white p-2 border rounded-lg shadow-sm"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </td>
                        </tr>`;
                });
                lucide.createIcons({root: tbody});
            },

            // --- Field dinamis: Pelatih/Pembina (bisa lebih dari 1) & Kelompok Peserta+Jadwal+WA (bisa lebih dari 1) ---
            resetDynamicFields() {
                document.getElementById('ekskul-pembimbing-list').innerHTML = '';
                document.getElementById('ekskul-grup-list').innerHTML = '';
            },
            addPembimbingField(value = '') {
                const wrap = document.getElementById('ekskul-pembimbing-list');
                const row = document.createElement('div');
                row.className = 'flex gap-2 dynamic-row';
                row.innerHTML = `
                    <input type="text" class="ekskul-pembimbing-input flex-1 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Nama pelatih / pembina" value="${String(value).replace(/"/g, '&quot;')}">
                    <button type="button" onclick="masterDataManager.removeDynamicField(this)" class="px-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                `;
                wrap.appendChild(row);
                lucide.createIcons({ root: row });
            },
            // Satu "kelompok" = 1 baris peserta: kelas mana yang boleh ikut, hari/jadwalnya, dan
            // link grup WA-nya sendiri. Ini yang bikin 1 ekskul (mis. Rebana) bisa punya kelompok
            // Kelas 3 hari Sabtu & kelompok Kelas 4 hari Minggu, masing-masing dengan grup WA beda.
            addGrupField(grup = {}) {
                const wrap = document.getElementById('ekskul-grup-list');
                const row = document.createElement('div');
                row.className = 'ekskul-grup-card dynamic-row border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3 relative';
                row.dataset.grupId = grup.id || system.generateId('grp');

                const kelasSorted = [...state.kelas].sort((a, b) => a.nama.localeCompare(b.nama));
                const selectedKelas = system.toArr(grup.kelas);
                const kelasOptionsHtml = kelasSorted.length
                    ? kelasSorted.map(k => `
                        <label class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs cursor-pointer has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-400 has-[:checked]:text-indigo-700 transition-colors">
                            <input type="checkbox" class="ekskul-grup-kelas-checkbox w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" value="${String(k.nama).replace(/"/g, '&quot;')}" ${selectedKelas.includes(k.nama) ? 'checked' : ''}>
                            ${k.nama}
                        </label>`).join('')
                    : `<p class="text-[11px] text-slate-400 italic">Belum ada master kelas. Tambahkan lewat menu "Master Kelas" supaya bisa dipilih di sini.</p>`;

                // Kompatibel dengan data lama: 1 kelompok dulu cuma punya 1 string hari.
                // Sekarang string itu boleh berisi beberapa hari yang digabung dengan ' • ',
                // jadi dipecah lagi di sini supaya masing-masing tampil sebagai baris terpisah.
                const hariList = String(grup.hari || '').split('•').map(s => s.trim()).filter(Boolean);
                const hariRowsHtml = (hariList.length ? hariList : ['']).map(h => `
                    <div class="flex gap-2 dynamic-row">
                        <input type="text" class="ekskul-grup-hari-input flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Misal: Sabtu, 14:00 - 15:30" value="${String(h).replace(/"/g, '&quot;')}">
                        <button type="button" onclick="masterDataManager.removeDynamicField(this)" class="px-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                `).join('');

                row.innerHTML = `
                    <button type="button" onclick="masterDataManager.removeDynamicField(this)" class="absolute top-3 right-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg p-1.5 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Keterangan Kelompok</label>
                        <input type="text" class="ekskul-grup-keterangan w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 pr-8" placeholder="Misal: Kelas 3 &amp; 4 Putra" value="${String(grup.keterangan || '').replace(/"/g, '&quot;')}">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Hari / Jadwal Latihan <span class="text-slate-400 font-normal">(boleh lebih dari satu hari)</span></label>
                        <div class="ekskul-grup-hari-list space-y-2">${hariRowsHtml}</div>
                        <button type="button" onclick="masterDataManager.addGrupHariRow(this)" class="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Tambah Hari</button>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Kelas yang Boleh Ikut <span class="text-slate-400 font-normal">(kosongkan = semua kelas)</span></label>
                        <div class="ekskul-grup-kelas-options flex flex-wrap gap-1.5">${kelasOptionsHtml}</div>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 mb-1">Link Grup WhatsApp <span class="text-slate-400 font-normal">(opsional)</span></label>
                        <input type="url" class="ekskul-grup-walink w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="https://chat.whatsapp.com/..." value="${String(grup.waLink || '').replace(/"/g, '&quot;')}">
                    </div>
                `;
                wrap.appendChild(row);
                lucide.createIcons({ root: row });
            },
            removeDynamicField(btn) {
                btn.closest('.dynamic-row')?.remove();
            },
            addGrupHariRow(btn) {
                const list = btn.previousElementSibling; // div.ekskul-grup-hari-list persis sebelum tombol ini
                if (!list) return;
                const row = document.createElement('div');
                row.className = 'flex gap-2 dynamic-row';
                row.innerHTML = `
                    <input type="text" class="ekskul-grup-hari-input flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Misal: Sabtu, 14:00 - 15:30" value="">
                    <button type="button" onclick="masterDataManager.removeDynamicField(this)" class="px-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                `;
                list.appendChild(row);
                lucide.createIcons({ root: row });
            },

            saveEkskul(e) {
                e.preventDefault();
                const id = document.getElementById('ekskul-id').value;
                const nama = document.getElementById('ekskul-nama').value;
                const kuotaRaw = document.getElementById('ekskul-kuota').value.trim();
                const kuota = kuotaRaw === '' ? 0 : Math.max(0, parseInt(kuotaRaw, 10) || 0);
                const pembimbing = Array.from(document.querySelectorAll('.ekskul-pembimbing-input')).map(i => i.value.trim()).filter(Boolean);
                const grup = Array.from(document.querySelectorAll('#ekskul-grup-list .ekskul-grup-card')).map(card => {
                    const keterangan = card.querySelector('.ekskul-grup-keterangan').value.trim();
                    const hari = Array.from(card.querySelectorAll('.ekskul-grup-hari-input')).map(i => i.value.trim()).filter(Boolean).join(' • ');
                    const waLink = card.querySelector('.ekskul-grup-walink').value.trim();
                    const kelas = Array.from(card.querySelectorAll('.ekskul-grup-kelas-checkbox:checked')).map(cb => cb.value);
                    return { id: card.dataset.grupId || system.generateId('grp'), keterangan, kelas, hari, waLink };
                }).filter(g => g.keterangan || g.hari || g.waLink || g.kelas.length);
                const deskripsi = document.getElementById('ekskul-deskripsi').value;

                if(pembimbing.length === 0) {
                    return system.showToast('Isi minimal 1 nama pelatih/pembina.', 'error');
                }

                // Kuota tidak boleh diset lebih kecil dari jumlah pendaftar yang sudah ada
                const terisiSaatIni = state.surveys.filter(s => (s.pilihanEkskul || [s.ekskul1, s.ekskul2].filter(Boolean)).includes(nama)).length;
                if (kuota > 0 && kuota < terisiSaatIni) {
                    return system.showToast(`Kuota tidak boleh lebih kecil dari jumlah pendaftar saat ini (${terisiSaatIni} siswa).`, 'error');
                }
                
                if(id) { 
                    const idx = state.ekskul.findIndex(e => e.id === id); 
                    if(idx !== -1) state.ekskul[idx] = {id, nama, kuota, pembimbing, grup, deskripsi}; 
                    system.showToast('Data ekstrakurikuler diubah.');
                }
                else {
                    state.ekskul.push({id: system.generateId('ek'), nama, kuota, pembimbing, grup, deskripsi});
                    system.showToast('Ekstrakurikuler berhasil ditambahkan.');
                }
                system.saveData('ekskul'); uiManager.closeEkskulModal(); this.renderTable(); uiManager.populateBerandaFilterOptions(); uiManager.renderBerandaCards(); uiManager.renderBerandaStats(); uiManager.renderBerandaJadwal(); uiManager.populateEkskulDropdowns(); uiManager.populateEkskulCheckboxes();
            },
            deleteEkskul(id, nama) {
                uiManager.confirm(`Cabut ekstrakurikuler "${nama}" dari daftar?`, () => {
                    state.ekskul = state.ekskul.filter(e => e.id !== id);
                    system.saveData('ekskul'); this.renderTable(); uiManager.populateBerandaFilterOptions(); uiManager.renderBerandaCards(); uiManager.renderBerandaStats(); uiManager.renderBerandaJadwal(); uiManager.populateEkskulDropdowns(); uiManager.populateEkskulCheckboxes();
                    system.showToast('Data berhasil dihapus.', 'success');
                });
            }
        };

        // --- USULAN EKSKUL BARU (dari Wali Murid/Siswa) ---
        const usulanManager = {
            updateBadge() {
                const badge = document.getElementById('badge-usulan-baru');
                const count = state.usulan.length;
                if(count > 0) { badge.innerText = count > 99 ? '99+' : count; badge.classList.remove('d-none'); }
                else { badge.classList.add('d-none'); }
            },

            renderTable() {
                const container = document.getElementById('usulan-list-container');
                const filtered = [...state.usulan].reverse();

                if(filtered.length === 0) {
                    container.innerHTML = `<div class="col-span-full p-8 text-center bg-white/40 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm"><i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-300 mb-2"></i>Belum ada usulan ekstrakurikuler baru.</div>`;
                    lucide.createIcons({root: container});
                    return;
                }

                container.innerHTML = filtered.map(u => `
                    <div class="glass-card p-5 rounded-2xl flex flex-col gap-3">
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <h4 class="font-extrabold text-slate-900 text-base leading-tight">${u.usulanNama}</h4>
                                <p class="text-[11px] text-slate-500 mt-1">Diusulkan oleh <span class="font-semibold text-slate-700">${u.nama}</span> &bull; Kelas ${u.kelas}</p>
                            </div>
                        </div>
                        ${u.usulanAlasan ? `<p class="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 leading-relaxed">"${u.usulanAlasan}"</p>` : ''}
                        <p class="text-[10px] text-slate-400">${u.timestamp}</p>
                        <div class="flex gap-2 pt-2 border-t border-slate-100">
                            <button onclick="usulanManager.deleteUsulan('${u.id}')" class="flex-1 py-2 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus</button>
                        </div>
                    </div>`).join('');
                lucide.createIcons({root: container});
            },

            deleteUsulan(id) {
                uiManager.confirm('Hapus usulan ini secara permanen?', () => {
                    state.usulan = state.usulan.filter(u => u.id !== id);
                    system.saveData('usulan'); this.renderTable(); this.updateBadge();
                    system.showToast('Usulan berhasil dihapus.', 'success');
                });
            }
        };

        // --- KRITIK & SARAN (dari Wali Murid, lewat tombol mengambang di halaman publik) ---
        const saranManager = {
            updateBadge() {
                const badge = document.getElementById('badge-saran-baru');
                if (!badge) return;
                const count = state.saran.length;
                if(count > 0) { badge.innerText = count > 99 ? '99+' : count; badge.classList.remove('d-none'); }
                else { badge.classList.add('d-none'); }
            },

            // --- Tombol & modal mengambang di halaman publik (Beranda, Survey, Tutorial) ---
            openPublicModal() {
                const modal = document.getElementById('modal-saran');
                if (!modal) return;
                document.getElementById('saran-nama').value = '';
                document.getElementById('saran-nowa').value = '';
                const jenisSelect = document.getElementById('saran-jenis-ekskul');
                if (jenisSelect) {
                    const opts = ['<option value="">Umum / Lainnya</option>']
                        .concat([...state.ekskul].sort((a,b) => a.nama.localeCompare(b.nama)).map(ek => `<option value="${String(ek.nama).replace(/"/g,'&quot;')}">${ek.nama}</option>`));
                    jenisSelect.innerHTML = opts.join('');
                }
                document.getElementById('saran-kritik').value = '';
                document.getElementById('saran-saran').value = '';
                const m = modal, c = document.getElementById('modal-saran-card');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
            },
            closePublicModal() {
                const modal = document.getElementById('modal-saran'), c = document.getElementById('modal-saran-card');
                if (!modal) return;
                modal.classList.add('pointer-events-none'); modal.classList.remove('opacity-100'); c.classList.add('scale-95');
            },
            submitPublic(e) {
                e.preventDefault();
                const nama = document.getElementById('saran-nama').value.trim();
                const noWa = document.getElementById('saran-nowa').value.trim();
                const jenisEkskul = document.getElementById('saran-jenis-ekskul').value;
                const kritik = document.getElementById('saran-kritik').value.trim();
                const saran = document.getElementById('saran-saran').value.trim();

                if (!nama || !noWa) {
                    return system.showToast('Nama dan No. WA wajib diisi.', 'error');
                }
                if (!kritik && !saran) {
                    return system.showToast('Isi minimal salah satu: Kritik atau Saran.', 'error');
                }

                state.saran.push({
                    id: system.generateId('srn'),
                    nama, noWa, jenisEkskul,
                    kritik, saran,
                    timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                });
                system.saveData('saran');
                this.updateBadge();
                this.closePublicModal();
                system.showToast('Terima kasih! Kritik & saran Anda telah terkirim ke Admin Sekolah.', 'success');
            },

            // --- Tabel admin ---
            renderTable() {
                const container = document.getElementById('saran-list-container');
                if (!container) return;
                const filtered = [...state.saran].reverse();

                if(filtered.length === 0) {
                    container.innerHTML = `<div class="col-span-full p-8 text-center bg-white/40 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm"><i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-300 mb-2"></i>Belum ada kritik & saran yang masuk.</div>`;
                    lucide.createIcons({root: container});
                    return;
                }

                container.innerHTML = filtered.map(s => `
                    <div class="glass-card p-5 rounded-2xl flex flex-col gap-3">
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <h4 class="font-extrabold text-slate-900 text-base leading-tight">${s.nama}</h4>
                                <p class="text-[11px] text-slate-500 mt-1">No. WA: <span class="font-semibold text-slate-700">${s.noWa}</span>${s.jenisEkskul ? ` &bull; Terkait: <span class="font-semibold text-slate-700">${s.jenisEkskul}</span>` : ''}</p>
                            </div>
                        </div>
                        ${s.kritik ? `<div><p class="text-[10px] font-bold text-rose-500 uppercase tracking-wide mb-1">Kritik</p><p class="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 leading-relaxed">"${s.kritik}"</p></div>` : ''}
                        ${s.saran ? `<div><p class="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Saran</p><p class="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 leading-relaxed">"${s.saran}"</p></div>` : ''}
                        ${(!s.kritik && !s.saran && s.pesan) ? `<p class="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 leading-relaxed">"${s.pesan}"</p>` : ''}
                        <p class="text-[10px] text-slate-400">${s.timestamp}</p>
                        <div class="flex gap-2 pt-2 border-t border-slate-100">
                            <button onclick="saranManager.deleteSaran('${s.id}')" class="flex-1 py-2 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus</button>
                        </div>
                    </div>`).join('');
                lucide.createIcons({root: container});
            },

            deleteSaran(id) {
                uiManager.confirm('Hapus kritik & saran ini secara permanen?', () => {
                    state.saran = state.saran.filter(s => s.id !== id);
                    system.saveData('saran'); this.renderTable(); this.updateBadge();
                    system.showToast('Kritik & saran berhasil dihapus.', 'success');
                });
            }
        };

        // --- NOTIFIKASI CUSTOM (Admin bisa buat beberapa notifikasi berurutan untuk wali murid) ---
        const NOTIF_READ_KEY = 'sdn01_notif_read_ids_v1';
        const notifManager = {
            getReadIds() {
                try { return JSON.parse(localStorage.getItem(NOTIF_READ_KEY)) || []; } catch (err) { return []; }
            },
            markRead(id) {
                const ids = this.getReadIds();
                if (!ids.includes(id)) {
                    ids.push(id);
                    localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(ids));
                }
            },

            // Tampilkan notifikasi aktif berikutnya yang belum "dibaca" (ditutup) oleh
            // pengunjung ini. Dipanggil saat halaman publik pertama kali dimuat, dan
            // dipanggil lagi setiap kali 1 notifikasi ditutup -> efeknya berurutan:
            // notif 1 muncul, selesai dibaca (ditutup), baru notif 2 muncul, dst.
            maybeShowSequence() {
                const modal = document.getElementById('modal-custom-notif');
                if (!modal) return; // halaman ini tidak menyediakan modal notifikasi (mis. halaman admin)
                if (state.isAdmin) return; // notifikasi ini ditujukan untuk wali murid, bukan admin yang sedang login
                const readIds = this.getReadIds();
                const active = [...state.notif]
                    .filter(n => n.aktif !== false)
                    .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
                const next = active.find(n => !readIds.includes(n.id));
                if (next) this.showNotif(next);
            },
            showNotif(n) {
                const modal = document.getElementById('modal-custom-notif');
                const card = document.getElementById('modal-custom-notif-card');
                if (!modal || !card) return;
                document.getElementById('custom-notif-title').textContent = n.judul || 'Pemberitahuan';
                document.getElementById('custom-notif-message').textContent = n.pesan || '';
                modal.dataset.notifId = n.id;
                modal.classList.remove('pointer-events-none'); void modal.offsetWidth; modal.classList.add('opacity-100'); card.classList.remove('scale-95');
            },
            closeCurrent() {
                const modal = document.getElementById('modal-custom-notif');
                const card = document.getElementById('modal-custom-notif-card');
                if (!modal) return;
                const id = modal.dataset.notifId;
                if (id) this.markRead(id);
                modal.classList.add('pointer-events-none'); modal.classList.remove('opacity-100'); card.classList.add('scale-95');
                // Beri jeda sebentar (sesuai durasi transisi) sebelum notif berikutnya muncul.
                setTimeout(() => this.maybeShowSequence(), 350);
            },

            // --- CRUD Admin ---
            renderTable() {
                const container = document.getElementById('notif-list-container');
                if (!container) return;
                const sorted = [...state.notif].sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));

                if (sorted.length === 0) {
                    container.innerHTML = `<div class="col-span-full p-8 text-center bg-white/40 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm"><i data-lucide="bell-off" class="w-8 h-8 mx-auto text-slate-300 mb-2"></i>Belum ada notifikasi custom. Klik "Tambah Notifikasi" untuk membuat.</div>`;
                    lucide.createIcons({root: container});
                    return;
                }

                container.innerHTML = sorted.map(n => `
                    <div class="glass-card p-5 rounded-2xl flex flex-col gap-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">Urutan ${n.urutan ?? 0}</span>
                                <span class="text-[10px] font-bold px-2 py-1 rounded-md ${n.aktif !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${n.aktif !== false ? 'Aktif' : 'Nonaktif'}</span>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-extrabold text-slate-900 text-base leading-tight">${n.judul}</h4>
                            <p class="text-xs text-slate-600 mt-1.5 leading-relaxed whitespace-pre-line">${n.pesan}</p>
                        </div>
                        <div class="flex gap-2 pt-2 border-t border-slate-100">
                            <button onclick="notifManager.openModal('${n.id}')" class="flex-1 py-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"><i data-lucide="pencil" class="w-3.5 h-3.5"></i> Edit</button>
                            <button onclick="notifManager.deleteNotif('${n.id}')" class="flex-1 py-2 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus</button>
                        </div>
                    </div>`).join('');
                lucide.createIcons({root: container});
            },

            openModal(id = null) {
                const n = id ? state.notif.find(x => x.id === id) : null;
                document.getElementById('notif-id').value = n ? n.id : '';
                document.getElementById('notif-judul').value = n ? n.judul : '';
                document.getElementById('notif-pesan').value = n ? n.pesan : '';
                document.getElementById('notif-urutan').value = n ? (n.urutan ?? (state.notif.length + 1)) : (state.notif.length + 1);
                document.getElementById('notif-aktif').checked = n ? (n.aktif !== false) : true;
                document.getElementById('modal-notif-title').textContent = n ? 'Edit Notifikasi' : 'Tambah Notifikasi';

                const m = document.getElementById('modal-notif'), c = document.getElementById('modal-notif-card');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
            },
            closeModal() {
                const m = document.getElementById('modal-notif'), c = document.getElementById('modal-notif-card');
                m.classList.add('pointer-events-none'); m.classList.remove('opacity-100'); c.classList.add('scale-95');
            },
            save(e) {
                e.preventDefault();
                const id = document.getElementById('notif-id').value;
                const judul = document.getElementById('notif-judul').value.trim();
                const pesan = document.getElementById('notif-pesan').value.trim();
                const urutan = Number(document.getElementById('notif-urutan').value) || 0;
                const aktif = document.getElementById('notif-aktif').checked;

                if (!judul || !pesan) {
                    return system.showToast('Judul dan isi pesan wajib diisi.', 'error');
                }

                if (id) {
                    const idx = state.notif.findIndex(n => n.id === id);
                    if (idx > -1) state.notif[idx] = { ...state.notif[idx], judul, pesan, urutan, aktif };
                } else {
                    state.notif.push({ id: system.generateId('ntf'), judul, pesan, urutan, aktif });
                }

                system.saveData('notif');
                this.renderTable();
                this.closeModal();
                system.showToast('Notifikasi berhasil disimpan.', 'success');
            },
            deleteNotif(id) {
                uiManager.confirm('Hapus notifikasi ini secara permanen?', () => {
                    state.notif = state.notif.filter(n => n.id !== id);
                    system.saveData('notif'); this.renderTable();
                    system.showToast('Notifikasi berhasil dihapus.', 'success');
                });
            }
        };

        // --- STREAMING_CHUNK:Implementing Gallery Logic... ---
        const galleryManager = {
            currentSlide: 0,
            intervalId: null,
            activePhotos: [],

            initSlideshow() {
                this.renderPublicSlideshow();
                this.startSlideshow();
            },

            renderPublicSlideshow() {
                const container = document.getElementById('beranda-slideshow');
                if(!container) return;
                
                this.activePhotos = state.gallery.filter(p => p.aktif);
                if(this.activePhotos.length === 0) {
                    container.classList.add('hidden');
                    return;
                }
                container.classList.remove('hidden');

                let slidesHTML = '';
                let indicatorsHTML = '';

                this.activePhotos.forEach((photo, idx) => {
                    const imgUrl = system.normalizeImageUrl(photo.url);
                    slidesHTML += `
                        <div class="absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}" id="slide-${idx}">
                            <img src="${imgUrl}" alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-xl brightness-75" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async" onerror="this.style.display='none'">
                            <img src="${imgUrl}" alt="Gallery ${idx}" class="relative w-full h-full object-contain" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async" onerror="this.src='https://placehold.co/800x400/e2e8f0/475569?text=Gambar+Tidak+Tersedia'">
                            ${photo.caption ? `<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent p-5 pt-16"><p class="text-white text-sm md:text-base font-medium">${photo.caption}</p></div>` : ''}
                        </div>
                    `;
                    indicatorsHTML += `<button onclick="galleryManager.goToSlide(${idx})" class="w-2 h-2 rounded-full transition-all duration-300 shadow-sm ${idx === 0 ? 'bg-white w-5' : 'bg-white/50 hover:bg-white/80'}" id="indicator-${idx}"></button>`;
                });

                container.innerHTML = `
                    <div class="relative w-full h-48 md:h-72 lg:h-[350px] rounded-3xl overflow-hidden shadow-sm group">
                        ${slidesHTML}
                        <div class="absolute bottom-5 left-0 right-0 flex justify-center gap-2 z-20">
                            ${indicatorsHTML}
                        </div>
                        <button onclick="galleryManager.prevSlide()" class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                        <button onclick="galleryManager.nextSlide()" class="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                    </div>
                `;
                lucide.createIcons({root: container});
                this.currentSlide = 0;
            },

            showSlide(index) {
                if (this.activePhotos.length === 0) return;
                
                // Hide current
                const currentEl = document.getElementById(`slide-${this.currentSlide}`);
                const currentInd = document.getElementById(`indicator-${this.currentSlide}`);
                if (currentEl) {
                    currentEl.classList.remove('opacity-100', 'z-10');
                    currentEl.classList.add('opacity-0', 'z-0');
                }
                if (currentInd) {
                    currentInd.classList.remove('w-5', 'bg-white');
                    currentInd.classList.add('w-2', 'bg-white/50');
                }

                // Update index
                this.currentSlide = index;
                if (this.currentSlide >= this.activePhotos.length) this.currentSlide = 0;
                if (this.currentSlide < 0) this.currentSlide = this.activePhotos.length - 1;

                // Show new
                const newEl = document.getElementById(`slide-${this.currentSlide}`);
                const newInd = document.getElementById(`indicator-${this.currentSlide}`);
                if (newEl) {
                    newEl.classList.remove('opacity-0', 'z-0');
                    newEl.classList.add('opacity-100', 'z-10');
                }
                if (newInd) {
                    newInd.classList.remove('w-2', 'bg-white/50');
                    newInd.classList.add('w-5', 'bg-white');
                }
            },

            nextSlide() {
                this.showSlide(this.currentSlide + 1);
                this.resetInterval();
            },

            prevSlide() {
                this.showSlide(this.currentSlide - 1);
                this.resetInterval();
            },

            goToSlide(index) {
                this.showSlide(index);
                this.resetInterval();
            },

            startSlideshow() {
                this.stopSlideshow();
                if(this.activePhotos && this.activePhotos.length > 1) {
                    this.intervalId = setInterval(() => {
                        this.showSlide(this.currentSlide + 1);
                    }, 4000);
                }
            },

            stopSlideshow() {
                if(this.intervalId) {
                    clearInterval(this.intervalId);
                    this.intervalId = null;
                }
            },

            resetInterval() {
                this.startSlideshow(); // Restart timer when manually clicked
            },

            // --- Admin Functions ---
            renderAdminTable() {
                const tbody = document.getElementById('table-body-galeri'); tbody.innerHTML = '';
                if(state.gallery.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-slate-500">Belum ada foto galeri.</td></tr>`; return; }
                state.gallery.forEach(item => {
                    tbody.innerHTML += `
                        <tr class="hover:bg-indigo-50/40 border-b border-slate-100 last:border-0 transition-colors">
                            <td class="px-6 py-4">
                                <div class="w-16 h-12 rounded-lg bg-slate-200 overflow-hidden shadow-sm border border-slate-200">
                                    <img src="${system.normalizeImageUrl(item.url)}" alt="Preview" class="w-full h-full object-cover" loading="lazy" decoding="async" onerror="this.src='https://placehold.co/100x100/e2e8f0/475569?text=Err'">
                                </div>
                            </td>
                            <td class="px-6 py-4 text-xs text-slate-700 font-medium max-w-sm truncate" title="${item.caption || '-'}">
                                ${item.caption || '<span class="text-slate-400 italic">Tanpa Caption</span>'}
                            </td>
                            <td class="px-6 py-4 text-center">
                                ${item.aktif 
                                    ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100"><i data-lucide="eye" class="w-3 h-3"></i> Tampil</span>' 
                                    : '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200"><i data-lucide="eye-off" class="w-3 h-3"></i> Disembunyikan</span>'}
                            </td>
                            <td class="px-6 py-4 text-center space-x-1 whitespace-nowrap">
                                <button onclick="uiManager.openGaleriModal('${item.id}')" class="text-slate-500 hover:text-indigo-600 bg-white p-2 border rounded-lg shadow-sm" title="Edit"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                                <button onclick="galleryManager.deletePhoto('${item.id}')" class="text-slate-500 hover:text-rose-600 bg-white p-2 border rounded-lg shadow-sm" title="Hapus"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </td>
                        </tr>`;
                });
                lucide.createIcons({root: tbody});
            },

            savePhoto(e) {
                e.preventDefault();
                const id = document.getElementById('galeri-id').value;
                const url = system.normalizeImageUrl(document.getElementById('galeri-url').value);
                const caption = document.getElementById('galeri-caption').value;
                const aktif = document.getElementById('galeri-aktif').checked;
                
                if(id) { 
                    const idx = state.gallery.findIndex(e => e.id === id); 
                    if(idx !== -1) state.gallery[idx] = {id, url, caption, aktif}; 
                    system.showToast('Data foto diperbarui.');
                }
                else {
                    state.gallery.unshift({id: system.generateId('gal'), url, caption, aktif});
                    system.showToast('Foto berhasil ditambahkan ke galeri.');
                }
                system.saveData('gallery'); 
                uiManager.closeGaleriModal(); 
                this.renderAdminTable(); 
                this.renderPublicSlideshow(); 
                if(state.activePage === 'beranda') this.startSlideshow();
            },
            
            deletePhoto(id) {
                uiManager.confirm(`Hapus foto ini dari galeri?`, () => {
                    state.gallery = state.gallery.filter(e => e.id !== id);
                    system.saveData('gallery'); 
                    this.renderAdminTable();
                    this.renderPublicSlideshow();
                    if(state.activePage === 'beranda') this.startSlideshow();
                    system.showToast('Foto berhasil dihapus.', 'success');
                });
            }
        };

        const studentManager = {
            renderTable() {
                const tbody = document.getElementById('table-body-siswa');
                const search = document.getElementById('search-siswa')?.value.toLowerCase() || '';
                const kls = document.getElementById('filter-kelas-siswa')?.value || '';
                
                const filtered = state.siswa.filter(s => (s.nama.toLowerCase().includes(search)) && (kls === "" || s.kelas === kls));
                tbody.innerHTML = '';
                
                if(filtered.length === 0) { 
                    tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-slate-500">Tidak ada data siswa. Tambahkan melalui menu Master Kelas.</td></tr>`; 
                    document.getElementById('siswa-info').innerText = `Total: 0 Siswa`; return; 
                }
                
                document.getElementById('siswa-info').innerText = `Menampilkan ${filtered.length} Siswa (Total Keseluruhan ${state.siswa.length} Siswa)`;
                [...filtered].sort((a,b) => a.nama.localeCompare(b.nama)).forEach((item, idx) => {
                    tbody.innerHTML += `
                        <tr class="hover:bg-indigo-50/40 border-b border-slate-100 last:border-0">
                            <td class="px-6 py-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
                            <td class="px-6 py-3 font-semibold text-slate-800">${item.nama}</td>
                            <td class="px-6 py-3 text-xs"><span class="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded">${item.kelas}</span></td>
                            <td class="px-6 py-3 text-center">
                                <button onclick="studentManager.deleteSiswa('${item.id}', '${item.nama}')" class="text-slate-500 hover:text-rose-600 bg-white p-1.5 border rounded shadow-sm"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                            </td>
                        </tr>`;
                });
                lucide.createIcons({root: tbody});
            },
            deleteSiswa(id, nama) { 
                uiManager.confirm(`Hapus data siswa "${nama}"?`, () => { 
                    state.siswa = state.siswa.filter(s => s.id !== id); 
                    system.saveData('siswa'); this.renderTable(); 
                    system.showToast('Siswa dihapus.');
                });
            },
            clearAllData() { 
                uiManager.prompt('Ketik "RESET-SISWA" untuk menghapus seluruh data siswa:', 'RESET-SISWA', 'RESET-SISWA', () => {
                    state.siswa = []; system.saveData('siswa'); this.renderTable(); 
                    system.showToast('Seluruh data siswa berhasil dikosongkan.', 'success');
                });
            }
        };

        const spreadsheetManager = {
            render() {
                const tbody = document.getElementById('table-body-spreadsheet');
                const search = document.getElementById('filter-search').value.toLowerCase();
                const kls = document.getElementById('filter-kelas').value;
                const eks = document.getElementById('filter-ekskul').value;
                
                const filtered = state.surveys.filter(r => {
                    const matchNama = r.nama.toLowerCase().includes(search);
                    const matchKelas = kls === "" || r.kelas === kls;
                    // Backward compatibility untuk ekskul1/2 jika ada data lama
                    const arrPilihan = r.pilihanEkskul || [r.ekskul1, r.ekskul2].filter(Boolean);
                    const matchEkskul = eks === "" || arrPilihan.includes(eks);
                    return matchNama && matchKelas && matchEkskul;
                });
                
                tbody.innerHTML = '';
                
                if(filtered.length === 0) { 
                    document.getElementById('spreadsheet-empty-state').classList.remove('d-none'); 
                    document.getElementById('spreadsheet-info').innerText = `Menampilkan 0 baris data`; return; 
                }
                
                document.getElementById('spreadsheet-empty-state').classList.add('d-none'); 
                document.getElementById('spreadsheet-info').innerHTML = `Menampilkan ${filtered.length} baris data dari total ${state.surveys.length}.`;
                
                [...filtered].reverse().forEach((row, index) => {
                    const pilihanStr = row.pilihanEkskul ? row.pilihanEkskul.join(', ') : [row.ekskul1, row.ekskul2].filter(Boolean).join(', ');
                    tbody.innerHTML += `
                        <tr class="${(index+1)%2===0?'bg-slate-50/50':'bg-transparent'} hover:bg-indigo-50/60 font-mono text-[13px] border-b border-slate-200/50">
                            <td class="px-4 py-3 border-r text-center text-slate-400">${index+1}</td>
                            <td class="px-4 py-3 border-r text-slate-500">${row.timestamp}</td>
                            <td class="px-4 py-3 border-r font-bold text-slate-800 font-sans">${row.nama}</td>
                            <td class="px-4 py-3 border-r font-sans text-xs"><span class="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">${row.kelas}</span></td>
                            <td class="px-4 py-3 border-r font-sans text-xs text-center">${row.jenisKelamin === 'P' ? 'P' : (row.jenisKelamin === 'L' ? 'L' : '-')}</td>
                            <td class="px-4 py-3 border-r font-sans">${row.namaOrtu || '-'}</td>
                            <td class="px-4 py-3 border-r font-sans">${row.waOrtu || '-'}</td>
                            <td class="px-4 py-3 border-r font-semibold text-emerald-700 font-sans max-w-[250px] truncate whitespace-normal leading-relaxed">${pilihanStr}</td>
                            <td class="px-4 py-3 border-r text-slate-500 font-sans truncate max-w-[200px]" title="${row.alasan}">${row.alasan}</td>
                            <td class="px-4 py-3 text-center font-sans whitespace-nowrap">
                                <button onclick="spreadsheetManager.openEditModal('${row.id}')" class="text-slate-500 hover:text-indigo-600 bg-white p-1.5 border rounded-lg shadow-sm mr-1" title="Edit baris ini"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                                <button onclick="spreadsheetManager.deleteRow('${row.id}')" class="text-slate-500 hover:text-rose-600 bg-white p-1.5 border rounded-lg shadow-sm" title="Hapus baris ini"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                            </td>
                        </tr>`;
                });
                lucide.createIcons({ root: tbody });
            },
            exportToCSV() {
                if(state.surveys.length === 0) return system.showToast('Database kosong, tidak ada yang diekspor.', 'error');
                let csv = "ID Data,Waktu Input,Nama Siswa,Kelas,Jenis Kelamin,Nama Orang Tua,No. WhatsApp,Pilihan Ekstrakurikuler,Alasan Memilih\n";
                state.surveys.forEach(r => {
                    const pilihanStr = r.pilihanEkskul ? r.pilihanEkskul.join(', ') : [r.ekskul1, r.ekskul2].filter(Boolean).join(', ');
                    const jkLabel = r.jenisKelamin === 'P' ? 'Perempuan' : (r.jenisKelamin === 'L' ? 'Laki-laki' : '-');
                    const row = [r.id, r.timestamp, r.nama, r.kelas, jkLabel, (r.namaOrtu || '-'), (r.waOrtu || '-'), pilihanStr.replace(/"/g,'""'), r.alasan.replace(/"/g,'""')];
                    csv += `"${row.join('","')}"\n`;
                });
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `Data_Pendaftaran_Ekskul_${system.formatDate(new Date()).replace(/[: ]/g,'_')}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },
            clearAllData() { 
                uiManager.prompt('Ketik "RESET-PENDAFTARAN" untuk menghapus permanen seluruh data responden:', 'RESET-PENDAFTARAN', 'RESET-PENDAFTARAN', () => {
                    state.surveys = []; system.saveData('survey'); this.render();
                    system.showToast('Database responden telah dikosongkan.', 'success');
                });
            },

            // --- Edit / hapus 1 baris responden (tanpa perlu reset seluruh database) ---
            openEditModal(id) {
                const row = state.surveys.find(s => s.id === id);
                if (!row) return system.showToast('Data tidak ditemukan.', 'error');

                document.getElementById('edit-row-id').value = row.id;
                document.getElementById('edit-nama').value = row.nama || '';
                document.getElementById('edit-namaOrtu').value = row.namaOrtu || '';
                document.getElementById('edit-waOrtu').value = row.waOrtu || '';
                document.getElementById('edit-alasan').value = row.alasan || '';
                document.getElementById('edit-jenisKelamin').value = row.jenisKelamin || '';

                const selKelas = document.getElementById('edit-kelas');
                const sortedKelas = [...state.kelas].sort((a,b) => a.nama.localeCompare(b.nama));
                selKelas.innerHTML = sortedKelas.map(k => `<option value="${k.nama}">${k.nama}</option>`).join('');
                if (sortedKelas.some(k => k.nama === row.kelas)) selKelas.value = row.kelas;

                const pilihan = row.pilihanEkskul || [row.ekskul1, row.ekskul2].filter(Boolean);
                const container = document.getElementById('edit-ekskul-checkboxes');
                container.innerHTML = state.ekskul.map(ek => `
                    <label class="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-xs has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50">
                        <input type="checkbox" class="edit-ekskul-cb w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" value="${ek.nama}" ${pilihan.includes(ek.nama) ? 'checked' : ''}>
                        <span>${ek.nama}</span>
                    </label>
                `).join('');

                const m = document.getElementById('modal-edit-row'), c = document.getElementById('modal-edit-row-card');
                m.classList.remove('pointer-events-none'); void m.offsetWidth; m.classList.add('opacity-100'); c.classList.remove('scale-95');
                lucide.createIcons({ root: m });
            },

            closeEditModal() {
                const m = document.getElementById('modal-edit-row'), c = document.getElementById('modal-edit-row-card');
                m.classList.remove('opacity-100'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('pointer-events-none'), 300);
            },

            saveRowEdit(e) {
                e.preventDefault();
                const id = document.getElementById('edit-row-id').value;
                const idx = state.surveys.findIndex(s => s.id === id);
                if (idx === -1) return system.showToast('Data tidak ditemukan (mungkin sudah dihapus admin lain).', 'error');

                const nama = document.getElementById('edit-nama').value.trim();
                const kelas = document.getElementById('edit-kelas').value;
                const jenisKelamin = document.getElementById('edit-jenisKelamin').value;
                const namaOrtu = document.getElementById('edit-namaOrtu').value.trim();
                const waOrtu = document.getElementById('edit-waOrtu').value.trim();
                const alasan = document.getElementById('edit-alasan').value.trim();
                const pilihanEkskul = Array.from(document.querySelectorAll('.edit-ekskul-cb:checked')).map(cb => cb.value);

                if (nama === '') return system.showToast('Nama siswa tidak boleh kosong.', 'error');
                if (jenisKelamin === '') return system.showToast('Pilih jenis kelamin.', 'error');
                if (pilihanEkskul.length === 0) return system.showToast('Pilih minimal satu ekstrakurikuler.', 'error');

                state.surveys[idx] = { ...state.surveys[idx], nama, kelas, jenisKelamin, namaOrtu, waOrtu, alasan, pilihanEkskul };
                // Buang field lama (ekskul1/ekskul2) supaya tidak ada data ganda/nyangkut setelah diedit.
                delete state.surveys[idx].ekskul1;
                delete state.surveys[idx].ekskul2;

                system.saveData('survey');
                this.closeEditModal();
                this.render();
                if (state.activePage === 'dashboard') dashboardManager.init();
                system.showToast('Data responden berhasil diperbarui.', 'success');
            },

            deleteRow(id) {
                const row = state.surveys.find(s => s.id === id);
                if (!row) return;
                uiManager.confirm(`Hapus data pendaftaran "${row.nama}" (${row.kelas})? Tindakan ini tidak bisa dibatalkan.`, () => {
                    state.surveys = state.surveys.filter(s => s.id !== id);
                    system.saveData('survey');
                    this.render();
                    system.showToast('Data responden dihapus.', 'success');
                });
            }
        };

        const cetakManager = {
            init() {
                // Isi dropdown filter ekstrakurikuler & kelas khusus halaman cetak
                const selEkskul = document.getElementById('cetak-filter-ekskul');
                const selKelas = document.getElementById('cetak-filter-kelas');
                if (!selEkskul || !selKelas) return;

                const currentEkskul = selEkskul.value;
                selEkskul.innerHTML = '<option value="">Semua Ekstrakurikuler</option>';
                [...state.ekskul].sort((a, b) => a.nama.localeCompare(b.nama)).forEach(ek => {
                    selEkskul.innerHTML += `<option value="${ek.nama}">${ek.nama}</option>`;
                });
                if (currentEkskul && state.ekskul.some(e => e.nama === currentEkskul)) selEkskul.value = currentEkskul;

                const currentKelas = selKelas.value;
                selKelas.innerHTML = '<option value="">Semua Kelas</option>';
                [...state.kelas].sort((a, b) => a.nama.localeCompare(b.nama)).forEach(k => {
                    selKelas.innerHTML += `<option value="${k.nama}">${k.nama}</option>`;
                });
                if (currentKelas && state.kelas.some(k => k.nama === currentKelas)) selKelas.value = currentKelas;

                const tglEl = document.getElementById('cetak-tanggal');
                if (tglEl) {
                    tglEl.textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                }

                const namaSekolahEl = document.getElementById('cetak-nama-sekolah');
                if (namaSekolahEl) namaSekolahEl.textContent = (state.settings && state.settings.schoolName) || DEFAULT_SETTINGS.schoolName;

                this.render();
            },

            // Ambil peserta suatu ekskul (opsional disaring per kelas juga)
            getPeserta(namaEkskul, namaKelas) {
                return state.surveys.filter(r => {
                    const arrPilihan = r.pilihanEkskul || [r.ekskul1, r.ekskul2].filter(Boolean);
                    const matchEkskul = arrPilihan.includes(namaEkskul);
                    const matchKelas = !namaKelas || r.kelas === namaKelas;
                    return matchEkskul && matchKelas;
                }).sort((a, b) => (a.kelas || '').localeCompare(b.kelas || '') || a.nama.localeCompare(b.nama));
            },

            buildTabel(peserta) {
                if (peserta.length === 0) {
                    return `<tr><td colspan="5" class="text-center py-6 text-slate-400 italic">Belum ada peserta yang mendaftar.</td></tr>`;
                }
                return peserta.map((r, idx) => `
                    <tr>
                        <td class="cetak-td text-center">${idx + 1}</td>
                        <td class="cetak-td">${r.nama}</td>
                        <td class="cetak-td text-center">${r.kelas || '-'}</td>
                        <td class="cetak-td text-center">${r.jenisKelamin === 'P' ? 'P' : (r.jenisKelamin === 'L' ? 'L' : '-')}</td>
                        <td class="cetak-td"></td>
                    </tr>
                `).join('');
            },

            buildFooterRekap(peserta) {
                if (peserta.length === 0) return '';
                const jmlL = peserta.filter(r => r.jenisKelamin === 'L').length;
                const jmlP = peserta.filter(r => r.jenisKelamin === 'P').length;
                const belumDiisi = peserta.length - jmlL - jmlP;
                const belumDiisiStr = belumDiisi > 0 ? ` &middot; ${belumDiisi} belum isi JK` : '';
                return `
                    <tfoot>
                        <tr>
                            <td class="cetak-td text-right font-semibold" colspan="3">Rekap Jenis Kelamin</td>
                            <td class="cetak-td text-center font-semibold" colspan="2">${jmlL} L &middot; ${jmlP} P${belumDiisiStr}</td>
                        </tr>
                    </tfoot>
                `;
            },

            buildBlokEkskul(namaEkskul, namaKelas) {
                const peserta = this.getPeserta(namaEkskul, namaKelas);
                return `
                    <div class="cetak-blok">
                        <div class="cetak-blok-judul">
                            <h3>${namaEkskul}</h3>
                            <span>${peserta.length} Peserta${namaKelas ? ` &middot; Kelas ${namaKelas}` : ''}</span>
                        </div>
                        <table class="cetak-tabel">
                            <thead>
                                <tr>
                                    <th class="text-center" style="width:36px;">No</th>
                                    <th>Nama Siswa</th>
                                    <th class="text-center" style="width:80px;">Kelas</th>
                                    <th class="text-center" style="width:36px;">JK</th>
                                    <th style="width:130px;">Tanda Tangan</th>
                                </tr>
                            </thead>
                            <tbody>${this.buildTabel(peserta)}</tbody>
                            ${this.buildFooterRekap(peserta)}
                        </table>
                    </div>
                `;
            },

            render() {
                const selEkskul = document.getElementById('cetak-filter-ekskul');
                const selKelas = document.getElementById('cetak-filter-kelas');
                const preview = document.getElementById('cetak-preview-area');
                const subjudulEl = document.getElementById('cetak-subjudul');
                if (!selEkskul || !preview) return;

                const namaEkskul = selEkskul.value;
                const namaKelas = selKelas.value;

                if (namaEkskul) {
                    // Satu ekskul terpilih
                    if (subjudulEl) subjudulEl.textContent = `Daftar Peserta Ekstrakurikuler: ${namaEkskul}`;
                    preview.innerHTML = this.buildBlokEkskul(namaEkskul, namaKelas);
                } else {
                    // Semua ekskul -> satu blok tercetak per ekskul, halaman baru tiap blok
                    if (subjudulEl) subjudulEl.textContent = `Daftar Peserta Seluruh Ekstrakurikuler`;
                    if (state.ekskul.length === 0) {
                        preview.innerHTML = `<p class="text-center text-slate-400 italic py-10">Belum ada data ekstrakurikuler.</p>`;
                    } else {
                        preview.innerHTML = [...state.ekskul]
                            .sort((a, b) => a.nama.localeCompare(b.nama))
                            .map(ek => this.buildBlokEkskul(ek.nama, namaKelas))
                            .join('');
                    }
                }

                lucide.createIcons({ root: document.getElementById('page-cetak') });
            },

            cetakSekarang() {
                window.print();
            }
        };

        const dashboardManager = {
            init() {
                const badgeEl = document.getElementById('dash-tahun-ajaran-badge');
                if (badgeEl) badgeEl.textContent = state.settings.tahunAjaran ? `Tahun Ajaran ${state.settings.tahunAjaran}` : 'Tahun Ajaran Aktif Belum Diatur';

                document.getElementById('dash-total-siswa').innerText = state.surveys.length;
                document.getElementById('dash-total-ekskul').innerText = state.ekskul.length;

                // --- Tingkat Partisipasi (Response Rate) ---
                const totalSiswaTerdaftar = state.siswa.length;
                const totalResponden = state.surveys.length;
                const responseRate = totalSiswaTerdaftar > 0 ? Math.round((totalResponden / totalSiswaTerdaftar) * 100) : 0;
                const rateEl = document.getElementById('dash-response-rate');
                if (rateEl) {
                    rateEl.textContent = totalSiswaTerdaftar > 0
                        ? `dari ${totalSiswaTerdaftar} siswa terdaftar (${responseRate}%)`
                        : 'Belum ada data siswa di Master Kelas';
                }

                const dataEkskul = {};
                const dataKelas = {};
                const dataGender = { 'Laki-laki': 0, 'Perempuan': 0 };
                state.kelas.forEach(k => dataKelas[k.nama] = 0);
                state.ekskul.forEach(e => dataEkskul[e.nama] = 0);
                
                state.surveys.forEach(surv => {
                    if(surv.pilihanEkskul) {
                        surv.pilihanEkskul.forEach(eksName => {
                            if(dataEkskul[eksName] !== undefined) dataEkskul[eksName]++; 
                            else { if(!dataEkskul['Lainnya']) dataEkskul['Lainnya']=0; dataEkskul['Lainnya']++; }
                        });
                    } else {
                        // Fallback untuk data lama
                        if(dataEkskul[surv.ekskul1] !== undefined) dataEkskul[surv.ekskul1]++; 
                        else { if(!dataEkskul['Lainnya']) dataEkskul['Lainnya']=0; dataEkskul['Lainnya']++; }
                    }
                    
                    if(dataKelas[surv.kelas] !== undefined) dataKelas[surv.kelas]++; else { if(!dataKelas['Lainnya']) dataKelas['Lainnya']=0; dataKelas['Lainnya']++; }

                    if(surv.jenisKelamin === 'L') dataGender['Laki-laki']++;
                    else if(surv.jenisKelamin === 'P') dataGender['Perempuan']++;
                });

                // Top 5 Ranking
                let sortedEkskul = Object.entries(dataEkskul).sort((a,b) => b[1] - a[1]);
                let top5 = sortedEkskul.slice(0, 5).filter(item => item[1] > 0); // Only show if they have votes
                
                if(top5.length > 0) {
                    let top5HTML = top5.map((item, idx) => `
                        <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 rounded-lg px-2 transition-colors">
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-bold ${idx === 0 ? 'text-amber-500' : 'text-slate-400'} w-4">${idx+1}.</span>
                                <span class="text-sm font-semibold text-slate-700">${item[0]}</span>
                            </div>
                            <span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">${item[1]} Peminat</span>
                        </div>
                    `).join('');
                    document.getElementById('dash-top-5-container').innerHTML = top5HTML;
                } else {
                    document.getElementById('dash-top-5-container').innerHTML = '<div class="text-center py-4"><i data-lucide="bar-chart-2" class="w-8 h-8 mx-auto text-slate-200 mb-2"></i><p class="text-xs text-slate-500">Belum ada data pendaftar.</p></div>';
                    lucide.createIcons({root: document.getElementById('dash-top-5-container')});
                }

                // Initialize Charts
                Chart.defaults.font.family = '"Plus Jakarta Sans", sans-serif'; 
                Chart.defaults.color = '#64748b';
                
                // Pie Chart
                if(state.chartInstances.pie) state.chartInstances.pie.destroy();
                state.chartInstances.pie = new Chart(document.getElementById('chartPieMinat'), {
                    type: 'doughnut', 
                    data: { 
                        labels: Object.keys(dataEkskul), 
                        datasets: [{ 
                            data: Object.values(dataEkskul), 
                            backgroundColor: ['#4f46e5','#f59e0b','#10b981','#ec4899','#8b5cf6','#0ea5e9','#94a3b8'], 
                            borderWidth: 2, borderColor: '#ffffff' 
                        }] 
                    },
                    options: { 
                        responsive: true, maintainAspectRatio: false, cutout: '65%', 
                        plugins: { legend: { position: 'right', labels: {boxWidth: 12, usePointStyle: true, font: {size:11}} } } 
                    }
                });

                // Bar Chart
                if(state.chartInstances.bar) state.chartInstances.bar.destroy();
                state.chartInstances.bar = new Chart(document.getElementById('chartBarKelas'), {
                    type: 'bar', 
                    data: { 
                        labels: Object.keys(dataKelas), 
                        datasets: [{ 
                            label: 'Jumlah Partisipasi', 
                            data: Object.values(dataKelas), 
                            backgroundColor: '#6366f1', 
                            borderRadius: 6,
                            barPercentage: 0.6
                        }] 
                    },
                    options: { 
                        responsive: true, maintainAspectRatio: false, 
                        plugins: { legend: { display: false } }, 
                        scales: { y: { beginAtZero: true, ticks: {stepSize: 1, precision: 0} }, x: { grid: { display: false } } } 
                    }
                });

                // Gender Chart
                if(state.chartInstances.gender) state.chartInstances.gender.destroy();
                state.chartInstances.gender = new Chart(document.getElementById('chartGender'), {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(dataGender),
                        datasets: [{
                            data: Object.values(dataGender),
                            backgroundColor: ['#0ea5e9', '#ec4899'],
                            borderWidth: 2, borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '65%',
                        plugins: { legend: { position: 'bottom', labels: {boxWidth: 12, usePointStyle: true, font: {size:11}} } }
                    }
                });

                this.renderPartisipasiKelas();
                this.renderEkskulSepi(dataEkskul);
                this.renderAktivitasTerbaru();
            },
            renderPartisipasiKelas() {
                const container = document.getElementById('dash-kelas-partisipasi-container');
                if (!container) return;

                if (state.kelas.length === 0) {
                    container.innerHTML = `<div class="text-center py-6"><i data-lucide="school" class="w-8 h-8 mx-auto text-slate-200 mb-2"></i><p class="text-xs text-slate-500">Belum ada data Master Kelas.</p></div>`;
                    lucide.createIcons({ root: container });
                    return;
                }

                const sortedKelas = [...state.kelas].sort((a, b) => a.nama.localeCompare(b.nama));
                container.innerHTML = sortedKelas.map(k => {
                    const siswaKelas = state.siswa.filter(s => s.kelas === k.nama);
                    const respondedIds = new Set(state.surveys.filter(sv => sv.kelas === k.nama).map(sv => sv.idSiswa));
                    const respondedNames = new Set(state.surveys.filter(sv => sv.kelas === k.nama).map(sv => sv.nama));
                    const belumIsi = siswaKelas.filter(s => !respondedIds.has(s.id) && !respondedNames.has(s.nama));
                    const total = siswaKelas.length;
                    const sudah = total - belumIsi.length;
                    const pct = total > 0 ? Math.round((sudah / total) * 100) : 0;
                    const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
                    const rowId = `kelas-belum-${k.id}`;

                    return `
                        <div class="border border-slate-100 rounded-xl p-3.5 bg-white/50">
                            <div class="flex items-center justify-between gap-3 mb-2">
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-bold text-slate-800 truncate">${k.nama}</p>
                                    <p class="text-[10px] text-slate-500">${sudah} / ${total} siswa sudah isi</p>
                                </div>
                                <span class="text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 ${pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}">${total > 0 ? pct + '%' : '-'}</span>
                            </div>
                            <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                                <div class="h-full ${barColor} rounded-full" style="width:${pct}%"></div>
                            </div>
                            ${belumIsi.length > 0 ? `
                                <button onclick="dashboardManager.toggleBelumIsi('${rowId}')" class="text-[11px] font-bold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1">
                                    <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i> Lihat ${belumIsi.length} siswa yang belum isi
                                </button>
                                <div id="${rowId}" class="d-none mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                                    ${belumIsi.map(s => `<span class="px-2 py-1 bg-rose-50 border border-rose-100 text-rose-700 rounded-md text-[10px] font-semibold">${s.nama}</span>`).join('')}
                                </div>
                                <button onclick="dashboardManager.sendReminderWA('${k.id}')" class="mt-2.5 w-full py-2 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-lg text-[11px] font-bold shadow-sm flex items-center justify-center gap-1.5">
                                    <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> Kirim Reminder WA
                                </button>
                            ` : `<p class="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Semua siswa sudah mengisi</p>`}
                        </div>
                    `;
                }).join('');
                lucide.createIcons({ root: container });
            },

            toggleBelumIsi(rowId) {
                const el = document.getElementById(rowId);
                if (el) el.classList.toggle('d-none');
            },

            // Buka WhatsApp dengan pesan reminder siap-kirim berisi daftar siswa yang belum
            // isi survei di kelas ini. Kalau nomor WA wali kelas sudah diisi di Master Kelas,
            // langsung diarahkan ke kontak itu; kalau belum, tetap buka WA supaya admin tinggal
            // pilih sendiri kontak/grup tujuannya.
            sendReminderWA(kelasId) {
                const k = state.kelas.find(x => x.id === kelasId);
                if (!k) return;

                const siswaKelas = state.siswa.filter(s => s.kelas === k.nama);
                const respondedIds = new Set(state.surveys.filter(sv => sv.kelas === k.nama).map(sv => sv.idSiswa));
                const respondedNames = new Set(state.surveys.filter(sv => sv.kelas === k.nama).map(sv => sv.nama));
                const belumIsi = siswaKelas.filter(s => !respondedIds.has(s.id) && !respondedNames.has(s.nama));

                if (belumIsi.length === 0) return system.showToast('Semua siswa di kelas ini sudah mengisi.', 'success');

                const linkSurvei = `${window.location.origin}/survey.html`;
                const daftarNama = belumIsi.map((s, i) => `${i + 1}. ${s.nama}`).join('\n');
                const pesan = `Assalamu'alaikum/Selamat siang, mohon info untuk wali murid ${k.nama} yang putra/putrinya *belum mengisi* Survei Peminatan Ekstrakurikuler:\n\n${daftarNama}\n\nMohon diisi selambatnya melalui link berikut:\n${linkSurvei}\n\nTerima kasih.`;

                let waNumber = String(k.waWaliKelas || '').replace(/[^0-9]/g, '');
                if (waNumber.startsWith('0')) waNumber = '62' + waNumber.slice(1);
                else if (waNumber && !waNumber.startsWith('62')) waNumber = '62' + waNumber;

                const waUrl = waNumber
                    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(pesan)}`
                    : `https://wa.me/?text=${encodeURIComponent(pesan)}`;

                if (!waNumber) {
                    system.showToast(`Nomor WA wali kelas ${k.nama} belum diisi (Master Kelas). Membuka WA tanpa nomor tujuan, silakan pilih kontak sendiri.`, 'error');
                }
                window.open(waUrl, '_blank');
            },

            // --- Ekskul sepi / tanpa peminat ---
            renderEkskulSepi(dataEkskul) {
                const container = document.getElementById('dash-ekskul-sepi-container');
                if (!container) return;

                if (state.ekskul.length === 0) {
                    container.innerHTML = `<div class="text-center py-4"><i data-lucide="award" class="w-8 h-8 mx-auto text-slate-200 mb-2"></i><p class="text-xs text-slate-500">Belum ada data ekstrakurikuler.</p></div>`;
                    lucide.createIcons({ root: container });
                    return;
                }

                const sepi = state.ekskul
                    .map(ek => ({ nama: ek.nama, jumlah: dataEkskul[ek.nama] || 0 }))
                    .sort((a, b) => a.jumlah - b.jumlah)
                    .filter(item => item.jumlah <= 2);

                if (sepi.length === 0) {
                    container.innerHTML = `<div class="text-center py-4"><i data-lucide="thumbs-up" class="w-8 h-8 mx-auto text-emerald-200 mb-2"></i><p class="text-xs text-slate-500">Semua ekskul punya peminat yang cukup merata.</p></div>`;
                    lucide.createIcons({ root: container });
                    return;
                }

                container.innerHTML = sepi.map(item => `
                    <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 px-2">
                        <span class="text-sm font-semibold text-slate-700">${item.nama}</span>
                        <span class="text-[10px] font-bold px-2.5 py-1 rounded-md border ${item.jumlah === 0 ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}">${item.jumlah === 0 ? 'Belum ada peminat' : item.jumlah + ' Peminat'}</span>
                    </div>
                `).join('');
                lucide.createIcons({ root: container });
            },

            // --- Aktivitas terbaru (activity feed) ---
            renderAktivitasTerbaru() {
                const container = document.getElementById('dash-aktivitas-container');
                if (!container) return;

                if (state.surveys.length === 0) {
                    container.innerHTML = `<div class="text-center py-4"><i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-200 mb-2"></i><p class="text-xs text-slate-500">Belum ada pengisian survei.</p></div>`;
                    lucide.createIcons({ root: container });
                    return;
                }

                const recent = [...state.surveys].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 10);
                container.innerHTML = recent.map(sv => {
                    const pilihan = Array.isArray(sv.pilihanEkskul) ? sv.pilihanEkskul : [];
                    return `
                        <div class="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0 px-2">
                            <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5"><i data-lucide="user-round" class="w-4 h-4"></i></div>
                            <div class="flex-1 min-w-0">
                                <p class="text-xs font-bold text-slate-800 truncate">${sv.nama} <span class="font-medium text-slate-400">&middot; ${sv.kelas}</span></p>
                                <p class="text-[10px] text-slate-500 truncate">Memilih: ${pilihan.join(', ') || '-'}</p>
                            </div>
                            <span class="text-[9px] text-slate-400 flex-shrink-0 whitespace-nowrap">${sv.timestamp}</span>
                        </div>
                    `;
                }).join('');
                lucide.createIcons({ root: container });
            },

            // --- KPI & Kesimpulan Berbasis AI (Cloudflare Workers AI) ---
            async generateAiKpi() {
                const box = document.getElementById('dash-ai-kpi-result');
                const btn = document.getElementById('dash-ai-kpi-btn');
                if (!box) return;

                // Susun ringkasan data terkini (bukan data mentah tiap siswa, cukup agregatnya)
                // supaya prompt tetap ringkas dan tidak membocorkan data pribadi siswa ke API luar.
                const dataEkskul = {};
                const dataKelas = {};
                const dataGender = { lakiLaki: 0, perempuan: 0, belumDiisi: 0 };
                state.kelas.forEach(k => dataKelas[k.nama] = 0);
                state.ekskul.forEach(e => dataEkskul[e.nama] = 0);
                state.surveys.forEach(surv => {
                    const pilihan = Array.isArray(surv.pilihanEkskul) ? surv.pilihanEkskul : (surv.ekskul1 ? [surv.ekskul1] : []);
                    pilihan.forEach(nm => { if (dataEkskul[nm] !== undefined) dataEkskul[nm]++; });
                    if (dataKelas[surv.kelas] !== undefined) dataKelas[surv.kelas]++;
                    if (surv.jenisKelamin === 'L') dataGender.lakiLaki++;
                    else if (surv.jenisKelamin === 'P') dataGender.perempuan++;
                    else dataGender.belumDiisi++;
                });
                const totalSiswaTerdaftar = state.siswa.length;
                const totalResponden = state.surveys.length;
                const responseRate = totalSiswaTerdaftar > 0 ? Math.round((totalResponden / totalSiswaTerdaftar) * 100) : 0;

                const ringkasan = {
                    totalSiswaTerdaftar, totalResponden, responseRatePersen: responseRate,
                    peminatPerEkskul: dataEkskul,
                    partisipasiPerKelas: dataKelas,
                    rasioGenderResponden: dataGender
                };

                if (btn) { btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Menganalisis...`; lucide.createIcons({ root: btn }); }
                box.innerHTML = `<p class="text-xs text-slate-400 italic">Sedang menghubungi AI untuk menganalisis data, mohon tunggu...</p>`;

                try {
                    // Prompt disusun & dikirim ke Workers AI langsung dari dalam Worker
                    // (endpoint /api/ai-kpi) -- di sini kita hanya kirim ringkasan datanya.
                    const res = await fetch('/api/ai-kpi', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ringkasan })
                    });
                    const json = await res.json();

                    if (!res.ok || !json.success) {
                        const msg = (json && json.error) || 'Gagal menghubungi Workers AI.';
                        box.innerHTML = `<p class="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">Gagal membuat analisis: ${msg}</p>`;
                        return;
                    }

                    const text = (json.text || '').trim();
                    if (!text) {
                        box.innerHTML = `<p class="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">AI tidak mengembalikan hasil. Coba lagi beberapa saat lagi.</p>`;
                        return;
                    }

                    box.innerHTML = `<div class="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">${text.replace(/</g, '&lt;')}</div>`;
                } catch (err) {
                    box.innerHTML = `<p class="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">Terjadi kesalahan jaringan saat menghubungi AI: ${err.message}</p>`;
                } finally {
                    if (btn) { btn.disabled = false; btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Buat Analisis AI`; lucide.createIcons({ root: btn }); }
                }
            }
        };

        // --- HEADER MOBILE AUTO HIDE/SHOW SAAT SCROLL ---
        // Header mobile (class "lg:hidden fixed top-0...") disembunyikan otomatis saat
        // user scroll ke bawah, dan dimunculkan lagi saat scroll ke atas.
        // PENTING: area yang benar-benar discroll BUKAN window, tapi elemen
        // #main-content-container (.page-container, overflow-y:auto) -- lihat style.css.
        (function setupAutoHideMobileHeader() {
            const header = document.querySelector('header.lg\\:hidden');
            const scrollEl = document.getElementById('main-content-container');
            if (!header || !scrollEl) return;

            header.classList.add('transition-transform', 'duration-300', 'will-change-transform');

            // Baseline diambil dari posisi scroll SAAT INI (bukan hardcode 0), supaya
            // tidak salah anggap "sudah discroll" di render pertama.
            let lastScroll = scrollEl.scrollTop;
            let ticking = false;
            const SCROLL_THRESHOLD = 8; // px -- abaikan jitter/rubber-band kecil di HP

            // PENTING: konten halaman ini di-render ulang secara ASYNC (data dari server
            // datang belakangan -> dropdown/kartu ekskul baru muncul beberapa saat setelah
            // load). Perubahan tinggi konten seperti itu bisa memicu event "scroll" dari
            // browser sendiri (efek "scroll anchoring") walau user tidak menyentuh layar
            // sama sekali. Makanya, hide/show HANYA boleh jalan kalau baru saja ada
            // gesture asli dari user (sentuh/geser/scroll wheel).
            let userIsInteracting = false;
            let interactionTimer = null;
            const markUserInteraction = () => {
                userIsInteracting = true;
                clearTimeout(interactionTimer);
                // beri jeda singkat setelah gesture berhenti, karena momentum scroll
                // di HP masih lanjut sesaat walau jari sudah diangkat
                interactionTimer = setTimeout(() => { userIsInteracting = false; }, 400);
            };
            scrollEl.addEventListener('touchstart', markUserInteraction, { passive: true });
            scrollEl.addEventListener('touchmove', markUserInteraction, { passive: true });
            scrollEl.addEventListener('wheel', markUserInteraction, { passive: true });

            scrollEl.addEventListener('scroll', () => {
                if (ticking) return;
                ticking = true;

                window.requestAnimationFrame(() => {
                    // Bukan gesture user -> ini scroll "palsu" akibat render ulang konten,
                    // abaikan sepenuhnya, jangan ubah status header.
                    if (!userIsInteracting) {
                        lastScroll = scrollEl.scrollTop;
                        ticking = false;
                        return;
                    }

                    // Saat user sedang mengetik di form (keyboard HP terbuka), jangan
                    // sembunyikan header -- resize viewport karena keyboard juga
                    // memicu event scroll padahal user tidak sedang menggeser layar.
                    const activeTag = document.activeElement && document.activeElement.tagName;
                    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
                        lastScroll = scrollEl.scrollTop;
                        ticking = false;
                        return;
                    }

                    const current = Math.max(0, scrollEl.scrollTop); // clamp, jaga2 dari overscroll negatif iOS
                    const diff = current - lastScroll;
                    const headerHeight = header.offsetHeight || 64;

                    if (Math.abs(diff) > SCROLL_THRESHOLD) {
                        if (diff > 0 && current > headerHeight) {
                            header.classList.add('-translate-y-full');   // scroll ke bawah -> sembunyikan
                        } else if (diff < 0) {
                            header.classList.remove('-translate-y-full'); // scroll ke atas -> tampilkan
                        }
                        lastScroll = current;
                    }

                    ticking = false;
                });
            }, { passive: true });
        })();

        // --- STARTUP ---
        system.init();
