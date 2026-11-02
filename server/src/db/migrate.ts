import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';
import { config } from '../config.js';
import fs from 'node:fs';

export function runMigrations() {
  if (!fs.existsSync(config.paths.migrationsDir)) {
    console.warn(`[db:migrate] Migrations folder "${config.paths.migrationsDir}" not found. Skipping migration.`);
    return;
  }

  console.log(`[db:migrate] Running migrations from "${config.paths.migrationsDir}"...`);
  migrate(db, { migrationsFolder: config.paths.migrationsDir });
  console.log('[db:migrate] Migrations completed successfully.');
}

// Run immediately if executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  try {
    runMigrations();
    process.exit(0);
  } catch (err) {
    console.error('[db:migrate] Migration failed:', err);
    process.exit(1);
  }
}
