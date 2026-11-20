# Dokumentasi Alur Bisnis dan Arsitektur Sistem ERP Sukma (ELLITH)

Dokumen ini merupakan panduan resmi dan rujukan utama yang menjelaskan seluruh alur bisnis, arsitektur teknis, skema basis data, logika algoritma, serta antarmuka pengguna pada sistem **ERP Sukma / ELLITH Tracking**.

Setiap pengembang maupun AI Agent yang bekerja pada repositori ini **wajib membaca, memahami, dan mematuhi** prinsip-prinsip yang tertuang dalam dokumen ini sebelum merancang atau mengimplementasikan perubahan kode.

---

## Daftar Isi
1. [Profil Sistem dan Konteks Bisnis](#1-profil-sistem-dan-konteks-bisnis)
2. [Arsitektur Teknologi dan Infrastruktur](#2-arsitektur-teknologi-dan-infrastruktur)
3. [Skema Basis Data Relasional](#3-skema-basis-data-relasional)
4. [Tujuh Siklus Alur Bisnis Utama (End-to-End)](#4-tujuh-siklus-alur-bisnis-utama-end-to-end)
   - [Siklus 1: Master Data Produk dan Biaya Standar (Master HPP)](#siklus-1-master-data-produk-dan-biaya-standar-master-hpp)
   - [Siklus 2: Pengadaan dan Stok Masuk Berbasis Kloter (Inbound Batch)](#siklus-2-pengadaan-dan-stok-masuk-berbasis-kloter-inbound-batch)
   - [Siklus 3: Penjualan Online TikTok Shop dan Parsing PDF Label Resi J&T](#siklus-3-penjualan-online-tiktok-shop-dan-parsing-pdf-label-resi-jt)
   - [Siklus 4: Penjualan Offline (Kasir) dan Smart Hint Modal FIFO](#siklus-4-penjualan-offline-kasir-dan-smart-hint-modal-fifo)
   - [Siklus 5: Operasional Gudang dan Barcode Scanning (Packing & Kirim)](#siklus-5-operasional-gudang-dan-barcode-scanning-packing--kirim)
   - [Siklus 6: Pengendalian Inventaris, Mutasi, dan Cut-Off Stock Opname](#siklus-6-pengendalian-inventaris-mutasi-dan-cut-off-stock-opname)
   - [Siklus 7: Engine HPP FIFO, Moving Average, dan Realisasi Laba Rugi](#siklus-7-engine-hpp-fifo-moving-average-dan-realisasi-laba-rugi)
5. [Struktur Modul dan Halaman Antarmuka (Frontend Views)](#5-struktur-modul-dan-halaman-antarmuka-frontend-views)
6. [Algoritma dan Logika Bisnis Khusus](#6-algoritma-dan-logika-bisnis-khusus)
   - [Algoritma Perhitungan Stok O(N + M) Single-Pass Hash Map](#algoritma-perhitungan-stok-on--m-single-pass-hash-map)
   - [Resolusi SKU Cerdas dan Strict Exact Matching](#resolusi-sku-cerdas-dan-strict-exact-matching)
   - [Alokasi Beban Pokok Penjualan FIFO (First-In, First-Out)](#alokasi-beban-pokok-penjualan-fifo-first-in-first-out)
   - [Komparasi Akuntansi: FIFO vs Moving Average](#komparasi-akuntansi-fifo-vs-moving-average)
   - [Kebijakan Pemisahan Data: Offline Riil vs Online Resi Fisik](#kebijakan-pemisahan-data-offline-riil-vs-online-resi-fisik)
7. [Pedoman Standar UI/UX dan Copywriting Enterprise](#7-pedoman-standar-uiux-dan-copywriting-enterprise)
8. [Struktur Berkas Proyek dan Navigasi Kode](#8-struktur-berkas-proyek-dan-navigasi-kode)

---

## 1. Profil Sistem dan Konteks Bisnis

Sistem **ERP Sukma / ELLITH Tracking** adalah aplikasi Enterprise Resource Planning (ERP) dan pelacak fulfillment pesanan berbasis web yang dirancang khusus untuk operasional bisnis manufaktur dan ritel busana muslim/garmen (merek ELLITH).

### Tantangan Bisnis Utama yang Diselesaikan
1. **Omnichannel Fulfillment**: Mengelola dua saluran penjualan yang berbeda karakter:
   - **Saluran Online (TikTok Shop via ekspedisi J&T Express)**: Pesanan masuk dalam volume tinggi berupa berkas PDF cetak label resi dari TikTok Shop Seller Center. Perlu diparsing otomatis, dilacak proses pengemasan (*packing*), dan serah terima ke kurir (*shipping*) via barcode scanner.
   - **Saluran Offline (Kasir / Pembelian Langsung / Grosir / Reseller)**: Pesanan manual yang dicatat langsung di tempat dengan harga jual riil lapangan yang dinamis.
2. **Akurasi Inventaris Real-Time**: Mencegah salah potong stok (*overselling*) dan selisih fisik gudang akibat ribuan pesanan online dan transaksi kasir harian.
3. **Kalkulasi Biaya Pokok Penjualan (HPP) Multi-Kloter**: Bisnis garmen memproduksi pakaian per kloter (*batch*). Biaya bahan baku kain, tenaga jahit, dan aksesoris fluktuatif antar kloter. Sistem harus mampu melacak modal riil per kloter secara presisi menggunakan metode akuntansi **FIFO (First-In, First-Out)** dan menyajikan komparasi **Moving Average**.
4. **Keamanan Margin Keuntungan**: Menyediakan panduan instan (*Smart Hint*) kepada kasir saat menginput harga jual offline agar transaksi tidak pernah dijual di bawah harga modal kloter aktif.

---

## 2. Arsitektur Teknologi dan Infrastruktur

Sistem dibangun menggunakan arsitektur **Monorepo** modern yang efisien, ringan, dan dapat dijalankan secara mandiri (*self-hosted* pada jaringan LAN maupun server cloud Ubuntu Linux):

* **Monorepo Manager**: npm workspaces (`server` dan `web`).
* **Backend Runtime**:
  - Node.js LTS + TypeScript (ES Modules).
  - Framework HTTP: Express.js.
  - Driver Basis Data: `better-sqlite3` dengan konfigurasi kinerja tinggi:
    - `journal_mode = WAL` (Write-Ahead Logging untuk konkurensi tinggi antara pembaca dan penulis).
    - `foreign_keys = ON` (Integritas referensial ketat).
    - `synchronous = NORMAL` dan `cache_size = -64000` (64 MB in-memory cache).
    - `busy_timeout = 5000` (Mencegah database locked error pada akses bersamaan).
  - ORM & Schema Migration: **Drizzle ORM** + auto-migration runner saat server startup.
  - Autentikasi: Sesi berbasis cookie terenkripsi (`express-session` dengan `better-sqlite3-session-store`) dan hashing password `bcryptjs`.
  - Mesin Parsing PDF: `pdfjs-dist` / `pdf-parse` yang diekstrak secara asinkron.
  - Logging: `pino` (stream konsol dan berkas log di `data/logs/app.log`).
* **Frontend Web**:
  - Vue 3 (Composition API dengan `<script setup lang="ts">`).
  - Bundler: Vite (dengan konfigurasi proxy `/api` ke Express backend).
  - State Management: Pinia.
  - Routing: Vue Router 4 dengan navigation guards (`requiresAuth`).
  - Desain & Gaya: Tailwind CSS v3.
  - Ikonografi: `lucide-vue-next` (komponen SVG semantik, zero unicode raw characters).
* **Testing & Quality Assurance**:
  - Test Runner: **Vitest** (mencakup unit testing parser, auth, CRUD batch, engine stok, dan perhitungan HPP FIFO).
  - Code Quality: ESLint 9 (Flat config) dan Prettier.

---

## 3. Skema Basis Data Relasional

Basis data SQLite (`data/app.db`) dirancang dengan 13 tabel relasional yang saling terhubung:

```
 users
   │
   ├──< batches ──< orders ──< order_items
   │                  │             │ (stock_batch_id)
   │                  │             v
   │                  ├──< scan_logs  stock_batch_items >── stock_batches
   │                  │                   │                     │
   │                  v                   v                     │ (created_by)
   ├──< offline_orders ──< offline_order_items                  v
   │          │                           │                   users
   │          v                           v
   │      customers                    products >── product_categories
   │          │                           │   │
   │          └───────────────────────────┤   └──< stock_mutations
   │                                      │
   │                                      └─── product_cogs
   │
   └── system_settings
```

### Rincian Tabel dan Fungsinya:

1. **`users`**:
   - Menyimpan akun pengguna dengan peran (`role`: `admin` atau `operator`).
   - Otentikasi kata sandi menggunakan hash bcrypt.
2. **`batches`**:
   - Menyimpan riwayat berkas PDF label resi pengiriman yang diunggah dari TikTok Shop.
   - Kolom kunci: `name` (jam/kode batch, misal `15.51`), `source_filename`, `pdf_path`, `total_orders`, `uploaded_at`, `created_by`.
3. **`orders`**:
   - Menyimpan transaksi pesanan online TikTok Shop hasil ekstraksi berkas PDF.
   - Kolom kunci: `batch_id`, `resi` (No. Resi J&T unik), `order_id` (**strictly 18 digit teks**), `courier` (J&T Express), `service` (EZ/NDD/ECO), `is_cod`, `recipient_name`, `recipient_phone`, `recipient_address`, `status` (`menunggu_dikemas`, `dikemas`, `dikirim`, `dibatalkan`), `is_packed`, `packed_at`, `is_shipped`, `shipped_at`, `needs_review`.
4. **`order_items`**:
   - Baris produk yang dipesan dalam satu resi online.
   - Kolom kunci: `order_id`, `product_name`, `sku`, `seller_sku` (kode SKU toko yang cocok dengan master), `qty`, `cogs_unit_fifo` (modal kloter yang dibebankan), `stock_batch_id`.
5. **`scan_logs`**:
   - Audit trail setiap aktivitas scan barcode resi di meja gudang.
   - Kolom kunci: `order_id`, `resi_scanned`, `mode` (`packing` / `pengiriman`), `result` (`ok`, `duplikat`, `tidak_ditemukan`, `status_tidak_valid`), `user_id`, `scanned_at`.
6. **`product_categories`**:
   - Master kategori produk (misal: Gamis, Celana, Setelan Jaket, Ponco, Rok).
7. **`products`**:
   - Master data katalog barang.
   - Kolom kunci: `seller_sku` (SKU unik acuan inventaris), `sku_temp` (alias hasil deteksi label jika ada perbedaan penamaan), `name`, `category_id`, `image_url`, `label_color`, `min_stock` (batas batas minimum/safety stock), `max_stock`.
8. **`stock_batches`**:
   - Induk kloter penerimaan stok barang dari konveksi/vendor.
   - Kolom kunci: `batch_code` (Kode unik kloter, misal `BATCH-202611-001`), `notes`, `created_by`, `created_at`.
9. **`stock_batch_items`**:
   - Rincian barang masuk per kloter beserta rincian biaya produksinya.
   - Kolom kunci: `stock_batch_id`, `product_id`, `seller_sku`, `qty` (kuantitas awal masuk), `remaining_qty` (sisa unit kloter yang belum terjual, dipotong bertahap oleh engine FIFO), `cogs_bahan_utama`, `cogs_aksesori`, `cogs_kemasan`, `cogs_tenaga_kerja`, `cogs_overhead`, `cogs_total`, `target_price`, `tiktok_fee_percent`.
10. **`stock_mutations`**:
    - Catatan penyesuaian pengurangan stok non-penjualan.
    - Kolom kunci: `seller_sku`, `type` (`barang_rusak`, `barang_hilang`, `selisih_kurang`), `qty`, `notes` (alasan mutasi wajib diisi), `created_by`, `created_at`.
11. **`customers`**:
    - Master basis data pelanggan omnichannel (offline kasir dan online penerima pesanan).
    - Kolom kunci: `name`, `phone`, `email`, `address`, `channel` (`offline`, `online`, `omnichannel`), `notes`.
12. **`offline_orders`**:
    - Transaksi penjualan offline (kasir langsung di toko).
    - Kolom kunci: `order_no` (Nomor nota unik), `order_date`, `customer_id`, `customer_name`, `customer_phone`, `notes`, `status` (`selesai`, `dibatalkan`, dll.), `created_by`, `created_at`.
13. **`offline_order_items`**:
    - Baris barang yang dibeli pada transaksi offline.
    - Kolom kunci: `offline_order_id`, `product_id`, `seller_sku`, `product_name`, `qty`, `price` (harga jual satuan aktual yang disepakati/dibayar), `cogs_unit_fifo` (modal FIFO yang terpotong), `stock_batch_id`.
14. **`product_cogs`**:
    - Template acuan Master HPP per produk.
    - Kolom kunci: `product_id`, `bahan_utama`, `aksesori`, `kemasan`, `tenaga_kerja`, `overhead`, `target_price`, `tiktok_fee_percent` (default 25%), `target_margin_percent` (default 40%).
15. **`system_settings`**:
    - Pengaturan global sistem berupa pasangan key-value, termasuk pengaturan `stock_cut_off_date` untuk stock opname.

---

## 4. Tujuh Siklus Alur Bisnis Utama (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           1. MASTER DATA & HPP                              │
│         Definisikan SKU, Kategori, Komponen Biaya Acuan & Target 40%        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    2. PENGADAAN & STOK MASUK (INBOUND)                      │
│        Barang Datang Konveksi ──> Buat Batch ──> Catat Qty & HPP Kloter     │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │                                       │
┌──────────────────▼─────────────────┐   ┌─────────────────▼──────────────────┐
│        3. PENJUALAN ONLINE         │   │        4. PENJUALAN OFFLINE        │
│   Cetak PDF Resi J&T TikTok Shop   │   │   Kasir Toko Input Pesanan Manual  │
│                 │                  │   │                 │                  │
│   Upload PDF & Parsing Otomatis    │   │   Pilih SKU & Smart Hint HPP FIFO  │
│                 │                  │   │                 │                  │
│   Order Masuk "Menunggu Dikemas"   │   │   Input Harga Jual Aktual & Qty    │
└──────────────────┬─────────────────┘   └─────────────────┬──────────────────┘
                   │                                       │
                   │ (Alokasi Stok & Potong Kloter FIFO)   │
                   └───────────────────┬───────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    5. OPERASIONAL GUDANG & FULFILLMENT                      │
│        Scan Barcode Resi Mode PACKING  ──> Status Pesanan "Dikemas"         │
│        Scan Barcode Resi Mode SHIPPING ──> Status Pesanan "Dikirim"         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                6. PENGENDALIAN STOK & STOCK OPNAME (CUT-OFF)                │
│    Pantau Sisa Rak (Stockout/Understock) & Catat Mutasi Barang Hilang/Rusak │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│             7. REALISASI LABA RUGI & PELAPORAN BISNIS (COGS)                │
│   Realisasi Offline Riil vs Estimasi Resi Online ──> Komparasi FIFO vs MA   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Siklus 1: Master Data Produk dan Biaya Standar (Master HPP)
1. Admin mendaftarkan kategori pakaian pada menu `/products` (misalnya: Celana, Setelan Jaket, Gamis, Ponco).
2. Admin mendaftarkan produk dengan menetapkan **Seller SKU** resmi (misal: `JAS-PRIA-HITAM-XL`), nama produk, warna label pembeda, foto, serta batas stok pengaman (`min_stock` dan `max_stock`).
3. Admin menyusun struktur biaya acuan pada menu `/cogs` Tab 1 (**Master Acuan & Simulasi**):
   - Komponen Bahan Langsung: Bahan Utama (Kain), Aksesori (Kancing/Resleting), Kemasan (Plastik/Kardus).
   - Biaya Konversi: Tenaga Kerja Langsung (Ongkos Jahit/Potong) dan Overhead Operasional Pabrik (Listrik, Benang, Penyusutan Mesin).
   - Menetapkan Target Harga Jual dan Margin Kotor Target (standar bisnis: minimal 40%).
   - Menetapkan acuan potongan komisi marketplace (standar TikTok Shop: 25%).
4. Sistem menghitung estimasi keuntungan bersih (*Net Profit Target*) dan rumus simulasi harga ideal (`IF Target Margin 40%`).

---

### Siklus 2: Pengadaan dan Stok Masuk Berbasis Kloter (Inbound Batch)
1. Setiap kali barang selesai diproduksi oleh konveksi atau tiba dari supplier, barang tidak boleh dimasukkan sembarangan ke rak tanpa dokumen kloter.
2. Petugas gudang/admin membuka menu `/stock` atau `/cogs` Tab 2 lalu menekan tombol `+ Input Stok Masuk`.
3. Admin memasukkan:
   - **Kode Batch unik** (misal: `BATCH-202611-002`).
   - Tanggal kloter masuk dan catatan (nama konveksi/vendor).
   - Daftar SKU yang masuk beserta jumlah kuantitas (`qty`).
   - Nilai HPP per unit untuk kloter tersebut. Sistem secara otomatis memuat angka standar dari Master HPP, namun admin dapat menyesuaikannya jika kloter tersebut mengalami kenaikan harga kain atau ongkos jahit.
4. Saat disimpan:
   - Baris `stock_batch_items` dibuat dengan nilai `remaining_qty = qty`.
   - Total fisik gudang langsung bertambah.
   - Sisa unit kloter ini disiapkan untuk dipotong secara kronologis oleh mesin FIFO saat penjualan terjadi.

---

### Siklus 3: Penjualan Online TikTok Shop dan Parsing PDF Label Resi J&T
1. Pesanan masuk dari siaran langsung (*live streaming*) atau etalase TikTok Shop.
2. Admin mengunduh dokumen cetak label resi dalam format PDF dari portal TikTok Shop Seller Center. Dokumen ini biasanya diberi nama berkas berdasarkan jam unduh (contoh: `15.51.pdf` atau `11.05.pdf`).
3. Admin membuka menu `/upload` pada aplikasi dan mengunggah berkas PDF tersebut.
4. Mesin Parser (`server/src/parsers/jnt.ts`) membaca teks dan koordinat PDF:
   - **No. Resi J&T** (biasanya diawali huruf `JX...` atau `JP...`).
   - **Order ID TikTok** (**strictly 18 digit teks**, wajib diproses sebagai string untuk menghindari degradasi presisi integer JavaScript).
   - Layanan pengiriman (EZ, NDD, ECO), status COD, berat paket, tanggal pengiriman.
   - Identitas penerima: nama, nomor telepon, dan pembersihan alamat otomatis (menghapus koma/spasi berlebih).
   - Baris barang: nama barang, SKU marketplace, Seller SKU toko, kuantitas.
   - Penanganan khusus: mampu mengekstrak pesanan multi-halaman (1 pesanan yang memiliki banyak baris produk pada lembar terpisah).
5. Mesin melakukan **Cek Duplikasi**: Jika nomor resi sudah pernah tersimpan dari batch upload sebelumnya, resi tersebut ditandai agar tidak terjadi pencatatan ganda.
6. Admin meninjau pratinjau (*preview*) data, lalu menekan Simpan.
7. Data tersimpan di tabel `orders` dan `order_items`. Status awal adalah `menunggu_dikemas`.
8. Stok gudang pada menu `/stock` otomatis mengalokasikan kuantitas tersebut ke kolom *Menunggu Dikemas*, sehingga sisa stok siap jual langsung berkurang.

---

### Siklus 4: Penjualan Offline (Kasir) dan Smart Hint Modal FIFO
1. Pelanggan datang langsung ke toko fisik, gerai bazar, atau memesan via WhatsApp/telepon langsung ke kasir.
2. Kasir membuka menu `/orders` (**Semua Pesanan**) dan menekan tombol `+ Input Pesanan Offline`.
3. Kasir memilih nama pelanggan (dapat memilih dari basis data pelanggan yang sudah ada atau membuat pelanggan baru).
4. Kasir memilih produk menggunakan komponen pencarian SKU cerdas (`SearchSelect.vue` yang dilengkapi fitur teleportasi dan auto-flip agar tidak tenggelam di layar).
5. **Fitur Smart Hint HPP FIFO**:
   - Begitu kasir memilih SKU, sistem langsung melakukan kalkulasi real-time ke backend (`/api/cogs/fifo-hint/:sku`) untuk melihat harga modal kloter tertua yang sedang aktif di rak.
   - Di bawah input harga jual, muncul teks panduan: `HPP: Rp XX.XXX (Modal Kloter Aktif: BATCH-XXXX)`.
   - Hal ini mencegah kasir memberikan diskon berlebihan yang mengakibatkan penjualan rugi (di bawah HPP modal).
6. Kasir memasukkan harga jual kesepakatan dan kuantitas barang.
7. Saat disimpan:
   - Pesanan tersimpan di tabel `offline_orders` dan `offline_order_items`.
   - Stok fisik langsung terpotong.
   - Mesin FIFO langsung memotong `remaining_qty` pada kloter batch tertua yang masih tersedia dan mengunci nilai `cogs_unit_fifo` pada baris transaksi.
   - Pendapatan offline diakui 100% sebagai omzet riil tanpa potongan komisi pihak ketiga.

---

### Siklus 5: Operasional Gudang dan Barcode Scanning (Packing & Kirim)
Operasional fulfillment di lantai gudang menggunakan barcode scanner fisik USB yang bekerja seperti keyboard (*keyboard wedge*):

1. **Tahap 1: Pengemasan (Mode Packing)**:
   - Petugas packing mengambil lembar fisik resi yang telah dicetak beserta produk dari rak.
   - Petugas membuka menu `/scan` dan memilih mode **Packing**.
   - Petugas memindai (*scan*) barcode resi fisik pada paket.
   - **Validasi Sistem**:
     - Sistem memvalidasi keberadaan resi di database.
     - Jika resi ditemukan dan belum dikemas: Sistem mengeluarkan nada suara sukses, menampilkan rincian barang (SKU, nama produk, dan jumlah yang wajib dimasukkan ke paket), memperbarui status order menjadi `dikemas` (`is_packed = true`, mencatat `packed_at` dan `packed_by`), serta mencatat log di tabel `scan_logs`.
     - Jika resi sudah pernah discan sebelumnya: Sistem mengeluarkan bunyi peringatan dan notifikasi tebal bertuliskan **Duplikat Scan**, mencegah barang yang sama diproses dua kali.
     - Jika resi tidak ditemukan dalam sistem: Sistem mengeluarkan bunyi peringatan gagal dan meminta petugas memeriksa apakah file PDF batch resi tersebut sudah diupload oleh admin.
   - Paket yang selesai dikemas ditaruh di keranjang/area siap kirim.

2. **Tahap 2: Serah Terima Ekspedisi (Mode Shipping / Pengiriman)**:
   - Kurir J&T Express tiba di gudang untuk melakukan penjemputan paket (*pickup*).
   - Petugas gudang mengubah mode di menu `/scan` menjadi **Pengiriman**.
   - Setiap paket yang akan dimasukkan ke karung kurir discan kembali barcode resinya satu per satu.
   - **Validasi Sistem**:
     - Sistem memastikan paket telah berstatus `dikemas`. Jika paket belum pernah discan packing, sistem memberi peringatan agar petugas memeriksa fisik paket terlebih dahulu.
     - Sistem memperbarui status pesanan menjadi `dikirim` (`is_shipped = true`, mencatat `shipped_at` dan `shipped_by`), dan mencatat log serah terima kurir.
   - Layar scan menyajikan counter real-time: Total Scan, Sukses, Duplikat, Gagal, serta sisa paket yang belum terkirim pada hari tersebut.

---

### Siklus 6: Pengendalian Inventaris, Mutasi, dan Cut-Off Stock Opname
1. **Pemantauan Stok Real-Time**:
   - Menu `/stock` menyajikan status stok seluruh SKU yang dihitung dinamis menggunakan algoritma *Single-Pass Hash Map Aggregation*.
   - Status visual:
     - **Stockout** (Merah Pekat): Stok fisik = 0 pcs.
     - **Understock** (Kuning): Stok fisik di bawah batas minimum (`stok <= min_stock`). Sinyal bagi tim produksi untuk segera membuat kloter baru.
     - **Normal** (Hijau): Stok aman berada di antara batas minimum dan maksimum.
     - **Overstock** (Biru): Stok melebihi kapasitas rak (`stok > max_stock`).
2. **Pencatatan Mutasi Barang (Pengurangan Non-Penjualan)**:
   - Jika saat operasional ditemukan baju rusak (cacat jahitan, kain sobek) atau hilang, admin menekan tombol `+ Mutasi Stok`.
   - Admin memilih SKU, tipe mutasi (`barang_rusak`, `barang_hilang`, `selisih_kurang`), jumlah unit, dan **catatan wajib** (misal: "Kain robek saat proses packing").
   - Mutasi ini mengurangi stok fisik gudang secara transparan tanpa mengotori data penjualan.
3. **Mekanisme Cut-Off Stock Opname**:
   - Pada saat audit inventaris berkala (misal akhir bulan), admin menghitung ulang seluruh stok fisik di rak.
   - Sistem menyediakan fitur **Tanggal Cut-Off Opname** (`stock_cut_off_date`):
     - Admin menetapkan tanggal dan jam cut-off.
     - Admin menginput saldo stok awal baru melalui kloter batch baru per tanggal tersebut.
     - Seluruh transaksi penjualan dan resi sebelum tanggal cut-off tidak akan lagi mengurangi angka stok baru, namun riwayat historis penjualan dan data pelanggan masa lalu **tetap utuh tersimpan** dan tidak terhapus.

---

### Siklus 7: Engine HPP FIFO, Moving Average, dan Realisasi Laba Rugi
1. Setiap unit produk yang terjual (baik melalui resi online maupun nota kasir offline) harus diperhitungkan beban modal produksinya.
2. **Alokasi Modal FIFO**:
   - Sistem mencari kloter tertua dari SKU tersebut yang nilai `remaining_qty`-nya masih lebih dari 0.
   - Nilai HPP dari kloter tersebut dicatat sebagai `cogs_unit_fifo`.
   - Nilai `remaining_qty` kloter tersebut dikurangi sejumlah unit yang terjual.
   - Jika satu pesanan membutuhkan unit yang melebihi sisa kloter pertama, sistem memecah alokasi secara berurutan ke kloter berikutnya (*split allocation*).
3. **Menu Kalkulator HPP (`/cogs`) Tab 3: Realisasi Laba Rugi**:
   - Admin dapat memilih filter periode tanggal (*Hari Ini*, *7 Hari*, *Bulan Ini*, *Semua*, atau rentang kustom).
   - **Filter Sumber Penjualan**:
     - **Offline**: Menghitung omzet riil dari harga jual transaksi kasir dikurangi HPP FIFO kloter yang terjual. Angka laba bersih adalah **100% realisasi nyata**.
     - **Online**: Menampilkan jumlah pcs yang telah beredar via resi logistik fisik. Angka omzet nominal ditandai berstatus *Data belum tersedia* karena menunggu sinkronisasi API TikTok Shop langsung.
     - **Semua (Gabungan)**: Menggabungkan volume seluruh saluran.
   - **Komparasi Efek Akuntansi**:
     - Sistem membandingkan nilai beban pokok penjualan terjual dengan metode FIFO vs Moving Average, sehingga manajemen mengetahui efisiensi modal antara batch lama vs batch baru.
   - **Analisis Variance vs Target**:
     - Menghitung apakah laba aktual berada di atas atau di bawah target laba standar (target margin 40%).

---

## 5. Struktur Modul dan Halaman Antarmuka (Frontend Views)

Aplikasi memiliki 11 tampilan halaman utama yang diakses melalui bilah sisi (*Sidebar*) navigasi:

| Rute URL | Komponen View | Fungsi dan Alur Operasional Utama |
|---|---|---|
| `/dashboard` | `DashboardView.vue` | **Dasbor Eksekutif Bisnis**: Ringkasan KPI omzet gabungan, grafik garis tren penjualan harian/mingguan, grafik kesehatan stok gudang, daftar produk terlaris (*best seller*), dan performa pengemasan. |
| `/orders` | `AllOrdersView.vue` | **Semua Pesanan (Omnichannel)**: Tabel menyeluruh pesanan online dan offline. Dilengkapi filter saluran (Semua, Online, Offline), status order, tanggal, pencarian global, tombol batal order, dan modal input pesanan offline. |
| `/printed-orders` | `OrdersView.vue` | **Resi Tercetak (Khusus Online)**: Khusus melacak pesanan dari upload PDF TikTok. Dilengkapi filter per jam batch upload PDF, filter status packing/kirim, identifikasi pesanan multi-halaman, dan status review. |
| `/scan` | `ScanView.vue` | **Terminal Barcode Scanner**: Antarmuka meja gudang untuk scan barcode fisik dengan input cepat. Memiliki toggle mode **Packing** dan **Pengiriman**, audio beeps, visual badge duplikat, dan log sesi real-time. |
| `/products` | `ProductsView.vue` | **Master Produk & SKU**: Manajemen katalog pakaian, penentuan safety stock (`min_stock`/`max_stock`), kategori produk, warna label, dan pemetaan alias SKU (`sku_temp`). |
| `/stock` | `StockView.vue` | **Manajemen Inventaris Gudang**: Monitoring stok fisik di rak, indikator *Stockout/Understock*, tombol input stok masuk kloter baru, tombol mutasi barang rusak/hilang, dan pengaturan tanggal cut-off opname. |
| `/cogs` | `CogsCalculatorView.vue` | **Kalkulator HPP & Realisasi Laba Rugi**: Terdiri dari 3 tab terpadu: (1) Master Biaya Acuan & Simulasi Sandbox, (2) Riwayat Kloter HPP Akordion per SKU dengan pelacakan FIFO, dan (3) Laporan Realisasi Laba Rugi riil vs target. |
| `/customers` | `CustomersView.vue` | **CRM & Basis Data Pelanggan**: Data kontak pelanggan offline dan online, akumulasi total belanja, riwayat frekuensi pemesanan, dan sebaran wilayah pengiriman. |
| `/upload` | `UploadView.vue` | **Unggah Berkas Label Resi PDF**: Area drag-and-drop file PDF cetak label resi TikTok Shop J&T, parsing data otomatis, pratinjau tabel, dan deteksi resi ganda. |
| `/export` | `ExportView.vue` | **Pusat Ekspor Laporan CSV**: Mengunduh berkas laporan spreadsheet (Pesanan, Inventaris Stok, Master Produk, Log Barcode Scan, Laba Rugi) berformat CSV UTF-8 BOM. |
| `/login` | `LoginView.vue` | **Autentikasi Pengguna**: Formulir login pengguna dengan perlindungan brute-force dan penanganan pengalihan rute aman. |

---

## 6. Algoritma dan Logika Bisnis Khusus

### Algoritma Perhitungan Stok O(N + M) Single-Pass Hash Map
* **Masalah Terdahulu**: Loop bersarang antara seluruh produk ($P$) terhadap seluruh batch ($B$), pesanan online ($O$), pesanan offline ($Off$), dan mutasi ($M$) yang menjalankan pencocokan regex berulang kali ($O(P \times (B + O + Off + M))$), menyebabkan freeze pada database besar.
* **Solusi Terpasang**:
  1. Seluruh master produk dan alias dipetakan ke dalam `Map<string, number>` ($O(P)$).
  2. Data batch, mutasi, pesanan online, dan pesanan offline masing-masing hanya di-loop **tepat 1 kali** ($O(B + O + Off + M)$).
  3. Kuantitas diakumulasikan ke dalam struktur `SkuAccumulator` per produk via akses instan $O(1)$.
  4. Rumus stok akhir:
     $$\text{Stok Tersedia} = \text{Total Inbound Masuk} - \text{Pesanan Online Aktif} - \text{Pesanan Offline} - \text{Mutasi Keluar}$$
  5. Kecepatan kalkulasi meningkat drastis dari 3–5 detik menjadi **< 16 milidetik**.

### Resolusi SKU Cerdas dan Strict Exact Matching
* Untuk mencegah kesalahan dobel potong produk (*fuzzy matching error* pada SKU dengan karakter mirip seperti `PNC-Hitam` dan `CLN-Hitam`):
  * Pencocokan fuzzy HANYA dijalankan sekali pada tahap upload PDF di `batchService.ts`. Hasil SKU yang teridentifikasi disimpan permanen di `order_items.seller_sku`.
  * Seluruh perhitungan stok, mutasi, dan FIFO di backend menggunakan **Strict Exact Match (Case-Insensitive & Whitespace Trimmed)**. Risiko salah potong antar produk adalah **0%**.

### Alokasi Beban Pokok Penjualan FIFO (First-In, First-Out)
* Setiap kloter barang masuk memiliki catatan `remaining_qty`.
* Saat barang keluar terjual:
  ```
  Pesanan Terjual: N unit
  Ambil kloter tertua dengan remaining_qty > 0:
    Jika remaining_qty >= N:
      remaining_qty -= N
      Catat modal kloter ini ke order_item
    Jika remaining_qty < N:
      Sisa unit = N - remaining_qty
      remaining_qty = 0 (Kloter Habis Terjual)
      Lanjutkan pemotongan ke kloter berikutnya untuk Sisa unit
  ```
* Status kloter pada antarmuka ditampilkan secara informatif:
  - `Sedang Terpotong FIFO (Aktif)`: Kloter tertua yang saat ini menjadi sumber alokasi unit.
  - `Antrean Kloter Berikutnya`: Kloter aktif yang siap dipotong jika kloter sebelumnya habis.
  - `Habis Terjual`: Kloter yang `remaining_qty`-nya telah mencapai 0 pcs.

### Komparasi Akuntansi: FIFO vs Moving Average
* **FIFO Total Valuation**:
  $$\text{Valuasi FIFO} = \sum (\text{remaining\_qty} \times \text{cogs\_total kloter masing-masing})$$
* **Moving Average Unit Cost**:
  $$\text{HPP MA per unit} = \frac{\text{Total Nilai Sisa Seluruh Kloter Aktif}}{\text{Total Sisa Unit Seluruh Kloter Aktif}}$$
* Laporan performa di `/cogs` menyajikan perbandingan kedua metode untuk mengukur dampak inflasi biaya bahan baku terhadap profitabilitas perusahaan.

### Kebijakan Pemisahan Data: Offline Riil vs Online Resi Fisik
* **Pesanan Offline**: Memiliki harga jual transaksi kasir aktual di lapangan. Angka omzet dan laba bersih dihitung secara 100% riil tanpa potongan biaya komisi platform.
* **Pesanan Online**: Menggunakan dokumen resi fisik pengiriman logistik TikTok Shop J&T. Nilai omzet riil yang dibayar konsumen (setelah diskon toko, subsidi TikTok, dan potongan komisi settlement) saat ini belum tersedia di database karena belum terhubung langsung ke API resmi TikTok Shop Seller Partner. Oleh karena itu, pada filter Online, sistem secara jujur menampilkan status **"Data belum tersedia"** demi menjaga integritas data keuangan perusahaan.

---

## 7. Pedoman Standar UI/UX dan Copywriting Enterprise

Seluruh tampilan antarmuka pada proyek ini tunduk pada aturan ketat desain enterprise:

1. **Hirarki Visual 4 Tingkat Konsisten**:
   - **Tingkat 1**: Judul halaman dan tombol aksi utama (`Simulasi`, `Ekspor CSV`, refresh).
   - **Tingkat 2**: Tombol navigasi tab utama (jika halaman memiliki tab).
   - **Tingkat 3**: Kartu KPI ringkas (1 baris bersih, menyajikan metrik inti tanpa komponen mengambang).
   - **Tingkat 4**: Kontainer data tunggal yang menampung seluruh filter dan tabel di dalamnya. Dilarang membuat kartu-kartu filter terpisah yang bertumpuk.
2. **Copywriting Bersih Tanpa AI Slop**:
   - Dilarang menggunakan label bertele-tele atau gaya bahasa generatif AI.
   - Contoh penyederhanaan:
     - Gunakan label ringkas: **Semua**, **Offline**, **Online** (bukan `Pesanan Offline (100% Realisasi Riil)`).
     - Gunakan penghitung ringkas: `12 produk` (bukan `12 produk dalam laporan (Mode: Online)`).
     - Gunakan pesan objektif jika data belum terhubung: *Data belum tersedia. Menunggu integrasi API TikTok Shop untuk sinkronisasi harga jual.*
3. **Bebas Karakter Emoji**: Seluruh elemen UI, tombol, pesan notifikasi, dan dokumen teks **wajib bebas dari karakter emoji visual**. Gunakan komponen ikon SVG resmi dari pustaka `lucide-vue-next`.
4. **Tata Letak Responsif**:
   - Gunakan grid adaptif (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`) agar elemen kartu metrik tidak terpotong pada layar laptop (resolusi 1366x768) maupun saat sidebar aktif.
   - Dropdown pencarian yang melayang wajib menggunakan Vue `<Teleport to="body">` dan perhitungan koordinat fixed untuk mencegah menu terpotong kontainer modal.

---

## 8. Struktur Berkas Proyek dan Navigasi Kode

```text
E:\Coding\ERP-Sukma\tracking\
├── data/                               # Direktori runtime (di-gitignore)
│   ├── app.db                          # Basis data SQLite utama
│   ├── pdf/                            # Arsip berkas PDF label resi fisik
│   └── logs/                           # Berkas log aplikasi (app.log)
├── docs/                               # Dokumentasi sistem & sampel dokumen
│   ├── ALUR_BISNIS_DAN_SISTEM.md       # DOKUMEN INI (Rujukan Utama)
│   ├── perubahan-15-nov-2026.md        # Catatan audit & optimasi engine stok
│   └── 15.51.pdf                       # Berkas sampel resi J&T Express
├── server/                             # Modul Backend (Node.js + Express)
│   └── src/
│       ├── db/
│       │   ├── schema.ts               # Definisi skema tabel Drizzle ORM
│       │   ├── client.ts               # Inisialisasi better-sqlite3 & WAL
│       │   └── migrate.ts              # Migrasi otomatis dan backfill database
│       ├── parsers/
│       │   └── jnt.ts                  # Mesin ekstraksi teks PDF label resi J&T
│       ├── routes/                     # Definisi endpoint API Express
│       │   ├── auth.routes.ts          # /api/auth
│       │   ├── batch.routes.ts         # /api/batches (Upload & parsing resi)
│       │   ├── cogs.routes.ts          # /api/cogs (HPP, Batch HPP, Realisasi Laba)
│       │   ├── customer.routes.ts      # /api/customers
│       │   ├── dashboard.routes.ts     # /api/dashboard
│       │   ├── offlineOrder.routes.ts  # /api/offline-orders
│       │   ├── order.routes.ts         # /api/orders
│       │   ├── product.routes.ts       # /api/products
│       │   ├── scan.routes.ts          # /api/scan (Terminal barcode scanner)
│       │   └── stock.routes.ts         # /api/stock (Stok gudang & mutasi)
│       ├── services/                   # Logika bisnis inti sistem
│       │   ├── batchService.ts         # Logika penyimpanan & verifikasi PDF resi
│       │   ├── cogsService.ts          # Mesin HPP, FIFO batch, dan profitabilitas
│       │   ├── customerService.ts      # Layanan CRM & agregasi belanja pelanggan
│       │   ├── dashboardService.ts     # Layanan metrik BI & grafik dasbor
│       │   ├── offlineOrderService.ts  # Layanan transaksi kasir & Smart Hint FIFO
│       │   ├── productService.ts       # Layanan master katalog & pemetaan SKU
│       │   ├── scanService.ts          # Logika validasi barcode & anti-duplikat
│       │   └── stockService.ts         # Mesin kalkulasi stok O(N+M) & cut-off
│       └── index.ts                    # Entry point Express server & graceful shutdown
├── web/                                # Modul Frontend (Vue 3 + Vite)
│   └── src/
│       ├── api/client.ts               # HTTP client (fetch wrapper) dengan session cookie
│       ├── components/                 # Komponen antarmuka yang dapat digunakan ulang
│       │   ├── DateRangePicker.vue     # Pemilih rentang tanggal kalender
│       │   ├── Pagination.vue          # Komponen navigasi nomor halaman
│       │   ├── SearchSelect.vue        # Dropdown pencarian SKU dengan teleportasi body
│       │   └── Sidebar.vue             # Bilah navigasi menu utama
│       ├── router/index.ts             # Konfigurasi Vue Router & guard autentikasi
│       ├── stores/auth.ts              # Pinia store autentikasi pengguna
│       └── views/                      # Komponen halaman utama aplikasi (11 views)
├── tests/                              # Berkas pengujian unit Vitest
│   ├── batch.test.ts                   # Pengujian upload & deteksi duplikat PDF
│   ├── cogs.test.ts                    # Pengujian engine COGS, FIFO, dan margin
│   ├── erp.test.ts                     # Pengujian alur ERP produk & stok
│   ├── parser.test.ts                  # Pengujian ekstraksi label resi J&T
│   └── scan.test.ts                    # Pengujian validasi barcode scanner
├── package.json                        # Konfigurasi root npm workspaces
└── agent.md                            # Instruksi wajib bagi agen AI
```
