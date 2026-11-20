import { eq, or, like, sql, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  customers,
  offline_orders,
  offline_order_items,
  type Customer,
  type NewCustomer,
} from '../db/schema.js';

const resolvedCustomerId = sql<number | null>`COALESCE(${offline_orders.customer_id}, (
  SELECT CASE WHEN count(*)=1 THEN min(c.id) END FROM customers c
  WHERE lower(trim(c.name))=lower(trim(${offline_orders.customer_name}))
    AND (coalesce(${offline_orders.customer_phone},'')='' OR trim(c.phone)=trim(${offline_orders.customer_phone}))
))`;

export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  channel?: 'offline' | 'online' | 'omnichannel';
  notes?: string | null;
  photo_url?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  channel?: 'offline' | 'online' | 'omnichannel';
  notes?: string | null;
  photo_url?: string | null;
}

export interface CustomerWithSummary extends Customer {
  total_items_purchased: number; // Jumlah total barang (pcs) yang dibeli
  total_orders_count: number;
  last_order_date: string | null;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const cleanName = input.name?.trim();
  if (!cleanName) {
    throw new Error('Nama pelanggan wajib diisi');
  }

  const [created] = await db
    .insert(customers)
    .values({
      name: cleanName,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      channel: input.channel || 'offline',
      photo_url: input.photo_url || null,
      notes: input.notes?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .returning();

  return created;
}

export async function getCustomers(filters?: {
  search?: string;
  channel?: string;
}): Promise<CustomerWithSummary[]> {
  const conditions = [];

  if (filters?.channel && filters.channel !== 'all') {
    conditions.push(eq(customers.channel, filters.channel as any));
  }

  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${customers.name})`, term),
        like(sql`lower(${customers.phone})`, term),
        like(sql`lower(${customers.email})`, term),
        like(sql`lower(${customers.address})`, term)
      )
    );
  }

  const query = db.select().from(customers);
  const rows =
    conditions.length > 0
      ? await query.where(sql.join(conditions, sql` AND `)).orderBy(desc(customers.id))
      : await query.orderBy(desc(customers.id));

  // Agregasi item dan pesanan secara efisien dengan Map O(O + I)
  const allOrders = await db.select({
    id: offline_orders.id,
    customer_id: resolvedCustomerId,
    customer_name: offline_orders.customer_name,
    order_date: offline_orders.order_date,
  }).from(offline_orders).where(sql`${offline_orders.status} != 'dibatalkan'`);

  const allItems = await db.select({
    offline_order_id: offline_order_items.offline_order_id,
    qty: offline_order_items.qty,
  }).from(offline_order_items);

  const orderQtyMap = new Map<number, number>();
  for (const item of allItems) {
    orderQtyMap.set(item.offline_order_id, (orderQtyMap.get(item.offline_order_id) || 0) + (item.qty || 0));
  }

  // Pre-agregasi per customer_id dan per customer_name
  const custIdStats = new Map<number, { totalOrders: number; totalQty: number; latestDate: string | null }>();


  for (const ord of allOrders) {
    const qty = orderQtyMap.get(ord.id) || 0;
    if (ord.customer_id) {
      const stat = custIdStats.get(ord.customer_id) || { totalOrders: 0, totalQty: 0, latestDate: null };
      stat.totalOrders += 1;
      stat.totalQty += qty;
      if (!stat.latestDate || ord.order_date > stat.latestDate) {
        stat.latestDate = ord.order_date;
      }
      custIdStats.set(ord.customer_id, stat);

    }
  }

  return rows.map((cust) => {
    const byId = custIdStats.get(cust.id);
    const totalOrdersCount = byId?.totalOrders ?? 0;
    const totalItemsPurchased = byId?.totalQty ?? 0;
    const latestDate = byId?.latestDate ?? null;
    return {
      ...cust,
      total_items_purchased: totalItemsPurchased,
      total_orders_count: totalOrdersCount,
      last_order_date: latestDate,
    };
  });
}

export async function getCustomerById(id: number) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!customer) return null;

  // Ambil pesanan yang terhubung ke pelanggan ini
  const ordersList = await db
    .select()
    .from(offline_orders)
    .where(sql`${resolvedCustomerId} = ${id}`)
    .orderBy(desc(offline_orders.order_date), desc(offline_orders.id));

  const detailedOrders = [];
  let totalItemsPurchased = 0;
  let totalSpentAmount = 0;

  for (const ord of ordersList) {
    const items = await db
      .select()
      .from(offline_order_items)
      .where(eq(offline_order_items.offline_order_id, ord.id));

    const orderQty = items.reduce((acc, it) => acc + (it.qty || 0), 0);
    const orderTotal = items.reduce((acc, it) => acc + (it.qty || 0) * (it.price || 0), 0);

    if (ord.status !== 'dibatalkan') {
      totalItemsPurchased += orderQty;
      totalSpentAmount += orderTotal;
    }

    detailedOrders.push({
      ...ord,
      items,
      total_qty: orderQty,
      total_amount: orderTotal,
    });
  }

  return {
    ...customer,
    total_items_purchased: totalItemsPurchased,
    total_orders_count: ordersList.filter(o=>o.status!=='dibatalkan').length,
    total_spent_amount: totalSpentAmount,
    orders: detailedOrders,
  };
}

export async function updateCustomer(id: number, input: UpdateCustomerInput) {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) {
    throw new Error(`Pelanggan ID #${id} tidak ditemukan`);
  }

  const updates: Partial<NewCustomer> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    const cleanName = input.name.trim();
    if (!cleanName) throw new Error('Nama pelanggan tidak boleh kosong');
    updates.name = cleanName;
  }
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.email !== undefined) updates.email = input.email?.trim() || null;
  if (input.address !== undefined) updates.address = input.address?.trim() || null;
  if (input.channel !== undefined) updates.channel = input.channel;
  if (input.photo_url !== undefined) updates.photo_url = input.photo_url || null;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  await db.update(customers).set(updates).where(eq(customers.id, id));

  return await getCustomerById(id);
}

export async function deleteCustomer(id: number) {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) {
    throw new Error(`Pelanggan ID #${id} tidak ditemukan`);
  }

  // Lepaskan referensi customer_id pada offline_orders jika ada
  await db
    .update(offline_orders)
    .set({ customer_id: null })
    .where(eq(offline_orders.customer_id, id));

  await db.delete(customers).where(eq(customers.id, id));

  return { success: true, deletedId: id, name: existing.name };
}
