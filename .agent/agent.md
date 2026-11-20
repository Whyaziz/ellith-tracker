# Instruksi Wajib Agen AI (agent.md)

Dokumen ini berisi instruksi dan aturan mutlak yang wajib dipatuhi oleh seluruh asisten kecerdasan buatan (AI Agent seperti Antigravity, Claude, Cursor, Copilot, ChatGPT, dan model lainnya) saat membaca, menganalisis, atau memodifikasi repositori **ERP Sukma / ELLITH Tracking**.

---

## 1. Perintah Wajib Utama: Baca Dokumen Alur Bisnis & Sistem

Setiap agen AI yang memulai sesi kerja atau menerima instruksi pada repositori ini **WAJIB MEMBACA DAN MEMAHAMI** dokumen rujukan utama berikut ini sebelum merumuskan rencana tindakan atau mengedit berkas apa pun:

* **Dokumen Rujukan Utama**: [`docs/ALUR_BISNIS_DAN_SISTEM.md`](file:///E:/Coding/ERP-Sukma/tracking/docs/ALUR_BISNIS_DAN_SISTEM.md)

Dokumen tersebut memuat detail lengkap tentang:
- 13 tabel basis data relasional SQLite Drizzle ORM.
- 7 siklus alur bisnis end-to-end (Master HPP, Stok Masuk Inbound, Penjualan Online TikTok Shop, Penjualan Offline Kasir, Barcode Scanning Gudang, Pengendalian Stok & Cut-Off, serta Engine Laba Rugi FIFO & Moving Average).
- 11 halaman antarmuka pengguna pada modul web frontend.
- Algoritma perhitungan stok O(N + M) dan alokasi modal kloter FIFO.

---

## 2. Prinsip dan Batasan Mutlak Operasional (Guardrails)

### A. Integritas Basis Data dan Keamanan Lingkungan
1. **Dilarang Menghapus Data Produksi**: Basis data lokal (`data/app.db`) telah disinkronkan dengan basis data server produksi. Jangan pernah menjalankan skrip drop table, truncate, atau penghapusan data massal tanpa konfirmasi pengguna.
2. **Skema Basis Data & Migrasi**:
   - Definisi skema tabel berada di [`server/src/db/schema.ts`](file:///E:/Coding/ERP-Sukma/tracking/server/src/db/schema.ts).
   - Skrip migrasi startup dan backfill berada di [`server/src/db/migrate.ts`](file:///E:/Coding/ERP-Sukma/tracking/server/src/db/migrate.ts).
   - Setiap penambahan kolom baru wajib menyertakan nilai default atau migrasi otomatis agar basis data yang ada tetap kompatibel.
3. **Penyimpanan Order ID**: Kolom `order_id` pesanan TikTok berukuran 18 digit angka. Kolom ini **wajib disimpan dan diproses sebagai teks (`text`)** di seluruh lapisan database, backend, dan frontend guna mencegah penurunan presisi integer JavaScript (angka di atas $2^{53} - 1$).

---

### B. Pemisahan Logika Saluran Penjualan (Offline vs Online)
1. **Saluran Offline**:
   - Sumber: Transaksi kasir langsung / WhatsApp via menu `/orders`.
   - Data memiliki nilai nominal harga jual aktual di lapangan (`offline_order_items.price`).
   - Angka pendapatan dan laba bersih dihitung **100% riil** dikurangi beban modal kloter FIFO tanpa potongan komisi pihak ketiga.
2. **Saluran Online**:
   - Sumber: Unggahan berkas PDF label pengiriman TikTok Shop kurir J&T Express via menu `/upload`.
   - Data saat ini baru mencatat dokumen resi fisik logistik (identitas penerima, SKU, dan volume pcs barang yang dikemas/dikirim).
   - Nilai transaksi finansial riil (harga bersih yang dibayar konsumen setelah diskon toko, subsidi marketplace, dan potongan komisi platform) belum tersedia di database karena **belum ada integrasi langsung dengan API resmi TikTok Shop Seller Partner**.
   - **Kebijakan Tampilan**: Pada filter pesanan online, dilarang merekayasa angka laba riil. Tampilkan status resmi:
     > **Data belum tersedia**  
     > *Data transaksi penjualan online belum tersedia. Menunggu integrasi API TikTok Shop untuk sinkronisasi harga jual.*

---

### C. Standar Desain UI/UX dan Copywriting
1. **Hirarki Visual 4 Tingkat Konsisten**:
   - Setiap halaman/tab wajib mengikuti struktur:
     - **Tingkat 1**: Judul halaman dan tombol aksi utama terpadu (`Simulasi`, `Ekspor CSV`, refresh).
     - **Tingkat 2**: Navigasi tab utama (jika halaman memiliki tab).
     - **Tingkat 3**: Kartu KPI ringkas 1 baris yang langsung terlihat di bawah tab.
     - **Tingkat 4**: Kontainer data inti tunggal. **Seluruh filter, pencarian, dan kontrol data wajib diletakkan di header atas kontainer ini**. Dilarang membuat kartu-kartu filter terpisah yang mengambang.
2. **Bebas AI Slop (Clean Copywriting)**:
   - Gunakan frasa profesional, padat, dan langsung pada intinya.
   - Contoh: Gunakan `Semua`, `Offline`, `Online` (bukan `Pesanan Offline (100% Realisasi Riil)`).
   - Gunakan format counter ringkas: `X produk` (bukan `X produk dalam laporan (Mode: Online)`).
   - Sederhanakan catatan sistem tanpa penekanan huruf tebal yang berlebihan.
3. **Bebas Karakter Emoji**: Seluruh elemen antarmuka, tombol, teks notifikasi, dan pesan sistem **wajib bebas dari karakter emoji visual**. Gunakan komponen ikon SVG semantik dari pustaka `lucide-vue-next`.
4. **Respon Layar & Teleportasi**:
   - Gunakan grid adaptif (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`) agar informasi tidak terpotong pada layar laptop (resolusi 1366x768).
   - Dropdown pencarian yang melayang wajib menggunakan Vue `<Teleport to="body">` dan penempatan fixed dengan auto-flip agar tidak tenggelam di dalam kontainer modal.

---

### D. Performa dan Algoritma Inventaris
1. **Pencocokan SKU**:
   - Dilarang menggunakan pencocokan substring/regex longgar (*fuzzy matching*) pada modul inventaris stok maupun HPP.
   - Seluruh pencocokan wajib menggunakan **Strict Exact Match** (`sku.trim().toLowerCase() === target.trim().toLowerCase()`) untuk mencegah kesalahan dobel potong produk.
2. **Kalkulasi Stok**:
   - Fungsi rekapitulasi stok pada [`server/src/services/stockService.ts`](file:///E:/Coding/ERP-Sukma/tracking/server/src/services/stockService.ts) wajib mempertahankan arsitektur **Single-Pass Hash Map Aggregation** berkecepatan $O(N + M)$ (< 16 milidetik). Jangan mengembalikan algoritma ke bentuk loop bersarang $O(N \times M)$.
3. **Alokasi Modal FIFO**:
   - Pengurangan modal kloter terjual wajib memotong kolom `remaining_qty` pada kloter batch tertua dari SKU terkait.

---

## 3. Disiplin Verifikasi & Pengujian Kode

Sebelum melaporkan pekerjaan selesai kepada pengguna, agen AI wajib menjalankan dua langkah pengujian berikut di lingkungan lokal:

1. **Pengujian Unit Otomatis (Vitest)**:
   ```bash
   npm test
   ```
   Pastikan seluruh test suite (minimal 46 pengujian) lulus 100% tanpa ada yang gagal (*0 failed*).
2. **Pengecekan Tipe TypeScript & Kompilasi Frontend**:
   ```bash
   npm run build:web
   ```
   Pastikan perintah `vue-tsc -b && vite build` selesai dengan kode keluar 0 (*exit code 0*) tanpa galat sintaks template, tag penutup yang salah, atau kesalahan tipe TypeScript.

---

## 4. Bahasa Komunikasi

Gunakan **Bahasa Indonesia** yang formal, jelas, dan profesional dalam setiap interaksi dan pelaporan kepada pengguna.
