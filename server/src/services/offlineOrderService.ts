import { eq, or, like, sql, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
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
    const [matchedCustomer] = await db
      .select()
      .from(customers)
      .where(eq(sql`lower(${customers.name})`, input.customer_name.trim().toLowerCase()))
      .limit(1);
    if (matchedCustomer) {
      customerId = matchedCustomer.id;
    }
  }

  const [order] = await db
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
    .returning();

  for (const item of input.items) {
    const cleanSku = item.seller_sku.trim();
    if (!cleanSku) throw new Error('Seller SKU tidak boleh kosong');
    if (typeof item.qty !== 'number' || item.qty <= 0) {
      throw new Error(`Qty untuk Seller SKU "${cleanSku}" minimal 1`);
    }

    const prod = await findProductBySellerSku(cleanSku);
    const productName = item.product_name?.trim() || prod?.name || cleanSku;

    await db.insert(offline_order_items).values({
      offline_order_id: order.id,
      product_id: prod?.id ?? null,
      seller_sku: prod?.seller_sku ?? cleanSku,
      product_name: productName,
      qty: item.qty,
      price: item.price ?? 0,
    });
  }

  return await getOfflineOrderById(order.id);
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

  // Ambil items untuk setiap pesanan offline
  const result = [];
  for (const ord of rows) {
    const items = await db
      .select()
      .from(offline_order_items)
      .where(eq(offline_order_items.offline_order_id, ord.id));

    result.push({
      ...ord,
      items,
      total_qty: items.reduce((s, it) => s + it.qty, 0),
      total_amount: items.reduce((s, it) => s + it.qty * (it.price || 0), 0),
    });
  }

  return result;
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

  if (Object.keys(updateFields).length > 0) {
    await db.update(offline_orders).set(updateFields).where(eq(offline_orders.id, id));
  }

  if (input.items && Array.isArray(input.items)) {
    if (input.items.length === 0) throw new Error('Pesanan offline harus memiliki minimal 1 barang');
    await db.delete(offline_order_items).where(eq(offline_order_items.offline_order_id, id));

    for (const item of input.items) {
      const cleanSku = item.seller_sku.trim();
      const prod = await findProductBySellerSku(cleanSku);
      const productName = item.product_name?.trim() || prod?.name || cleanSku;

      await db.insert(offline_order_items).values({
        offline_order_id: id,
        product_id: prod?.id ?? null,
        seller_sku: prod?.seller_sku ?? cleanSku,
        product_name: productName,
        qty: item.qty,
        price: item.price ?? 0,
      });
    }
  }

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
