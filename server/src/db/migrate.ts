import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from './client.js';
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

  // Ensure label_color column on products
  try {
    const productCols = sqlite.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>;
    if (productCols.length > 0 && !productCols.some((c) => c.name === 'label_color')) {
      console.log('[db:migrate] Adding column label_color to products table...');
      sqlite.prepare("ALTER TABLE products ADD COLUMN label_color text NOT NULL DEFAULT '#4f46e5'").run();
    }
  } catch (err) {
    console.warn('[db:migrate] Note on products label_color column:', err);
  }

  // Ensure photo_url column on customers
  try {
    const customerCols = sqlite.prepare("PRAGMA table_info(customers)").all() as Array<{ name: string }>;
    if (customerCols.length > 0 && !customerCols.some((c) => c.name === 'photo_url')) {
      console.log('[db:migrate] Adding column photo_url to customers table...');
      sqlite.prepare("ALTER TABLE customers ADD COLUMN photo_url text").run();
    }
  } catch (err) {
    console.warn('[db:migrate] Note on customers photo_url column:', err);
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
