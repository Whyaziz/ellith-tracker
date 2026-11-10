import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  products,
  product_categories,
  stock_batches,
  stock_batch_items,
  stock_mutations,
  orders,
  order_items,
  offline_orders,
  offline_order_items,
} from '../db/schema.js';
import { findProductBySellerSku } from './productService.js';

export interface CreateStockBatchInput {
  batch_code?: string;
  notes?: string | null;
  items: Array<{
    seller_sku: string;
    qty: number;
  }>;
  userId: number;
}

export interface CreateStockMutationInput {
  seller_sku: string;
  type: 'barang_rusak' | 'barang_hilang' | 'selisih_kurang';
  qty: number;
  notes?: string | null;
  userId: number;
}

export interface DirectStockAdjustmentInput {
  seller_sku: string;
  target_stock: number;
  notes?: string | null;
  userId: number;
}

export interface SkuStockSummary {
  product_id: number;
  seller_sku: string;
  product_name: string;
  category_name: string | null;
  image_url: string | null;
  min_stock: number;
  max_stock: number;
  total_in: number;
  total_mutation_out: number;
  unpacked_qty: number; // Belum dikemas (online + offline)
  packed_qty: number; // Siap kirim (online + offline)
  shipped_qty: number; // Selesai kirim / selesai (online + offline)
  canceled_qty: number; // Dibatalkan (kembali ke stok)
  total_sold: number; // Total aktif keluar
  available_stock: number; // Sisa stok tersedia untuk dijual
  physical_stock: number; // Stok fisik riil di rak gudang
  health_status: 'stockout' | 'understock' | 'normal' | 'overstock';
  health_action: string;
}

// ----------------- BATCH STOK MASUK (STOCK IN) -----------------

export async function createStockBatch(input: CreateStockBatchInput) {
  if (!input.items || input.items.length === 0) {
    throw new Error('Batch stok harus memiliki minimal 1 item barang');
  }

  // Generate batch code jika tidak diberikan (misal: STK-20261104-1234)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const batch_code = input.batch_code?.trim() || `STK-${today}-${randomSuffix}`;

  // Validasi kode unik
  const [existing] = await db
    .select()
    .from(stock_batches)
    .where(eq(stock_batches.batch_code, batch_code))
    .limit(1);

  if (existing) {
    throw new Error(`Kode batch stok "${batch_code}" sudah pernah digunakan`);
  }

  // Buat batch stok baru
  const [batch] = await db
    .insert(stock_batches)
    .values({
      batch_code,
      notes: input.notes?.trim() || null,
      created_by: input.userId,
    })
    .returning();

  // Validasi dan simpan item barang
  for (const item of input.items) {
    const cleanSku = item.seller_sku.trim();
    if (!cleanSku) throw new Error('Seller SKU tidak boleh kosong');
    if (typeof item.qty !== 'number' || item.qty <= 0) {
      throw new Error(`Qty untuk Seller SKU "${cleanSku}" harus lebih besar dari 0`);
    }

    const prod = await findProductBySellerSku(cleanSku);

    await db.insert(stock_batch_items).values({
      stock_batch_id: batch.id,
      product_id: prod?.id ?? null,
      seller_sku: prod?.seller_sku ?? cleanSku,
      qty: item.qty,
    });
  }

  return await getStockBatchById(batch.id);
}

export async function getStockBatches() {
  const batches = await db
    .select()
    .from(stock_batches)
    .orderBy(desc(stock_batches.id));

  // Ambil total item dan qty per batch
  const batchSummaries = [];
  for (const b of batches) {
    const items = await db
      .select()
      .from(stock_batch_items)
      .where(eq(stock_batch_items.stock_batch_id, b.id));

    const totalQty = items.reduce((s, it) => s + it.qty, 0);
    batchSummaries.push({
      ...b,
      total_items: items.length,
      total_qty: totalQty,
      items,
    });
  }

  return batchSummaries;
}

export async function getStockBatchById(id: number) {
  const [batch] = await db
    .select()
    .from(stock_batches)
    .where(eq(stock_batches.id, id))
    .limit(1);

  if (!batch) return null;

  const items = await db
    .select({
      id: stock_batch_items.id,
      product_id: stock_batch_items.product_id,
      seller_sku: stock_batch_items.seller_sku,
      qty: stock_batch_items.qty,
      product_name: products.name,
      category_name: product_categories.name,
    })
    .from(stock_batch_items)
    .leftJoin(products, eq(stock_batch_items.product_id, products.id))
    .leftJoin(product_categories, eq(products.category_id, product_categories.id))
    .where(eq(stock_batch_items.stock_batch_id, id));

  return {
    ...batch,
    items,
    total_qty: items.reduce((s, it) => s + it.qty, 0),
  };
}

// ----------------- MUTASI STOK (PENGURANGAN / PENYESUAIAN) -----------------

export async function createStockMutation(input: CreateStockMutationInput) {
  const cleanSku = input.seller_sku.trim();
  if (!cleanSku) throw new Error('Seller SKU tidak boleh kosong');
  if (typeof input.qty !== 'number' || input.qty <= 0) {
    throw new Error('Kuantitas mutasi harus lebih besar dari 0');
  }
  const finalNotes = input.notes?.trim() || 'Mutasi penyesuaian stok';

  const prod = await findProductBySellerSku(cleanSku);

  const [mutation] = await db
    .insert(stock_mutations)
    .values({
      product_id: prod?.id ?? null,
      seller_sku: prod?.seller_sku ?? cleanSku,
      type: input.type,
      qty: input.qty,
      notes: finalNotes,
      created_by: input.userId,
    })
    .returning();

  return mutation;
}

// ----------------- PENYESUAIAN STOK LANGSUNG (DIRECT STOCK ADJUSTMENT) -----------------

export async function adjustDirectStock(input: DirectStockAdjustmentInput) {
  const cleanSku = input.seller_sku.trim();
  if (!cleanSku) throw new Error('Seller SKU tidak boleh kosong');
  if (typeof input.target_stock !== 'number' || input.target_stock < 0) {
    throw new Error('Jumlah stok target harus berupa angka 0 atau lebih');
  }

  const prod = await findProductBySellerSku(cleanSku);
  if (!prod) {
    throw new Error(`Produk dengan SKU "${cleanSku}" tidak ditemukan`);
  }

  // Hitung stok tersedia saat ini
  const overview = await getStockOverview({ search: cleanSku });
  const currentItem = overview.find(
    (it) => it.seller_sku.toLowerCase() === cleanSku.toLowerCase()
  );
  const currentStock = currentItem ? currentItem.available_stock : 0;
  const diff = input.target_stock - currentStock;
  const customNotes = input.notes?.trim();

  if (diff > 0) {
    // Stok bertambah -> Catat otomatis sebagai Batch Stok Masuk
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const batch_code = `ADJ-IN-${today}-${randomSuffix}`;
    const autoNotes = customNotes || `Penyesuaian stok langsung (+${diff} pcs, dari ${currentStock} ke ${input.target_stock})`;

    const batch = await createStockBatch({
      batch_code,
      notes: autoNotes,
      items: [{ seller_sku: cleanSku, qty: diff }],
      userId: input.userId,
    });

    const batchCode = batch?.batch_code || batch_code;

    return {
      action: 'batch_in',
      diff,
      previous_stock: currentStock,
      new_stock: input.target_stock,
      batch_code: batchCode,
      message: `Stok berhasil ditambah +${diff} pcs dan dicatat di Riwayat Batch Stok Masuk (${batchCode})`,
    };
  } else if (diff < 0) {
    // Stok berkurang -> Catat otomatis sebagai Mutasi Stok Pengurangan
    const reduction = Math.abs(diff);
    const autoNotes = customNotes || `Penyesuaian stok langsung (-${reduction} pcs, dari ${currentStock} ke ${input.target_stock})`;

    const mutation = await createStockMutation({
      seller_sku: cleanSku,
      type: 'selisih_kurang',
      qty: reduction,
      notes: autoNotes,
      userId: input.userId,
    });

    return {
      action: 'mutation_out',
      diff,
      previous_stock: currentStock,
      new_stock: input.target_stock,
      mutation_id: mutation.id,
      message: `Stok berhasil dikurangi -${reduction} pcs dan dicatat di Riwayat Mutasi Pengurangan`,
    };
  } else {
    return {
      action: 'no_change',
      diff: 0,
      previous_stock: currentStock,
      new_stock: input.target_stock,
      message: 'Jumlah stok tidak mengalami perubahan',
    };
  }
}

export async function getStockMutations() {
  const rows = await db
    .select({
      id: stock_mutations.id,
      product_id: stock_mutations.product_id,
      seller_sku: stock_mutations.seller_sku,
      type: stock_mutations.type,
      qty: stock_mutations.qty,
      notes: stock_mutations.notes,
      created_at: stock_mutations.created_at,
      product_name: products.name,
    })
    .from(stock_mutations)
    .leftJoin(products, eq(stock_mutations.product_id, products.id))
    .orderBy(desc(stock_mutations.id));

  return rows;
}

// ----------------- PENCCOCOKAN CERDAS SELLER SKU -----------------

export function normalizeSkuCode(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/birumuda/g, 'birulaut')
    .replace(/[^a-z0-9]/g, '')
    .replace(/top/g, 'ats')
    .replace(/set/g, 'stl')
    .replace(/jkt/g, 'jk');
}

/**
 * Mencocokkan SKU dari label pesanan (misal: "Hitam CLN-Hitam", "PNC-TOP-ARMY")
 * dengan master produk ("CLN-Hitam", "PNC-ATS-Army").
 */
export function isSkuMatch(
  product: { seller_sku: string; sku_temp?: string | null },
  rawSku: string | null | undefined
): boolean {
  if (!rawSku) return false;
  const raw = rawSku.trim();
  const lower = raw.toLowerCase();
  const targetLower = product.seller_sku.toLowerCase();

  // 1. Exact match (case-insensitive)
  if (lower === targetLower) return true;

  // 2. sku_temp alias exact / partial match
  if (product.sku_temp) {
    const aliases = product.sku_temp.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (aliases.includes(lower)) return true;
    for (const a of aliases) {
      if (a.length >= 4 && (lower.includes(a) || a.includes(lower))) return true;
    }
  }

  // 3. Token match (split by whitespace/punctuation, e.g. "Hitam CLN-Hitam" -> "cln-hitam")
  const tokens = raw.split(/[\s,()]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.includes(targetLower)) return true;

  // 4. Normalized code match (PNC-TOP-ARMY vs PNC-ATS-Army, JKT-SET-NAVY vs JK-STL-Navy)
  const normTarget = normalizeSkuCode(product.seller_sku);
  const normRaw = normalizeSkuCode(raw);
  if (normTarget && normRaw === normTarget) return true;

  // 5. Token normalized match (token harus sama persis dengan normTarget atau token panjang memuat normTarget)
  for (const token of tokens) {
    const normToken = normalizeSkuCode(token);
    if (normToken === normTarget) return true;
    if (normTarget.length >= 6 && normToken.includes(normTarget)) return true;
  }

  // 6. Substring match jika target SKU cukup spesifik (>= 6 karakter)
  if (targetLower.length >= 6 && lower.includes(targetLower)) return true;

  // 7. Component words set match (e.g. ATS-PNC-Army vs PNC-ATS-Army)
  const targetParts = targetLower.split(/[\-_ ]+/).map((s) => s.replace(/top/g, 'ats').replace(/set/g, 'stl')).filter(Boolean);
  const rawParts = lower.split(/[\-_ ]+/).map((s) => s.replace(/top/g, 'ats').replace(/set/g, 'stl')).filter(Boolean);
  if (targetParts.length >= 2 && targetParts.every((tp) => rawParts.includes(tp))) {
    return true;
  }

  return false;
}

/**
 * Mencari Master Produk terbaik untuk suatu item pesanan dengan mengevaluasi
 * seller_sku, sku, dan product_name.
 */
export function findMasterProductForOrderItem<
  T extends { id: number; name: string; seller_sku: string; sku_temp?: string | null }
>(
  item: { product_name?: string | null; sku?: string | null; seller_sku?: string | null },
  productsList: T[]
): T | null {
  // 1. Coba pencocokan langsung menggunakan isSkuMatch terhadap seller_sku & sku
  for (const p of productsList) {
    if (isSkuMatch(p, item.seller_sku) || isSkuMatch(p, item.sku)) {
      return p;
    }
  }

  // 2. Ekstraksi kode SKU dari string gabungan (contoh: "Hitam CLN-Hitam", "Cream PNC-ATS-Cream", "BIRU JK-Biru Muda MUDA")
  const rawList = [item.seller_sku, item.sku].filter(Boolean) as string[];
  for (const raw of rawList) {
    const extracted = raw.match(/(CLN|PNC|JK|JKT|KL|KL2|ROK|GMS|JH|CL)[\-_ ][A-Za-z0-9\-_ ]+/i);
    if (extracted) {
      let code = extracted[0].trim();
      code = code.replace(/\s+(MUDA|ARMY|HITAM|NAVY|VIOLET|CREAM|MAROON|PINK|SAGE)$/i, '');
      code = code.replace(/^KL2-[A-Za-z0-9]+-2C/i, (m) => m.replace(/-2C$/i, ''));
      code = code.replace(/^JK-Biru Muda/i, 'JK-STL-Biru Laut');
      code = code.replace(/^JK-Maroon/i, 'JK-STL-Maroon');
      code = code.replace(/^JK-Navy/i, 'JKT-SET-Navy');
      code = code.replace(/^JK-Violet/i, 'JK-STL-Violet');
      for (const p of productsList) {
        if (isSkuMatch(p, code)) {
          return p;
        }
      }
    }
  }

  // 3. Fallback cerdas menggunakan product_name jika teks SKU hanya berisi varian/warna (misal: "Cream" atau "Hitam")
  if (item.product_name) {
    const pName = item.product_name.toLowerCase();
    const COLOR_SYNONYMS: Record<string, string> = {
      mint: 'sage',
      'hijau mint': 'sage',
      'rose pink': 'pink',
      lilac: 'violet',
      'biru muda': 'biru laut',
      ungu: 'violet',
      krem: 'cream',
    };

    for (const raw of rawList) {
      const color = raw.toLowerCase().trim();
      const mappedColor = COLOR_SYNONYMS[color] || color;

      const p = productsList.find((prod) => {
        const prodName = prod.name.toLowerCase();
        const prodSku = prod.seller_sku.toLowerCase();
        const hasColor =
          prodName.includes(color) ||
          prodName.includes(mappedColor) ||
          prodSku.includes(color) ||
          prodSku.includes(mappedColor) ||
          (prod.sku_temp &&
            (prod.sku_temp.toLowerCase().includes(color) || prod.sku_temp.toLowerCase().includes(mappedColor)));

        if (hasColor) {
          if (pName.includes('celana') && (prodName.includes('celana') || prod.seller_sku.startsWith('CLN-'))) return true;
          if (pName.includes('atasan') && (prodName.includes('atasan') || prod.seller_sku.includes('TOP') || prod.seller_sku.includes('ATS'))) return true;
          if (pName.includes('setelan') && (prodName.includes('setelan') || prod.seller_sku.includes('SET') || prod.seller_sku.includes('STL'))) return true;
          if (pName.includes('gamis') && (prodName.includes('gamis') || prod.seller_sku.startsWith('GMS-'))) return true;
          if (pName.includes('rok') && (prodName.includes('rok') || prod.seller_sku.startsWith('ROK-'))) return true;
          if (pName.includes('2 kepala') || pName.includes('2 in 1') || pName.includes('dua kepala')) {
            if (prodName.includes('kepala 2') || prod.seller_sku.startsWith('KL2-') || prod.seller_sku.startsWith('KL-2')) return true;
          }
        }
        return false;
      });
      if (p) return p;
    }
  }

  return null;
}

// ----------------- REKAPITULASI STOK PER SELLER SKU -----------------

export async function getStockOverview(filters?: { search?: string; categoryId?: number }) {
  // Ambil semua master produk
  const allProducts = await db
    .select({
      id: products.id,
      seller_sku: products.seller_sku,
      sku_temp: products.sku_temp,
      name: products.name,
      category_id: products.category_id,
      category_name: product_categories.name,
      image_url: products.image_url,
      min_stock: products.min_stock,
      max_stock: products.max_stock,
    })
    .from(products)
    .leftJoin(product_categories, eq(products.category_id, product_categories.id));

  // Ambil seluruh batch stock in
  const allBatchItems = await db.select().from(stock_batch_items);
  // Ambil seluruh mutasi pengurangan
  const allMutations = await db.select().from(stock_mutations);

  // Ambil seluruh online order items beserta status orders
  const allOnlineItems = await db
    .select({
      seller_sku: order_items.seller_sku,
      sku: order_items.sku,
      qty: order_items.qty,
      status: orders.status,
    })
    .from(order_items)
    .innerJoin(orders, eq(order_items.order_id, orders.id));

  // Ambil seluruh offline order items beserta status offline_orders
  const allOfflineItems = await db
    .select({
      seller_sku: offline_order_items.seller_sku,
      qty: offline_order_items.qty,
      status: offline_orders.status,
    })
    .from(offline_order_items)
    .innerJoin(offline_orders, eq(offline_order_items.offline_order_id, offline_orders.id));

  const summaries: SkuStockSummary[] = allProducts.map((p) => {
    function isMatch(itemSku: string | null | undefined): boolean {
      return isSkuMatch(p, itemSku);
    }

    // 1. Total Masuk dari Stock Batches
    const total_in = allBatchItems
      .filter((b) => isMatch(b.seller_sku))
      .reduce((sum, b) => sum + b.qty, 0);

    // 2. Total Mutasi Keluar (rusak/hilang/koreksi)
    const total_mutation_out = allMutations
      .filter((m) => isMatch(m.seller_sku))
      .reduce((sum, m) => sum + m.qty, 0);

    // 3. Online Orders Breakdown
    let onlineUnpacked = 0;
    let onlinePacked = 0;
    let onlineShipped = 0;
    let onlineCanceled = 0;

    for (const item of allOnlineItems) {
      if (isMatch(item.seller_sku) || isMatch(item.sku)) {
        if (item.status === 'dibatalkan') {
          onlineCanceled += item.qty;
        } else if (item.status === 'dikirim' || item.status === 'selesai' || item.status === 'selesai_kirim') {
          onlineShipped += item.qty;
        } else if (item.status === 'dikemas' || item.status === 'siap_kirim') {
          onlinePacked += item.qty;
        } else if (item.status === 'menunggu_dikemas' || item.status === 'belum_dikemas') {
          onlineUnpacked += item.qty;
        }
      }
    }

    // 4. Offline Orders Breakdown (termasuk status siap_kirim dan selesai_kirim dari offline order)
    let offlineUnpacked = 0;
    let offlinePacked = 0;
    let offlineShipped = 0;
    let offlineCanceled = 0;

    for (const item of allOfflineItems) {
      if (isMatch(item.seller_sku)) {
        if (item.status === 'dibatalkan') {
          offlineCanceled += item.qty;
        } else if (item.status === 'selesai' || item.status === 'selesai_kirim' || item.status === 'dikirim') {
          offlineShipped += item.qty;
        } else if (item.status === 'dikemas' || item.status === 'siap_kirim') {
          offlinePacked += item.qty;
        } else if (item.status === 'menunggu_dikemas' || item.status === 'belum_dikemas') {
          offlineUnpacked += item.qty;
        }
      }
    }

    const unpacked_qty = onlineUnpacked + offlineUnpacked;
    const packed_qty = onlinePacked + offlinePacked;
    const shipped_qty = onlineShipped + offlineShipped;
    const canceled_qty = onlineCanceled + offlineCanceled;

    // Total terjual aktif (belum dikemas + siap kirim + selesai kirim)
    const total_sold = unpacked_qty + packed_qty + shipped_qty;

    // Stok Tersedia untuk dijual
    const available_stock = total_in - total_mutation_out - total_sold;

    // Stok Fisik di rak gudang (belum diserahkan ke kurir keluar)
    const physical_stock = total_in - total_mutation_out - shipped_qty;

    // Tentukan Health Status
    let health_status: 'stockout' | 'understock' | 'normal' | 'overstock' = 'normal';
    let health_action = 'Stok dalam batas aman dan ideal.';

    if (available_stock <= 0) {
      health_status = 'stockout';
      health_action = 'Stok habis (Stockout)! Segera jadwalkan batch produksi/restock darurat.';
    } else if (available_stock < p.min_stock) {
      health_status = 'understock';
      health_action = `Stok menipis di bawah ambang minimum (${p.min_stock} pcs). Masukkan ke antrean produksi minggu ini.`;
    } else if (available_stock > p.max_stock) {
      health_status = 'overstock';
      health_action = `Stok menumpuk di atas ambang maksimum (${p.max_stock} pcs). Pertimbangkan bundling / promo flash sale.`;
    }

    return {
      product_id: p.id,
      seller_sku: p.seller_sku,
      product_name: p.name,
      category_name: p.category_name,
      image_url: p.image_url,
      min_stock: p.min_stock,
      max_stock: p.max_stock,
      total_in,
      total_mutation_out,
      unpacked_qty,
      packed_qty,
      shipped_qty,
      canceled_qty,
      total_sold,
      available_stock,
      physical_stock,
      health_status,
      health_action,
    };
  });

  // Filter jika ada search atau categoryId
  return summaries.filter((s) => {
    if (filters?.categoryId && s.category_name) {
      // Filter category
      const p = allProducts.find((x) => x.id === s.product_id);
      if (p?.category_id !== filters.categoryId) return false;
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      return (
        s.seller_sku.toLowerCase().includes(q) ||
        s.product_name.toLowerCase().includes(q) ||
        (s.category_name && s.category_name.toLowerCase().includes(q))
      );
    }
    return true;
  });
}
