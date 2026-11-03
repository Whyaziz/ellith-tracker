import bcrypt from 'bcryptjs';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, order_items, scan_logs, users } from '../db/schema.js';

export interface ScanInput {
  resi: string;
  mode: 'packing' | 'pengiriman';
  userId: number;
}

export type ScanResultStatus = 'ok' | 'duplikat' | 'tidak_ditemukan' | 'status_tidak_valid';

export interface ScanResponse {
  logId: number;
  result: ScanResultStatus;
  message: string;
  order: typeof orders.$inferSelect | null;
  items: (typeof order_items.$inferSelect)[];
  packedAt?: string | null;
  packedBy?: string | null;
  shippedAt?: string | null;
  shippedBy?: string | null;
}

export async function processScan(input: ScanInput): Promise<ScanResponse> {
  const cleanedResi = input.resi.trim().toUpperCase();

  // 1. Cari data pesanan berdasarkan no resi
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.resi, cleanedResi))
    .limit(1);

  // Jika resi tidak ditemukan di sistem
  if (!order) {
    const [log] = await db
      .insert(scan_logs)
      .values({
        order_id: null,
        resi_scanned: cleanedResi,
        mode: input.mode,
        result: 'tidak_ditemukan',
        user_id: input.userId,
        scanned_at: new Date().toISOString(),
      })
      .returning();

    return {
      logId: log.id,
      result: 'tidak_ditemukan',
      message: `Resi "${cleanedResi}" tidak ditemukan. Pastikan file PDF label pesanan sudah diunggah.`,
      order: null,
      items: [],
    };
  }

  // Ambil item produk pesanan
  const items = await db
    .select()
    .from(order_items)
    .where(eq(order_items.order_id, order.id));

  // 1.5 Cek jika pesanan telah dibatalkan (Cancel)
  if (order.status === 'dibatalkan') {
    const [log] = await db
      .insert(scan_logs)
      .values({
        order_id: order.id,
        resi_scanned: cleanedResi,
        mode: input.mode,
        result: 'status_tidak_valid',
        user_id: input.userId,
        scanned_at: new Date().toISOString(),
      })
      .returning();

    return {
      logId: log.id,
      result: 'status_tidak_valid',
      message: `PERINGATAN: Resi "${cleanedResi}" TELAH DIBATALKAN (CANCEL)! Harap bongkar paket dan kembalikan produk ke rak stok.`,
      order,
      items,
    };
  }

  // 2. Mode SCAN: PACKING
  if (input.mode === 'packing') {
    // Jika sudah pernah di-packing -> Duplikat
    if (order.is_packed) {
      let packedByName: string | null = null;
      if (order.packed_by) {
        const [packedUser] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, order.packed_by))
          .limit(1);
        packedByName = packedUser?.username ?? null;
      }

      const [log] = await db
        .insert(scan_logs)
        .values({
          order_id: order.id,
          resi_scanned: cleanedResi,
          mode: 'packing',
          result: 'duplikat',
          user_id: input.userId,
          scanned_at: new Date().toISOString(),
        })
        .returning();

      return {
        logId: log.id,
        result: 'duplikat',
        message: `Resi "${cleanedResi}" SUDAH PERNAH DIKEMAS sebelumnya.`,
        order,
        items,
        packedAt: order.packed_at,
        packedBy: packedByName,
      };
    }

    // Berhasil packing (update status pesanan)
    const now = new Date().toISOString();
    const [updatedOrder] = await db
      .update(orders)
      .set({
        is_packed: true,
        status: 'dikemas',
        packed_at: now,
        packed_by: input.userId,
      })
      .where(eq(orders.id, order.id))
      .returning();

    const [log] = await db
      .insert(scan_logs)
      .values({
        order_id: order.id,
        resi_scanned: cleanedResi,
        mode: 'packing',
        result: 'ok',
        user_id: input.userId,
        scanned_at: now,
      })
      .returning();

    return {
      logId: log.id,
      result: 'ok',
      message: `BERHASIL! Resi "${cleanedResi}" tercatat selesai dikemas.`,
      order: updatedOrder,
      items,
      packedAt: now,
    };
  }

  // 3. Mode SCAN: PENGIRIMAN
  if (input.mode === 'pengiriman') {
    // Jika belum melalui proses packing -> Status Tidak Valid
    if (!order.is_packed) {
      const [log] = await db
        .insert(scan_logs)
        .values({
          order_id: order.id,
          resi_scanned: cleanedResi,
          mode: 'pengiriman',
          result: 'status_tidak_valid',
          user_id: input.userId,
          scanned_at: new Date().toISOString(),
        })
        .returning();

      return {
        logId: log.id,
        result: 'status_tidak_valid',
        message: `PERINGATAN: Resi "${cleanedResi}" BELUM DIKEMAS! Paket harus dipacking terlebih dahulu.`,
        order,
        items,
      };
    }

    // Jika sudah pernah dikirim -> Duplikat
    if (order.is_shipped) {
      let shippedByName: string | null = null;
      if (order.shipped_by) {
        const [shippedUser] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, order.shipped_by))
          .limit(1);
        shippedByName = shippedUser?.username ?? null;
      }

      const [log] = await db
        .insert(scan_logs)
        .values({
          order_id: order.id,
          resi_scanned: cleanedResi,
          mode: 'pengiriman',
          result: 'duplikat',
          user_id: input.userId,
          scanned_at: new Date().toISOString(),
        })
        .returning();

      return {
        logId: log.id,
        result: 'duplikat',
        message: `Resi "${cleanedResi}" SUDAH PERNAH DIKIRIM sebelumnya.`,
        order,
        items,
        shippedAt: order.shipped_at,
        shippedBy: shippedByName,
      };
    }

    // Berhasil kirim (update status pesanan)
    const now = new Date().toISOString();
    const [updatedOrder] = await db
      .update(orders)
      .set({
        is_shipped: true,
        status: 'dikirim',
        shipped_at: now,
        shipped_by: input.userId,
      })
      .where(eq(orders.id, order.id))
      .returning();

    const [log] = await db
      .insert(scan_logs)
      .values({
        order_id: order.id,
        resi_scanned: cleanedResi,
        mode: 'pengiriman',
        result: 'ok',
        user_id: input.userId,
        scanned_at: now,
      })
      .returning();

    return {
      logId: log.id,
      result: 'ok',
      message: `BERHASIL! Resi "${cleanedResi}" tercatat siap diserahkan ke kurir J&T.`,
      order: updatedOrder,
      items,
      shippedAt: now,
    };
  }

  throw new Error(`Mode scan tidak valid: ${String(input.mode)}`);
}

export async function undoScan(params: {
  logId?: number;
  orderId: number;
  mode: 'packing' | 'pengiriman';
}): Promise<{ success: boolean; message: string; order: typeof orders.$inferSelect }> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId))
    .limit(1);

  if (!order) {
    throw new Error('Pesanan tidak ditemukan untuk dibatalkan.');
  }

  let updatedOrder: typeof orders.$inferSelect;

  if (params.mode === 'packing') {
    // Revert packing status
    const [reverted] = await db
      .update(orders)
      .set({
        is_packed: false,
        packed_at: null,
        packed_by: null,
        status: 'menunggu_dikemas',
      })
      .where(eq(orders.id, params.orderId))
      .returning();
    updatedOrder = reverted;
  } else {
    // Revert pengiriman status
    const [reverted] = await db
      .update(orders)
      .set({
        is_shipped: false,
        shipped_at: null,
        shipped_by: null,
        status: 'dikemas',
      })
      .where(eq(orders.id, params.orderId))
      .returning();
    updatedOrder = reverted;
  }

  // Jika ada logId, hapus scan log keberhasilan tersebut
  if (params.logId) {
    await db.delete(scan_logs).where(eq(scan_logs.id, params.logId));
  }

  return {
    success: true,
    message: `Perubahan scan ${params.mode === 'packing' ? 'packing' : 'pengiriman'} berhasil dibatalkan.`,
    order: updatedOrder,
  };
}

export async function getRecentScanLogs(limit = 30) {
  const logs = await db
    .select({
      id: scan_logs.id,
      order_id: scan_logs.order_id,
      resi_scanned: scan_logs.resi_scanned,
      mode: scan_logs.mode,
      result: scan_logs.result,
      scanned_at: scan_logs.scanned_at,
      user_id: scan_logs.user_id,
      username: users.username,
      order_resi: orders.resi,
      order_id_tiktok: orders.order_id,
      recipient_name: orders.recipient_name,
      recipient_address: orders.recipient_address,
      order_status: orders.status,
    })
    .from(scan_logs)
    .leftJoin(users, eq(scan_logs.user_id, users.id))
    .leftJoin(orders, eq(scan_logs.order_id, orders.id))
    .orderBy(desc(scan_logs.id))
    .limit(limit);

  return logs;
}

export async function getScanStats() {
  const allLogs = await db.select().from(scan_logs);
  const allOrders = await db.select().from(orders);

  const stats = {
    totalLogs: allLogs.length,
    packingSuccess: allLogs.filter((l) => l.mode === 'packing' && l.result === 'ok').length,
    shippingSuccess: allLogs.filter((l) => l.mode === 'pengiriman' && l.result === 'ok').length,
    duplicates: allLogs.filter((l) => l.result === 'duplikat').length,
    notFound: allLogs.filter((l) => l.result === 'tidak_ditemukan').length,
    invalidStatus: allLogs.filter((l) => l.result === 'status_tidak_valid').length,

    // Real-time Order Counts
    totalOrders: allOrders.length,
    waitingPacked: allOrders.filter((o) => !o.is_packed).length,
    packed: allOrders.filter((o) => o.is_packed && !o.is_shipped).length,
    shipped: allOrders.filter((o) => o.is_shipped).length,
  };

  return stats;
}

export async function clearScanLogs(userId: number, password: string) {
  if (!password || !password.trim()) {
    throw new Error('Password konfirmasi wajib diisi');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error('Pengguna tidak ditemukan');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Password konfirmasi salah. Pembersihan riwayat scan dibatalkan.');
  }

  await db.delete(scan_logs);

  return {
    success: true,
    message: 'Seluruh riwayat log scan berhasil dibersihkan.',
  };
}
