import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getOrders,
  getOrderByResi,
  updateOrder,
  deleteOrder,
  cancelOrder,
  restoreOrder,
} from '../services/batchService.js';

export const orderRouter = Router();

orderRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const batchId = req.query.batch_id ? Number(req.query.batch_id) : undefined;
    const status = req.query.status as
      | 'menunggu_dikemas'
      | 'dikemas'
      | 'dikirim'
      | 'dibatalkan'
      | undefined;
    const search = req.query.search as string | undefined;
    const date = req.query.date as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

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
      date,
      startDate,
      endDate,
    });

    res.json({ orders, total: orders.length });
  } catch (err) {
    next(err);
  }
});

// Update order & items by ID
orderRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID pesanan tidak valid' });
      return;
    }

    const updated = await updateOrder(id, req.body);
    res.json({ message: 'Data pesanan berhasil diperbarui', order: updated });
  } catch (err) {
    next(err);
  }
});

// Cancel order by ID
orderRouter.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID pesanan tidak valid' });
      return;
    }

    const updated = await cancelOrder(id);
    res.json({ message: 'Pesanan berhasil dibatalkan', order: updated });
  } catch (err) {
    next(err);
  }
});

// Restore cancelled order by ID
orderRouter.post('/:id/restore', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID pesanan tidak valid' });
      return;
    }

    const updated = await restoreOrder(id);
    res.json({ message: 'Pesanan berhasil dipulihkan', order: updated });
  } catch (err) {
    next(err);
  }
});

// Delete order by ID
orderRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID pesanan tidak valid' });
      return;
    }

    const result = await deleteOrder(id);
    res.json({ message: `Pesanan resi ${result.deletedResi} berhasil dihapus`, result });
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
