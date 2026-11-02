# Resi Tracker

Aplikasi web lokal (*self-hosted / single-machine LAN*) untuk melacak status proses packing dan pengiriman pesanan TikTok Shop dengan kurir J&T Express berbasis scan barcode resi.

Aplikasi ini dirancang untuk diinstal di satu komputer Windows client dan dapat diakses oleh beberapa perangkat (operator/admin) di jaringan lokal (LAN) melalui browser.

---

## 🛠️ Tech Stack

- **Monorepo**: npm workspaces (`server`, `web`)
- **Backend**:
  - Node.js LTS + TypeScript
  - Express.js
  - SQLite (driver `better-sqlite3` dengan mode **WAL** dan penegakan *foreign keys*)
  - Drizzle ORM + Drizzle Kit (migrasi otomatis)
  - Validasi schema: Zod
  - Session Store: SQLite session store via `express-session`
  - Hashing password: `bcryptjs`
  - Logging: `pino` (stream konsol & file log di `data/logs/app.log`)
- **Frontend**:
  - Vue 3 (Composition API) + TypeScript
  - Vite (dengan proxy `/api` pada development server)
  - Vue Router (dengan authentication guard)
  - Pinia (state management)
  - Tailwind CSS
- **Testing & Quality**:
  - Vitest
  - ESLint 9 (Flat config) & Prettier

---

## 📁 Struktur Direktori

```text
resi-tracker/
├── data/                  # Runtime storage (di-gitignore: app.db, pdf/, backup/, logs/)
├── samples/               # Sampel dokumen PDF resi asli (di-gitignore)
├── scripts/
│   └── copy-dist.js       # Script cross-platform menyalin web/dist ke server/public
├── tests/
│   └── example.test.ts    # Unit test (contoh verifikasi order_id 18 digit)
├── server/
│   ├── drizzle/           # SQL migration files hasil generate Drizzle Kit
│   ├── src/
│   │   ├── config.ts      # Validasi environment variable Zod & direktori runtime
│   │   ├── db/
│   │   │   ├── schema.ts  # Definisi skema tabel Drizzle (users, batches, orders, order_items, scan_logs)
│   │   │   ├── client.ts  # Inisialisasi better-sqlite3 (WAL & foreign keys) + Drizzle
│   │   │   └── migrate.ts # Auto-migration runner saat server startup
│   │   ├── middleware/
│   │   │   ├── auth.ts    # Middleware requireAuth dan requireRole
│   │   │   ├── logger.ts  # Pino logger (konsol dan file data/logs/app.log)
│   │   │   └── errorHandler.ts # Error handler JSON terpusat
│   │   ├── routes/
│   │   │   ├── auth.routes.ts   # /api/auth (login, logout, me)
│   │   │   ├── health.routes.ts # /api/health
│   │   │   └── index.ts
│   │   ├── scripts/
│   │   │   └── seedAdmin.ts     # Script pembuatan user admin
│   │   ├── session/
│   │   │   └── sqliteStore.ts   # SQLite session store untuk express-session
│   │   ├── parsers/       # [Tahap Selanjutnya] Ekstraksi PDF label resi
│   │   ├── services/      # [Tahap Selanjutnya] Logika bisnis order & scan
│   │   └── index.ts       # Entry point Express, static SPA serving, shutdown handler
│   ├── drizzle.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── .env
├── web/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts  # Fetch API client dengan session cookie support
│   │   ├── components/
│   │   │   └── Navbar.vue # Navbar responsif berbahasa Indonesia
│   │   ├── router/
│   │   │   └── index.ts   # Router dengan login guard
│   │   ├── stores/
│   │   │   └── auth.ts    # Pinia auth store
│   │   ├── views/
│   │   │   ├── LoginView.vue   # Halaman Login
│   │   │   ├── UploadView.vue  # Placeholder Upload PDF
│   │   │   ├── OrdersView.vue  # Placeholder Data Pesanan
│   │   │   ├── ScanView.vue    # Placeholder Scan Resi USB
│   │   │   └── ExportView.vue  # Placeholder Export CSV/Excel
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── style.css
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── tsconfig.json
├── package.json           # Root workspace config & unified scripts
├── tsconfig.base.json
├── eslint.config.js
├── vitest.config.ts
└── README.md
```

---

## 🗄️ Skema Database

1. **`users`**: Akun pengguna sistem (`id`, `username`, `password_hash`, `role` ['admin' | 'operator'], `created_at`).
2. **`batches`**: Riwayat unggahan PDF (`id`, `name`, `source_filename`, `pdf_path`, `uploaded_at`, `created_by`).
3. **`orders`**: Data pesanan resi (`id`, `batch_id`, `resi` [UNIK], `order_id` [**TEXT strictly 18 digit**], `courier`, `service`, `is_cod`, `weight_kg`, `ship_date`, `recipient_name`, `recipient_phone`, `recipient_address`, `sorting_code`, `status` ['menunggu_dikemas' | 'dikemas' | 'dikirim'], `packed_at`, `packed_by`, `shipped_at`, `shipped_by`, `created_at`).
4. **`order_items`**: Produk dalam resi (`id`, `order_id`, `product_name`, `sku`, `seller_sku`, `qty`).
5. **`scan_logs`**: Log setiap kali barcode di-scan (`id`, `order_id`, `resi_scanned`, `mode` ['packing' | 'pengiriman'], `result` ['ok' | 'duplikat' | 'tidak_ditemukan' | 'status_tidak_valid'], `user_id`, `scanned_at`).

> **PENTING**: `order_id` TikTok Shop berisi 18 digit angka yang melampaui batas integer aman JavaScript (`Number.MAX_SAFE_INTEGER`). Database dan aplikasi menyimpannya strictly sebagai tipe string/TEXT untuk menghindari kehilangan presisi.

---

## 🚀 Panduan Instalasi & Penggunaan

### 1. Prasyarat
- **Node.js**: Versi LTS (v20.x atau v22.x)
- **npm**: v10.x atau lebih baru

### 2. Instalasi Dependensi
Jalankan perintah berikut di root folder proyek:
```bash
npm install
```

### 3. Migrasi Database
Skema database akan dimigrasikan secara otomatis saat server berjalan. Untuk meng-*generate* berkas migrasi SQL secara manual:
```bash
# Generate file migrasi baru (jika ada perubahan skema di schema.ts)
npm run db:generate

# Menjalankan migrasi secara manual
npm run db:migrate

# Reset database (menghapus database lama, migrasi ulang dari nol, dan seed admin)
npm run db:reset
```

### 4. Seed Akun Admin
Buat akun Administrator pertama untuk login ke aplikasi:
```bash
# Menggunakan kredensial custom:
npm run seed:admin -- --username admin --password rahasia123

# Atau via environment variable:
ADMIN_USERNAME=admin ADMIN_PASSWORD=rahasia123 npm run seed:admin
```
*(Jika tidak menyertakan argumen, sistem akan membuatkan default `admin` / `admin123`)*

---

## 💻 Menjalankan Aplikasi

### Mode Pengembangan (Development)
```bash
# Menjalankan Backend + Frontend bersamaan (Hot-reload)
npm run dev

# Menjalankan HANYA Backend server (port 3000):
npm run dev:server

# Menjalankan HANYA Frontend Vite (port 5173 dengan proxy API):
npm run dev:web
```
Akses antarmuka melalui browser di `http://localhost:5173`. Vite secara otomatis mem-proxy panggilan `/api` ke backend server.

### Pengujian (Test) & Linting
```bash
# Menjalankan unit test Vitest
npm test

# Menjalankan pengecekan ESLint
npm run lint
```

### Mode Produksi (Single Port)
Membangun frontend web Vue dan menyatukannya ke server backend sehingga seluruh sistem berjalan pada 1 port:
```bash
# 1. Build frontend ke server/public
npm run build

# 2. Jalankan server produksi
npm start
```
Buka browser di komputer lokal atau komputer lain dalam satu jaringan WiFi/LAN di:
`http://<IP-KOMPUTER-WINDOWS>:3000` atau `http://localhost:3000`.
