import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  processScan,
  undoScan,
  getRecentScanLogs,
  getScanStats,
} from '../services/scanService.js';

export const scanRouter = Router();

const scanSchema = z.object({
  resi: z.string().min(1, 'Nomor resi wajib diisi'),
  mode: z.enum(['packing', 'pengiriman']),
});

const undoSchema = z.object({
  orderId: z.number().int().positive('Order ID tidak valid'),
  mode: z.enum(['packing', 'pengiriman']),
  logId: z.number().int().positive().optional(),
});

// POST /api/scan - Proses scan barcode resi
scanRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = scanSchema.parse(req.body);
    const userId = req.session.user!.id;

    const result = await processScan({
      resi: parsed.resi,
      mode: parsed.mode,
      userId,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/scan/undo - Batalkan hasil scan terakhir
scanRouter.post('/undo', requireAuth, async (req, res, next) => {
  try {
    const parsed = undoSchema.parse(req.body);

    const result = await undoScan({
      orderId: parsed.orderId,
      mode: parsed.mode,
      logId: parsed.logId,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/scan/logs - Riwayat scan log terkini
scanRouter.get('/logs', requireAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 100) : 30;
    const logs = await getRecentScanLogs(limit);
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

// GET /api/scan/stats - Statistik ringkasan scan
scanRouter.get('/stats', requireAuth, async (_req, res, next) => {
  try {
    const stats = await getScanStats();
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});
