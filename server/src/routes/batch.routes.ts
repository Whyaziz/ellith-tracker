import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import {
  processAndSaveBatch,
  getBatches,
  previewBatch,
  updateBatch,
  deleteBatch,
  BatchValidationError,
} from '../services/batchService.js';

export const batchRouter = Router();

// Multer storage configuration for uploaded label PDFs
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.paths.pdfDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Max 50MB
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return cb(new Error('Hanya berkas format PDF yang diperbolehkan'));
    }
    cb(null, true);
  },
});

batchRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const batches = await getBatches();
    res.json({ batches });
  } catch (err) {
    next(err);
  }
});

// Endpoint untuk pratinjau parsing tanpa langsung menyimpan ke database
batchRouter.post(
  '/preview',
  requireAuth,
  upload.single('pdf'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Berkas PDF resi tidak ditemukan' });
        return;
      }

      const parseResult = await previewBatch(req.file.path);

      res.json({
        message: `Pratinjau selesai: ${parseResult.totalOrders} resi ditemukan`,
        pdfPath: req.file.path,
        sourceFilename: req.file.originalname,
        parseResult,
      });
    } catch (err) {
      next(err);
    }
  }
);

batchRouter.post(
  '/upload',
  requireAuth,
  upload.single('pdf'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Berkas PDF resi tidak ditemukan' });
        return;
      }

      const userId = req.session.user!.id;
      const customName = typeof req.body.name === 'string' ? req.body.name.trim() : undefined;
      const forceConfirm = req.body.confirmed === 'true' || req.body.confirmed === true;
      const skipDuplicates = req.body.skip_duplicates !== 'false' && req.body.skip_duplicates !== false;

      const editedOrders = req.body.edited_orders
        ? typeof req.body.edited_orders === 'string'
          ? JSON.parse(req.body.edited_orders)
          : req.body.edited_orders
        : undefined;

      const result = await processAndSaveBatch({
        name: customName,
        sourceFilename: req.file.originalname,
        pdfPath: req.file.path,
        userId,
        forceConfirm,
        skipDuplicates,
        editedOrders,
      });

      res.json({
        message: result.message,
        batch: result.batch,
        stats: result.stats,
        orders: result.parseResult.orders,
        hasNeedsReview: result.parseResult.hasNeedsReview,
        newOrdersCount: result.parseResult.newOrdersCount,
        duplicateOrdersCount: result.parseResult.duplicateOrdersCount,
      });
    } catch (err) {
      if (err instanceof BatchValidationError) {
        res.status(422).json({
          error: err.message,
          requires_confirmation: true,
          orders: err.parseResult.orders,
          total: err.parseResult.totalOrders,
        });
        return;
      }
      next(err);
    }
  }
);

// Simpan batch dari pratinjau yang sudah diunggah sebelumnya (beserta hasil edit manual Seller SKU)
batchRouter.post('/save-preview', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const { pdfPath, sourceFilename, name, confirmed, skip_duplicates, edited_orders } = req.body;

    if (!pdfPath || !sourceFilename) {
      res.status(400).json({ error: 'Data pratinjau PDF tidak lengkap' });
      return;
    }

    const forceConfirm = confirmed === true || confirmed === 'true';
    const skipDuplicates = skip_duplicates !== false && skip_duplicates !== 'false';

    const result = await processAndSaveBatch({
      name: typeof name === 'string' ? name.trim() : undefined,
      sourceFilename,
      pdfPath,
      userId,
      forceConfirm,
      skipDuplicates,
      editedOrders: edited_orders,
    });

    res.json({
      message: result.message,
      batch: result.batch,
      stats: result.stats,
      orders: result.parseResult.orders,
      hasNeedsReview: result.parseResult.hasNeedsReview,
      newOrdersCount: result.parseResult.newOrdersCount,
      duplicateOrdersCount: result.parseResult.duplicateOrdersCount,
    });
  } catch (err) {
    if (err instanceof BatchValidationError) {
      res.status(422).json({
        error: err.message,
        requires_confirmation: true,
        orders: err.parseResult.orders,
        total: err.parseResult.totalOrders,
      });
      return;
    }
    next(err);
  }
});

batchRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID batch tidak valid' });
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Nama batch tidak boleh kosong' });
      return;
    }

    const updated = await updateBatch(id, { name: name.trim() });
    res.json({ message: 'Nama batch berhasil diperbarui', batch: updated });
  } catch (err) {
    next(err);
  }
});

batchRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID batch tidak valid' });
      return;
    }

    const result = await deleteBatch(id);
    res.json({
      message: `Batch #${id} beserta ${result.deletedOrdersCount} pesanan berhasil dihapus`,
      deletedOrdersCount: result.deletedOrdersCount,
    });
  } catch (err) {
    next(err);
  }
});
