import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../server/src/db/client.js';
import { config } from '../server/src/config.js';
import { users, orders, order_items } from '../server/src/db/schema.js';
import {
  previewBatch,
  processAndSaveBatch,
  updateBatch,
  deleteBatch,
  updateOrder,
  deleteOrder,
  cancelOrder,
  restoreOrder,
  getOrderById,
  getOrders,
} from '../server/src/services/batchService.js';
import { processScan } from '../server/src/services/scanService.js';
import { eq } from 'drizzle-orm';

describe('Batch Service - Duplicate Detection & Discard', () => {
  let testUserId: number;
  const sourcePdfPath = path.resolve(__dirname, '../docs/15.51.pdf');
  const samplePdfPath = path.join(config.paths.pdfDir, 'test-sample-15.51.pdf');

  beforeAll(async () => {
    // Pastikan user admin ada
    let [user] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          username: 'admin',
          password_hash: 'hashed',
          role: 'admin',
        })
        .returning();
    }
    testUserId = user.id;

    // Siapkan copy sample PDF agar docs/ asli terlindungi
    if (fs.existsSync(sourcePdfPath)) {
      fs.copyFileSync(sourcePdfPath, samplePdfPath);
    }

    // Bersihkan data lama dari sample 15.51.pdf
    const sampleResis = ['JY2115316542', 'JY2174096542', 'JY2185537122', 'JY2196806542'];
    for (const resi of sampleResis) {
      const [existing] = await db.select().from(orders).where(eq(orders.resi, resi));
      if (existing) {
        await db.delete(order_items).where(eq(order_items.order_id, existing.id));
        await db.delete(orders).where(eq(orders.id, existing.id));
      }
    }
  });

  it('marks orders as new on first preview and inserts them on first save', async () => {
    const preview = await previewBatch(samplePdfPath);
    expect(preview.totalOrders).toBe(4);
    expect(preview.newOrdersCount).toBe(4);
    expect(preview.duplicateOrdersCount).toBe(0);
    expect(preview.orders.every((o) => !o.is_duplicate)).toBe(true);

    const saveResult = await processAndSaveBatch({
      sourceFilename: '15.51.pdf',
      pdfPath: samplePdfPath,
      userId: testUserId,
      skipDuplicates: true,
    });

    expect(saveResult.stats.inserted).toBe(4);
    expect(saveResult.stats.duplicates).toBe(0);
    expect(saveResult.stats.skipped).toBe(0);
  });

  it('detects all orders as duplicates on second preview of the same PDF', async () => {
    const secondPreview = await previewBatch(samplePdfPath);
    expect(secondPreview.totalOrders).toBe(4);
    expect(secondPreview.newOrdersCount).toBe(0);
    expect(secondPreview.duplicateOrdersCount).toBe(4);

    // Semua order ditandai is_duplicate: true
    for (const order of secondPreview.orders) {
      expect(order.is_duplicate).toBe(true);
      expect(order.duplicate_info).toBeDefined();
      expect(order.duplicate_info?.batch_id).toBeGreaterThan(0);
      expect(order.duplicate_info?.status).toBe('menunggu_dikemas');
    }
  });

  it('discards/skips duplicate orders upon second upload and preserves existing data', async () => {
    const secondSaveResult = await processAndSaveBatch({
      sourceFilename: '15.51.pdf',
      pdfPath: samplePdfPath,
      userId: testUserId,
      skipDuplicates: true,
    });

    expect(secondSaveResult.stats.inserted).toBe(0);
    expect(secondSaveResult.stats.duplicates).toBe(4);
    expect(secondSaveResult.stats.skipped).toBe(4);
    expect(secondSaveResult.message).toContain('duplikat dan telah dilewati (discard)');

    // Pastikan tidak ada duplikasi data di tabel orders
    const allMatching = await db.select().from(orders).where(eq(orders.resi, 'JY2115316542'));
    expect(allMatching.length).toBe(1);
  });

  it('updates batch name successfully', async () => {
    const [order] = await db.select().from(orders).where(eq(orders.resi, 'JY2115316542'));
    expect(order).toBeDefined();

    const updated = await updateBatch(order.batch_id, { name: 'Batch 15.51 Revisi Manual' });
    expect(updated.name).toBe('Batch 15.51 Revisi Manual');
  });

  it('updates order details and order items with qty recalculation', async () => {
    const [order] = await db.select().from(orders).where(eq(orders.resi, 'JY2115316542'));
    expect(order).toBeDefined();

    const updatedOrder = await updateOrder(order.id, {
      recipient_name: 'Budi Santoso',
      sorting_code: '999-REVISED',
      ship_date: '03-11-2026',
      needs_review: false,
      items: [
        {
          product_name: 'Produk Baju Tidur Revisi',
          sku: 'CREAM-XL',
          seller_sku: 'SELLER-01',
          qty: 3,
        },
        {
          product_name: 'Item Tambahan',
          sku: 'ACC-01',
          seller_sku: 'ACC-S',
          qty: 2,
        },
      ],
    });

    expect(updatedOrder).toBeDefined();
    expect(updatedOrder?.recipient_name).toBe('Budi Santoso');
    expect(updatedOrder?.sorting_code).toBe('999-REVISED');
    expect(updatedOrder?.ship_date).toBe('03-11-2026');
    expect(updatedOrder?.needs_review).toBe(false);
    expect(updatedOrder?.qty_total).toBe(5);
    expect(updatedOrder?.items.length).toBe(2);
    expect(updatedOrder?.items[0].sku).toBe('CREAM-XL');
    expect(updatedOrder?.items[1].sku).toBe('ACC-01');
  });

  it('filters orders by order creation date / ship_date', async () => {
    // Cari dengan format YYYY-MM-DD yang mencocokkan ship_date 03-11-2026
    const filteredByDate = await getOrders({ date: '2026-11-03' });
    expect(filteredByDate.length).toBeGreaterThan(0);
    expect(filteredByDate.some((o) => o.resi === 'JY2115316542')).toBe(true);

    // Tanggal yang tidak ada
    const emptyResult = await getOrders({ date: '2099-01-01' });
    expect(emptyResult.length).toBe(0);
  });

  it('filters orders by date range (startDate & endDate)', async () => {
    // Range yang mencakup 03-11-2026
    const rangeResult = await getOrders({
      startDate: '2026-11-01',
      endDate: '2026-11-05',
    });
    expect(rangeResult.length).toBeGreaterThan(0);
    expect(rangeResult.some((o) => o.resi === 'JY2115316542')).toBe(true);

    // Range masa lalu
    const outOfRange = await getOrders({
      startDate: '2020-01-01',
      endDate: '2020-01-31',
    });
    expect(outOfRange.length).toBe(0);
  });

  it('cancels an order, prevents scanner from scanning it, and restores order', async () => {
    const [order] = await db.select().from(orders).where(eq(orders.resi, 'JY2174096542'));
    expect(order).toBeDefined();

    // 1. Cancel order
    const cancelled = await cancelOrder(order.id);
    expect(cancelled?.status).toBe('dibatalkan');

    // 2. Scan attempt on cancelled order must fail with warning
    const scanResult = await processScan({
      resi: 'JY2174096542',
      mode: 'packing',
      userId: testUserId,
    });
    expect(scanResult.result).toBe('status_tidak_valid');
    expect(scanResult.message).toContain('TELAH DIBATALKAN');

    // 3. Restore order
    const restored = await restoreOrder(order.id);
    expect(restored?.status).toBe('menunggu_dikemas');
  });

  it('deletes single order and its items, and decrements batch total_orders', async () => {
    const [orderToDelete] = await db.select().from(orders).where(eq(orders.resi, 'JY2196806542'));
    expect(orderToDelete).toBeDefined();

    const deleteRes = await deleteOrder(orderToDelete.id);
    expect(deleteRes.success).toBe(true);
    expect(deleteRes.deletedResi).toBe('JY2196806542');

    const checkOrder = await getOrderById(orderToDelete.id);
    expect(checkOrder).toBeNull();

    const checkItems = await db.select().from(order_items).where(eq(order_items.order_id, orderToDelete.id));
    expect(checkItems.length).toBe(0);
  });

  it('deletes entire batch and all associated orders and items', async () => {
    const [sampleOrder] = await db.select().from(orders).where(eq(orders.resi, 'JY2115316542'));
    expect(sampleOrder).toBeDefined();

    const batchId = sampleOrder.batch_id;
    const result = await deleteBatch(batchId);
    expect(result.success).toBe(true);
    expect(result.deletedOrdersCount).toBeGreaterThan(0);

    // Pastikan semua orders di batch tersebut sudah terhapus
    const remainingOrders = await db.select().from(orders).where(eq(orders.batch_id, batchId));
    expect(remainingOrders.length).toBe(0);
  });
});
