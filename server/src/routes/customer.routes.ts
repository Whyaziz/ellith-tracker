import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} from '../services/customerService.js';

export const customerRouter = Router();

// GET /api/customers - Daftar pelanggan dengan agregasi total pembelian
customerRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const search = req.query.search as string | undefined;
    const channel = req.query.channel as string | undefined;

    const customers = await getCustomers({ search, channel });
    res.json({ customers, total: customers.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id - Detail profil & riwayat pesanan pelanggan
customerRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const customer = await getCustomerById(id);
    if (!customer) {
      res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
      return;
    }
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers - Tambah pelanggan baru
customerRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const created = await createCustomer(req.body);
    res.status(201).json({ message: 'Pelanggan berhasil ditambahkan', customer: created });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id - Ubah data pelanggan
customerRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await updateCustomer(id, req.body);
    res.json({ message: 'Data pelanggan berhasil diperbarui', customer: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id - Hapus pelanggan
customerRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await deleteCustomer(id);
    res.json({ message: `Pelanggan "${result.name}" berhasil dihapus`, result });
  } catch (err) {
    next(err);
  }
});
