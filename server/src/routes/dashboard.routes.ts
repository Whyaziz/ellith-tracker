import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDashboardData, getSalesTrend } from '../services/dashboardService.js';

export const dashboardRouter = Router();

async function handleDashboard(req: any, res: any, next: any) {
  try {
    const timeframe = (req.query.timeframe as any) || undefined;
    const startDate = (req.query.startDate || req.query.start_date) as string | undefined;
    const endDate = (req.query.endDate || req.query.end_date) as string | undefined;

    const rawData = await getDashboardData({ timeframe, startDate, endDate });

    // Provide friendly normalized properties for frontend
    const response = {
      kpis: {
        totalOrders: rawData.cards.total_orders,
        totalShippedOrders: rawData.cards.total_shipped_orders,
        totalItemsSold: rawData.cards.total_items_sold,
        totalStockAvailable: rawData.cards.total_available_stock,
        stockoutCount: rawData.cards.stockout_count,
        understockCount: rawData.cards.understock_count,
        normalStockCount: rawData.cards.normal_count,
        overstockCount: rawData.cards.overstock_count,
      },
      salesTrend: rawData.salesChart.dataPoints.map((d) => ({
        date: d.date,
        label: d.label,
        count: d.total_orders,
        qty: d.total_qty,
        total_orders: d.total_orders,
        total_qty: d.total_qty,
      })),
      stockByCategory: rawData.categoryChart.map((c) => ({
        category: c.category_name,
        total_stock: c.available_stock,
      })),
      topSelling: rawData.topSelling.map((t) => ({
        seller_sku: t.seller_sku,
        name: t.product_name,
        image_url: t.image_url,
        category: t.category_name,
        total_sold: t.total_sold,
        current_stock: t.available_stock,
      })),
      healthAlerts: [
        ...rawData.stockHealth.stockout.map((s) => ({
          seller_sku: s.seller_sku,
          name: s.product_name,
          category: s.category_name || '',
          current_stock: s.available_stock,
          min_stock: s.min_stock,
          max_stock: s.max_stock,
          status: 'habis' as const,
          recommendation: s.health_action,
        })),
        ...rawData.stockHealth.understock.map((s) => ({
          seller_sku: s.seller_sku,
          name: s.product_name,
          category: s.category_name || '',
          current_stock: s.available_stock,
          min_stock: s.min_stock,
          max_stock: s.max_stock,
          status: 'menipis' as const,
          recommendation: s.health_action,
        })),
        ...rawData.stockHealth.overstock.map((s) => ({
          seller_sku: s.seller_sku,
          name: s.product_name,
          category: s.category_name || '',
          current_stock: s.available_stock,
          min_stock: s.min_stock,
          max_stock: s.max_stock,
          status: 'berlebih' as const,
          recommendation: s.health_action,
        })),
        ...rawData.stockHealth.normal.map((s) => ({
          seller_sku: s.seller_sku,
          name: s.product_name,
          category: s.category_name || '',
          current_stock: s.available_stock,
          min_stock: s.min_stock,
          max_stock: s.max_stock,
          status: 'normal' as const,
          recommendation: s.health_action,
        })),
      ],
      timeframe: rawData.salesChart.timeframe,
      startDate: rawData.salesChart.startDate,
      endDate: rawData.salesChart.endDate,
      raw: rawData,
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
}

// Endpoint khusus pembaruan data Line Chart berdasarkan rentang tanggal
dashboardRouter.get('/sales-trend', requireAuth, async (req: any, res: any, next: any) => {
  try {
    const timeframe = (req.query.timeframe as string) || undefined;
    const startDate = (req.query.startDate || req.query.start_date) as string | undefined;
    const endDate = (req.query.endDate || req.query.end_date) as string | undefined;

    const trend = await getSalesTrend({ timeframe, startDate, endDate });
    res.json(trend);
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get('/', requireAuth, handleDashboard);
dashboardRouter.get('/summary', requireAuth, handleDashboard);
