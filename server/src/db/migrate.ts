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

  // Auto-populate / normalize label_color based on SKU and product name
  try {
    const colorMap: Record<string, string> = {
      'biru laut': '#0ea5e9',
      'sage': '#739072',
      'cream': '#c4a482',
      'violet': '#8b5cf6',
      'pink': '#ec4899',
      'hitam': '#1e293b',
      'army': '#4d7c0f',
      'navy': '#1e3a8a',
      'maroon': '#881337',
      'custom': '#6366f1',
    };

    const updateColorStmt = sqlite.prepare('UPDATE products SET label_color = ? WHERE id = ?');
    const existingProducts = sqlite.prepare('SELECT id, name, sku_temp FROM products').all() as Array<{
      id: number;
      name: string;
      sku_temp: string | null;
    }>;

    let updatedCount = 0;
    for (const p of existingProducts) {
      const combined = `${p.sku_temp || ''} ${p.name || ''}`.toLowerCase();
      for (const [key, colorHex] of Object.entries(colorMap)) {
        if (combined.includes(key)) {
          updateColorStmt.run(colorHex, p.id);
          updatedCount++;
          break;
        }
      }
    }
    if (updatedCount > 0) {
      console.log(`[db:migrate] Synchronized label_color for ${updatedCount} products based on SKU color.`);
    }
  } catch (err) {
    console.warn('[db:migrate] Note on normalizing product label colors:', err);
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
