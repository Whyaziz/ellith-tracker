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
Pada detail nota offline, tombol Edit harga jual memungkinkan kasir mengubah harga per baris dan melihat total sebelum menyimpan. Pembaruan hanya menulis kolom harga dan mendeteksi konflik jika harga sudah berubah sejak nota dibuka.

## Perbaikan alur operasional lintas modul

| Alur | Perubahan dan hasil yang diharapkan |
|---|---|
| Opname | Target dibandingkan dengan stok fisik per ID produk di dalam satu transaksi tulis. Dialog menampilkan reservasi dan stok tersedia. Koreksi dengan saldo awal kedaluwarsa ditolak jika stok belum mencapai target. Stok masuk, mutasi, dan target opname memakai unit pcs bulat. |
| SKU | Pencocokan memakai kode utama atau alias utuh. Penggantian SKU mempertahankan ID produk, menambahkan kode lama sebagai alias dan menyelaraskan referensi kode di kloter, nota, resi, mutasi serta alokasi untuk pemrosesan ulang cut-off. Alias yang berbenturan ditolak ketika disimpan. |
| Batch dan penghapusan | Jumlah resi mengikuti penambahan, pemindahan, dan penghapusan anggota melalui trigger SQLite. Migrasi menyelaraskan header lama. Penghapusan nota, resi, atau batch menjalankan seluruh penulisan database dalam satu transaksi. Penghapusan PDF berlangsung setelah transaksi berhasil dan memeriksa referensi dari batch lain. |
| Pelanggan dan status | Pemilihan pelanggan mengganti nomor telepon, termasuk jika kosong. Edit manual melepaskan pilihan profil. Pencocokan nota memakai nama, nomor yang tersedia, dan keunikan profil. CRM tetap menampilkan pembatalan dalam riwayat dan mengecualikannya dari total barang serta belanja. Daftar pesanan mengenali nama status offline lama maupun baru. |
| Resi dan scan | Metadata paket yang sudah diproses dapat dikoreksi. Rincian barang terkunci. Pembersihan tampilan scan menyimpan batas riwayat yang ditampilkan. Operator dapat menggunakan Batalkan scan terakhir dari detail resi selama bukti scan tersedia. |
| Tanggal dan ekspor | Daftar resi dan CSV memakai tanggal kirim, atau tanggal pembuatan dalam WIB jika tanggal kirim tidak tersedia. Pemilihan filter memulai permintaan baru; data lama langsung dilepas. Kegagalan menampilkan tindakan muat ulang. Respons lama tidak dapat menimpa permintaan terbaru. |
| Sesi dan HPP | Logout gagal mempertahankan status pengguna dan menampilkan pemberitahuan. Sesi yang sudah kedaluwarsa dapat ditutup dari UI. Saran harga mengambil harga target master HPP. Untuk nota susulan, tanggal nota menentukan periode penjualan dan waktu pencatatan menentukan modal; formulir menyampaikan aturan ini sebelum penyimpanan. |

### Hasil verifikasi

- 55 tes pada delapan berkas lulus. Regresi lintas modul mencakup dua permintaan opname, saldo fisik dengan reservasi, penggantian dan pencocokan SKU, rollback penghapusan, CRM, keanggotaan batch, rekonsiliasi header, dan satu tanggal acuan laporan.
- Tes scan memastikan undo tetap berhasil setelah tampilan riwayat dibersihkan. Bukti scan yang sudah dihapus secara permanen oleh versi lama tidak dapat dipulihkan oleh fitur ini.
- Pemeriksaan tipe server dan build frontend lulus. ESLint melaporkan nol galat dan tujuh peringatan.
- Uji Edge headless pada bundle frontend dengan API sintetis mencakup pergantian batch, kegagalan jaringan, percobaan ulang, respons terlambat, dan logout gagal. Jalankan setelah build dengan perintah `node scripts/test-export-browser.mjs`. Lokasi browser bisa ditetapkan melalui `BROWSER_EXECUTABLE`.
- Migrasi dijalankan dua kali pada salinan database lokal. Salinan itu sudah memiliki nol selisih header saat pemeriksaan dimulai dan hasilnya tetap nol. Pemulihan header yang sengaja dibuat salah diuji terpisah pada database sintetis.
