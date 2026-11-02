import { eq, desc, and, or, like } from 'drizzle-orm';
import { db } from '../db/client.js';
import { batches, orders, order_items } from '../db/schema.js';
import { parseJtPdf, type ParsedOrder } from '../parsers/jnt.js';

export interface DuplicateInfo {
  batch_id: number;
  batch_name?: string;
  status: string;
  created_at: string;
}

export interface EnrichedParsedOrder extends ParsedOrder {
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

  for (const parsed of ordersList) {
    // 1. Cek duplikasi internal di dalam file PDF yang sama
    if (seenInPdf.has(parsed.resi)) {
      duplicateOrdersCount++;
      enriched.push({
        ...parsed,
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

  // Insert batch record
  const [createdBatch] = await db
    .insert(batches)
    .values({
      name: batchName,
      source_filename: input.sourceFilename,
      pdf_path: input.pdfPath,
      total_orders: newOrdersCount, // Simpan jumlah pesanan baru yang berhasil masuk di batch ini
      uploaded_at: new Date().toISOString(),
      created_by: input.userId,
    })
    .returning();

  for (const parsed of enrichedOrders) {
    if (parsed.is_duplicate) {
      if (skipDuplicates) {
        // DISCARD / SKIP: Jangan ubah data pesanan yang sudah ada di database
        skippedCount++;
        continue;
      }

      // Jika skipDuplicates === false (mode overwrite/update paksa)
      const [existingOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.resi, parsed.resi))
        .limit(1);

      if (existingOrder) {
        await db
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
          .where(eq(orders.id, existingOrder.id));

        updatedCount++;
        await db.delete(order_items).where(eq(order_items.order_id, existingOrder.id));
        if (parsed.items.length > 0) {
          await db.insert(order_items).values(
            parsed.items.map((item) => ({
              order_id: existingOrder.id,
              product_name: item.product_name,
              sku: item.sku,
              seller_sku: item.seller_sku,
              qty: item.qty,
            }))
          );
        }
      }
      continue;
    }

    // Insert pesanan baru yang belum pernah terdaftar
    const [newOrder] = await db
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
      .returning();

    insertedCount++;

    if (parsed.items.length > 0) {
      await db.insert(order_items).values(
        parsed.items.map((item) => ({
          order_id: newOrder.id,
          product_name: item.product_name,
          sku: item.sku,
          seller_sku: item.seller_sku,
          qty: item.qty,
        }))
      );
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
    batch: createdBatch,
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
}

export async function getBatches() {
  return db.select().from(batches).orderBy(desc(batches.uploaded_at));
}

export async function getOrders(filters: {
  batchId?: number;
  status?: 'menunggu_dikemas' | 'dikemas' | 'dikirim';
  isPacked?: boolean;
  isShipped?: boolean;
  needsReview?: boolean;
  search?: string;
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

  // Fetch items for these orders
  const orderIds = rows.map((r) => r.id);
  const allItems =
    orderIds.length > 0 ? await db.select().from(order_items) : [];

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
