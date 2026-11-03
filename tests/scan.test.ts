import bcrypt from 'bcryptjs';
import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../server/src/db/client.js';
import { batches, orders, order_items, users, scan_logs } from '../server/src/db/schema.js';
import {
  processScan,
  undoScan,
  getRecentScanLogs,
  getScanStats,
  clearScanLogs,
} from '../server/src/services/scanService.js';
import { eq } from 'drizzle-orm';

describe('Scan Service (server/src/services/scanService.ts)', () => {
  let testUserId: number;
  let testBatchId: number;
  const testResi1 = 'TEST-RESI-PACKING-01';
  const testResi2 = 'TEST-RESI-SHIPPING-02';

  beforeAll(async () => {
    // Pastikan user test ada dengan password hash bcrypt yang valid
    const passwordHash = await bcrypt.hash('admin123', 10);
    let [user] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          username: 'admin',
          password_hash: passwordHash,
          role: 'admin',
        })
        .returning();
    } else {
      await db.update(users).set({ password_hash: passwordHash }).where(eq(users.id, user.id));
    }
    testUserId = user.id;

    // Bersihkan data test lama jika ada
    await db.delete(scan_logs).where(eq(scan_logs.resi_scanned, testResi1));
    await db.delete(scan_logs).where(eq(scan_logs.resi_scanned, testResi2));
    await db.delete(orders).where(eq(orders.resi, testResi1));
    await db.delete(orders).where(eq(orders.resi, testResi2));

    // Buat batch dummy
    const [batch] = await db
      .insert(batches)
      .values({
        name: 'Batch Unit Test Scan',
        source_filename: 'test.pdf',
        pdf_path: 'data/pdf/test.pdf',
        total_orders: 2,
        created_by: testUserId,
      })
      .returning();
    testBatchId = batch.id;

    // Buat Order 1 (untuk test packing)
    const [order1] = await db
      .insert(orders)
      .values({
        batch_id: testBatchId,
        resi: testResi1,
        order_id: '586887193517983001',
        courier: 'J&T',
        service: 'EZ',
        is_cod: false,
        recipient_name: 'Budi Santoso',
        recipient_phone: '08123456789',
        recipient_address: 'Jl. Merdeka No. 1, Jakarta Pusat',
        status: 'menunggu_dikemas',
        is_packed: false,
        is_shipped: false,
      })
      .returning();

    await db.insert(order_items).values([
      {
        order_id: order1.id,
        product_name: 'Jas Hujan Anti Rembes',
        sku: 'Hitam, L',
        seller_sku: 'JH-01-BLK-L',
        qty: 1,
      },
    ]);

    // Buat Order 2 (untuk test status_tidak_valid & shipping)
    const [order2] = await db
      .insert(orders)
      .values({
        batch_id: testBatchId,
        resi: testResi2,
        order_id: '586887193517983002',
        courier: 'J&T',
        service: 'NDD',
        is_cod: true,
        recipient_name: 'Siti Aminah',
        recipient_phone: '08987654321',
        recipient_address: 'Jl. Melati No. 45, Bandung',
        status: 'menunggu_dikemas',
        is_packed: false,
        is_shipped: false,
      })
      .returning();

    await db.insert(order_items).values([
      {
        order_id: order2.id,
        product_name: 'Celana Jas Hujan',
        sku: 'Navy, All Size',
        seller_sku: 'CL-NVY-01',
        qty: 2,
      },
    ]);
  });

  it('handles resi not found (result: tidak_ditemukan)', async () => {
    const res = await processScan({
      resi: 'NON-EXISTENT-RESI-999',
      mode: 'packing',
      userId: testUserId,
    });

    expect(res.result).toBe('tidak_ditemukan');
    expect(res.order).toBeNull();
    expect(res.items).toHaveLength(0);
  });

  it('successfully processes packing scan (result: ok)', async () => {
    const res = await processScan({
      resi: testResi1,
      mode: 'packing',
      userId: testUserId,
    });

    expect(res.result).toBe('ok');
    expect(res.order).toBeDefined();
    expect(res.order?.is_packed).toBe(true);
    expect(res.order?.status).toBe('dikemas');
    expect(res.order?.packed_by).toBe(testUserId);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].sku).toBe('Hitam, L');
  });

  it('detects duplicate packing scan (result: duplikat)', async () => {
    const res = await processScan({
      resi: testResi1,
      mode: 'packing',
      userId: testUserId,
    });

    expect(res.result).toBe('duplikat');
    expect(res.message).toContain('SUDAH PERNAH DIKEMAS');
  });

  it('rejects shipping scan when order is not yet packed (result: status_tidak_valid)', async () => {
    // Order 2 belum di-packing
    const res = await processScan({
      resi: testResi2,
      mode: 'pengiriman',
      userId: testUserId,
    });

    expect(res.result).toBe('status_tidak_valid');
    expect(res.message).toContain('BELUM DIKEMAS');
  });

  it('successfully processes shipping scan after packing (result: ok)', async () => {
    // 1. Pack order 2 first
    const packRes = await processScan({
      resi: testResi2,
      mode: 'packing',
      userId: testUserId,
    });
    expect(packRes.result).toBe('ok');

    // 2. Now ship order 2
    const shipRes = await processScan({
      resi: testResi2,
      mode: 'pengiriman',
      userId: testUserId,
    });

    expect(shipRes.result).toBe('ok');
    expect(shipRes.order?.is_shipped).toBe(true);
    expect(shipRes.order?.status).toBe('dikirim');
    expect(shipRes.items).toHaveLength(1);
  });

  it('detects duplicate shipping scan (result: duplikat)', async () => {
    const res = await processScan({
      resi: testResi2,
      mode: 'pengiriman',
      userId: testUserId,
    });

    expect(res.result).toBe('duplikat');
    expect(res.message).toContain('SUDAH PERNAH DIKIRIM');
  });

  it('allows undoing a scan operation', async () => {
    // Ambil order 1
    const [order1] = await db.select().from(orders).where(eq(orders.resi, testResi1));
    expect(order1.is_packed).toBe(true);

    const undoRes = await undoScan({
      orderId: order1.id,
      mode: 'packing',
    });

    expect(undoRes.success).toBe(true);
    expect(undoRes.order.is_packed).toBe(false);
    expect(undoRes.order.status).toBe('menunggu_dikemas');
  });

  it('retrieves scan logs and statistics accurately', async () => {
    const logs = await getRecentScanLogs(10);
    expect(logs.length).toBeGreaterThan(0);

    const stats = await getScanStats();
    expect(stats.totalLogs).toBeGreaterThan(0);
    expect(stats.totalOrders).toBeGreaterThan(0);
  });

  it('rejects clearScanLogs when password does not match', async () => {
    await expect(clearScanLogs(testUserId, 'wrong-password')).rejects.toThrow(
      'Password konfirmasi salah'
    );
  });

  it('clears all scan logs successfully with correct password', async () => {
    const res = await clearScanLogs(testUserId, 'admin123');
    expect(res.success).toBe(true);

    const logsAfter = await getRecentScanLogs(10);
    expect(logsAfter).toHaveLength(0);

    const statsAfter = await getScanStats();
    expect(statsAfter.totalLogs).toBe(0);
  });
});
