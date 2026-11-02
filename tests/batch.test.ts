import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../server/src/db/client.js';
import { users, orders, order_items } from '../server/src/db/schema.js';
import { previewBatch, processAndSaveBatch } from '../server/src/services/batchService.js';
import { eq } from 'drizzle-orm';

describe('Batch Service - Duplicate Detection & Discard', () => {
  let testUserId: number;
  const samplePdfPath = path.resolve(__dirname, '../docs/15.51.pdf');

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
});
