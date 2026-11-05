import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createStockBatch,
  getStockBatches,
  getStockBatchById,
  createStockMutation,
  getStockMutations,
  getStockOverview,
  adjustDirectStock,
} from '../services/stockService.js';

export const stockRouter = Router();

// ----------------- BATCH STOK MASUK -----------------

stockRouter.get('/batches', requireAuth, async (_req, res, next) => {
  try {
    const batches = await getStockBatches();
    res.json({ batches });
  } catch (err) {
    next(err);
  }
});

stockRouter.get('/batches/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const batch = await getStockBatchById(id);
    if (!batch) {
      res.status(404).json({ error: 'Batch stok tidak ditemukan' });
      return;
    }
    res.json({ batch });
  } catch (err) {
    next(err);
  }
});

stockRouter.post('/batches', requireAuth, async (req, res, next) => {
  try {
    const { batch_code, notes, items } = req.body;
    const userId = req.session.user!.id;

    const created = await createStockBatch({
      batch_code,
      notes,
      items,
      userId,
    });

    res.status(201).json({ message: 'Batch stok masuk berhasil disimpan', batch: created });
  } catch (err) {
    next(err);
  }
});

// ----------------- MUTASI STOK (PENGURANGAN) -----------------

stockRouter.get('/mutations', requireAuth, async (_req, res, next) => {
  try {
    const mutations = await getStockMutations();
    res.json({ mutations });
  } catch (err) {
    next(err);
  }
});

stockRouter.post('/mutations', requireAuth, async (req, res, next) => {
  try {
    const { seller_sku, type, qty, notes } = req.body;
    const userId = req.session.user!.id;

    const mutation = await createStockMutation({
      seller_sku,
      type,
      qty: Number(qty),
      notes,
      userId,
    });

    res.status(201).json({ message: 'Mutasi penyesuaian stok berhasil dicatat', mutation });
  } catch (err) {
    next(err);
  }
});

// ----------------- PENYESUAIAN STOK LANGSUNG -----------------

stockRouter.post('/adjust', requireAuth, async (req, res, next) => {
  try {
    const { seller_sku, target_stock, notes } = req.body;
    const userId = req.session.user!.id;

    const result = await adjustDirectStock({
      seller_sku,
      target_stock: Number(target_stock),
      notes,
      userId,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ----------------- REKAPITULASI REALTIME STOK PER SKU -----------------

function formatStockList(overview: Awaited<ReturnType<typeof getStockOverview>>) {
  return overview.map((item) => {
    let stock_status: 'habis' | 'menipis' | 'berlebih' | 'normal' = 'normal';
    if (item.health_status === 'stockout') stock_status = 'habis';
    else if (item.health_status === 'understock') stock_status = 'menipis';
    else if (item.health_status === 'overstock') stock_status = 'berlebih';

    return {
      id: item.product_id,
      product_id: item.product_id,
      seller_sku: item.seller_sku,
      sku_temp: null,
      name: item.product_name,
      product_name: item.product_name,
      category_id: null,
      category_name: item.category_name || 'Tanpa Kategori',
      image_url: item.image_url,
      min_stock: item.min_stock,
      max_stock: item.max_stock,
      total_in: item.total_in,
      unpacked: item.unpacked_qty,
      unpacked_qty: item.unpacked_qty,
      packed: item.packed_qty,
      packed_qty: item.packed_qty,
      shipped: item.shipped_qty,
      shipped_qty: item.shipped_qty,
      canceled_qty: item.canceled_qty,
      total_sold: item.total_sold,
      total_mutations: item.total_mutation_out,
      total_mutation_out: item.total_mutation_out,
      current_stock: item.available_stock,
      available_stock: item.available_stock,
      physical_stock: item.physical_stock,
      stock_status,
      health_status: item.health_status,
      health_action: item.health_action,
    };
  });
}

// Support both GET /api/stock and GET /api/stock/overview
stockRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const search = req.query.search as string | undefined;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;

    const rawOverview = await getStockOverview({ search, categoryId });
    const stock = formatStockList(rawOverview);
    res.json({ stock, overview: stock, total: stock.length });
  } catch (err) {
    next(err);
  }
});

stockRouter.get('/overview', requireAuth, async (req, res, next) => {
  try {
    const search = req.query.search as string | undefined;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;

    const rawOverview = await getStockOverview({ search, categoryId });
    const stock = formatStockList(rawOverview);
    res.json({ stock, overview: stock, total: stock.length });
  } catch (err) {
    next(err);
  }
});
