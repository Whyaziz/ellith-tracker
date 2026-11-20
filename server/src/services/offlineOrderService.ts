import { eq, or, like, sql, desc, inArray } from 'drizzle-orm';
import { db, sqlite } from '../db/client.js';
import { offline_orders, offline_order_items, products, customers } from '../db/schema.js';
import { findProductBySellerSku } from './productService.js';


export interface CreateOfflineOrderItemInput {
  seller_sku: string;
  product_name?: string;
  qty: number;
  price?: number;
}

export interface CreateOfflineOrderInput {
  order_no?: string;
  order_date: string;
  customer_id?: number | null;
  customer_name: string;
  customer_phone?: string | null;
  notes?: string | null;
  status?: 'menunggu_dikemas' | 'dikemas' | 'dikirim' | 'selesai' | 'dibatalkan';
  items: CreateOfflineOrderItemInput[];
  userId: number;
}

export interface UpdateOfflineOrderInput {
  order_date?: string;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string | null;
  notes?: string | null;
  status?: 'menunggu_dikemas' | 'dikemas' | 'dikirim' | 'selesai' | 'dibatalkan';
  items?: CreateOfflineOrderItemInput[];
}

async function prepareItems(items: CreateOfflineOrderItemInput[]) {
  const rows: Omit<typeof offline_order_items.$inferInsert, 'offline_order_id'>[] = [];

  for (const item of items) {
    const cleanSku = item.seller_sku.trim();
    if (!cleanSku) throw new Error('Seller SKU tidak boleh kosong');
    if (!Number.isSafeInteger(item.qty) || item.qty <= 0) {
      throw new Error(`Qty untuk Seller SKU "${cleanSku}" minimal 1`);
    }

    const prod = await findProductBySellerSku(cleanSku);
    const productName = item.product_name?.trim() || prod?.name || cleanSku;
    if (!Number.isFinite(item.price ?? 0) || (item.price ?? 0) < 0) throw new Error("Harga tidak valid");

    rows.push({
      product_id: prod?.id ?? null,
      seller_sku: prod?.seller_sku ?? cleanSku,
      product_name: productName,
      qty: item.qty,
      price: item.price ?? 0,
    });
  }

  return rows;
}

export async function createOfflineOrder(input: CreateOfflineOrderInput) {
  if (!input.customer_name || !input.customer_name.trim()) {
    throw new Error('Nama pelanggan wajib diisi');
  }
  if (!input.items || input.items.length === 0) {
    throw new Error('Pesanan offline harus memiliki minimal 1 barang');
  }

  // Generate nomor nota / pesanan offline (misal: OFF-20261104-5821)
  const today = (input.order_date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const order_no = input.order_no?.trim() || `OFF-${today}-${randomSuffix}`;

  const [existing] = await db
    .select()
    .from(offline_orders)
    .where(eq(offline_orders.order_no, order_no))
    .limit(1);

  if (existing) {
    throw new Error(`Nomor pesanan "${order_no}" sudah digunakan`);
  }

  // Cari customer_id jika tidak disuplai secara eksplisit tapi ada customer dengan nama yang cocok
  let customerId = input.customer_id ?? null;
  if (!customerId) {
    const matches = await db
      .select()
      .from(customers)
      .where(eq(sql`lower(${customers.name})`, input.customer_name.trim().toLowerCase()))
      .limit(2);
    if (matches.length === 1 && (!input.customer_phone || matches[0].phone === input.customer_phone.trim())) {
      customerId = matches[0].id;
    }
  }

  const rows = await prepareItems(input.items);

  const order = db.transaction((tx) => {
    const [order] = tx
      .insert(offline_orders)
      .values({
        order_no,
        order_date: input.order_date,
        customer_id: customerId,
        customer_name: input.customer_name.trim(),
        customer_phone: input.customer_phone?.trim() || null,
        notes: input.notes?.trim() || null,
        status: input.status || 'selesai',
        created_by: input.userId,
      })
      .returning().all();
    for (const row of rows) tx.insert(offline_order_items).values({ ...row, offline_order_id: order.id }).run();
    return order;
  });
  return getOfflineOrderById(order.id);
}

export async function getOfflineOrders(filters?: {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}) {
  const conditions = [];

  if (filters?.status && filters.status !== 'all') {
    conditions.push(eq(offline_orders.status, filters.status as any));
  }

  if (filters?.startDate) {
    conditions.push(sql`${offline_orders.order_date} >= ${filters.startDate}`);
  }

  if (filters?.endDate) {
    conditions.push(sql`${offline_orders.order_date} <= ${filters.endDate}`);
  }

  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${offline_orders.order_no})`, term),
        like(sql`lower(${offline_orders.customer_name})`, term),
        like(sql`lower(${offline_orders.customer_phone})`, term)
      )
    );
  }

  const query = db.select().from(offline_orders);
  const rows =
    conditions.length > 0
      ? await query.where(sql.join(conditions, sql` AND `)).orderBy(desc(offline_orders.id))
      : await query.orderBy(desc(offline_orders.id));

  // Ambil items untuk pesanan offline secara efisien (menghindari N+1 query)
  const orderIds = rows.map((r) => r.id);
  const allItems: (typeof offline_order_items.$inferSelect)[] = [];
  if (orderIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const itemsChunk = await db
        .select()
        .from(offline_order_items)
        .where(inArray(offline_order_items.offline_order_id, chunk));
      allItems.push(...itemsChunk);
    }
  }

  const itemsByOrderId = new Map<number, (typeof offline_order_items.$inferSelect)[]>();
  for (const item of allItems) {
    if (!itemsByOrderId.has(item.offline_order_id)) {
      itemsByOrderId.set(item.offline_order_id, []);
    }
    itemsByOrderId.get(item.offline_order_id)!.push(item);
  }

  return rows.map((ord) => {
    const items = itemsByOrderId.get(ord.id) || [];
    return {
      ...ord,
      items,
      total_qty: items.reduce((s, it) => s + it.qty, 0),
      total_amount: items.reduce((s, it) => s + it.qty * (it.price || 0), 0),
    };
  });
}

export async function getOfflineOrderById(id: number) {
  const [order] = await db
    .select()
    .from(offline_orders)
    .where(eq(offline_orders.id, id))
    .limit(1);

  if (!order) return null;

  const items = await db
    .select()
    .from(offline_order_items)
    .where(eq(offline_order_items.offline_order_id, id));

  return {
    ...order,
    items,
    total_qty: items.reduce((s, it) => s + it.qty, 0),
    total_amount: items.reduce((s, it) => s + it.qty * (it.price || 0), 0),
  };
}

// Release the newest allocated units first, retaining the cost of the oldest units on the invoice.
function shrinkOfflineIssue(itemId: number, original: number, keep: number, unitCost: number) {
  const issue = sqlite.prepare("SELECT id FROM inventory_issues WHERE source='offline' AND item_id=?").get(itemId) as {id:number} | undefined;
  if (!issue) return;
  const lots = sqlite.prepare('SELECT lot_id,qty,unit_cost FROM inventory_allocations WHERE issue_id=? ORDER BY lot_id').all(issue.id) as
    { lot_id:number; qty:number; unit_cost:number }[];
  const allocated = lots.reduce((sum, lot) => sum + lot.qty, 0);
  const historicalValue = lots.reduce((sum, lot) => sum + lot.qty * lot.unit_cost, 0);
  const fallback = original > allocated ? (original * unitCost - historicalValue) / (original - allocated) : 0;
  let needed = keep;
  let value = 0;
  for (const lot of lots) {
    const used = Math.min(needed, lot.qty);
    if (used < lot.qty) {
      sqlite.prepare('UPDATE stock_batch_items SET remaining_qty=remaining_qty+? WHERE id=?').run(lot.qty-used, lot.lot_id);
      if (used) sqlite.prepare('UPDATE inventory_allocations SET qty=? WHERE issue_id=? AND lot_id=?').run(used,issue.id,lot.lot_id);
      else sqlite.prepare('DELETE FROM inventory_allocations WHERE issue_id=? AND lot_id=?').run(issue.id,lot.lot_id);
    }
    value += used * lot.unit_cost;
    needed -= used;
  }
  sqlite.prepare('UPDATE inventory_issues SET qty=? WHERE id=?').run(keep,issue.id);
  sqlite.prepare('UPDATE offline_order_items SET cogs_unit_fifo=? WHERE id=?').run((value+needed*fallback)/keep,itemId);
}

export async function updateOfflineOrder(id: number, input: UpdateOfflineOrderInput) {
  const [current] = await db
    .select()
    .from(offline_orders)
    .where(eq(offline_orders.id, id))
    .limit(1);

  if (!current) {
    throw new Error(`Pesanan offline ID #${id} tidak ditemukan`);
  }

  const updateFields: Partial<typeof offline_orders.$inferInsert> = {};

  if (input.order_date !== undefined) updateFields.order_date = input.order_date;
  if (input.customer_id !== undefined) updateFields.customer_id = input.customer_id;
  if (input.customer_name !== undefined) {
    const name = input.customer_name.trim();
    if (!name) throw new Error('Nama pelanggan tidak boleh kosong');
    updateFields.customer_name = name;
  }
  if (input.customer_phone !== undefined) updateFields.customer_phone = input.customer_phone?.trim() || null;
  if (input.notes !== undefined) updateFields.notes = input.notes?.trim() || null;
  if (input.status !== undefined) updateFields.status = input.status;

  if (input.items?.length === 0) throw new Error('Pesanan wajib memiliki barang');
  const rows = input.items ? await prepareItems(input.items) : undefined;
  db.transaction((tx) => {
    if (Object.keys(updateFields).length) tx.update(offline_orders).set(updateFields).where(eq(offline_orders.id, id)).run();
    if (!rows) return;
    const existing = tx.select().from(offline_order_items).where(eq(offline_order_items.offline_order_id, id)).all();
    const additions = [];
    for (const row of rows) {
      let needed = row.qty;
      while (needed > 0) {
        const index = existing.findIndex(item => item.seller_sku === row.seller_sku);
        if (index < 0) break;
        const [item] = existing.splice(index, 1);
        const keep = Math.min(item.qty, needed);
        if (keep < item.qty) shrinkOfflineIssue(item.id, item.qty, keep, item.cogs_unit_fifo ?? 0);
        tx.update(offline_order_items).set({ price: row.price, product_name: row.product_name, qty: keep })
          .where(eq(offline_order_items.id, item.id)).run();
        needed -= keep;
      }
      if (needed) additions.push({ ...row, qty: needed, offline_order_id: id });
    }
    for (const item of existing) tx.delete(offline_order_items).where(eq(offline_order_items.id, item.id)).run();
    for (const row of additions) tx.insert(offline_order_items).values(row).run();
  }, { behavior: 'immediate' });

  return await getOfflineOrderById(id);
}

export async function deleteOfflineOrder(id: number) {
  const [order] = await db
    .select()
    .from(offline_orders)
    .where(eq(offline_orders.id, id))
    .limit(1);

  if (!order) {
    throw new Error(`Pesanan offline ID #${id} tidak ditemukan`);
  }

  await db.delete(offline_order_items).where(eq(offline_order_items.offline_order_id, id));
  await db.delete(offline_orders).where(eq(offline_orders.id, id));

  return { success: true, deletedOrderNo: order.order_no };
}
