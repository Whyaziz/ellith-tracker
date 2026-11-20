import { eq, asc, desc, sql, and, gte, lte, or, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  products,
  product_categories,
  product_cogs,
  stock_batches,
  stock_batch_items,
  orders,
  order_items,
  offline_orders,
  offline_order_items,
} from '../db/schema.js';

const inCurrentStockPeriod = sql`EXISTS (SELECT 1 FROM stock_batches b WHERE b.id = ${stock_batch_items.stock_batch_id} AND datetime(b.created_at) >= COALESCE((SELECT datetime(value) FROM system_settings WHERE key='stock_cutoff_date'),'0001-01-01'))`;

export interface CogsMetrics {
  bahan_utama: number;
  aksesori: number;
  kemasan: number;
  bb_langsung: number;
  tenaga_kerja: number;
  overhead: number;
  total_biaya: number; // HPP per unit
  target_price: number; // Harga Jual Target
  gross_margin_percent: number; // ((target_price - total_biaya) / target_price) * 100
  tiktok_fee_percent: number; // default 25%
  tiktok_fee_nominal: number; // target_price * (tiktok_fee_percent / 100)
  tiktok_payout: number; // target_price - tiktok_fee_nominal
  net_profit: number; // tiktok_payout - total_biaya
  net_profit_percent: number; // (net_profit / target_price) * 100
  target_margin_percent: number; // default 40%
  if_target_margin_price: number; // Harga pada target margin kotor
  if_target_margin_payout: number; // if_target_margin_price * (1 - tiktok_fee_percent / 100)
  if_target_margin_net_profit: number; // if_target_margin_payout - total_biaya
}

export function computeCogsMetrics(data: {
  bahan_utama?: number | null;
  aksesori?: number | null;
  kemasan?: number | null;
  tenaga_kerja?: number | null;
  overhead?: number | null;
  target_price?: number | null;
  tiktok_fee_percent?: number | null;
  target_margin_percent?: number | null;
}): CogsMetrics {
  const bu = Number(data.bahan_utama) || 0;
  const aks = Number(data.aksesori) || 0;
  const kem = Number(data.kemasan) || 0;
  const tk = Number(data.tenaga_kerja) || 0;
  const ovh = Number(data.overhead) || 0;
  const targetPrice = Number(data.target_price) || 0;
  const tiktokFeePct =
    data.tiktok_fee_percent !== undefined && data.tiktok_fee_percent !== null
      ? Number(data.tiktok_fee_percent)
      : 25;
  const targetMarginPct =
    data.target_margin_percent !== undefined && data.target_margin_percent !== null
      ? Number(data.target_margin_percent)
      : 40;

  const bb_langsung = bu + aks + kem;
  const total_biaya = bb_langsung + tk + ovh;

  const gross_margin_percent =
    targetPrice > 0 ? ((targetPrice - total_biaya) / targetPrice) * 100 : 0;
  const tiktok_fee_nominal = targetPrice * (tiktokFeePct / 100);
  const tiktok_payout = targetPrice - tiktok_fee_nominal;
  const net_profit = tiktok_payout - total_biaya;
  const net_profit_percent =
    targetPrice > 0 ? (net_profit / targetPrice) * 100 : 0;

  const if_target_margin_price = targetMarginPct >= 0 && targetMarginPct < 100 ? total_biaya / (1 - targetMarginPct / 100) : 0;
  const if_target_margin_payout =
    if_target_margin_price * (1 - tiktokFeePct / 100);
  const if_target_margin_net_profit =
    if_target_margin_payout - total_biaya;

  return {
    bahan_utama: bu,
    aksesori: aks,
    kemasan: kem,
    bb_langsung,
    tenaga_kerja: tk,
    overhead: ovh,
    total_biaya,
    target_price: targetPrice,
    gross_margin_percent: Math.round(gross_margin_percent * 100) / 100,
    tiktok_fee_percent: tiktokFeePct,
    tiktok_fee_nominal: Math.round(tiktok_fee_nominal),
    tiktok_payout: Math.round(tiktok_payout),
    net_profit: Math.round(net_profit),
    net_profit_percent: Math.round(net_profit_percent * 100) / 100,
    target_margin_percent: targetMarginPct,
    if_target_margin_price: Math.round(if_target_margin_price * 100) / 100,
    if_target_margin_payout: Math.round(if_target_margin_payout * 100) / 100,
    if_target_margin_net_profit: Math.round(if_target_margin_net_profit * 100) / 100,
  };
}

export interface ProductCogsItem {
  id?: number | null;
  product_id: number;
  seller_sku: string;
  name: string;
  category_name: string | null;
  label_color: string;
  image_url: string | null;
  notes: string | null;
  updated_at?: string | null;
  metrics: CogsMetrics;
  // FIFO & Moving Average Cost references
  current_fifo_cogs: number;
  moving_average_cogs: number;
  current_stock_qty: number;
}

export interface InventoryValuationSummary {
  total_stock_qty: number;
  fifo_total_valuation: number;
  ma_total_valuation: number;
  valuation_diff_nominal: number;
  valuation_diff_percent: number;
}

export interface CogsOverviewResponse {
  summary: {
    total_products: number;
    avg_total_cogs: number;
    avg_gross_margin: number;
    avg_net_profit: number;
    target_achieved_count: number;
  };
  valuation: InventoryValuationSummary;
  items: ProductCogsItem[];
}

/**
 * Mengambil ringkasan Master HPP, Valuasi Gudang (FIFO vs MA), dan rincian per produk
 */
export async function getCogsOverview(): Promise<CogsOverviewResponse> {
  const allProducts = await db
    .select({
      id: products.id,
      seller_sku: products.seller_sku,
      name: products.name,
      label_color: products.label_color,
      image_url: products.image_url,
      category_name: product_categories.name,
    })
    .from(products)
    .leftJoin(product_categories, eq(products.category_id, product_categories.id))
    .orderBy(asc(products.seller_sku));

  const allCogs = await db.select().from(product_cogs);
  const cogsMap = new Map<number, (typeof allCogs)[0]>();
  for (const c of allCogs) {
    cogsMap.set(c.product_id, c);
  }

  // Ambil semua batch aktif untuk menghitung FIFO & Moving Average per SKU
  const activeBatches = await db
    .select({
      id: stock_batch_items.id,
      seller_sku: stock_batch_items.seller_sku,
      qty: stock_batch_items.qty,
      remaining_qty: stock_batch_items.remaining_qty,
      cogs_total: stock_batch_items.cogs_total,
    })
    .from(stock_batch_items)
    .where(inCurrentStockPeriod)
    .orderBy(asc(stock_batch_items.id));

  // Kelompokkan batch berdasarkan SKU
  const batchBySku = new Map<string, Array<{ id: number; qty: number; remaining_qty: number; cogs_total: number | null }>>();
  for (const b of activeBatches) {
    const sku = b.seller_sku;
    if (!batchBySku.has(sku)) batchBySku.set(sku, []);
    const rem = b.remaining_qty !== null && b.remaining_qty !== undefined ? b.remaining_qty : b.qty;
    batchBySku.get(sku)!.push({
      id: b.id,
      qty: b.qty,
      remaining_qty: rem,
      cogs_total: b.cogs_total,
    });
  }

  const items: ProductCogsItem[] = [];
  let totalCogsSum = 0;
  let grossMarginSum = 0;
  let netProfitSum = 0;
  let targetAchievedCount = 0;

  let totalStockQty = 0;
  let totalFifoValuation = 0;
  let totalMaValuation = 0;

  for (const p of allProducts) {
    const c = cogsMap.get(p.id);
    const metrics = computeCogsMetrics({
      bahan_utama: c?.bahan_utama ?? 0,
      aksesori: c?.aksesori ?? 0,
      kemasan: c?.kemasan ?? 0,
      tenaga_kerja: c?.tenaga_kerja ?? 0,
      overhead: c?.overhead ?? 0,
      target_price: c?.target_price ?? 0,
      tiktok_fee_percent: c?.tiktok_fee_percent ?? 25,
      target_margin_percent: c?.target_margin_percent ?? 40,
    });

    totalCogsSum += metrics.total_biaya;
    grossMarginSum += metrics.gross_margin_percent;
    netProfitSum += metrics.net_profit;
    if (metrics.gross_margin_percent >= metrics.target_margin_percent && metrics.target_price > 0) {
      targetAchievedCount++;
    }

    // Hitung FIFO & Moving Average Cost dari batch aktif
    const pBatches = batchBySku.get(p.seller_sku) || [];
    const activeWithStock = pBatches.filter((b) => b.remaining_qty > 0);

    const skuTotalStock = activeWithStock.reduce((s, b) => s + b.remaining_qty, 0);
    const skuTotalValue = activeWithStock.reduce((s, b) => s + b.remaining_qty * (b.cogs_total ?? metrics.total_biaya), 0);

    // FIFO HPP: Mengambil kloter tertua yang masih punya sisa stok
    const oldestActive = activeWithStock[0];
    const currentFifoCogs = oldestActive
      ? (oldestActive.cogs_total ?? metrics.total_biaya)
      : metrics.total_biaya;

    // Moving Average HPP: Rata-rata tertimbang nilai stok di rak
    const movingAverageCogs = skuTotalStock > 0
      ? Math.round((skuTotalValue / skuTotalStock) * 100) / 100
      : metrics.total_biaya;

    totalStockQty += skuTotalStock;
    totalFifoValuation += skuTotalValue;
    totalMaValuation += skuTotalStock * movingAverageCogs;

    items.push({
      id: c?.id ?? null,
      product_id: p.id,
      seller_sku: p.seller_sku,
      name: p.name,
      category_name: p.category_name,
      label_color: p.label_color,
      image_url: p.image_url,
      notes: c?.notes ?? null,
      updated_at: c?.updated_at ?? null,
      metrics,
      current_fifo_cogs: currentFifoCogs,
      moving_average_cogs: movingAverageCogs,
      current_stock_qty: skuTotalStock,
    });
  }

  const count = allProducts.length || 1;
  const valuationDiff = totalFifoValuation - totalMaValuation;
  const valuationDiffPct = totalMaValuation > 0 ? (valuationDiff / totalMaValuation) * 100 : 0;

  return {
    summary: {
      total_products: allProducts.length,
      avg_total_cogs: Math.round(totalCogsSum / count),
      avg_gross_margin: Math.round((grossMarginSum / count) * 100) / 100,
      avg_net_profit: Math.round(netProfitSum / count),
      target_achieved_count: targetAchievedCount,
    },
    valuation: {
      total_stock_qty: totalStockQty,
      fifo_total_valuation: Math.round(totalFifoValuation),
      ma_total_valuation: Math.round(totalMaValuation),
      valuation_diff_nominal: Math.round(valuationDiff),
      valuation_diff_percent: Math.round(valuationDiffPct * 100) / 100,
    },
    items,
  };
}

export interface UpdateProductCogsInput {
  bahan_utama?: number;
  aksesori?: number;
  kemasan?: number;
  tenaga_kerja?: number;
  overhead?: number;
  target_price?: number;
  tiktok_fee_percent?: number;
  target_margin_percent?: number;
  notes?: string | null;
}

export async function upsertProductCogs(productId: number, data: UpdateProductCogsInput) {
  if (data.target_margin_percent != null && (!Number.isFinite(data.target_margin_percent) || data.target_margin_percent < 0 || data.target_margin_percent >= 100)) {
    throw new Error('Target margin kotor harus antara 0 dan kurang dari 100 persen.');
  }
  const [prod] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!prod) {
    throw new Error(`Produk dengan ID ${productId} tidak ditemukan`);
  }

  const [existing] = await db
    .select()
    .from(product_cogs)
    .where(eq(product_cogs.product_id, productId))
    .limit(1);

  const cleanValues = {
    bahan_utama: data.bahan_utama !== undefined ? Math.max(0, Number(data.bahan_utama)) : (existing?.bahan_utama ?? 0),
    aksesori: data.aksesori !== undefined ? Math.max(0, Number(data.aksesori)) : (existing?.aksesori ?? 0),
    kemasan: data.kemasan !== undefined ? Math.max(0, Number(data.kemasan)) : (existing?.kemasan ?? 0),
    tenaga_kerja: data.tenaga_kerja !== undefined ? Math.max(0, Number(data.tenaga_kerja)) : (existing?.tenaga_kerja ?? 0),
    overhead: data.overhead !== undefined ? Math.max(0, Number(data.overhead)) : (existing?.overhead ?? 0),
    target_price: data.target_price !== undefined ? Math.max(0, Number(data.target_price)) : (existing?.target_price ?? 0),
    tiktok_fee_percent: data.tiktok_fee_percent !== undefined ? Math.max(0, Number(data.tiktok_fee_percent)) : (existing?.tiktok_fee_percent ?? 25),
    target_margin_percent: data.target_margin_percent !== undefined ? Math.max(0, Number(data.target_margin_percent)) : (existing?.target_margin_percent ?? 40),
    notes: data.notes !== undefined ? data.notes : (existing?.notes ?? null),
    updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
  };

  if (existing) {
    await db
      .update(product_cogs)
      .set(cleanValues)
      .where(eq(product_cogs.id, existing.id));
  } else {
    await db.insert(product_cogs).values({
      product_id: productId,
      ...cleanValues,
    });
  }

  const metrics = computeCogsMetrics(cleanValues);
  return {
    product_id: productId,
    seller_sku: prod.seller_sku,
    name: prod.name,
    ...cleanValues,
    metrics,
  };
}

export async function bulkUpsertProductCogs(items: Array<{ product_id: number } & UpdateProductCogsInput>) {
  const results = [];
  for (const it of items) {
    const res = await upsertProductCogs(it.product_id, it);
    results.push(res);
  }
  return results;
}

// ----------------- BATCH COGS HISTORY -----------------

export interface BatchCogsHistoryItem {
  id: number;
  stock_batch_id: number;
  batch_code: string;
  batch_created_at: string;
  batch_notes: string | null;
  product_id: number | null;
  seller_sku: string;
  product_name: string;
  category_name: string | null;
  label_color: string;
  qty_in: number;
  remaining_qty: number;
  cogs_bahan_utama: number;
  cogs_aksesori: number;
  cogs_kemasan: number;
  cogs_tenaga_kerja: number;
  cogs_overhead: number;
  cogs_total: number;
  total_batch_value: number;
  remaining_batch_value: number;
  target_price: number;
  tiktok_fee_percent: number;
  status: 'aktif' | 'habis';
}

/**
 * Mengambil histori HPP per kloter/batch stok masuk
 */
export async function getBatchCogsHistory(options?: {
  sku?: string;
  status?: 'aktif' | 'habis';
}): Promise<BatchCogsHistoryItem[]> {
  const rows = await db
    .select({
      id: stock_batch_items.id,
      stock_batch_id: stock_batch_items.stock_batch_id,
      batch_code: stock_batches.batch_code,
      batch_created_at: stock_batches.created_at,
      current_period: inCurrentStockPeriod,
      batch_notes: stock_batches.notes,
      product_id: stock_batch_items.product_id,
      seller_sku: stock_batch_items.seller_sku,
      product_name: products.name,
      category_name: product_categories.name,
      label_color: products.label_color,
      qty_in: stock_batch_items.qty,
      remaining_qty: stock_batch_items.remaining_qty,
      cogs_bahan_utama: stock_batch_items.cogs_bahan_utama,
      cogs_aksesori: stock_batch_items.cogs_aksesori,
      cogs_kemasan: stock_batch_items.cogs_kemasan,
      cogs_tenaga_kerja: stock_batch_items.cogs_tenaga_kerja,
      cogs_overhead: stock_batch_items.cogs_overhead,
      cogs_total: stock_batch_items.cogs_total,
      target_price: stock_batch_items.target_price,
      tiktok_fee_percent: stock_batch_items.tiktok_fee_percent,
    })
    .from(stock_batch_items)
    .innerJoin(stock_batches, eq(stock_batch_items.stock_batch_id, stock_batches.id))
    .leftJoin(products, eq(stock_batch_items.product_id, products.id))
    .leftJoin(product_categories, eq(products.category_id, product_categories.id))
    .orderBy(desc(stock_batches.id), desc(stock_batch_items.id));

  return rows
    .map((r) => {
      const remaining = r.current_period ? (r.remaining_qty ?? r.qty_in) : 0;
      const cogsTotal = r.cogs_total || (
        (r.cogs_bahan_utama || 0) +
        (r.cogs_aksesori || 0) +
        (r.cogs_kemasan || 0) +
        (r.cogs_tenaga_kerja || 0) +
        (r.cogs_overhead || 0)
      );

      const status: 'aktif' | 'habis' = remaining > 0 ? 'aktif' : 'habis';

      return {
        id: r.id,
        stock_batch_id: r.stock_batch_id,
        batch_code: r.batch_code,
        batch_created_at: r.batch_created_at,
        batch_notes: r.batch_notes,
        product_id: r.product_id,
        seller_sku: r.seller_sku,
        product_name: r.product_name || r.seller_sku,
        category_name: r.category_name || null,
        label_color: r.label_color || '#4f46e5',
        qty_in: r.qty_in,
        remaining_qty: remaining,
        cogs_bahan_utama: r.cogs_bahan_utama || 0,
        cogs_aksesori: r.cogs_aksesori || 0,
        cogs_kemasan: r.cogs_kemasan || 0,
        cogs_tenaga_kerja: r.cogs_tenaga_kerja || 0,
        cogs_overhead: r.cogs_overhead || 0,
        cogs_total: cogsTotal,
        total_batch_value: r.qty_in * cogsTotal,
        remaining_batch_value: remaining * cogsTotal,
        target_price: r.target_price || 0,
        tiktok_fee_percent: r.tiktok_fee_percent || 25,
        status,
      };
    })
    .filter((it) => {
      if (options?.sku && it.seller_sku.toLowerCase() !== options.sku.toLowerCase()) {
        return false;
      }
      if (options?.status && it.status !== options.status) {
        return false;
      }
      return true;
    });
}

// ----------------- FIFO & MOVING AVERAGE COST ENGINE -----------------

/**
 * Mengambil HPP FIFO saat ini untuk SKU tertentu (mengambil biaya kloter tertua yang masih punya stok)
 */
export async function getFifoCostForSku(sellerSku: string): Promise<number> {
  let masterCost = 0;
  const [prod] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.seller_sku, sellerSku))
    .limit(1);

  if (prod) {
    const [master] = await db
      .select()
      .from(product_cogs)
      .where(eq(product_cogs.product_id, prod.id))
      .limit(1);
    if (master) {
      masterCost =
        master.bahan_utama +
        master.aksesori +
        master.kemasan +
        master.tenaga_kerja +
        master.overhead;
    }
  }

  const [oldestActive] = await db
    .select({
      cogs_total: stock_batch_items.cogs_total,
      qty: stock_batch_items.qty,
      remaining_qty: stock_batch_items.remaining_qty,
    })
    .from(stock_batch_items)
    .where(
      and(
        inCurrentStockPeriod,
        eq(stock_batch_items.seller_sku, sellerSku),
        sql`COALESCE(${stock_batch_items.remaining_qty}, ${stock_batch_items.qty}) > 0`
      )
    )
    .orderBy(asc(stock_batch_items.id))
    .limit(1);

  if (oldestActive?.cogs_total != null) {
    return oldestActive.cogs_total;
  }

  return masterCost;
}

/**
 * Mengambil HPP Moving Average untuk SKU tertentu
 */
export async function getMovingAverageCostForSku(sellerSku: string): Promise<number> {
  const masterCost = await getFifoCostForSku(sellerSku);

  const activeItems = await db
    .select({
      remaining_qty: stock_batch_items.remaining_qty,
      qty: stock_batch_items.qty,
      cogs_total: stock_batch_items.cogs_total,
    })
    .from(stock_batch_items)
    .where(
      and(
        inCurrentStockPeriod,
        eq(stock_batch_items.seller_sku, sellerSku),
        sql`COALESCE(${stock_batch_items.remaining_qty}, ${stock_batch_items.qty}) > 0`
      )
    );

  let totalQty = 0;
  let totalVal = 0;

  for (const it of activeItems) {
    const rem = it.remaining_qty !== null && it.remaining_qty !== undefined ? it.remaining_qty : it.qty;
    const unitCost = it.cogs_total ?? masterCost;
    totalQty += rem;
    totalVal += rem * unitCost;
  }

  if (totalQty > 0 && totalVal > 0) {
    return Math.round((totalVal / totalQty) * 100) / 100;
  }

  return masterCost;
}

// ----------------- REALIZED PROFIT PERFORMANCE (EXPECTED VS ACTUAL) -----------------

export interface SkuProfitPerformance {
  seller_sku: string;
  product_name: string;
  category_name: string | null;
  label_color: string;
  offline_qty_sold: number;
  online_qty_sold: number;
  total_qty_sold: number;
  total_revenue: number;
  offline_revenue: number;
  online_revenue: number;
  avg_selling_price: number;
  cogs_fifo_total: number;
  cogs_fifo_per_unit: number;
  cogs_ma_total: number;
  cogs_ma_per_unit: number;
  total_platform_fees: number;
  actual_net_profit: number;
  actual_net_profit_percent: number;
  expected_net_profit: number;
  expected_net_profit_percent: number;
  variance_nominal: number;
  status: 'di_atas_target' | 'di_bawah_target';
  channel_label: 'Offline Riil' | 'Online Estimasi' | 'Gabungan';
}

export interface ProfitPerformanceResponse {
  period: {
    startDate?: string;
    endDate?: string;
    channel: 'offline' | 'online' | 'all';
  };
  summary: {
    channel: 'offline' | 'online' | 'all';
    total_qty_sold: number;
    offline_qty_sold: number;
    unallocated_offline_qty: number;
    online_qty_sold: number;
    actual_revenue: number;
    offline_revenue: number;
    online_revenue: number;
    actual_cogs_fifo: number;
    actual_cogs_ma: number;
    cogs_method_diff_nominal: number;
    actual_platform_fees: number;
    actual_net_profit: number;
    actual_net_margin_percent: number;
    expected_net_profit: number;
    expected_margin_percent: number;
    margin_variance_nominal: number;
    margin_variance_percent: number;
    target_achieved_count: number;
    total_skus: number;
  };
  items: SkuProfitPerformance[];
}

/**
 * Menghitung perbandingan Realisasi Penjualan & Profit Riil (Expected vs Actual, FIFO vs MA)
 */
export async function getProfitPerformance(options?: {
  startDate?: string;
  endDate?: string;
  channel?: 'offline' | 'online' | 'all';
}): Promise<ProfitPerformanceResponse> {
  const channel = options?.channel || 'offline';

  const allProducts = await db
    .select({
      id: products.id,
      seller_sku: products.seller_sku,
      name: products.name,
      label_color: products.label_color,
      category_name: product_categories.name,
    })
    .from(products)
    .leftJoin(product_categories, eq(products.category_id, product_categories.id));

  const allCogs = await db.select().from(product_cogs);
  const cogsMap = new Map<number, (typeof allCogs)[0]>();
  for (const c of allCogs) {
    cogsMap.set(c.product_id, c);
  }

  const productInfoMap = new Map(allProducts.map(product => [product.seller_sku, {
    ...product, target_margin: cogsMap.get(product.id)?.target_margin_percent ?? 40,
  }]));
  
  // 1. Ambil Penjualan Offline (jika channel = 'offline' atau 'all')
  let offlineSales: Array<{
    id: number;
    seller_sku: string | null;
    qty: number;
    unallocated: number;
    price: number | null;
    cogs_unit_ma: number | null;
    cogs_unit_fifo: number | null;
    order_date: string;
    status: string;
  }> = [];

  if (channel === 'offline' || channel === 'all') {
    offlineSales = await db
      .select({
        id: offline_order_items.id,
        seller_sku: offline_order_items.seller_sku,
        qty: offline_order_items.qty,
        price: offline_order_items.price,
        unallocated: sql<number>`${offline_order_items.qty} - COALESCE((SELECT SUM(a.qty)
          FROM inventory_issues i JOIN inventory_allocations a ON a.issue_id=i.id
          WHERE i.source='offline' AND i.item_id=${offline_order_items.id}),0)`,
        cogs_unit_ma: offline_order_items.cogs_unit_ma,
        cogs_unit_fifo: offline_order_items.cogs_unit_fifo,
        order_date: offline_orders.order_date,
        status: offline_orders.status,
      })
      .from(offline_order_items)
      .innerJoin(offline_orders, eq(offline_order_items.offline_order_id, offline_orders.id))
      .where(
        and(
          sql`${offline_orders.status} != 'dibatalkan'`,
          options?.startDate ? gte(offline_orders.order_date, options.startDate) : undefined,
          options?.endDate ? lte(offline_orders.order_date, options.endDate) : undefined
        )
      );
  }

  // 2. Ambil Penjualan Online dari resi logistik TikTok Shop (jika channel = 'online' atau 'all')
  let onlineSales: Array<{
    id: number;
    seller_sku: string | null;
    qty: number;
    cogs_unit_fifo: number | null;
    status: string;
    created_at: string;
  }> = [];

  if (channel !== 'offline') {
    onlineSales = await db
      .select({
        id: order_items.id,
        seller_sku: order_items.seller_sku,
        qty: order_items.qty,
        cogs_unit_fifo: order_items.cogs_unit_fifo,
        status: orders.status,
        created_at: orders.created_at,
      })
      .from(order_items)
      .innerJoin(orders, eq(order_items.order_id, orders.id))
      .where(
        and(
          inArray(orders.status, ['dikemas', 'dikirim', 'siap_kirim', 'selesai_kirim', 'selesai']),
          options?.startDate ? sql`date(COALESCE(${orders.packed_at},${orders.created_at}), '+7 hours') >= ${options.startDate}` : undefined,
          options?.endDate ? sql`date(COALESCE(${orders.packed_at},${orders.created_at}), '+7 hours') <= ${options.endDate}` : undefined
        )
      );
  }

  // Akumulasikan per SKU
  interface SkuAccumulator {
    offline_qty: number;
    offline_rev: number;
    offline_fifo_cogs: number;
    offline_ma_cogs: number;
    online_qty: number;

  }

  const skuAccum = new Map<string, SkuAccumulator>();

  function accumulator(sku: string) {
    let entry = skuAccum.get(sku);
    if (!entry) {
      entry = { offline_qty:0, offline_rev:0, offline_fifo_cogs:0, offline_ma_cogs:0, online_qty:0 };
      skuAccum.set(sku, entry);
    }
    return entry;
  }
  for (const s of offlineSales) {
    const acc = accumulator(s.seller_sku ?? 'SKU belum terpetakan');
    const fifoUnit = s.cogs_unit_fifo ?? 0;
    const maUnit = s.cogs_unit_ma ?? fifoUnit;

    acc.offline_qty += s.qty;
    acc.offline_rev += s.qty * (s.price || 0);
    acc.offline_fifo_cogs += s.qty * fifoUnit;
    acc.offline_ma_cogs += s.qty * maUnit;
  }

  for (const s of onlineSales) {
    accumulator(s.seller_sku ?? 'SKU belum terpetakan').online_qty += s.qty;
  }

  // Hitung summary dan items
  let totalQtySold = 0;
  let totalOfflineQty = 0;
  let totalOnlineQty = 0;
  let totalOfflineRevenue = 0;
  const totalOnlineRevenue = 0;
  let actualRevenue = 0;
  let actualCogsFifo = 0;
  let actualCogsMa = 0;
  let actualPlatformFees = 0;
  let expectedNetProfitTotal = 0;
  let targetAchievedCount = 0;

  const items: SkuProfitPerformance[] = [];

  for (const [sku, acc] of skuAccum.entries()) {
    const info = productInfoMap.get(sku);
    const totalQty = acc.offline_qty + acc.online_qty;
    if (totalQty === 0) continue;

    const skuRevenue = acc.offline_rev;
    const skuCogsFifo = acc.offline_fifo_cogs;
    const skuCogsMa = acc.offline_ma_cogs;
    const skuFees = 0; // Offline fee = 0
    const skuNetProfit = skuRevenue - skuCogsFifo - skuFees;
    const skuNetMarginPct = skuRevenue > 0 ? (skuNetProfit / skuRevenue) * 100 : 0;

    const skuExpectedProfit = skuRevenue * (info?.target_margin ?? 40) / 100;
    const skuExpectedMarginPct = info?.target_margin ?? 40;
    const varianceNominal = skuNetProfit - skuExpectedProfit;

    let channel_label: 'Offline Riil' | 'Online Estimasi' | 'Gabungan' = 'Offline Riil';
    if (acc.offline_qty > 0 && acc.online_qty > 0) {
      channel_label = 'Gabungan';
    } else if (acc.online_qty > 0) {
      channel_label = 'Online Estimasi';
    }

    totalQtySold += totalQty;
    totalOfflineQty += acc.offline_qty;
    totalOnlineQty += acc.online_qty;
    totalOfflineRevenue += acc.offline_rev;
    actualRevenue += skuRevenue;
    actualCogsFifo += skuCogsFifo;
    actualCogsMa += skuCogsMa;
    actualPlatformFees += skuFees;
    expectedNetProfitTotal += skuExpectedProfit;

    const isAchieved = acc.offline_qty > 0 && skuNetMarginPct >= (info?.target_margin ?? 40);
    if (isAchieved) targetAchievedCount++;

    items.push({
      seller_sku: sku,
      product_name: info?.name || sku,
      category_name: info?.category_name || null,
      label_color: info?.label_color || '#4f46e5',
      offline_qty_sold: acc.offline_qty,
      online_qty_sold: acc.online_qty,
      total_qty_sold: totalQty,
      total_revenue: Math.round(skuRevenue),
      offline_revenue: Math.round(acc.offline_rev),
      online_revenue: 0,
      avg_selling_price: acc.offline_qty ? Math.round(skuRevenue / acc.offline_qty) : 0,
      cogs_fifo_total: Math.round(skuCogsFifo),
      cogs_fifo_per_unit: acc.offline_qty ? Math.round(skuCogsFifo / acc.offline_qty) : 0,
      cogs_ma_total: Math.round(skuCogsMa),
      cogs_ma_per_unit: acc.offline_qty ? Math.round(skuCogsMa / acc.offline_qty) : 0,
      total_platform_fees: Math.round(skuFees),
      actual_net_profit: Math.round(skuNetProfit),
      actual_net_profit_percent: Math.round(skuNetMarginPct * 100) / 100,
      expected_net_profit: Math.round(skuExpectedProfit),
      expected_net_profit_percent: Math.round(skuExpectedMarginPct * 100) / 100,
      variance_nominal: Math.round(varianceNominal),
      status: isAchieved ? 'di_atas_target' : 'di_bawah_target',
      channel_label,
    });
  }

  // Sort descending by total revenue
  items.sort((a, b) => b.total_revenue - a.total_revenue);

  const actualNetProfit = actualRevenue - actualCogsFifo - actualPlatformFees;
  const actualNetMarginPercent = actualRevenue > 0 ? (actualNetProfit / actualRevenue) * 100 : 0;
  const expectedMarginPercent = actualRevenue > 0 ? (expectedNetProfitTotal / actualRevenue) * 100 : 40;
  const varianceNominal = actualNetProfit - expectedNetProfitTotal;
  const variancePercent = expectedNetProfitTotal > 0 ? (varianceNominal / expectedNetProfitTotal) * 100 : 0;
  const cogsMethodDiff = actualCogsFifo - actualCogsMa;

  return {
    period: {
      startDate: options?.startDate,
      endDate: options?.endDate,
      channel,
    },
    summary: {
      channel,
      total_qty_sold: totalQtySold,
      offline_qty_sold: totalOfflineQty,
      unallocated_offline_qty: offlineSales.reduce((total,item) => total + item.unallocated, 0),
      online_qty_sold: totalOnlineQty,
      actual_revenue: Math.round(actualRevenue),
      offline_revenue: Math.round(totalOfflineRevenue),
      online_revenue: Math.round(totalOnlineRevenue),
      actual_cogs_fifo: Math.round(actualCogsFifo),
      actual_cogs_ma: Math.round(actualCogsMa),
      cogs_method_diff_nominal: Math.round(cogsMethodDiff),
      actual_platform_fees: Math.round(actualPlatformFees),
      actual_net_profit: Math.round(actualNetProfit),
      actual_net_margin_percent: Math.round(actualNetMarginPercent * 100) / 100,
      expected_net_profit: Math.round(expectedNetProfitTotal),
      expected_margin_percent: Math.round(expectedMarginPercent * 100) / 100,
      margin_variance_nominal: Math.round(varianceNominal),
      margin_variance_percent: Math.round(variancePercent * 100) / 100,
      target_achieved_count: targetAchievedCount,
      total_skus: items.length,
    },
    items,
  };
}
