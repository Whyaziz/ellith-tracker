import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  mapSkuTemp,
} from '../services/productService.js';

export const productRouter = Router();

// Multer storage untuk upload foto produk
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(config.paths.productsDir)) {
      fs.mkdirSync(config.paths.productsDir, { recursive: true });
    }
    cb(null, config.paths.productsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
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

// Upload gambar produk
productRouter.post('/upload-image', requireAuth, upload.single('image'), (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Tidak ada berkas gambar yang diunggah' });
      return;
    }
    const imageUrl = `/uploads/products/${req.file.filename}`;
    res.json({ message: 'Gambar berhasil diunggah', imageUrl });
  } catch (err) {
    next(err);
  }
});

// ----------------- KATEGORI PRODUK -----------------

productRouter.get('/categories', requireAuth, async (_req, res, next) => {
  try {
    const categories = await getCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

productRouter.post('/categories', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.body;
    const created = await createCategory(name);
    res.status(201).json({ message: 'Kategori berhasil dibuat', category: created });
  } catch (err) {
    next(err);
  }
});

productRouter.put('/categories/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;
    const updated = await updateCategory(id, name);
    res.json({ message: 'Kategori berhasil diperbarui', category: updated });
  } catch (err) {
    next(err);
  }
});

productRouter.delete('/categories/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await deleteCategory(id);
    res.json({ message: 'Kategori berhasil dihapus', result });
  } catch (err) {
    next(err);
  }
});

// ----------------- MASTER PRODUK -----------------

productRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined;
    const search = req.query.search as string | undefined;

    const products = await getProducts({ categoryId, search });
    res.json({ products, total: products.length });
  } catch (err) {
    next(err);
  }
});

productRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await getProductById(id);
    if (!product) {
      res.status(404).json({ error: 'Produk tidak ditemukan' });
      return;
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

productRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const created = await createProduct(req.body);
    res.status(201).json({ message: 'Produk berhasil ditambahkan', product: created });
  } catch (err) {
    next(err);
  }
});

productRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await updateProduct(id, req.body);
    res.json({ message: 'Produk berhasil diperbarui', product: updated });
  } catch (err) {
    next(err);
  }
});

productRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await deleteProduct(id);
    res.json({ message: `Produk ${result.deletedSellerSku} berhasil dihapus`, result });
  } catch (err) {
    next(err);
  }
});

// Pemetaan SKU Alias / sku_temp ke produk tertentu
productRouter.post('/:id/map-alias', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { alias_sku } = req.body;
    const updated = await mapSkuTemp(id, alias_sku);
    res.json({ message: 'Alias SKU berhasil dipetakan ke produk', product: updated });
  } catch (err) {
    next(err);
  }
});
