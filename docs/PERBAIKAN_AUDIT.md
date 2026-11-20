# Perbaikan hasil audit ERP Sukma

| Area | Perubahan |
|---|---|
| Transaksi gudang dan kasir | Pembuatan batch stok dan nota offline menyiapkan rincian sebelum menyimpan header dan seluruh item dalam satu transaksi SQLite. Kegagalan saat menyimpan item membatalkan seluruh penulisan. |
| Pemindaian | Pemeriksaan status, pembaruan pesanan, dan pencatatan scan berjalan dalam transaksi dengan kunci tulis sejak awal. |
| Pembatalan scan | Undo memeriksa tahap terakhir dan riwayat sukses untuk pesanan serta mode terkait. Scan asal ditandai dibatalkan dan kejadian undo mencatat operator dari sesi. Antarmuka menampilkan kedua jenis riwayat tersebut. |
| Statistik | Antrean packing dan jumlah paket siap kirim mengecualikan pesanan batal. |
| Sesi | Produksi memerlukan SESSION_SECRET khusus dan mengirim cookie dengan atribut Secure. Siapkan HTTPS dan rahasia acak sebelum memulai server produksi. |
| Pelanggan | Saat ID tidak diberikan, pencocokan otomatis memerlukan nama yang unik dan nomor telepon yang cocok jika diisi. Jika ambigu, nota menyimpan informasi pembeli tanpa menautkan profil. |
| Tanggal | Form nota di halaman Semua Pesanan dan batas rentang tren dashboard menggunakan tanggal bisnis Asia/Jakarta. |
| Performa | Daftar batch membaca header dan rincian dengan dua kueri lalu mengelompokkan rincian berdasarkan ID batch. Volume data yang dibaca masih mengikuti jumlah batch. |
| HPP | Rute estimasi biaya memvalidasi tipe SKU. Cabang laporan gabungan mengikuti pemisahan kanal setelah respons khusus online. |
| Tes | Setiap berkas tes memakai direktori SQLite sementara dengan migrasi otomatis. Tes HPP menyiapkan produk beserta modalnya. Tes regresi mencakup undo setelah pengiriman dan log milik pesanan lain. |

## Verifikasi lokal

- Vitest lulus 47 dari 47 tes pada enam berkas.
- Pemeriksaan tipe server dan build produksi frontend berhasil.
- ESLint melaporkan nol galat dan delapan peringatan.
- Perilaku HTTPS di reverse proxy produksi dan latensi daftar batch pada volume produksi belum diukur.

## Perbaikan logika bisnis lanjutan

- **FIFO dan biaya rata-rata (1, 4, 9).** Setiap pengeluaran memakai kloter tertua yang masih memiliki saldo. Satu baris penjualan dapat memakai beberapa kloter. Nota menyimpan HPP FIFO rata-rata per unit hasil alokasi dan biaya rata-rata tertimbang saat transaksi. Pengeditan harga mempertahankan modal. Pengurangan kuantitas melepaskan alokasi terakhir terlebih dahulu. Perubahan header dan rincian nota berlangsung dalam satu transaksi.
- **Waktu pengeluaran.** Nota offline aktif memakai kloter saat dicatat. Pesanan online memakai kloter saat packing. Pembatalan atau penghapusan melepaskan alokasi milik transaksi tersebut. Mutasi pengurangan juga memakai kloter. Perubahan ini mengikuti perilaku pembatalan yang sudah ada untuk paket terkirim.
- **Realisasi per kanal (2, 6).** Filter online menghitung unit dari paket yang diproses. Filter gabungan menyertakan volume kedua kanal, sedangkan omzet, biaya terjual, harga rata-rata, dan laba riil berasal dari nota offline. Ekspor online menyediakan SKU dan volume.
- **Integritas paket (5).** Impor ulang dengan mode timpa melewati resi yang sudah diproses. Penyimpanan satu impor berlangsung dalam satu transaksi. Pengeditan manual rincian paket dikemas atau dikirim juga ditolak.
- **Opname (7).** HPP aktif dan valuasi menggunakan batas opname yang sama dengan penerimaan stok. Perubahan batas merekonsiliasi alokasi sejak batas yang terdampak dalam satu transaksi. Riwayat penerimaan tetap tersedia.
- **Target harga (8).** Target menggunakan margin kotor. Harga untuk target dihitung sebagai modal dibagi satu dikurangi fraksi margin. Evaluasi membandingkan hasil dengan persentase masing-masing SKU. Contoh: modal Rp100.000 dan target 40% menghasilkan harga Rp166.666,67.
- **Indikator gudang (10).** Sinyal restok menggunakan stok fisik. Saldo nol atau negatif adalah stockout, dan saldo positif tepat pada minimum adalah understock. Stok tersedia untuk penjualan tetap dihitung terpisah.

### Migrasi dan rekonsiliasi

Startup pertama memasang tabel alokasi dan merekonstruksi pemakaian kloter dari urutan kejadian yang tersimpan. Baris pengeluaran yang melampaui stok kloter memakai biaya master untuk kuantitas yang belum tercakup. Jika biaya master juga kosong, kontribusi biayanya nol. Nilai ini merupakan estimasi. Laporan HPP menampilkan jumlah unit offline tanpa alokasi kloter pada periode yang dipilih.

Migrasi diuji dua kali pada salinan sementara basis data lokal. SQLite melaporkan integritas baik, 418 baris pengeluaran, dan nol selisih antara saldo kloter dan penerimaan dikurangi alokasi. Dari 418 baris tersebut, 142 belum sepenuhnya tertutup kloter. Angka ini mencakup berbagai sumber pengeluaran dan bukan jumlah nota atau jumlah unit. Rekonsiliasi penerimaan lama, waktu transaksi, dan pemetaan SKU diperlukan sebelum memakai hasil historis sebagai angka final.
Verifikasi regresi lanjutan mencakup 50 tes pada tujuh berkas, termasuk penjualan lintas kloter, edit nota, perbandingan kanal, opname, dan impor ulang paket yang sudah dikemas.
