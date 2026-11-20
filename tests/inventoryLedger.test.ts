import { expect, it } from 'vitest';
import { db } from '../server/src/db/client.js';
import {
  products,
  users,
  order_items,
  orders,
  batches,
  stock_batch_items,
  stock_batches,
} from '../server/src/db/schema.js';
import {
  createOfflineOrder,
  updateOfflineOrder,
  updateOfflinePrices,
  getOfflineOrderById,
} from '../server/src/services/offlineOrderService.js';
import {
  createStockBatch,
  getStockOverview,
  setStockCutoffDate,
} from '../server/src/services/stockService.js';
import { getProfitPerformance, getFifoCostForSku } from '../server/src/services/cogsService.js';
import { eq } from 'drizzle-orm';

it('reconciles split lots, historical cost, invoice edits and online volume', async () => {
  const user = db
    .insert(users)
    .values({ username: 'kasir', password_hash: 'fixture', role: 'admin' })
    .returning()
    .get();
  const sku = 'BISNIS';
  db.insert(products).values({ seller_sku: sku, name: sku, min_stock: 3 }).run();
  const receive = (qty: number, cost: number) =>
    createStockBatch({
      userId: user.id,
      items: [{ seller_sku: sku, qty, cogs_bahan_utama: cost }],
    });
  await receive(2, 10000);
  await receive(5, 20000);
  const order = await createOfflineOrder({
    userId: user.id,
    customer_name: 'Kasir',
    order_date: '2026-11-21',
    items: [{ seller_sku: sku, qty: 4, price: 30000 }],
  });
  const balances = () =>
    db
      .select()
      .from(stock_batch_items)
      .orderBy(stock_batch_items.id)
      .all()
      .map((i) => i.remaining_qty);
  expect(balances()).toEqual([0, 3]);
  expect(order!.items[0].cogs_unit_fifo).toBe(15000);
  expect(order!.items[0].cogs_unit_ma).toBeCloseTo(120000 / 7);
  expect((await getStockOverview())[0].health_status).toBe('understock');
  await receive(1, 90000);
  const lineId = order!.items[0].id;
  updateOfflinePrices(order!.id, [{ id: lineId, previous: 30000, price: 31000 }]);
  expect(() => updateOfflinePrices(order!.id, [{ id: lineId, previous: 30000, price: 0 }])).toThrow();
  const edited = await getOfflineOrderById(order!.id);
  expect(edited!.total_amount).toBe(124000);
  expect(edited!.items[0].cogs_unit_ma).toBe(order!.items[0].cogs_unit_ma);
  const batch = db
    .insert(batches)
    .values({ name: 'online', source_filename: 'test', pdf_path: 'test', created_by: user.id })
    .returning()
    .get();
  const online = db
    .insert(orders)
    .values({
      order_id: '123',
      resi: 'R1',
      courier: 'JT',
      service: 'EZ',
      recipient_name: 'A',
      recipient_address: 'A',
      batch_id: batch.id,
      status: 'dikemas',
      is_packed: true,
    })
    .returning()
    .get();
  db.insert(order_items)
    .values({ order_id: online.id, product_name: sku, seller_sku: sku, sku, qty: 1 })
    .run();
  expect(balances()).toEqual([0, 2, 1]);
  const combined = await getProfitPerformance({ channel: 'all' });
  expect(combined.summary).toMatchObject({
    actual_revenue: 124000,
    actual_cogs_fifo: 60000,
    online_qty_sold: 1,
    total_qty_sold: 5,
  });
  expect(combined.items[0].avg_selling_price).toBe(31000);
  expect((await getProfitPerformance({ channel: 'online' })).summary).toMatchObject({
    online_qty_sold: 1,
    actual_revenue: 0,
  });
  await updateOfflineOrder(order!.id, { items: [{ seller_sku: sku, qty: 2, price: 31000 }] });
  expect(balances()).toEqual([0, 4, 1]);
  expect((await getProfitPerformance()).summary.actual_cogs_fifo).toBe(20000);
});

it('uses the opname boundary for both stock and FIFO hints', async () => {
  const sku = 'OPNAME';
  const user = db
    .insert(users)
    .values({ username: 'opname', password_hash: 'fixture', role: 'admin' })
    .returning()
    .get();
  db.insert(products).values({ seller_sku: sku, name: sku }).run();
  const before = await createStockBatch({
    userId: user.id,
    items: [{ seller_sku: sku, qty: 5, cogs_bahan_utama: 12 }],
  });
  db.update(stock_batches)
    .set({ created_at: '2000-01-01' })
    .where(eq(stock_batches.id, before!.id))
    .run();
  await setStockCutoffDate('2001-01-01T00:00:00Z');
  await createStockBatch({
    userId: user.id,
    items: [{ seller_sku: sku, qty: 2, cogs_bahan_utama: 33 }],
  });
  expect(await getFifoCostForSku(sku)).toBe(33);
  expect((await getStockOverview()).find((p) => p.seller_sku === sku)?.physical_stock).toBe(2);
  await setStockCutoffDate(null);
  expect(await getFifoCostForSku(sku)).toBe(12);
});
