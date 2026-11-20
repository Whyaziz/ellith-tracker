import { db } from '../db/client.js';
import { product_cogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getCogsOverview,
  upsertProductCogs,
  bulkUpsertProductCogs,
  computeCogsMetrics,
  getBatchCogsHistory,
  getProfitPerformance,
  getFifoCostForSku,
  getMovingAverageCostForSku,
} from '../services/cogsService.js';
import { findProductBySellerSku } from '../services/productService.js';

export const cogsRouter = Router();

// GET /api/cogs - Mengambil seluruh data HPP dan metrik simulasi profit produk
cogsRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const data = await getCogsOverview();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/cogs/batches - Mengambil histori HPP per kloter/batch stok masuk
cogsRouter.get('/batches', requireAuth, async (req, res, next) => {
  try {
    const sku = req.query.sku ? String(req.query.sku) : undefined;
    const status = req.query.status === 'aktif' || req.query.status === 'habis' ? req.query.status : undefined;
    const data = await getBatchCogsHistory({ sku, status });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/cogs/performance - Komparasi Laba Rugi Riil (Expected vs Actual, FIFO vs MA)
cogsRouter.get('/performance', requireAuth, async (req, res, next) => {
  try {
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
    const channelParam = req.query.channel ? String(req.query.channel).toLowerCase() : undefined;
    const channel: 'offline' | 'online' | 'all' =
      channelParam === 'online' || channelParam === 'all' ? channelParam : 'offline';
    const data = await getProfitPerformance({ startDate, endDate, channel });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/cogs/fifo-hint/:sku - Bantuan HPP FIFO & MA untuk input pesanan offline
cogsRouter.get('/fifo-hint/:sku', requireAuth, async (req, res, next) => {
  try {
    const sku = req.params.sku;
    if (typeof sku !== 'string' || !sku.trim()) return res.status(400).json({ message: 'SKU tidak valid' });
    const prod = await findProductBySellerSku(sku);
    const canonical = prod?.seller_sku ?? sku;
    const [fifoCost, maCost] = await Promise.all([getFifoCostForSku(canonical),getMovingAverageCostForSku(canonical)]);
    const master = prod && db.select().from(product_cogs).where(eq(product_cogs.product_id,prod.id)).get();
    res.json({
      success: true,
      data: {
        seller_sku: sku,
        fifo_cogs: fifoCost,
        moving_average_cogs: maCost,
        suggested_target_price: master?.target_price || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/cogs/simulate - Hitung simulasi margin instan tanpa menyimpan
cogsRouter.post('/simulate', requireAuth, (req, res, next) => {
  try {
    const metrics = computeCogsMetrics(req.body);
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
});

// PUT /api/cogs/:productId - Update atau buat master COGS per produk
cogsRouter.put('/:productId', requireAuth, async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId || isNaN(productId)) {
      return res.status(400).json({ success: false, message: 'ID produk tidak valid' });
    }
    const updated = await upsertProductCogs(productId, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/cogs/bulk - Simpan perubahan massal COGS
cogsRouter.post('/bulk', requireAuth, async (req, res, next) => {
  try {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Daftar item tidak boleh kosong' });
    }
    const results = await bulkUpsertProductCogs(items);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});
