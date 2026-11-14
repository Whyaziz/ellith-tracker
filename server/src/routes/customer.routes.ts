import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} from '../services/customerService.js';

export const customerRouter = Router();

// Multer storage untuk upload foto customer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(config.paths.customersDir)) {
      fs.mkdirSync(config.paths.customersDir, { recursive: true });
    }
    cb(null, config.paths.customersDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `cust-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Hanya berkas gambar (JPG, PNG, WEBP) yang diizinkan'));
      return;
    }
    cb(null, true);
  },
});

// POST /api/customers/upload-photo - Upload foto profil pelanggan
customerRouter.post('/upload-photo', requireAuth, upload.single('photo'), (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Tidak ada berkas gambar yang diunggah' });
      return;
    }
    const photoUrl = `/uploads/customers/${req.file.filename}`;
    res.json({ message: 'Foto profil berhasil diunggah', photoUrl });
  } catch (err) {
    next(err);
  }
});

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
