import { describe, it, expect } from 'vitest';
import { db, sqlite } from '../server/src/db/client.js';
import { products, users, batches, orders, order_items } from '../server/src/db/schema.js';
import {
  adjustDirectStock,
  createStockBatch,
  getStockOverview,
} from '../server/src/services/stockService.js';
import { findProductBySellerSku, updateProduct } from '../server/src/services/productService.js';
import {
  createOfflineOrder,
  deleteOfflineOrder,
  getOfflineOrderById,
} from '../server/src/services/offlineOrderService.js';
import { getFifoCostForSku } from '../server/src/services/cogsService.js';
import {
  createCustomer,
  getCustomerById,
  getCustomers,
} from '../server/src/services/customerService.js';
import { deleteBatch, getOrders } from '../server/src/services/batchService.js';
import { runMigrations } from '../server/src/db/migrate.js';
import { eq } from 'drizzle-orm';

const user = db
  .insert(users)
  .values({ username: 'audit', role: 'admin', password_hash: 'fixture' })
  .returning()
  .get();
const product = (sku: string, alias?: string) =>
  db.insert(products).values({ seller_sku: sku, sku_temp: alias, name: sku }).returning().get();
const receive = (sku: string, qty: number) =>
  createStockBatch({ userId: user.id, items: [{ seller_sku: sku, qty, cogs_bahan_utama: 30 }] });
const sell = (sku: string, qty: number) =>
  createOfflineOrder({
    userId: user.id,
    customer_name: 'Pembeli',
    order_date: '2026-01-01',
    items: [{ seller_sku: sku, qty, price: 100 }],
  });
describe('Alur operasional lintas modul', () => {
  it('opname via alias counts physical units once even with reservations and two requests', async () => {
    product('OP-A', 'A-LAMA');
    receive('OP-A', 10);
    await createOfflineOrder({
      userId: user.id,
      status: 'dikemas',
      order_date: '2026-01-01',
      customer_name: 'Pembeli',
      items: [{ seller_sku: 'OP-A', qty: 4, price: 100 }],
    });
    const adjust = (target: number) =>
      adjustDirectStock({
        seller_sku: 'A-LAMA',
        userId: user.id,
        target_stock: target,
        expected_physical_stock: 10,
      });
    expect((await adjust(10)).diff).toBe(0);
    const results = await Promise.all([adjust(8), adjust(8)]);
    expect(results.map((r) => r.diff)).toEqual([-2, 0]);
    await expect(adjust(6)).rejects.toThrow('berubah');
    expect(getStockOverview().find((p) => p.seller_sku === 'OP-A')).toMatchObject({
      physical_stock: 8,
      available_stock: 4,
    });
    expect(() => receive('OP-A', 1.5)).toThrow();
  });
  it('renaming preserves lot balances, cost and exact legacy aliases', async () => {
    const item = product('OLD', 'CLN-10');
    receive('OLD', 3);
    expect(findProductBySellerSku('CLN-1')).toBeNull();
    await updateProduct(item.id, { seller_sku: 'NEW' });
    expect(findProductBySellerSku('OLD')?.id).toBe(item.id);
    expect(await getFifoCostForSku('NEW')).toBe(30);
    const sale = await sell('OLD', 2);
    expect(sale?.items[0]).toMatchObject({ seller_sku: 'NEW', cogs_unit_fifo: 30 });
    expect(getStockOverview().find((p) => p.product_id === item.id)?.physical_stock).toBe(1);
  });
  it('failed invoice deletion rolls back inventory and details', async () => {
    product('ROLLBACK');
    receive('ROLLBACK', 4);
    const order = await sell('ROLLBACK', 1);
    sqlite.exec(
      "CREATE TEMP TRIGGER reject_delete BEFORE DELETE ON offline_orders BEGIN SELECT RAISE(ABORT,'fixture'); END"
    );
    try {
      await expect(deleteOfflineOrder(order!.id)).rejects.toThrow('fixture');
    } finally {
      sqlite.exec('DROP TRIGGER reject_delete');
    }
    expect((await getOfflineOrderById(order!.id))?.items.length).toBe(1);
    expect(getStockOverview().find((p) => p.seller_sku === 'ROLLBACK')?.physical_stock).toBe(3);
  });
  it('CRM excludes cancelled spending and ambiguous unlinked invoices', async () => {
    const a = await createCustomer({ name: 'Nama Sama', phone: '01' });
    await createCustomer({ name: 'Nama Sama', phone: '02' });
    const invoice = {
      userId: user.id,
      customer_name: a.name,
      order_date: '2026-01-01',
      items: [{ seller_sku: 'CRM', qty: 2, price: 100 }],
    };
    await createOfflineOrder(invoice);
    await createOfflineOrder({
      ...invoice,
      customer_id: a.id,
      customer_phone: '01',
      status: 'dibatalkan',
    });
    const detail = await getCustomerById(a.id);
    expect(detail).toMatchObject({
      total_orders_count: 0,
      total_items_purchased: 0,
      total_spent_amount: 0,
    });
    expect(detail?.orders.length).toBe(1);
    expect((await getCustomers()).find((c) => c.id === a.id)?.total_orders_count).toBe(0);
  });
  it('batch counts follow membership and date ranges use a single business date', async () => {
    const makeBatch = (name: string) =>
      db
        .insert(batches)
        .values({ name, source_filename: 'test', pdf_path: 'test', created_by: user.id })
        .returning()
        .get();
    const a = makeBatch('A'),
      b = makeBatch('B');
    const order = db
      .insert(orders)
      .values({
        batch_id: a.id,
        recipient_name: 'P',
        recipient_address: 'A',
        order_id: '1',
        resi: 'D-1',
        courier: 'JT',
        service: 'EZ',
        ship_date: '01-01-2026',
        created_at: '2026-01-31 10:00:00',
      })
      .returning()
      .get();
    db.insert(order_items)
      .values({ order_id: order.id, sku: 'D', product_name: 'D', qty: 1 })
      .run();
    db.update(orders).set({ batch_id: b.id }).where(eq(orders.id, order.id)).run();
    expect(db.select().from(batches).where(eq(batches.id, a.id)).get()?.total_orders).toBe(0);
    expect(db.select().from(batches).where(eq(batches.id, b.id)).get()?.total_orders).toBe(1);
    expect(
      await getOrders({ batchId: b.id, startDate: '2026-01-10', endDate: '2026-01-20' })
    ).toHaveLength(0);
    db.update(batches).set({total_orders:99}).where(eq(batches.id,b.id)).run();
    runMigrations();
    expect(db.select().from(batches).where(eq(batches.id,b.id)).get()?.total_orders).toBe(1);
    sqlite.exec(
      "CREATE TEMP TRIGGER reject_batch BEFORE DELETE ON batches BEGIN SELECT RAISE(ABORT,'fixture'); END"
    );
    try {
      await expect(deleteBatch(b.id)).rejects.toThrow('fixture');
    } finally {
      sqlite.exec('DROP TRIGGER reject_batch');
    }
    expect(
      db.select().from(order_items).where(eq(order_items.order_id, order.id)).all()
    ).toHaveLength(1);
  });
});
