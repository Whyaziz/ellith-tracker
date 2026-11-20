import { installInventoryLedger } from './inventoryLedger.js';
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

  // Ensure system_settings table exists
  try {
    sqlite.prepare(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `).run();
  } catch (err) {
    console.warn('[db:migrate] Note on creating system_settings table:', err);
  }

  // Ensure COGS columns on stock_batch_items
  try {
    const batchItemCols = sqlite.prepare("PRAGMA table_info(stock_batch_items)").all() as Array<{ name: string }>;
    const colsToAdd = [
      { name: 'cogs_bahan_utama', type: 'REAL' },
      { name: 'cogs_aksesori', type: 'REAL' },
      { name: 'cogs_kemasan', type: 'REAL' },
      { name: 'cogs_tenaga_kerja', type: 'REAL' },
      { name: 'cogs_overhead', type: 'REAL' },
      { name: 'cogs_total', type: 'REAL' },
      { name: 'target_price', type: 'REAL' },
      { name: 'tiktok_fee_percent', type: 'REAL' },
      { name: 'remaining_qty', type: 'INTEGER' },
    ];
    for (const col of colsToAdd) {
      if (batchItemCols.length > 0 && !batchItemCols.some((c) => c.name === col.name)) {
        console.log(`[db:migrate] Adding column ${col.name} to stock_batch_items table...`);
        sqlite.prepare(`ALTER TABLE stock_batch_items ADD COLUMN ${col.name} ${col.type}`).run();
      }
    }
    // Backfill remaining_qty for existing records where it is NULL
    sqlite.prepare('UPDATE stock_batch_items SET remaining_qty = qty WHERE remaining_qty IS NULL').run();
  } catch (err) {
    console.warn('[db:migrate] Note on stock_batch_items COGS columns:', err);
  }

  // Ensure FIFO cost columns on order_items and offline_order_items
  try {
    const orderItemCols = sqlite.prepare("PRAGMA table_info(order_items)").all() as Array<{ name: string }>;
    if (!orderItemCols.some((c) => c.name === 'cogs_unit_fifo')) {
      sqlite.prepare('ALTER TABLE order_items ADD COLUMN cogs_unit_fifo REAL').run();
    }
    if (!orderItemCols.some((c) => c.name === 'stock_batch_id')) {
      sqlite.prepare('ALTER TABLE order_items ADD COLUMN stock_batch_id INTEGER').run();
    }

    const offlineItemCols = sqlite.prepare("PRAGMA table_info(offline_order_items)").all() as Array<{ name: string }>;
    if (!offlineItemCols.some((c) => c.name === 'cogs_unit_fifo')) {
      sqlite.prepare('ALTER TABLE offline_order_items ADD COLUMN cogs_unit_fifo REAL').run();
    }
    if (!offlineItemCols.some((c) => c.name === 'stock_batch_id')) {
      sqlite.prepare('ALTER TABLE offline_order_items ADD COLUMN stock_batch_id INTEGER').run();
    }
  } catch (err) {
    console.warn('[db:migrate] Note on order items FIFO columns:', err);
  }

  // Ensure product_cogs table exists
  try {
    sqlite.prepare(`
      CREATE TABLE IF NOT EXISTS product_cogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
        bahan_utama REAL NOT NULL DEFAULT 0,
        aksesori REAL NOT NULL DEFAULT 0,
        kemasan REAL NOT NULL DEFAULT 0,
        tenaga_kerja REAL NOT NULL DEFAULT 0,
        overhead REAL NOT NULL DEFAULT 0,
        target_price REAL NOT NULL DEFAULT 0,
        tiktok_fee_percent REAL NOT NULL DEFAULT 25,
        target_margin_percent REAL NOT NULL DEFAULT 40,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `).run();
    sqlite.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS product_cogs_product_id_idx ON product_cogs(product_id)`).run();
  } catch (err) {
    console.warn('[db:migrate] Note on creating product_cogs table:', err);
  }

  // Seed default product_cogs for products that don't have one yet
  try {
    const productsWithoutCogs = sqlite.prepare(`
      SELECT p.id, p.seller_sku, p.name
      FROM products p
      LEFT JOIN product_cogs c ON p.id = c.product_id
      WHERE c.id IS NULL
    `).all() as Array<{ id: number; seller_sku: string; name: string }>;

    if (productsWithoutCogs.length > 0) {
      console.log(`[db:migrate] Seeding default COGS for ${productsWithoutCogs.length} products...`);
      const insertCogs = sqlite.prepare(`
        INSERT INTO product_cogs (
          product_id, bahan_utama, aksesori, kemasan, tenaga_kerja, overhead, target_price, tiktok_fee_percent, target_margin_percent, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 40, ?)
      `);

      for (const p of productsWithoutCogs) {
        const s = `${p.seller_sku} ${p.name}`.toLowerCase();
        let bu = 15000;
        let aks = 3000;
        let kem = 2734;
        let tk = 3600;
        let ovh = 3520;
        let targetPrice = 50000;
        let tiktokFee = 25;
        let note = 'Baseline standar';

        if (s.includes('2 in 1') || s.includes('kl2-set') || s.includes('setelan ponco 2')) {
          // PC2-C Setelan Ponco K2
          bu = 42350;
          aks = 4454;
          kem = 2734;
          tk = 5370;
          ovh = 7520;
          targetPrice = 109900;
          tiktokFee = 30;
          note = 'Baseline Setelan Ponco K2 (PC2-C)';
        } else if (s.includes('kl2') || s.includes('ponco 2') || s.includes('ponco kepala 2')) {
          // PC2 Atasan Ponco K2
          bu = 28010;
          aks = 4454;
          kem = 2734;
          tk = 3600;
          ovh = 3520;
          targetPrice = 69000;
          tiktokFee = 25;
          note = 'Baseline Atasan Ponco K2 (PC2)';
        } else if (s.includes('pnc-set') || s.includes('setelan ponco')) {
          // PC1-C Setelan Ponco K1
          bu = 35840;
          aks = 4454;
          kem = 2734;
          tk = 3600;
          ovh = 3520;
          targetPrice = 79900;
          tiktokFee = 25;
          note = 'Baseline Setelan Ponco K1 (PC1-C)';
        } else if (s.includes('pnc') || s.includes('ponco')) {
          // PC1 Atasan Ponco K1
          bu = 21500;
          aks = 4454;
          kem = 2734;
          tk = 3600;
          ovh = 3520;
          targetPrice = 54900;
          tiktokFee = 25;
          note = 'Baseline Atasan Ponco K1 (PC1)';
        } else if (s.includes('jkt-set') || s.includes('setelan jaket')) {
          // JKT-C Stelan Jaket
          bu = 25740;
          aks = 4446;
          kem = 2734;
          tk = 3600;
          ovh = 3520;
          targetPrice = 59900;
          tiktokFee = 25;
          note = 'Baseline Stelan Jaket (JKT-C)';
        } else if (s.includes('jkt') || s.includes('jaket')) {
          // JKT Atasan Jaket
          bu = 15600;
          aks = 4446;
          kem = 2734;
          tk = 3600;
          ovh = 3520;
          targetPrice = 49900;
          tiktokFee = 30;
          note = 'Baseline Atasan Jaket (JKT)';
        } else if (s.includes('gms') || s.includes('gamis')) {
          // GMS Gamis
          bu = 39028;
          aks = 4454;
          kem = 2734;
          tk = 3600;
          ovh = 3520;
          targetPrice = 115000;
          tiktokFee = 25;
          note = 'Baseline Gamis (GMS)';
        } else if (s.includes('cln') || s.includes('celana')) {
          // CLN Celana
          bu = 7370;
          aks = 0;
          kem = 0;
          tk = 3450;
          ovh = 3520;
          targetPrice = 27000;
          tiktokFee = 25;
          note = 'Baseline Celana (CLN)';
        } else if (s.includes('rok')) {
          // ROK Rok
          bu = 12000;
          aks = 2000;
          kem = 2500;
          tk = 3500;
          ovh = 3500;
          targetPrice = 45000;
          tiktokFee = 25;
          note = 'Baseline Rok';
        }

        insertCogs.run(p.id, bu, aks, kem, tk, ovh, targetPrice, tiktokFee, note);
      }
      console.log(`[db:migrate] Successfully seeded COGS for ${productsWithoutCogs.length} products.`);
    }
  } catch (err) {
    console.warn('[db:migrate] Note on seeding product_cogs:', err);
  }

  // Backfill missing COGS on stock_batch_items from product_cogs
  try {
    // 1. Update from product_id match
    sqlite.prepare(`
      UPDATE stock_batch_items
      SET
        cogs_bahan_utama = (SELECT c.bahan_utama FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id),
        cogs_aksesori = (SELECT c.aksesori FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id),
        cogs_kemasan = (SELECT c.kemasan FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id),
        cogs_tenaga_kerja = (SELECT c.tenaga_kerja FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id),
        cogs_overhead = (SELECT c.overhead FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id),
        cogs_total = (SELECT (c.bahan_utama + c.aksesori + c.kemasan + c.tenaga_kerja + c.overhead) FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id),
        target_price = (SELECT c.target_price FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id),
        tiktok_fee_percent = (SELECT c.tiktok_fee_percent FROM product_cogs c WHERE c.product_id = stock_batch_items.product_id)
      WHERE product_id IS NOT NULL AND cogs_total IS NULL
    `).run();

    // 2. Fallback by normalized seller_sku match
    sqlite.prepare(`
      UPDATE stock_batch_items
      SET
        cogs_bahan_utama = (SELECT c.bahan_utama FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1),
        cogs_aksesori = (SELECT c.aksesori FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1),
        cogs_kemasan = (SELECT c.kemasan FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1),
        cogs_tenaga_kerja = (SELECT c.tenaga_kerja FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1),
        cogs_overhead = (SELECT c.overhead FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1),
        cogs_total = (SELECT (c.bahan_utama + c.aksesori + c.kemasan + c.tenaga_kerja + c.overhead) FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1),
        target_price = (SELECT c.target_price FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1),
        tiktok_fee_percent = (SELECT c.tiktok_fee_percent FROM product_cogs c JOIN products p ON c.product_id = p.id WHERE REPLACE(LOWER(p.seller_sku), ' ', '-') = REPLACE(LOWER(stock_batch_items.seller_sku), ' ', '-') LIMIT 1)
      WHERE cogs_total IS NULL
    `).run();

    // 3. Fallback for component parts (JKT-BW, JKT-TOP, PNC-BW)
    sqlite.prepare(`
      UPDATE stock_batch_items
      SET
        cogs_bahan_utama = 7370, cogs_aksesori = 0, cogs_kemasan = 0, cogs_tenaga_kerja = 3450, cogs_overhead = 3520, cogs_total = 14340, target_price = 27000, tiktok_fee_percent = 25
      WHERE cogs_total IS NULL AND (seller_sku LIKE 'JKT-BW%' OR seller_sku LIKE 'CLN%')
    `).run();

    sqlite.prepare(`
      UPDATE stock_batch_items
      SET
        cogs_bahan_utama = 15600, cogs_aksesori = 4446, cogs_kemasan = 2734, cogs_tenaga_kerja = 3600, cogs_overhead = 3520, cogs_total = 29900, target_price = 49900, tiktok_fee_percent = 30
      WHERE cogs_total IS NULL AND (seller_sku LIKE 'JKT-TOP%' OR seller_sku LIKE 'JKT%')
    `).run();

    sqlite.prepare(`
      UPDATE stock_batch_items
      SET
        cogs_bahan_utama = 12000, cogs_aksesori = 2000, cogs_kemasan = 2500, cogs_tenaga_kerja = 3500, cogs_overhead = 3500, cogs_total = 23500, target_price = 45000, tiktok_fee_percent = 25
      WHERE cogs_total IS NULL AND (seller_sku LIKE 'PNC-BW%' OR seller_sku LIKE 'ROK%')
    `).run();

    console.log('[db:migrate] Backfilled COGS for all stock_batch_items.');
  } catch (err) {
    console.warn('[db:migrate] Note on backfilling batch items COGS:', err);
  }

  installInventoryLedger(sqlite);

  // Ensure database index on performance-critical columns
  try {
    sqlite.prepare(`
      CREATE INDEX IF NOT EXISTS order_items_seller_sku_idx ON order_items(seller_sku)
    `).run();
    sqlite.prepare(`
      CREATE INDEX IF NOT EXISTS stock_batch_items_seller_sku_idx ON stock_batch_items(seller_sku)
    `).run();
    sqlite.prepare(`
      CREATE INDEX IF NOT EXISTS orders_ship_date_idx ON orders(ship_date)
    `).run();
    sqlite.prepare(`
      CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at)
    `).run();
    sqlite.prepare(`
      CREATE INDEX IF NOT EXISTS scan_logs_scanned_at_idx ON scan_logs(scanned_at)
    `).run();
    sqlite.prepare(`
      CREATE INDEX IF NOT EXISTS scan_logs_mode_result_idx ON scan_logs(mode, result)
    `).run();
  } catch (err) {
    console.warn('[db:migrate] Note on creating performance indexes:', err);
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
