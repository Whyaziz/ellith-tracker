import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';
import { config } from '../config.js';
import { product_categories } from './schema.js';
import fs from 'node:fs';

export const DEFAULT_PRODUCT_CATEGORIES = [
  'Celana',
  'Setelan Jaket',
  'Atasan Jaket',
  'Setelan Ponco',
  'Atasan Ponco',
  'Ponco Kepala 2',
  'Gamis',
  'Rok',
];

export function runMigrations() {
  if (!fs.existsSync(config.paths.migrationsDir)) {
    console.warn(`[db:migrate] Migrations folder "${config.paths.migrationsDir}" not found. Skipping migration.`);
    return;
  }

  console.log(`[db:migrate] Running migrations from "${config.paths.migrationsDir}"...`);
  migrate(db, { migrationsFolder: config.paths.migrationsDir });
  console.log('[db:migrate] Migrations completed successfully.');

  // Seed default product categories if empty
  try {
    const existing = db.select().from(product_categories).all();
    if (existing.length === 0) {
      console.log('[db:migrate] Seeding default product categories...');
      for (const catName of DEFAULT_PRODUCT_CATEGORIES) {
        db.insert(product_categories).values({ name: catName }).run();
      }
      console.log(`[db:migrate] Successfully seeded ${DEFAULT_PRODUCT_CATEGORIES.length} default categories.`);
    }
  } catch (err) {
    console.warn('[db:migrate] Note on seeding categories:', err);
  }
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
