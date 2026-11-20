import { z } from 'zod';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createOfflineOrder,
  getOfflineOrders,
  getOfflineOrderById,
  updateOfflineOrder,
  updateOfflinePrices,
  deleteOfflineOrder,
} from '../services/offlineOrderService.js';

export const offlineOrderRouter = Router();

offlineOrderRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    const orders = await getOfflineOrders({ status, search, startDate, endDate });
    res.json({ orders, total: orders.length });
  } catch (err) {
    next(err);
  }
});

offlineOrderRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const order = await getOfflineOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan offline tidak ditemukan' });
      return;
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

offlineOrderRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const created = await createOfflineOrder({
      ...req.body,
      userId,
    });
    res.status(201).json({ message: 'Pesanan offline berhasil dibuat', order: created });
  } catch (err) {
    next(err);
  }
});

offlineOrderRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await updateOfflineOrder(id, req.body);
    res.json({ message: 'Pesanan offline berhasil diperbarui', order: updated });
  } catch (err) {
    next(err);
  }
});

const priceChanges = z.array(z.object({
  id: z.number().int().positive(), previous: z.number().finite(), price: z.number().finite().nonnegative(),
})).nonempty();

offlineOrderRouter.put('/:id/prices', requireAuth, (req, res, next) => {
  const changes = priceChanges.safeParse(req.body?.changes);
  if (!changes.success) return res.status(400).json({ error: 'Harga jual harus berupa angka nol atau lebih.' });
  try {
    updateOfflinePrices(Number(req.params.id), changes.data);
    res.json({ message: 'Harga jual disimpan.' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Rincian nota')) return res.status(409).json({ error: err.message });
    next(err);
  }
});

offlineOrderRouter.put('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await updateOfflineOrder(id, { status: req.body.status });
    res.json({ message: 'Status pesanan offline berhasil diperbarui', order: updated });
  } catch (err) {
    next(err);
  }
});

offlineOrderRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await deleteOfflineOrder(id);
    res.json({ message: `Pesanan offline #${result.deletedOrderNo} berhasil dihapus`, result });
  } catch (err) {
    next(err);
  }
});
