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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof order_items.$inferSelect;
export type ScanLog = typeof scan_logs.$inferSelect;
