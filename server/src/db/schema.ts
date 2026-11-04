import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'operator'] }).notNull(),
  created_at: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const batches = sqliteTable('batches', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  source_filename: text('source_filename').notNull(),
  pdf_path: text('pdf_path').notNull(),
  total_orders: integer('total_orders', { mode: 'number' }).notNull().default(0),
  uploaded_at: text('uploaded_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  created_by: integer('created_by')
    .notNull()
    .references(() => users.id),
});

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    batch_id: integer('batch_id')
      .notNull()
      .references(() => batches.id),
    resi: text('resi').notNull().unique(),
    // PENTING: order_id berupa angka 18 digit, disimpan dan diproses strictly sebagai TEXT
    order_id: text('order_id').notNull(),
    courier: text('courier').notNull(),
    service: text('service').notNull(), // NDD / EZ / ECO
    is_cod: integer('is_cod', { mode: 'boolean' }).notNull().default(false),
    weight_kg: real('weight_kg'),
    ship_date: text('ship_date'),
    recipient_name: text('recipient_name').notNull(),
    recipient_phone: text('recipient_phone'),
    recipient_address: text('recipient_address').notNull(),
    sorting_code: text('sorting_code'),
    status: text('status', {
      enum: ['menunggu_dikemas', 'dikemas', 'dikirim', 'dibatalkan'],
    })
      .notNull()
      .default('menunggu_dikemas'),
    is_packed: integer('is_packed', { mode: 'boolean' }).notNull().default(false),
    packed_at: text('packed_at'),
    packed_by: integer('packed_by').references(() => users.id),
    is_shipped: integer('is_shipped', { mode: 'boolean' }).notNull().default(false),
    shipped_at: text('shipped_at'),
    shipped_by: integer('shipped_by').references(() => users.id),
    qty_total: integer('qty_total', { mode: 'number' }),
    needs_review: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
    validation_notes: text('validation_notes'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex('orders_resi_idx').on(table.resi),
    index('orders_batch_id_idx').on(table.batch_id),
    index('orders_status_idx').on(table.status),
    index('orders_is_packed_idx').on(table.is_packed),
    index('orders_is_shipped_idx').on(table.is_shipped),
    index('orders_needs_review_idx').on(table.needs_review),
  ]
);

export const order_items = sqliteTable(
  'order_items',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    order_id: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    product_name: text('product_name').notNull(),
    sku: text('sku').notNull(),
    seller_sku: text('seller_sku'), // Boleh null
    qty: integer('qty', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('order_items_order_id_idx').on(table.order_id),
  ]
);

export const scan_logs = sqliteTable(
  'scan_logs',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    order_id: integer('order_id').references(() => orders.id, { onDelete: 'set null' }), // Boleh null
    resi_scanned: text('resi_scanned').notNull(),
    mode: text('mode', { enum: ['packing', 'pengiriman'] }).notNull(),
    result: text('result', {
      enum: ['ok', 'duplikat', 'tidak_ditemukan', 'status_tidak_valid'],
    }).notNull(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    scanned_at: text('scanned_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('scan_logs_order_id_idx').on(table.order_id),
    index('scan_logs_resi_idx').on(table.resi_scanned),
  ]
);

// ----------------- MASTER PRODUK & KATEGORI -----------------
export const product_categories = sqliteTable('product_categories', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  created_at: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const products = sqliteTable(
  'products',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    seller_sku: text('seller_sku').notNull().unique(),
    sku_temp: text('sku_temp'), // Alias / Seller SKU sementara dari hasil parsing label
    name: text('name').notNull(),
    category_id: integer('category_id').references(() => product_categories.id, {
      onDelete: 'set null',
    }),
    image_url: text('image_url'),
    min_stock: integer('min_stock', { mode: 'number' }).notNull().default(10),
    max_stock: integer('max_stock', { mode: 'number' }).notNull().default(100),
    created_at: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex('products_seller_sku_idx').on(table.seller_sku),
    index('products_category_id_idx').on(table.category_id),
  ]
);

// ----------------- MANAJEMEN STOK & MUTASI -----------------
export const stock_batches = sqliteTable('stock_batches', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  batch_code: text('batch_code').notNull().unique(),
  notes: text('notes'), // Keterangan opsional: konveksi, vendor, restock, dll.
  created_by: integer('created_by')
    .notNull()
    .references(() => users.id),
  created_at: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const stock_batch_items = sqliteTable(
  'stock_batch_items',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    stock_batch_id: integer('stock_batch_id')
      .notNull()
      .references(() => stock_batches.id, { onDelete: 'cascade' }),
    product_id: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
    seller_sku: text('seller_sku').notNull(),
    qty: integer('qty', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('stock_batch_items_batch_idx').on(table.stock_batch_id),
    index('stock_batch_items_seller_sku_idx').on(table.seller_sku),
  ]
);

// Mutasi stok HANYA untuk pengurangan/penyesuaian (rusak, hilang, selisih audit)
export const stock_mutations = sqliteTable(
  'stock_mutations',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    product_id: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
    seller_sku: text('seller_sku').notNull(),
    type: text('type', { enum: ['barang_rusak', 'barang_hilang', 'selisih_kurang'] }).notNull(),
    qty: integer('qty', { mode: 'number' }).notNull(), // Kuantitas berkurang
    notes: text('notes').notNull(), // Alasan mutasi
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index('stock_mutations_seller_sku_idx').on(table.seller_sku),
    index('stock_mutations_created_at_idx').on(table.created_at),
  ]
);

// ----------------- PESANAN OFFLINE -----------------
export const offline_orders = sqliteTable(
  'offline_orders',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    order_no: text('order_no').notNull().unique(),
    order_date: text('order_date').notNull(),
    customer_name: text('customer_name').notNull(),
    customer_phone: text('customer_phone'),
    notes: text('notes'),
    status: text('status', {
      enum: ['menunggu_dikemas', 'dikemas', 'dikirim', 'selesai', 'dibatalkan'],
    })
      .notNull()
      .default('selesai'),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex('offline_orders_no_idx').on(table.order_no),
    index('offline_orders_status_idx').on(table.status),
    index('offline_orders_date_idx').on(table.order_date),
  ]
);

export const offline_order_items = sqliteTable(
  'offline_order_items',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    offline_order_id: integer('offline_order_id')
      .notNull()
      .references(() => offline_orders.id, { onDelete: 'cascade' }),
    product_id: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
    seller_sku: text('seller_sku').notNull(),
    product_name: text('product_name').notNull(),
    qty: integer('qty', { mode: 'number' }).notNull(),
    price: real('price').notNull().default(0),
  },
  (table) => [
    index('offline_order_items_order_idx').on(table.offline_order_id),
    index('offline_order_items_sku_idx').on(table.seller_sku),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof order_items.$inferSelect;
export type ScanLog = typeof scan_logs.$inferSelect;

export type ProductCategory = typeof product_categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type StockBatch = typeof stock_batches.$inferSelect;
export type StockBatchItem = typeof stock_batch_items.$inferSelect;
export type StockMutation = typeof stock_mutations.$inferSelect;
export type OfflineOrder = typeof offline_orders.$inferSelect;
export type OfflineOrderItem = typeof offline_order_items.$inferSelect;
