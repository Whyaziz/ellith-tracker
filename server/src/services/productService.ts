import { eq, or, like, sql, desc, asc } from 'drizzle-orm';
import { db, sqlite } from '../db/client.js';
import { product_categories, products } from '../db/schema.js';

export function detectProductColor(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('biru laut')) return '#0ea5e9';
  if (lower.includes('sage')) return '#739072';
  if (lower.includes('cream')) return '#c4a482';
  if (lower.includes('violet')) return '#8b5cf6';
  if (lower.includes('pink')) return '#ec4899';
  if (lower.includes('hitam')) return '#1e293b';
  if (lower.includes('army')) return '#4d7c0f';
  if (lower.includes('navy')) return '#1e3a8a';
  if (lower.includes('maroon')) return '#881337';
  if (lower.includes('custom')) return '#6366f1';
  return '#4f46e5';
}

export interface CreateProductInput {
  seller_sku: string;
  name: string;
  category_id?: number | null;
  sku_temp?: string | null;
  image_url?: string | null;
  label_color?: string | null;
  min_stock?: number;
  max_stock?: number;
}

export interface UpdateProductInput {
  seller_sku?: string;
  name?: string;
  category_id?: number | null;
  sku_temp?: string | null;
  image_url?: string | null;
  label_color?: string | null;
  min_stock?: number;
  max_stock?: number;
}

// ----------------- KATEGORI PRODUK -----------------

export async function getCategories() {
  return await db.select().from(product_categories).orderBy(asc(product_categories.name));
}

export async function createCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Nama kategori tidak boleh kosong');
  }

  const [existing] = await db
    .select()
    .from(product_categories)
    .where(eq(product_categories.name, trimmed))
    .limit(1);

  if (existing) {
    throw new Error(`Kategori "${trimmed}" sudah ada`);
  }

  const [created] = await db
    .insert(product_categories)
    .values({ name: trimmed })
    .returning();

  return created;
}

export async function updateCategory(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Nama kategori tidak boleh kosong');
  }

  const [existing] = await db
    .select()
    .from(product_categories)
    .where(eq(product_categories.name, trimmed))
    .limit(1);

  if (existing && existing.id !== id) {
    throw new Error(`Kategori "${trimmed}" sudah digunakan`);
  }

  const [updated] = await db
    .update(product_categories)
    .set({ name: trimmed })
    .where(eq(product_categories.id, id))
    .returning();

  return updated;
}

export async function deleteCategory(id: number) {
  const [cat] = await db
    .select()
    .from(product_categories)
    .where(eq(product_categories.id, id))
    .limit(1);

  if (!cat) {
    throw new Error(`Kategori ID #${id} tidak ditemukan`);
  }

  // Set category_id = null pada produk yang menggunakan kategori ini
  await db
    .update(products)
    .set({ category_id: null })
    .where(eq(products.category_id, id));

  await db.delete(product_categories).where(eq(product_categories.id, id));
  return { success: true, deletedName: cat.name };
}

// ----------------- MASTER PRODUK -----------------

export async function getProducts(filters?: { categoryId?: number; search?: string }) {
  const conditions = [];

  if (filters?.categoryId) {
    conditions.push(eq(products.category_id, filters.categoryId));
  }

  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${products.seller_sku})`, term),
        like(sql`lower(${products.name})`, term),
        like(sql`lower(${products.sku_temp})`, term)
      )
    );
  }

  const query = db
    .select({
      id: products.id,
      seller_sku: products.seller_sku,
      sku_temp: products.sku_temp,
      name: products.name,
      category_id: products.category_id,
      category_name: product_categories.name,
      image_url: products.image_url,
      label_color: products.label_color,
      min_stock: products.min_stock,
      max_stock: products.max_stock,
      created_at: products.created_at,
    })
    .from(products)
    .leftJoin(product_categories, eq(products.category_id, product_categories.id));

  const rows =
    conditions.length > 0
      ? await query.where(sql.join(conditions, sql` AND `)).orderBy(desc(products.id))
      : await query.orderBy(desc(products.id));

  return rows;
}

export async function getProductById(id: number) {
  const [row] = await db
    .select({
      id: products.id,
      seller_sku: products.seller_sku,
      sku_temp: products.sku_temp,
      name: products.name,
      category_id: products.category_id,
      category_name: product_categories.name,
      image_url: products.image_url,
      label_color: products.label_color,
      min_stock: products.min_stock,
      max_stock: products.max_stock,
      created_at: products.created_at,
    })
    .from(products)
    .leftJoin(product_categories, eq(products.category_id, product_categories.id))
    .where(eq(products.id, id))
    .limit(1);

  return row || null;
}

/**
 * Mencari produk berdasarkan Seller SKU atau Alias (sku_temp)
 */
export function findProductBySellerSku(raw: string) {
  const code = raw.trim().toLowerCase();
  if (!code) return null;
  const exact = db.select().from(products).where(eq(sql`lower(${products.seller_sku})`, code)).get();
  if (exact) return exact;
  const candidates = db.select().from(products).where(like(sql`lower(${products.sku_temp})`, `%${code}%`)).all()
    .filter(p => p.sku_temp?.split(',').some(alias => alias.trim().toLowerCase() === code));
  if (candidates.length > 1) throw new Error(`Alias "${raw}" ambigu. Pilih SKU utama produk.`);
  return candidates[0] ?? null;
}

function checkSkuOwnership(sku: string, aliases?: string | null, owner?: number) {
  for (const code of [sku,...(aliases ?? '').split(',')].map(s=>s.trim()).filter(Boolean)) {
    const match = findProductBySellerSku(code);
    if (match && match.id !== owner) throw new Error(`SKU atau alias "${code}" telah digunakan produk lain.`);
  }
}

export async function createProduct(input: CreateProductInput) {
  const seller_sku = input.seller_sku.trim();
  const name = input.name.trim();

  if (!seller_sku) throw new Error('Seller SKU tidak boleh kosong');
  if (!name) throw new Error('Nama produk tidak boleh kosong');

  const [existing] = await db
    .select()
    .from(products)
    .where(eq(sql`lower(${products.seller_sku})`, seller_sku.toLowerCase()))
    .limit(1);

  if (existing) {
    throw new Error(`Produk dengan Seller SKU "${seller_sku}" sudah terdaftar`);
  }

  checkSkuOwnership(seller_sku,input.sku_temp);
  const [created] = db
    .insert(products)
    .values({
      seller_sku,
      name,
      category_id: input.category_id ?? null,
      sku_temp: input.sku_temp ? input.sku_temp.trim() : null,
      image_url: input.image_url ?? null,
      label_color: input.label_color
        ? input.label_color.trim()
        : detectProductColor(`${seller_sku} ${name} ${input.sku_temp || ''}`),
      min_stock: input.min_stock ?? 10,
      max_stock: input.max_stock ?? 100,
    })
    .returning().all();

  return await getProductById(created.id);
}

export async function updateProduct(id: number, input: UpdateProductInput) {
  const [current] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!current) {
    throw new Error(`Produk dengan ID #${id} tidak ditemukan`);
  }

  const updateFields: Partial<typeof products.$inferInsert> = {};

  if (input.seller_sku !== undefined) {
    const trimmed = input.seller_sku.trim();
    if (!trimmed) throw new Error('Seller SKU tidak boleh kosong');
    const [existing] = await db
      .select()
      .from(products)
      .where(eq(sql`lower(${products.seller_sku})`, trimmed.toLowerCase()))
      .limit(1);

    if (existing && existing.id !== id) {
      throw new Error(`Seller SKU "${trimmed}" sudah digunakan oleh produk lain`);
    }
    updateFields.seller_sku = trimmed;
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('Nama produk tidak boleh kosong');
    updateFields.name = trimmed;
  }

  if (input.category_id !== undefined) {
    updateFields.category_id = input.category_id;
  }

  if (input.sku_temp !== undefined) {
    updateFields.sku_temp = input.sku_temp ? input.sku_temp.trim() : null;
  }

  if (input.image_url !== undefined) {
    updateFields.image_url = input.image_url;
  }

  if (input.label_color !== undefined) {
    updateFields.label_color = input.label_color ? input.label_color.trim() : '#4f46e5';
  }

  if (input.min_stock !== undefined) {
    updateFields.min_stock = Math.max(0, input.min_stock);
  }

  if (input.max_stock !== undefined) {
    updateFields.max_stock = Math.max(0, input.max_stock);
  }

  if (Object.keys(updateFields).length > 0) {
    db.transaction(tx => {
      const newSku = updateFields.seller_sku;
      if (newSku && newSku !== current.seller_sku) {
        const aliases = (updateFields.sku_temp ?? current.sku_temp ?? '').split(',').map(a=>a.trim()).filter(Boolean);
        updateFields.sku_temp = [...new Set([...aliases,current.seller_sku])].join(', ');
        // Keep lot references, historical snapshots and future cutoff replays on the same product.
        for (const table of ['stock_batch_items','stock_mutations','offline_order_items']) {
          sqlite.prepare(`UPDATE ${table} SET seller_sku=? WHERE product_id=? OR (product_id IS NULL AND seller_sku=? COLLATE NOCASE)`).run(newSku,id,current.seller_sku);
        }
        sqlite.prepare('UPDATE order_items SET seller_sku=? WHERE seller_sku=? COLLATE NOCASE').run(newSku,current.seller_sku);
        sqlite.prepare('UPDATE inventory_issues SET sku=? WHERE sku=? COLLATE NOCASE').run(newSku,current.seller_sku);
      }
      checkSkuOwnership(newSku ?? current.seller_sku, updateFields.sku_temp, id);
      tx.update(products).set(updateFields).where(eq(products.id,id)).run();
    }, {behavior:'immediate'});
  }

  return await getProductById(id);
}

export async function deleteProduct(id: number) {
  const [prod] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!prod) {
    throw new Error(`Produk dengan ID #${id} tidak ditemukan`);
  }

  await db.delete(products).where(eq(products.id, id));
  return { success: true, deletedSellerSku: prod.seller_sku, deletedName: prod.name };
}

/**
 * Memetakan SKU sementara / salah parsing ke produk resmi tertentu
 */
export async function mapSkuTemp(productId: number, aliasSku: string) {
  const cleanAlias = aliasSku.trim();
  if (!cleanAlias) throw new Error('Alias SKU tidak boleh kosong');

  const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!prod) throw new Error(`Produk dengan ID #${productId} tidak ditemukan`);

  checkSkuOwnership(prod.seller_sku,cleanAlias,productId);
  const aliases = (prod.sku_temp ?? '').split(',').map(s=>s.trim()).filter(Boolean);
  if (!aliases.some(a=>a.toLowerCase()===cleanAlias.toLowerCase())) {
    aliases.push(cleanAlias);
    db.update(products).set({ sku_temp: aliases.join(', ') }).where(eq(products.id,productId)).run();
  }
  return await getProductById(productId);
}
