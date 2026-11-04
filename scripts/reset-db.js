import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const pdfDir = path.join(dataDir, 'pdf');
const dbPath = path.join(dataDir, 'app.db');

console.log('[db:reset] Memulai proses reset database...');

const dbFiles = ['app.db', 'app.db-wal', 'app.db-shm'];
let fileDeleted = false;

// 1. Coba hapus file fisik jika server sedang mati (tidak ada process lock)
try {
  let anyFileExists = false;
  for (const file of dbFiles) {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      anyFileExists = true;
      fs.rmSync(filePath, { force: true });
    }
  }
  fileDeleted = anyFileExists;
  if (fileDeleted) {
    console.log('[db:reset] Berhasil menghapus file database fisik.');
  }
} catch {
  // Jika file terkunci oleh server di Windows (EBUSY / EPERM)
  console.log('[db:reset] Catatan: File database sedang terkunci oleh server backend yang berjalan.');
  console.log('[db:reset] Menghapus data langsung melalui koneksi SQLite...');
}

// 2. Jika file tidak bisa dihapus fisik karena locked oleh server, bersihkan seluruh baris tabel
if (!fileDeleted && fs.existsSync(dbPath)) {
  try {
    const db = new Database(dbPath);
    db.pragma('foreign_keys = OFF');

    const tablesToClean = [
      'scan_logs',
      'order_items',
      'orders',
      'batches',
      'offline_order_items',
      'offline_orders',
      'stock_mutations',
      'stock_batch_items',
      'stock_batches',
      'products',
      'product_categories',
      'sessions',
      'users',
    ];

    for (const table of tablesToClean) {
      try {
        db.prepare(`DELETE FROM ${table}`).run();
      } catch {
        // Abaikan jika tabel belum ada
      }
    }

    try {
      db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${tablesToClean.map((t) => `'${t}'`).join(',')})`).run();
    } catch {
      // Abaikan jika sqlite_sequence belum ada
    }

    db.pragma('foreign_keys = ON');
    db.exec('VACUUM');
    db.close();

    console.log('[db:reset] Berhasil mengosongkan seluruh tabel data (orders, order_items, batches, scan_logs, users, sessions).');
  } catch (dbErr) {
    console.error(`[db:reset] Gagal mengosongkan tabel database: ${dbErr.message}`);
    process.exit(1);
  }
}

// 3. Bersihkan file PDF yang pernah di-upload di folder data/pdf
if (fs.existsSync(pdfDir)) {
  const pdfFiles = fs.readdirSync(pdfDir);
  let deletedPdfCount = 0;
  for (const file of pdfFiles) {
    if (file !== '.gitkeep') {
      try {
        fs.rmSync(path.join(pdfDir, file), { force: true });
        deletedPdfCount++;
      } catch {
        // Lewati jika file sedang di-lock
      }
    }
  }
  if (deletedPdfCount > 0) {
    console.log(`[db:reset] Berhasil menghapus ${deletedPdfCount} file PDF di folder data/pdf/.`);
  }
}

// 4. Jika file fisik tadi berhasil terhapus dari disk, jalankan migrasi ulang
if (fileDeleted) {
  console.log('\n[db:reset] Menjalankan migrasi database skema baru...');
  execSync('npm run db:migrate', { stdio: 'inherit', cwd: rootDir });
}

// 5. Inisialisasi ulang akun admin
console.log('\n[db:reset] Membuat ulang akun admin default...');
execSync('npm run seed:admin', { stdio: 'inherit', cwd: rootDir });

console.log('\n[db:reset] Selesai! Seluruh pesanan, batch, scan logs, dan file upload telah direset bersih.');
