import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../server/src/db/client.js';
import {
  users,
} from '../server/src/db/schema.js';
import {
  getCategories,
  createCategory,
  createProduct,
  mapSkuTemp,
  findProductBySellerSku,
} from '../server/src/services/productService.js';
import {
  createStockBatch,
  createStockMutation,
  getStockOverview,
  adjustDirectStock,
} from '../server/src/services/stockService.js';
import {
  createOfflineOrder,
  getOfflineOrders,
  updateOfflineOrder,
  deleteOfflineOrder,
} from '../server/src/services/offlineOrderService.js';
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} from '../server/src/services/customerService.js';
import { getDashboardData } from '../server/src/services/dashboardService.js';
import { eq } from 'drizzle-orm';

describe('Garment Mini-ERP Integration Tests', () => {
  let testUserId: number;
  let testCategoryId: number;
  const runId = Date.now();
  const testSellerSku = `TEST-GAMIS-${runId}`;
  const testTempSku = `TEMP-GAMIS-${runId}`;
  const testNewAlias = `ALIAS-GAMIS-${runId}`;

  beforeAll(async () => {
    let [user] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          username: 'admin',
          password_hash: 'hashed',
          role: 'admin',
        })
        .returning();
    }
    testUserId = user.id;

    const categories = await getCategories();
    expect(categories.length).toBeGreaterThanOrEqual(8);
    testCategoryId = categories[0].id;
  });

  describe('1. Product Categories & Catalog', () => {
    it('creates and retrieves a new product category', async () => {
      const catName = `Kategori-${Date.now()}`;
      const newCat = await createCategory(catName);
      expect(newCat.name).toBe(catName);

      const allCats = await getCategories();
      expect(allCats.some((c) => c.name === catName)).toBe(true);
    });

    it('creates a new product with Seller SKU and safety stock thresholds', async () => {
      const prod = await createProduct({
        seller_sku: testSellerSku,
        name: 'Gamis Bordir Silk Sukma',
        category_id: testCategoryId,
        sku_temp: testTempSku,
        min_stock: 10,
        max_stock: 100,
      });

      expect(prod.seller_sku).toBe(testSellerSku);
      expect(prod.min_stock).toBe(10);
      expect(prod.max_stock).toBe(100);

      // Verify findProductBySellerSku works for both seller_sku and sku_temp
      const bySku = await findProductBySellerSku(testSellerSku);
      expect(bySku?.name).toBe('Gamis Bordir Silk Sukma');

      const byTemp = await findProductBySellerSku(testTempSku);
      expect(byTemp?.seller_sku).toBe(testSellerSku);
    });

    it('maps or updates sku_temp alias for a product', async () => {
      const prod = await findProductBySellerSku(testSellerSku);
      expect(prod).toBeDefined();

      const updated = await mapSkuTemp(prod!.id, testNewAlias);
      expect(updated.sku_temp).toContain(testNewAlias);

      const foundByNewAlias = await findProductBySellerSku(testNewAlias);
      expect(foundByNewAlias?.id).toBe(prod!.id);
    });
  });

  describe('2. Inbound Stock via Batch (Strict Stock In)', () => {
    it('adds stock ONLY through stock batches with optional notes', async () => {
      const batchResult = await createStockBatch({
        notes: 'Kloter Jahit Pertama dari Workshop',
        userId: testUserId,
        items: [
          {
            seller_sku: testSellerSku,
            qty: 50,
          },
        ],
      });

      expect(batchResult?.batch_code).toMatch(/^STK-/);
      expect(batchResult?.notes).toBe('Kloter Jahit Pertama dari Workshop');
      expect(batchResult?.items.length).toBe(1);
      expect(batchResult?.items[0].qty).toBe(50);

      // Verify stock overview reflects 50 inbound pcs
      const stockList = await getStockOverview();
      const itemStock = stockList.find((s) => s.seller_sku === testSellerSku);
      expect(itemStock).toBeDefined();
      expect(itemStock!.total_in).toBe(50);
      expect(itemStock!.available_stock).toBe(50);
      expect(itemStock!.health_status).toBe('normal'); // Between 10 and 100
    });
  });

  describe('3. Stock Deductions via Mutations (Only Reductions)', () => {
    it('deducts stock via reduction mutations (barang_rusak, barang_hilang, selisih_kurang)', async () => {
      const mut1 = await createStockMutation({
        seller_sku: testSellerSku,
        type: 'barang_rusak',
        qty: 3,
        notes: 'Kancing copot dan cacat bahan',
        userId: testUserId,
      });

      const mut2 = await createStockMutation({
        seller_sku: testSellerSku,
        type: 'barang_hilang',
        qty: 2,
        notes: 'Hilang saat display toko',
        userId: testUserId,
      });

      expect(mut1.qty).toBe(3);
      expect(mut2.qty).toBe(2);

      // Verify available stock decreased from 50 to 45
      const stockList = await getStockOverview();
      const itemStock = stockList.find((s) => s.seller_sku === testSellerSku);
      expect(itemStock!.total_mutation_out).toBe(5);
      expect(itemStock!.available_stock).toBe(45);
    });

    it('directly adjusts stock up and down with automatic batch or mutation recording and optional notes', async () => {
      const adjSku = `TEST-ADJ-${Date.now()}`;
      await createProduct({
        seller_sku: adjSku,
        name: 'Produk Uji Adjust Stok',
        category_id: testCategoryId,
        min_stock: 5,
        max_stock: 50,
      });
      // Initial batch in: 20 pcs
      await createStockBatch({
        batch_code: `BATCH-ADJ-${Date.now()}`,
        items: [{ seller_sku: adjSku, qty: 20 }],
        userId: testUserId,
      });

      // Direct adjustment up: 20 -> 35 (+15)
      const resUp = await adjustDirectStock({
        seller_sku: adjSku,
        target_stock: 35,
        userId: testUserId,
      });
      expect(resUp.action).toBe('batch_in');
      expect(resUp.diff).toBe(15);
      expect(resUp.new_stock).toBe(35);

      // Direct adjustment down: 35 -> 28 (-7)
      const resDown = await adjustDirectStock({
        seller_sku: adjSku,
        target_stock: 28,
        userId: testUserId,
      });
      expect(resDown.action).toBe('mutation_out');
      expect(resDown.diff).toBe(-7);
      expect(resDown.new_stock).toBe(28);

      // Mutation with optional notes
      const mutOpt = await createStockMutation({
        seller_sku: adjSku,
        type: 'selisih_kurang',
        qty: 1,
        userId: testUserId,
      });
      expect(mutOpt.notes).toBe('Mutasi penyesuaian stok');
    });
  });

  describe('4. Offline Orders & Auto Siap Kirim Status', () => {
    let createdOfflineOrderId: number;

    it('creates an offline order defaulting to siap_kirim status and deducts stock', async () => {
      const offlineOrder = await createOfflineOrder({
        customer_name: 'Ibu Hajjah Dewi',
        customer_phone: '081298765432',
        order_date: '2026-11-04',
        notes: 'Pengambilan toko offline',
        userId: testUserId,
        status: 'dikemas', // dikemas = siap kirim
        items: [
          {
            seller_sku: testSellerSku,
            product_name: 'Gamis Bordir Silk Sukma',
            qty: 5,
            price: 150000,
          },
        ],
      });

      createdOfflineOrderId = offlineOrder!.id;
      expect(offlineOrder!.status).toBe('dikemas');
      expect(offlineOrder!.items.length).toBe(1);
      expect(offlineOrder!.items[0].qty).toBe(5);

      // Stock should deduct from packed (siap_kirim)
      const stockList = await getStockOverview();
      const itemStock = stockList.find((s) => s.seller_sku === testSellerSku);
      expect(itemStock!.packed_qty).toBeGreaterThanOrEqual(5);
      // Available stock: 50 (in) - 5 (mutation) - 5 (offline dikemas) = 40
      expect(itemStock!.available_stock).toBe(40);
    });

    it('updates offline order status to selesai and cancels order', async () => {
      const updated = await updateOfflineOrder(createdOfflineOrderId, { status: 'selesai' });
      expect(updated!.status).toBe('selesai');

      const stockList = await getStockOverview();
      const itemStock = stockList.find((s) => s.seller_sku === testSellerSku);
      expect(itemStock!.shipped_qty).toBeGreaterThanOrEqual(5);
      expect(itemStock!.available_stock).toBe(40);

      // Cancel order returns stock
      const cancelled = await updateOfflineOrder(createdOfflineOrderId, { status: 'dibatalkan' });
      expect(cancelled!.status).toBe('dibatalkan');

      const stockAfterCancel = await getStockOverview();
      const itemStockAfterCancel = stockAfterCancel.find((s) => s.seller_sku === testSellerSku);
      // Canceled order does not deduct from current available stock: 50 - 5 = 45!
      expect(itemStockAfterCancel!.available_stock).toBe(45);
    });

    it('deletes wrongly inputted offline order and removes items cascade', async () => {
      const wrongOrder = await createOfflineOrder({
        customer_name: 'Salah Input Pelanggan',
        order_date: '2026-11-04',
        userId: testUserId,
        status: 'dikemas',
        items: [
          {
            seller_sku: testSellerSku,
            product_name: 'Item Salah Input',
            qty: 10,
            price: 50000,
          },
        ],
      });

      const delRes = await deleteOfflineOrder(wrongOrder!.id);
      expect(delRes.success).toBe(true);
      expect(delRes.deletedOrderNo).toBe(wrongOrder!.order_no);

      const allOffline = await getOfflineOrders();
      expect(allOffline.find((o) => o.id === wrongOrder!.id)).toBeUndefined();
    });
  });

  describe('5. Real-Time Stock Health Calculation', () => {
    it('accurately identifies understock, stockout, normal, and overstock health statuses', async () => {
      // Create understock product (min 20, max 50)
      const underSku = `TEST-UNDER-${Date.now()}`;
      await createProduct({
        seller_sku: underSku,
        name: 'Celana Understock Test',
        category_id: testCategoryId,
        min_stock: 20,
        max_stock: 50,
      });

      // Add only 5 pcs
      await createStockBatch({
        userId: testUserId,
        items: [{ seller_sku: underSku, qty: 5 }],
      });

      const stockList = await getStockOverview();
      const underItem = stockList.find((s) => s.seller_sku === underSku);
      expect(underItem?.health_status).toBe('understock');

      // Create stockout product with 0 stock
      const zeroSku = `TEST-ZERO-${Date.now()}`;
      await createProduct({
        seller_sku: zeroSku,
        name: 'Rok Habis Test',
        category_id: testCategoryId,
        min_stock: 5,
        max_stock: 50,
      });

      const stockList2 = await getStockOverview();
      const zeroItem = stockList2.find((s) => s.seller_sku === zeroSku);
      expect(zeroItem?.health_status).toBe('stockout');
    });
  });

  describe('6. Dashboard Summary & KPI Metrics', () => {
    it('aggregates daily trends, categories, top selling items, and actionable health alerts', async () => {
      const summary = await getDashboardData('7d');

      expect(summary.cards).toBeDefined();
      expect(summary.cards.total_orders).toBeGreaterThanOrEqual(0);
      expect(summary.cards.total_available_stock).toBeGreaterThan(0);
      expect(summary.salesChart.dataPoints).toBeInstanceOf(Array);
      expect(summary.salesChart.dataPoints.length).toBeGreaterThan(0);
      expect(summary.salesChart.dataPoints.every((dp) => typeof dp.total_qty === 'number')).toBe(true);
      expect(summary.categoryChart).toBeInstanceOf(Array);
      expect(summary.stockHealth).toBeDefined();

      // Verify health alerts contain recommendation texts
      const alert = summary.stockHealth.stockout.concat(summary.stockHealth.understock)[0];
      if (alert) {
        expect(alert.health_action).toBeDefined();
        expect(alert.health_action.length).toBeGreaterThan(5);
      }
    });
  });

  describe('7. Customer Relationship Management (CRM)', () => {
    it('creates, retrieves, updates, and calculates total items purchased for customers', async () => {
      const custName = `Customer Test Sukma ${Date.now()}`;
      const phone = '08123456789';

      // 1. Create customer
      const created = await createCustomer({
        name: custName,
        phone,
        email: 'sukma@example.com',
        channel: 'offline',
        notes: 'Pelanggan setia grosir',
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe(custName);
      expect(created.channel).toBe('offline');

      // 2. Initial purchase total should be 0
      const initialDetail = await getCustomerById(created.id);
      expect(initialDetail?.total_items_purchased).toBe(0);
      expect(initialDetail?.orders.length).toBe(0);

      // 3. Create offline order linked to this customer with 25 pcs total items
      await createOfflineOrder({
        order_date: new Date().toISOString().slice(0, 10),
        customer_id: created.id,
        customer_name: custName,
        customer_phone: phone,
        status: 'selesai',
        userId: testUserId,
        items: [
          { seller_sku: testSellerSku, qty: 15, price: 150000 },
          { seller_sku: testSellerSku, qty: 10, price: 150000 },
        ],
      });

      // 4. Retrieve customers list and verify total_items_purchased is strictly 25 pcs
      const list = await getCustomers({ search: custName });
      const found = list.find((c) => c.id === created.id);
      expect(found).toBeDefined();
      expect(found?.total_items_purchased).toBe(25);
      expect(found?.total_orders_count).toBe(1);

      // 5. Retrieve detailed profile with order history
      const detail = await getCustomerById(created.id);
      expect(detail).toBeDefined();
      expect(detail?.total_items_purchased).toBe(25);
      expect(detail?.orders.length).toBe(1);
      expect(detail?.orders[0].items.length).toBe(2);

      // 6. Update customer channel to omnichannel
      const updated = await updateCustomer(created.id, { channel: 'omnichannel' });
      expect(updated?.channel).toBe('omnichannel');

      // 7. Delete customer
      const del = await deleteCustomer(created.id);
      expect(del.success).toBe(true);

      const afterDelete = await getCustomerById(created.id);
      expect(afterDelete).toBeNull();
    });
  });
});
