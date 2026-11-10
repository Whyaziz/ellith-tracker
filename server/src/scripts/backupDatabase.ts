import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export async function runBackup() {
  const startTime = Date.now();
  console.log('=== MEMULAI BACKUP DATABASE (OPTION 3: SINGLE OVERWRITE LATEST) ===');

  const dbPath = config.paths.dbPath;
  if (!fs.existsSync(dbPath)) {
    throw new Error(`File database tidak ditemukan di: ${dbPath}`);
  }

  const backupDir = config.paths.backupDir;
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const finalTarget = path.join(backupDir, 'app_latest.db');
  const tmpTarget = path.join(backupDir, 'app_latest.db.tmp');
  const metaTarget = path.join(backupDir, 'app_latest.json');

  if (fs.existsSync(tmpTarget)) {
    fs.unlinkSync(tmpTarget);
  }

  console.log(`[BACKUP] Membaca source database: ${dbPath}`);
  const sourceDb = new Database(dbPath, { readonly: true, fileMustExist: true });

  console.log(`[BACKUP] Menyimpan snapshot ke file sementara: ${tmpTarget}`);
  await sourceDb.backup(tmpTarget);
  sourceDb.close();

  // Atomically replace file final agar tidak pernah terjadi file corrupt saat proses penulisan
  fs.renameSync(tmpTarget, finalTarget);

  const stat = fs.statSync(finalTarget);
  const nowIso = new Date().toISOString();

  // Simpan metadata backup (waktu pembuatan dan ukuran)
  const meta = {
    updated_at: nowIso,
    size_bytes: stat.size,
    size_formatted: `${(stat.size / 1024).toFixed(1)} KB`,
    source_path: dbPath,
    target_path: finalTarget,
    duration_ms: Date.now() - startTime,
  };
  fs.writeFileSync(metaTarget, JSON.stringify(meta, null, 2), 'utf-8');

  console.log(`[BACKUP SUKSES] File backup terbaru berhasil disimpan:`);
  console.log(`  File    : ${finalTarget}`);
  console.log(`  Ukuran  : ${meta.size_formatted} (${stat.size} bytes)`);
  console.log(`  Waktu   : ${nowIso}`);
  console.log(`  Durasi  : ${meta.duration_ms} ms`);
  console.log('=== SELESAI ===\n');
}

runBackup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[BACKUP GAGAL] Terjadi kesalahan:', err);
    process.exit(1);
  });
