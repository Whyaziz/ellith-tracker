import fs from 'node:fs';
import path from 'node:path';
import { eq, desc, and, or, like, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { batches, orders, order_items, scan_logs, products } from '../db/schema.js';
import { parseJtPdf, type ParsedOrder, type ParsedItem } from '../parsers/jnt.js';
import { config } from '../config.js';
import { findMasterProductForOrderItem } from './stockService.js';

export interface DuplicateInfo {
  batch_id: number;
  batch_name?: string;
  status: string;
  created_at: string;
}

export interface EnrichedParsedItem extends ParsedItem {
  is_recognized_sku?: boolean;
  matched_product_id?: number | null;
  matched_seller_sku?: string | null;
  matched_product_name?: string | null;
}

export interface EnrichedParsedOrder extends Omit<ParsedOrder, 'items'> {
  items: EnrichedParsedItem[];
  is_duplicate: boolean;
  duplicate_info?: DuplicateInfo | null;
}

export interface EnrichedParseResult {
  orders: EnrichedParsedOrder[];
  totalPages: number;
  totalOrders: number;
  newOrdersCount: number;
  duplicateOrdersCount: number;
  hasNeedsReview: boolean;
}

export interface CreateBatchInput {
  name?: string;
  sourceFilename: string;
  pdfPath: string;
  userId: number;
  forceConfirm?: boolean;
  skipDuplicates?: boolean;
  editedOrders?: Array<{
    resi: string;
    items: Array<{
      product_name: string;
      sku: string;
      seller_sku?: string | null;
      qty: number;
    }>;
  }>;
}

export class BatchValidationError extends Error {
  parseResult: EnrichedParseResult;
  constructor(message: string, parseResult: EnrichedParseResult) {
    super(message);
    this.name = 'BatchValidationError';
    this.parseResult = parseResult;
  }
}

/**
 * Memeriksa setiap resi dari hasil parsing terhadap database.
 * Menandai resi yang sudah terdaftar sebagai duplikat beserta informasi batch dan statusnya.
 */
export async function enrichOrdersWithDuplicateCheck(
  ordersList: ParsedOrder[]
): Promise<{
  orders: EnrichedParsedOrder[];
  newOrdersCount: number;
  duplicateOrdersCount: number;
}> {
  const enriched: EnrichedParsedOrder[] = [];
  const seenInPdf = new Set<string>();
  let duplicateOrdersCount = 0;
  let newOrdersCount = 0;

  // Ambil seluruh master produk untuk memeriksa keberadaan Seller SKU
  const allMasterProducts = await db.select().from(products);

  for (const parsed of ordersList) {
    // Enrich setiap item dengan status kecocokan Seller SKU
    const enrichedItems: EnrichedParsedItem[] = parsed.items.map((it) => {
      const matched = findMasterProductForOrderItem(it, allMasterProducts);

      return {
        ...it,
        seller_sku: matched?.seller_sku ?? (it.seller_sku || it.sku),
        is_recognized_sku: !!matched,
        matched_product_id: matched?.id ?? null,
        matched_seller_sku: matched?.seller_sku ?? null,
        matched_product_name: matched?.name ?? null,
      };
    });

    // 1. Cek duplikasi internal di dalam file PDF yang sama
    if (seenInPdf.has(parsed.resi)) {
      duplicateOrdersCount++;
      enriched.push({
        ...parsed,
        items: enrichedItems,
        is_duplicate: true,
        duplicate_info: {
          batch_id: 0,
          batch_name: 'File ini (Duplikat Halaman)',
          status: 'duplikat_internal',
          created_at: new Date().toISOString(),
        },
      });
      continue;
    }
    seenInPdf.add(parsed.resi);

    // 2. Cek apakah resi sudah ada di database
    const [existingOrder] = await db
      .select({
        id: orders.id,
        order_id: orders.order_id,
        batch_id: orders.batch_id,
        status: orders.status,
        created_at: orders.created_at,
        batch_name: batches.name,
      })
      .from(orders)
      .leftJoin(batches, eq(orders.batch_id, batches.id))
      .where(eq(orders.resi, parsed.resi))
      .limit(1);

    if (existingOrder) {
      duplicateOrdersCount++;
      enriched.push({
        ...parsed,
        items: enrichedItems,
        is_duplicate: true,
        duplicate_info: {
          batch_id: existingOrder.batch_id,
          batch_name: existingOrder.batch_name ?? `Batch #${existingOrder.batch_id}`,
          status: existingOrder.status,
          created_at: existingOrder.created_at,
        },
      });
    } else {
      newOrdersCount++;
      enriched.push({
        ...parsed,
        items: enrichedItems,
        is_duplicate: false,
        duplicate_info: null,
      });
    }
  }

  return {
    orders: enriched,
    newOrdersCount,
    duplicateOrdersCount,
  };
}

export async function previewBatch(pdfPath: string): Promise<EnrichedParseResult> {
  const parseResult = await parseJtPdf(pdfPath);
  const { orders: enrichedOrders, newOrdersCount, duplicateOrdersCount } =
    await enrichOrdersWithDuplicateCheck(parseResult.orders);

  return {
    orders: enrichedOrders,
    totalPages: parseResult.totalPages,
    totalOrders: parseResult.totalOrders,
    newOrdersCount,
    duplicateOrdersCount,
    hasNeedsReview: parseResult.hasNeedsReview,
  };
}

export async function processAndSaveBatch(input: CreateBatchInput): Promise<{
  batch: typeof batches.$inferSelect;
  parseResult: EnrichedParseResult;
  stats: {
    total: number;
    inserted: number;
    duplicates: number;
    skipped: number;
    updated: number;
  };
  message: string;
}> {
  const rawParseResult = await parseJtPdf(input.pdfPath);
  const { orders: enrichedOrders, newOrdersCount, duplicateOrdersCount } =
    await enrichOrdersWithDuplicateCheck(rawParseResult.orders);

  const enrichedResult: EnrichedParseResult = {
    orders: enrichedOrders,
    totalPages: rawParseResult.totalPages,
    totalOrders: rawParseResult.totalOrders,
    newOrdersCount,
    duplicateOrdersCount,
    hasNeedsReview: rawParseResult.hasNeedsReview,
  };

  // Validasi: jika ada resi baru yang tidak cocok Qty dan belum dikonfirmasi, tolak penyimpanan
  const hasNewUnconfirmedIssues = enrichedOrders.some((o) => !o.is_duplicate && o.needs_review);
  if (hasNewUnconfirmedIssues && !input.forceConfirm) {
    throw new BatchValidationError(
      'Terdapat resi baru yang perlu diperiksa karena jumlah Qty tidak sesuai dengan Qty Total. Harap konfirmasi sebelum menyimpan.',
      enrichedResult
    );
  }

  // Generate batch name from filename or timestamp if not provided
  const batchName =
    input.name ||
    `Batch ${input.sourceFilename.replace(/\.pdf$/i, '')} (${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`;

  const skipDuplicates = input.skipDuplicates !== false; // Default: true (otomatis discard/skip duplikat)
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  return db.transaction((tx) => {
    // Insert batch record
    const [createdBatch] = tx
      .insert(batches)
      .values({
        name: batchName,
        source_filename: input.sourceFilename,
        pdf_path: input.pdfPath,
        total_orders: 0, // Trigger SQLite menghitung keanggotaan resi.
        uploaded_at: new Date().toISOString(),
        created_by: input.userId,
      })
      .returning().all();

    // Terapkan penyesuaian edit manual dari pratinjau jika disediakan
    if (input.editedOrders && input.editedOrders.length > 0) {
      const editMap = new Map(input.editedOrders.map((eo) => [eo.resi, eo.items]));
      for (const parsed of enrichedOrders) {
        if (editMap.has(parsed.resi)) {
          parsed.items = editMap.get(parsed.resi)! as any;
        }
      }
    }

    // Ambil seluruh master produk untuk normalisasi SKU saat penyimpanan
    const allMasterProducts = tx.select().from(products).all();

    for (const parsed of enrichedOrders) {
      if (parsed.is_duplicate) {
        if (skipDuplicates || parsed.duplicate_info?.status === 'duplikat_internal') {
          // DISCARD / SKIP: Jangan ubah data pesanan yang sudah ada di database
          skippedCount++;
          continue;
        }

        // Jika skipDuplicates === false (mode overwrite/update paksa)
        const [existingOrder] = tx
          .select()
          .from(orders)
          .where(eq(orders.resi, parsed.resi))
          .limit(1).all();

        if (existingOrder && (existingOrder.is_packed || existingOrder.is_shipped || !['menunggu_dikemas','belum_dikemas'].includes(existingOrder.status))) {
          skippedCount++;
          continue;
        }
        if (existingOrder) {
          tx
            .update(orders)
            .set({
              batch_id: createdBatch.id,
              order_id: parsed.order_id,
              courier: parsed.courier,
              service: parsed.service,
              is_cod: parsed.is_cod,
              weight_kg: parsed.weight_kg,
              ship_date: parsed.ship_date,
              recipient_name: parsed.recipient_name,
              recipient_phone: parsed.recipient_phone,
              recipient_address: parsed.recipient_address,
              sorting_code: parsed.sorting_code,
              qty_total: parsed.qty_total,
              needs_review: parsed.needs_review,
              validation_notes: parsed.validation_notes,
            })
            .where(eq(orders.id, existingOrder.id)).run();

          updatedCount++;
          tx.delete(order_items).where(eq(order_items.order_id, existingOrder.id)).run();
          if (parsed.items.length > 0) {
            tx.insert(order_items).values(
              parsed.items.map((item) => {
                const matched = findMasterProductForOrderItem(item, allMasterProducts);
                return {
                  order_id: existingOrder.id,
                  product_name: item.product_name,
                  sku: item.sku,
                  seller_sku: matched?.seller_sku ?? (item.seller_sku || item.sku),
                  qty: item.qty,
                };
              })
            ).run();
          }
        }
        continue;
      }

      // Insert pesanan baru yang belum pernah terdaftar
      const [newOrder] = tx
        .insert(orders)
        .values({
          batch_id: createdBatch.id,
          resi: parsed.resi,
          order_id: parsed.order_id,
          courier: parsed.courier,
          service: parsed.service,
          is_cod: parsed.is_cod,
          weight_kg: parsed.weight_kg,
          ship_date: parsed.ship_date,
          recipient_name: parsed.recipient_name,
          recipient_phone: parsed.recipient_phone,
          recipient_address: parsed.recipient_address,
          sorting_code: parsed.sorting_code,
          status: 'menunggu_dikemas',
          is_packed: false,
          is_shipped: false,
          qty_total: parsed.qty_total,
          needs_review: parsed.needs_review,
          validation_notes: parsed.validation_notes,
          created_at: new Date().toISOString(),
        })
        .returning().all();

      insertedCount++;

      if (parsed.items.length > 0) {
        tx.insert(order_items).values(
          parsed.items.map((item) => {
            const matched = findMasterProductForOrderItem(item, allMasterProducts);
            return {
              order_id: newOrder.id,
              product_name: item.product_name,
              sku: item.sku,
              seller_sku: matched?.seller_sku ?? (item.seller_sku || item.sku),
              qty: item.qty,
            };
          })
        ).run();
      }
    }

    let summaryMessage = `Berhasil menyimpan ${insertedCount} pesanan baru.`;
    if (skippedCount > 0) {
      if (insertedCount === 0) {
        summaryMessage = `Seluruh ${skippedCount} resi merupakan duplikat dan telah dilewati (discard). Tidak ada data baru yang ditambahkan.`;
      } else {
        summaryMessage = `Berhasil menyimpan ${insertedCount} pesanan baru. Sebanyak ${skippedCount} resi duplikat dilewati (discard).`;
      }
    }

    return {
      batch: { ...createdBatch, total_orders: insertedCount + updatedCount },
      parseResult: enrichedResult,
      stats: {
        total: enrichedResult.totalOrders,
        inserted: insertedCount,
        duplicates: duplicateOrdersCount,
        skipped: skippedCount,
        updated: updatedCount,
      },
      message: summaryMessage,
    };
  }, { behavior: 'immediate' });
}

export async function getBatches() {
  return db.select().from(batches).orderBy(desc(batches.uploaded_at));
}

export async function getOrders(filters: {
  batchId?: number;
  status?: 'menunggu_dikemas' | 'dikemas' | 'dikirim' | 'dibatalkan';
  isPacked?: boolean;
  isShipped?: boolean;
  needsReview?: boolean;
  search?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
}) {
  const conditions = [];

  if (filters.batchId) {
    conditions.push(eq(orders.batch_id, filters.batchId));
  }
  if (filters.status) {
    conditions.push(eq(orders.status, filters.status));
  }
  if (filters.isPacked !== undefined) {
    conditions.push(eq(orders.is_packed, filters.isPacked));
  }
  if (filters.isShipped !== undefined) {
    conditions.push(eq(orders.is_shipped, filters.isShipped));
  }
  if (filters.needsReview !== undefined) {
    conditions.push(eq(orders.needs_review, filters.needsReview));
  }
  const effectiveDate = sql`CASE WHEN ${orders.ship_date} GLOB '??-??-????'
    THEN substr(${orders.ship_date},7,4)||'-'||substr(${orders.ship_date},4,2)||'-'||substr(${orders.ship_date},1,2)
    WHEN ${orders.ship_date} GLOB '????-??-??' THEN ${orders.ship_date}
    ELSE date(${orders.created_at},'+7 hours') END`;
  if (filters.date) conditions.push(sql`${effectiveDate} = ${filters.date.trim()}`);
  if (filters.startDate) conditions.push(sql`${effectiveDate} >= ${filters.startDate.trim()}`);
  if (filters.endDate) conditions.push(sql`${effectiveDate} <= ${filters.endDate.trim()}`);
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(orders.resi, term),
        like(orders.order_id, term),
        like(orders.recipient_name, term),
        like(orders.sorting_code, term)
      )
    );
  }

  const baseQuery = db.select().from(orders);
  const rows =
    conditions.length > 0
      ? await baseQuery.where(and(...conditions)).orderBy(desc(orders.id))
      : await baseQuery.orderBy(desc(orders.id));

  // Fetch items only for these filtered orders (chunked to prevent SQLite parameter limits)
  const orderIds = rows.map((r) => r.id);
  const allItems: (typeof order_items.$inferSelect)[] = [];
  if (orderIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const itemsChunk = await db
        .select()
        .from(order_items)
        .where(inArray(order_items.order_id, chunk));
      allItems.push(...itemsChunk);
    }
  }

  const itemsByOrderId = new Map<number, (typeof order_items.$inferSelect)[]>();
  for (const item of allItems) {
    if (!itemsByOrderId.has(item.order_id)) {
      itemsByOrderId.set(item.order_id, []);
    }
    itemsByOrderId.get(item.order_id)!.push(item);
  }

  return rows.map((order) => ({
    ...order,
    items: itemsByOrderId.get(order.id) || [],
  }));
}

export async function getOrderByResi(resi: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.resi, resi.trim()))
    .limit(1);

  if (!order) return null;

  const items = await db
    .select()
    .from(order_items)
    .where(eq(order_items.order_id, order.id));

  return {
    ...order,
    items,
  };
}

export async function getOrderById(id: number) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!order) return null;

  const items = await db
    .select()
    .from(order_items)
    .where(eq(order_items.order_id, order.id));

  return {
    ...order,
    items,
  };
}

export async function updateBatch(id: number, input: { name: string }) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, id)).limit(1);
  if (!batch) {
    throw new Error(`Batch dengan ID #${id} tidak ditemukan`);
  }

  const [updated] = await db
    .update(batches)
    .set({ name: input.name })
    .where(eq(batches.id, id))
    .returning();

  return updated;
}

export async function deleteBatch(id: number) {
  const {batch, orderIds} = db.transaction(tx => {
  const [batch] = tx.select().from(batches).where(eq(batches.id, id)).limit(1).all();
  if (!batch) {
    throw new Error(`Batch dengan ID #${id} tidak ditemukan`);
  }

  // Cari semua ID pesanan di dalam batch ini
  const batchOrders = tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.batch_id, id)).all();
  const orderIds = batchOrders.map((o) => o.id);

  if (orderIds.length > 0) {
    // 1. Hapus rincian item barang pesanan
    tx.delete(order_items).where(inArray(order_items.order_id, orderIds)).run();

    // 2. Putuskan relasi scan_logs agar log riwayat scan tetap tersimpan
    tx.update(scan_logs).set({ order_id: null }).where(inArray(scan_logs.order_id, orderIds)).run();

    // 3. Hapus data pesanan
    tx.delete(orders).where(eq(orders.batch_id, id)).run();
  }

  // 4. Hapus data batch
  tx.delete(batches).where(eq(batches.id, id)).run();

    return {batch, orderIds};
  }, {behavior:"immediate"});
  // 5. Hapus file fisik PDF jika ada (hanya jika berada di dalam folder upload data/pdf)
  if (batch.pdf_path && !db.select({id:batches.id}).from(batches).where(eq(batches.pdf_path,batch.pdf_path)).limit(1).get()) {
    try {
      const resolvedPath = path.resolve(batch.pdf_path);
      const pdfUploadDir = path.resolve(config.paths.pdfDir);
      // Cegah penghapusan jika file berada di luar direktori pdf upload (misal file fixture di docs)
      if (resolvedPath.startsWith(pdfUploadDir + path.sep) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
    } catch {
      // Abaikan jika file tidak dapat dihapus
    }
  }

  return { success: true, deletedOrdersCount: orderIds.length };
}

export interface UpdateOrderItemInput {
  id?: number;
  product_name: string;
  sku: string;
  seller_sku?: string | null;
  qty: number;
}

export interface UpdateOrderInput {
  resi?: string;
  order_id?: string;
  courier?: string;
  service?: string;
  is_cod?: boolean;
  weight_kg?: number;
  ship_date?: string | null;
  recipient_name?: string;
  recipient_phone?: string | null;
  recipient_address?: string;
  sorting_code?: string | null;
  needs_review?: boolean;
  validation_notes?: string | null;
  items?: UpdateOrderItemInput[];
}

export async function updateOrder(id: number, input: UpdateOrderInput) {
  db.transaction(tx => {
    const [order] = tx.select().from(orders).where(eq(orders.id, id)).limit(1).all();
    if (!order) {
      throw new Error(`Pesanan dengan ID #${id} tidak ditemukan`);
    }

    // Jika resi diubah, pastikan tidak bertabrakan dengan resi lain
    if (input.resi && input.resi.trim() !== order.resi) {
      const [existing] = tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.resi, input.resi.trim()))
        .limit(1).all();

      if (existing && existing.id !== id) {
        throw new Error(`Resi "${input.resi.trim()}" sudah digunakan pada pesanan lain`);
      }
    }

    const updateFields: Partial<typeof orders.$inferInsert> = {};
    if (input.resi !== undefined) updateFields.resi = input.resi.trim();
    if (input.order_id !== undefined) updateFields.order_id = input.order_id.trim();
    if (input.courier !== undefined) updateFields.courier = input.courier.trim();
    if (input.service !== undefined) updateFields.service = input.service.trim();
    if (input.is_cod !== undefined) updateFields.is_cod = input.is_cod;
    if (input.weight_kg !== undefined) updateFields.weight_kg = input.weight_kg;
    if (input.ship_date !== undefined) {
      updateFields.ship_date = input.ship_date ? input.ship_date.trim() : null;
    }
    if (input.recipient_name !== undefined) updateFields.recipient_name = input.recipient_name.trim();
    if (input.recipient_phone !== undefined) {
      updateFields.recipient_phone = input.recipient_phone ? input.recipient_phone.trim() : null;
    }
    if (input.recipient_address !== undefined) {
      updateFields.recipient_address = input.recipient_address.trim();
    }
    if (input.sorting_code !== undefined) {
      updateFields.sorting_code = input.sorting_code ? input.sorting_code.trim() : null;
    }
    if (input.needs_review !== undefined) updateFields.needs_review = input.needs_review;
    if (input.validation_notes !== undefined) updateFields.validation_notes = input.validation_notes;

    // Update item list jika diberikan
    if (input.items && Array.isArray(input.items)) {
      if (order.is_packed || order.is_shipped) throw new Error('Rincian paket yang sudah diproses terkunci.');
      if (input.items.length === 0) {
        throw new Error('Pesanan harus memiliki minimal 1 barang');
      }

      let calculatedQtyTotal = 0;
      for (const item of input.items) {
        if (!item.product_name || !item.product_name.trim()) {
          throw new Error('Nama produk tidak boleh kosong');
        }
        if (!item.sku || !item.sku.trim()) {
          throw new Error('SKU produk tidak boleh kosong');
        }
        if (typeof item.qty !== 'number' || item.qty <= 0) {
          throw new Error('Kuantitas (Qty) barang harus lebih besar dari 0');
        }
        calculatedQtyTotal += item.qty;
      }

      // Ganti rincian items lama dengan yang baru
      tx.delete(order_items).where(eq(order_items.order_id, id)).run();
      tx.insert(order_items).values(
        input.items.map((it) => ({
          order_id: id,
          product_name: it.product_name.trim(),
          sku: it.sku.trim(),
          seller_sku: it.seller_sku ? it.seller_sku.trim() : null,
          qty: it.qty,
        }))
      ).run();

      updateFields.qty_total = calculatedQtyTotal;
    }

    if (Object.keys(updateFields).length > 0) {
      tx.update(orders).set(updateFields).where(eq(orders.id, id)).run();
    }

  }, {behavior:'immediate'});
  return await getOrderById(id);
}

export async function deleteOrder(id: number) {
  return db.transaction(tx => {
  const [order] = tx.select().from(orders).where(eq(orders.id, id)).limit(1).all();
  if (!order) {
    throw new Error(`Pesanan dengan ID #${id} tidak ditemukan`);
  }

  // 1. Hapus item barang pesanan
  tx.delete(order_items).where(eq(order_items.order_id, id)).run();

  // 2. Putuskan relasi scan_logs
  tx.update(scan_logs).set({ order_id: null }).where(eq(scan_logs.order_id, id)).run();

  // 3. Hapus pesanan
  tx.delete(orders).where(eq(orders.id, id)).run();

  return { success: true, deletedResi: order.resi, batchId: order.batch_id };
  }, {behavior:'immediate'});
}

export async function cancelOrder(id: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) {
    throw new Error(`Pesanan dengan ID #${id} tidak ditemukan`);
  }

  const [updated] = await db
    .update(orders)
    .set({
      status: 'dibatalkan',
    })
    .where(eq(orders.id, id))
    .returning();

  return await getOrderById(updated.id);
}

export async function restoreOrder(id: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) {
    throw new Error(`Pesanan dengan ID #${id} tidak ditemukan`);
  }

  const restoredStatus = order.is_shipped
    ? 'dikirim'
    : order.is_packed
      ? 'dikemas'
      : 'menunggu_dikemas';

  const [updated] = await db
    .update(orders)
    .set({
      status: restoredStatus,
    })
    .where(eq(orders.id, id))
    .returning();

  return await getOrderById(updated.id);
}
