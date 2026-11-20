# Daftar Perintah (Commands) Proyek Resi Tracker

Dokumen ini memuat panduan ringkas seluruh perintah (*npm scripts*) yang tersedia di proyek **Resi Tracker** beserta deskripsi dan contoh penggunaannya.

---

## 1. Menjalankan Aplikasi

| Perintah | Deskripsi | Akses URL |
|---|---|---|
| `npm run dev` | Menjalankan **Backend (Express)** dan **Frontend (Vite)** secara bersamaan dengan fitur *hot-reload*. | `http://localhost:5173` |
| `npm run dev:server` | Menjalankan **HANYA Backend (BE)** dalam mode pengembangan dengan `tsx watch`. | `http://localhost:3000` |
| `npm run dev:web` | Menjalankan **HANYA Frontend (FE)** dalam mode pengembangan. Permintaan `/api` otomatis dialihkan ke port 3000. | `http://localhost:5173` |
| `npm start` | Menjalankan aplikasi dalam mode **Produksi** di 1 port (melayani API backend sekaligus antarmuka web statis). | `http://localhost:3000` |

---

## 2. Pengelolaan Database (SQLite + Drizzle ORM)

| Perintah | Deskripsi |
|---|---|
| `npm run db:reset` | **Reset Database Penuh**: Mengosongkan seluruh data tabel (`orders`, `order_items`, `batches`, `scan_logs`, `sessions`), menghapus file PDF upload di `data/pdf/`, dan membuat kembali akun admin default (`admin` / `admin123`). Bekerja otomatis baik saat server mati maupun saat server sedang berjalan. |
| `npm run db:migrate` | Menjalankan file migrasi SQL dari folder `server/drizzle/` ke `data/app.db`. *(Migrasi juga berjalan otomatis saat server start).* |
| `npm run db:generate` | Membuat (*generate*) file migrasi SQL baru jika ada perubahan struktur tabel di `server/src/db/schema.ts`. |
| `npm run seed:admin` | Membuat atau memperbarui user administrator: <br>• Default (`admin` / `admin123`): `npm run seed:admin` <br>• Kustom: `npm run seed:admin -- username password123` |

> **Catatan:** Skrip `npm run db:reset` dapat dijalankan kapan saja. Jika server sedang aktif di Windows, skrip akan mengosongkan tabel melalui koneksi SQLite (`better-sqlite3`) tanpa perlu mematikan server terlebih dahulu.

---

## 3. Kompilasi & Build

| Perintah | Deskripsi |
|---|---|
| `npm run build` | Mengompilasi frontend Vue lalu menyalin hasilnya ke folder `server/public/` agar backend dapat melayani seluruh aplikasi di satu port. |
| `npm run build:web` | HANYA mengompilasi frontend Vue ke folder `web/dist/`. |

---

## 4. Pengujian & Kualitas Kode

| Perintah | Deskripsi |
|---|---|
| `npm test` | Menjalankan pengujian unit dengan **Vitest** (termasuk verifikasi `order_id` 18-digit dan parser PDF `15.51.pdf`). |
| `npm run lint` | Memeriksa kepatuhan kode dan tipe data dengan **ESLint 9**. |

---

## 5. Ringkasan Kredensial Default

- **URL Aplikasi**: `http://localhost:3000`
- **Username**: `admin`
- **Password**: `admin123`
