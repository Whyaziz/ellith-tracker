import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import {
  processAndSaveBatch,
  getBatches,
  previewBatch,
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

      const result = await processAndSaveBatch({
        name: customName,
        sourceFilename: req.file.originalname,
        pdfPath: req.file.path,
        userId,
        forceConfirm,
        skipDuplicates,
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
