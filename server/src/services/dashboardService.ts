import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  orders,
  order_items,
  offline_orders,
  offline_order_items,
  product_categories,
} from '../db/schema.js';
import { getStockOverview } from './stockService.js';

export interface DashboardTimeframe {
  timeframe?: 'today' | '7d' | '30d' | 'month' | 'all';
  startDate?: string;
  endDate?: string;
}

export interface SalesTrendFilter {
  timeframe?: string;
  startDate?: string;
  endDate?: string;
}

// Helper normalisasi tanggal ke YYYY-MM-DD
function parseToYmd(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  // Format YYYY-MM-DD atau ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  // Format DD-MM-YYYY
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return '';
}

/**
 * Mengambil tren penjualan harian dengan filter rentang tanggal khusus untuk Line Chart
 */
export async function getSalesTrend(filter: SalesTrendFilter = {}) {
  const onlineOrders = await db.select().from(orders);
  const onlineItems = await db.select().from(order_items);
  const offlineOrdersList = await db.select().from(offline_orders);
  const offlineItems = await db.select().from(offline_order_items);

  // Map item counts per order
  const onlineQtyMap = new Map<number, number>();
  for (const it of onlineItems) {
    onlineQtyMap.set(it.order_id, (onlineQtyMap.get(it.order_id) || 0) + it.qty);
  }

  const offlineQtyMap = new Map<number, number>();
  for (const it of offlineItems) {
    offlineQtyMap.set(it.offline_order_id, (offlineQtyMap.get(it.offline_order_id) || 0) + it.qty);
  }

  let { timeframe, startDate, endDate } = filter;
  const now = new Date();

  // Jika startDate/endDate kosong tapi ada timeframe
  if (!startDate && !endDate && timeframe && timeframe !== 'all') {
    if (timeframe === 'today') {
      startDate = now.toISOString().slice(0, 10);
      endDate = startDate;
    } else if (timeframe === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      startDate = d.toISOString().slice(0, 10);
      endDate = now.toISOString().slice(0, 10);
    } else if (timeframe === '30d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      startDate = d.toISOString().slice(0, 10);
      endDate = now.toISOString().slice(0, 10);
    } else if (timeframe === 'month') {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      endDate = now.toISOString().slice(0, 10);
    }
  }

  const dailySalesMap = new Map<string, { total_orders: number; total_qty: number }>();

  // Agregasi dari Online Orders (kecuali dibatalkan)
  for (const o of onlineOrders) {
    if (o.status === 'dibatalkan') continue;
    const ymd = parseToYmd(o.ship_date) || parseToYmd(o.created_at);
    if (!ymd) continue;
    if (startDate && ymd < startDate) continue;
    if (endDate && ymd > endDate) continue;

    const current = dailySalesMap.get(ymd) || { total_orders: 0, total_qty: 0 };
    current.total_orders += 1;
    current.total_qty += onlineQtyMap.get(o.id) || o.qty_total || 1;
    dailySalesMap.set(ymd, current);
  }

  // Agregasi dari Offline Orders (kecuali dibatalkan)
  for (const off of offlineOrdersList) {
    if (off.status === 'dibatalkan') continue;
    const ymd = parseToYmd(off.order_date) || parseToYmd(off.created_at);
    if (!ymd) continue;
    if (startDate && ymd < startDate) continue;
    if (endDate && ymd > endDate) continue;

    const current = dailySalesMap.get(ymd) || { total_orders: 0, total_qty: 0 };
    current.total_orders += 1;
    current.total_qty += offlineQtyMap.get(off.id) || 1;
    dailySalesMap.set(ymd, current);
  }

  // Isi tanggal kosong di antara rentang tanggal (jika range <= 90 hari) agar grafik kontinyu
  if (startDate && endDate && startDate <= endDate) {
    const cur = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.round((end.getTime() - cur.getTime()) / (1000 * 3600 * 24));
    if (diffDays <= 90) {
      while (cur <= end) {
        const ymd = cur.toISOString().slice(0, 10);
        if (!dailySalesMap.has(ymd)) {
          dailySalesMap.set(ymd, { total_orders: 0, total_qty: 0 });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  const sortedDates = Array.from(dailySalesMap.keys()).sort();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

  const dataPoints = sortedDates.map((dateStr) => {
    const val = dailySalesMap.get(dateStr)!;
    const [y, m, d] = dateStr.split('-');
    const label = `${d} ${monthNames[parseInt(m, 10) - 1]}`;
    return {
      date: dateStr,
      label,
      total_orders: val.total_orders,
      total_qty: val.total_qty,
      count: val.total_orders,
      qty: val.total_qty,
    };
  });

  return {
    startDate,
    endDate,
    timeframe: timeframe || (startDate || endDate ? 'custom' : 'all'),
    dataPoints,
  };
}

export async function getDashboardData(
  timeframeOrOptions:
    | 'today'
    | '7d'
    | '30d'
    | 'month'
    | 'all'
    | { timeframe?: string; startDate?: string; endDate?: string } = '7d',
  startDateParam?: string,
  endDateParam?: string
) {
  let timeframe = '7d';
  let startDate: string | undefined = startDateParam;
  let endDate: string | undefined = endDateParam;

  if (typeof timeframeOrOptions === 'object') {
    timeframe = timeframeOrOptions.timeframe || '7d';
    startDate = timeframeOrOptions.startDate || startDate;
    endDate = timeframeOrOptions.endDate || endDate;
  } else if (typeof timeframeOrOptions === 'string') {
    timeframe = timeframeOrOptions;
  }

  // 1. Ambil Stock Overview per SKU
  const stockOverview = await getStockOverview();

  // 2. Ambil seluruh pesanan online
  const onlineOrders = await db.select().from(orders);

  // 3. Ambil seluruh pesanan offline
  const offlineOrdersList = await db.select().from(offline_orders);

  // --- STATS CARDS ---
  const total_orders = onlineOrders.length + offlineOrdersList.length;

  const total_shipped_orders =
    onlineOrders.filter((o) => o.status === 'dikirim' || o.status === 'selesai').length +
    offlineOrdersList.filter(
      (o) => o.status === 'dikirim' || o.status === 'selesai' || o.status === 'selesai_kirim'
    ).length;

  const total_canceled_orders =
    onlineOrders.filter((o) => o.status === 'dibatalkan').length +
    offlineOrdersList.filter((o) => o.status === 'dibatalkan').length;

  // Total item terjual aktif (tidak termasuk canceled)
  const total_items_sold = stockOverview.reduce((sum, s) => sum + s.total_sold, 0);

  // Total stok tersedia di gudang
  const total_available_stock = stockOverview.reduce((sum, s) => sum + Math.max(0, s.available_stock), 0);

  // Indikasi status kesehatan stok
  const stockoutList = stockOverview.filter((s) => s.health_status === 'stockout');
  const understockList = stockOverview.filter((s) => s.health_status === 'understock');
  const overstockList = stockOverview.filter((s) => s.health_status === 'overstock');
  const normalList = stockOverview.filter((s) => s.health_status === 'normal');

  // --- LINE CHART PENJUALAN KHUSUS ---
  const salesChart = await getSalesTrend({ timeframe, startDate, endDate });

  // --- BAR CHART STOK PER KATEGORI ---
  const allCategories = await db.select().from(product_categories);
  const categoryStockMap = new Map<
    string,
    { total_in: number; available_stock: number; total_sold: number; sku_count: number }
  >();

  for (const cat of allCategories) {
    categoryStockMap.set(cat.name, {
      total_in: 0,
      available_stock: 0,
      total_sold: 0,
      sku_count: 0,
    });
  }
  categoryStockMap.set('Lainnya', {
    total_in: 0,
    available_stock: 0,
    total_sold: 0,
    sku_count: 0,
  });

  for (const s of stockOverview) {
    const catName = s.category_name || 'Lainnya';
    const entry = categoryStockMap.get(catName) || {
      total_in: 0,
      available_stock: 0,
      total_sold: 0,
      sku_count: 0,
    };
    entry.total_in += s.total_in;
    entry.available_stock += Math.max(0, s.available_stock);
    entry.total_sold += s.total_sold;
    entry.sku_count += 1;
    categoryStockMap.set(catName, entry);
  }

  const categoryChartData = Array.from(categoryStockMap.entries())
    .map(([category_name, data]) => ({
      category_name,
      ...data,
    }))
    .filter((c) => c.sku_count > 0 || c.total_in > 0);

  // --- LIST BARANG PALING LAKU (TOP SELLING SKUS) ---
  const topSellingProducts = [...stockOverview]
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, 8)
    .map((s) => ({
      product_id: s.product_id,
      seller_sku: s.seller_sku,
      product_name: s.product_name,
      category_name: s.category_name,
      image_url: s.image_url,
      total_sold: s.total_sold,
      available_stock: s.available_stock,
      health_status: s.health_status,
    }));

  return {
    cards: {
      total_orders,
      total_shipped_orders,
      total_canceled_orders,
      total_items_sold,
      total_available_stock,
      stockout_count: stockoutList.length,
      understock_count: understockList.length,
      overstock_count: overstockList.length,
      normal_count: normalList.length,
    },
    salesChart: {
      timeframe: salesChart.timeframe,
      startDate: salesChart.startDate,
      endDate: salesChart.endDate,
      dataPoints: salesChart.dataPoints,
    },
    categoryChart: categoryChartData,
    topSelling: topSellingProducts,
    stockHealth: {
      stockout: stockoutList,
      understock: understockList,
      overstock: overstockList,
      normal: normalList,
    },
  };
}
