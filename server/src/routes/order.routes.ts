import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getOrders, getOrderByResi } from '../services/batchService.js';

export const orderRouter = Router();

orderRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const batchId = req.query.batch_id ? Number(req.query.batch_id) : undefined;
    const status = req.query.status as 'menunggu_dikemas' | 'dikemas' | 'dikirim' | undefined;
    const search = req.query.search as string | undefined;

    let isPacked: boolean | undefined = undefined;
    if (req.query.is_packed === 'true') isPacked = true;
    if (req.query.is_packed === 'false') isPacked = false;

    let isShipped: boolean | undefined = undefined;
    if (req.query.is_shipped === 'true') isShipped = true;
    if (req.query.is_shipped === 'false') isShipped = false;

    const orders = await getOrders({
      batchId,
      status,
      isPacked,
      isShipped,
      search,
    });

    res.json({ orders, total: orders.length });
  } catch (err) {
    next(err);
  }
});

orderRouter.get('/:resi', requireAuth, async (req, res, next) => {
  try {
    const order = await getOrderByResi(req.params.resi);
    if (!order) {
      res.status(404).json({ error: `Resi "${req.params.resi}" tidak ditemukan` });
      return;
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
});
