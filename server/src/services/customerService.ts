import { eq, or, like, sql, desc, isNull, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  customers,
  offline_orders,
  offline_order_items,
  type Customer,
  type NewCustomer,
} from '../db/schema.js';

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

  // Ambil semua pesanan offline beserta items untuk kalkulasi total pembelian
  const allOrders = await db.select().from(offline_orders);
  const allItems = await db.select().from(offline_order_items);

  // Map order items by offline_order_id
  const itemsByOrderId = new Map<number, typeof allItems>();
  for (const item of allItems) {
    const arr = itemsByOrderId.get(item.offline_order_id) || [];
    arr.push(item);
    itemsByOrderId.set(item.offline_order_id, arr);
  }

  return rows.map((cust) => {
    // Cari pesanan yang terhubung ke pelanggan (by customer_id ATAU nama yang persis sama)
    const custOrders = allOrders.filter(
      (ord) =>
        ord.customer_id === cust.id ||
        (!ord.customer_id && ord.customer_name.trim().toLowerCase() === cust.name.trim().toLowerCase())
    );

    let totalItems = 0;
    let latestDate: string | null = null;

    for (const ord of custOrders) {
      const orderItems = itemsByOrderId.get(ord.id) || [];
      const orderTotalQty = orderItems.reduce((acc, it) => acc + (it.qty || 0), 0);
      totalItems += orderTotalQty;

      if (!latestDate || ord.order_date > latestDate) {
        latestDate = ord.order_date;
      }
    }

    return {
      ...cust,
      total_items_purchased: totalItems,
      total_orders_count: custOrders.length,
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
    .where(
      or(
        eq(offline_orders.customer_id, id),
        and(
          isNull(offline_orders.customer_id),
          eq(sql`lower(${offline_orders.customer_name})`, customer.name.trim().toLowerCase())
        )
      )
    )
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

    totalItemsPurchased += orderQty;
    totalSpentAmount += orderTotal;

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
    total_orders_count: detailedOrders.length,
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
