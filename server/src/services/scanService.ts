import bcrypt from 'bcryptjs';
import { and, eq, desc, sql } from 'drizzle-orm';
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
  return db.transaction((tx) => {
    const cleanedResi = input.resi.trim().toUpperCase();

    // 1. Cari data pesanan berdasarkan no resi
    const [order] = tx
      .select()
      .from(orders)
      .where(eq(orders.resi, cleanedResi))
      .limit(1).all();

    // Jika resi tidak ditemukan di sistem
    if (!order) {
      const [log] = tx
        .insert(scan_logs)
        .values({
          order_id: null,
          resi_scanned: cleanedResi,
          mode: input.mode,
          result: 'tidak_ditemukan',
          user_id: input.userId,
          scanned_at: new Date().toISOString(),
        })
        .returning().all();

      return {
        logId: log.id,
        result: 'tidak_ditemukan',
        message: `Resi "${cleanedResi}" tidak ditemukan. Pastikan file PDF label pesanan sudah diunggah.`,
        order: null,
        items: [],
      };
    }

    // Ambil item produk pesanan
    const items = tx
      .select()
      .from(order_items)
      .where(eq(order_items.order_id, order.id)).all();

    // 1.5 Cek jika pesanan telah dibatalkan (Cancel)
    if (order.status === 'dibatalkan') {
      const [log] = tx
        .insert(scan_logs)
        .values({
          order_id: order.id,
          resi_scanned: cleanedResi,
          mode: input.mode,
          result: 'status_tidak_valid',
          user_id: input.userId,
          scanned_at: new Date().toISOString(),
        })
        .returning().all();

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
          const [packedUser] = tx
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, order.packed_by))
            .limit(1).all();
          packedByName = packedUser?.username ?? null;
        }

        const [log] = tx
          .insert(scan_logs)
          .values({
            order_id: order.id,
            resi_scanned: cleanedResi,
            mode: 'packing',
            result: 'duplikat',
            user_id: input.userId,
            scanned_at: new Date().toISOString(),
          })
          .returning().all();

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
      const [updatedOrder] = tx
        .update(orders)
        .set({
          is_packed: true,
          status: 'dikemas',
          packed_at: now,
          packed_by: input.userId,
        })
        .where(eq(orders.id, order.id))
        .returning().all();

      const [log] = tx
        .insert(scan_logs)
        .values({
          order_id: order.id,
          resi_scanned: cleanedResi,
          mode: 'packing',
          result: 'ok',
          user_id: input.userId,
          scanned_at: now,
        })
        .returning().all();

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
        const [log] = tx
          .insert(scan_logs)
          .values({
            order_id: order.id,
            resi_scanned: cleanedResi,
            mode: 'pengiriman',
            result: 'status_tidak_valid',
            user_id: input.userId,
            scanned_at: new Date().toISOString(),
          })
          .returning().all();

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
          const [shippedUser] = tx
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, order.shipped_by))
            .limit(1).all();
          shippedByName = shippedUser?.username ?? null;
        }

        const [log] = tx
          .insert(scan_logs)
          .values({
            order_id: order.id,
            resi_scanned: cleanedResi,
            mode: 'pengiriman',
            result: 'duplikat',
            user_id: input.userId,
            scanned_at: new Date().toISOString(),
          })
          .returning().all();

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
      const [updatedOrder] = tx
        .update(orders)
        .set({
          is_shipped: true,
          status: 'dikirim',
          shipped_at: now,
          shipped_by: input.userId,
        })
        .where(eq(orders.id, order.id))
        .returning().all();

      const [log] = tx
        .insert(scan_logs)
        .values({
          order_id: order.id,
          resi_scanned: cleanedResi,
          mode: 'pengiriman',
          result: 'ok',
          user_id: input.userId,
          scanned_at: now,
        })
        .returning().all();

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
  }, { behavior: 'immediate' });
}

export async function undoScan(params: {
  userId?: number;
  logId?: number;
  orderId: number;
  mode: 'packing' | 'pengiriman';
}): Promise<{ success: boolean; message: string; order: typeof orders.$inferSelect }> {
  return db.transaction((tx) => {
    const [order] = tx
      .select()
      .from(orders)
      .where(eq(orders.id, params.orderId))
      .limit(1).all();

    if (!order) {
      throw new Error('Pesanan tidak ditemukan untuk dibatalkan.');
    }

    const packing = params.mode === 'packing';
    if (order.status !== (packing ? 'dikemas' : 'dikirim') || !order.is_packed || order.is_shipped === packing) {
      throw new Error('Status pesanan tidak sesuai untuk pembatalan scan.');
    }
    const log = tx.select().from(scan_logs).where(and(eq(scan_logs.order_id, order.id),
      eq(scan_logs.mode, params.mode), eq(scan_logs.result, 'ok'))).orderBy(desc(scan_logs.id)).limit(1).get();
    if (!log || (params.logId !== undefined && params.logId !== log.id)) {
      throw new Error('Riwayat scan tidak sesuai dengan pesanan.');
    }
    let updatedOrder: typeof orders.$inferSelect;

    if (params.mode === 'packing') {
      // Revert packing status
      const [reverted] = tx
        .update(orders)
        .set({
          is_packed: false,
          packed_at: null,
          packed_by: null,
          status: 'menunggu_dikemas',
        })
        .where(eq(orders.id, params.orderId))
        .returning().all();
      updatedOrder = reverted;
    } else {
      // Revert pengiriman status
      const [reverted] = tx
        .update(orders)
        .set({
          is_shipped: false,
          shipped_at: null,
          shipped_by: null,
          status: 'dikemas',
        })
        .where(eq(orders.id, params.orderId))
        .returning().all();
      updatedOrder = reverted;
    }

    tx.update(scan_logs).set({ result: 'dibatalkan' }).where(eq(scan_logs.id, log.id)).run();
    tx.insert(scan_logs).values({ order_id: order.id, resi_scanned: order.resi, mode: params.mode,
      result: 'undo', user_id: params.userId ?? log.user_id, scanned_at: new Date().toISOString() }).run();
    return {
      success: true,
      message: `Perubahan scan ${params.mode === 'packing' ? 'packing' : 'pengiriman'} berhasil dibatalkan.`,
      order: updatedOrder,
    };
  }, { behavior: 'immediate' });
}

const visibleScan = sql`${scan_logs.id} > coalesce((SELECT CAST(value AS INTEGER) FROM system_settings WHERE key='scan_history_hidden_through'),0)`;

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
    .where(visibleScan)
    .orderBy(desc(scan_logs.id))
    .limit(limit);

  return logs;
}

export async function getScanStats() {
  const [logStats] = await db
    .select({
      totalLogs: sql<number>`count(*)`,
      packingSuccess: sql<number>`coalesce(sum(case when ${scan_logs.mode} = 'packing' and ${scan_logs.result} = 'ok' then 1 else 0 end), 0)`,
      shippingSuccess: sql<number>`coalesce(sum(case when ${scan_logs.mode} = 'pengiriman' and ${scan_logs.result} = 'ok' then 1 else 0 end), 0)`,
      duplicates: sql<number>`coalesce(sum(case when ${scan_logs.result} = 'duplikat' then 1 else 0 end), 0)`,
      notFound: sql<number>`coalesce(sum(case when ${scan_logs.result} = 'tidak_ditemukan' then 1 else 0 end), 0)`,
      invalidStatus: sql<number>`coalesce(sum(case when ${scan_logs.result} = 'status_tidak_valid' then 1 else 0 end), 0)`,
    })
    .from(scan_logs).where(visibleScan);

  const [orderStats] = await db
    .select({
      totalOrders: sql<number>`count(*)`,
      waitingPacked: sql<number>`coalesce(sum(case when ${orders.status} != 'dibatalkan' and ${orders.is_packed} = 0 then 1 else 0 end), 0)`,
      packed: sql<number>`coalesce(sum(case when ${orders.status} != 'dibatalkan' and ${orders.is_packed} = 1 and ${orders.is_shipped} = 0 then 1 else 0 end), 0)`,
      shipped: sql<number>`coalesce(sum(case when ${orders.is_shipped} = 1 then 1 else 0 end), 0)`,
    })
    .from(orders);

  return {
    totalLogs: Number(logStats?.totalLogs || 0),
    packingSuccess: Number(logStats?.packingSuccess || 0),
    shippingSuccess: Number(logStats?.shippingSuccess || 0),
    duplicates: Number(logStats?.duplicates || 0),
    notFound: Number(logStats?.notFound || 0),
    invalidStatus: Number(logStats?.invalidStatus || 0),

    // Real-time Order Counts
    totalOrders: Number(orderStats?.totalOrders || 0),
    waitingPacked: Number(orderStats?.waitingPacked || 0),
    packed: Number(orderStats?.packed || 0),
    shipped: Number(orderStats?.shipped || 0),
  };
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

  db.run(sql`INSERT INTO system_settings(key,value) VALUES ('scan_history_hidden_through',
    (SELECT coalesce(max(id),0) FROM scan_logs)) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

  return {
    success: true,
    message: 'Seluruh riwayat log scan berhasil dibersihkan.',
  };
}
