import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  users,
  product_categories,
  products,
  stock_batches,
  stock_batch_items,
  stock_mutations,
  batches,
  orders,
  order_items,
  offline_orders,
  offline_order_items,
} from '../db/schema.js';
import { runMigrations, DEFAULT_PRODUCT_CATEGORIES } from '../db/migrate.js';

export async function seedSimulationData() {
  console.log('🚀 Memulai proses inisialisasi data simulasi Garment Mini-ERP...');

  // 1. Pastikan migrasi & tabel dasar siap
  runMigrations();

  // 2. Ambil user admin
  let [adminUser] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
  if (!adminUser) {
    [adminUser] = await db
      .insert(users)
      .values({
        username: 'admin',
        password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890', // placeholder
        role: 'admin',
      })
      .returning();
  }
  const userId = adminUser.id;

  // 3. Kategori Produk
  console.log('📦 Memeriksa Kategori Produk...');
  for (const catName of DEFAULT_PRODUCT_CATEGORIES) {
    const [exist] = await db
      .select()
      .from(product_categories)
      .where(eq(product_categories.name, catName))
      .limit(1);
    if (!exist) {
      await db.insert(product_categories).values({ name: catName });
    }
  }

  const allCategories = await db.select().from(product_categories);
  const getCatId = (name: string) => allCategories.find((c) => c.name === name)?.id || 1;

  // 4. Katalog Master Produk
  console.log('👗 Menyiapkan Master Katalog Produk (Seller SKU)...');
  const simulationProducts = [
    {
      seller_sku: 'CLN-KULOT-BLK-L',
      name: 'Celana Kulot Highwaist Katun Hitam L',
      category_id: getCatId('Celana'),
      sku_temp: 'KULOT-HITAM',
      min_stock: 15,
      max_stock: 120,
    },
    {
      seller_sku: 'CLN-CHINO-MOKA-XL',
      name: 'Celana Chino Stretch Moka XL',
      category_id: getCatId('Celana'),
      sku_temp: 'CHINO-MOKA',
      min_stock: 10,
      max_stock: 100,
    },
    {
      seller_sku: 'CLN-BAGGY-SAGE-M',
      name: 'Celana Baggy Pants Sage Green M',
      category_id: getCatId('Celana'),
      sku_temp: 'BAGGY-SAGE',
      min_stock: 25, // Diatur tinggi agar memicu status Menipis (Understock)
      max_stock: 80,
    },
    {
      seller_sku: 'ST-JKT-NAVY-XL',
      name: 'Setelan Jaket Training Parasut Navy XL',
      category_id: getCatId('Setelan Jaket'),
      sku_temp: 'JKT-NAVY',
      min_stock: 10,
      max_stock: 80,
    },
    {
      seller_sku: 'ST-JKT-GREY-L',
      name: 'Setelan Jaket Windbreaker Abu-Abu L',
      category_id: getCatId('Setelan Jaket'),
      sku_temp: 'JKT-GREY',
      min_stock: 10,
      max_stock: 80,
    },
    {
      seller_sku: 'AT-JKT-BOMBER-CREAM-M',
      name: 'Atasan Jaket Bomber Taslan Cream M',
      category_id: getCatId('Atasan Jaket'),
      sku_temp: 'BOMBER-CREAM',
      min_stock: 15,
      max_stock: 90,
    },
    {
      seller_sku: 'AT-JKT-HOODIE-BLK-XL',
      name: 'Atasan Jaket Hoodie Fleece Hitam XL',
      category_id: getCatId('Atasan Jaket'),
      sku_temp: 'HOODIE-HITAM',
      min_stock: 20,
      max_stock: 150,
    },
    {
      seller_sku: 'PONCO-ST-ARMY-L',
      name: 'Setelan Jas Hujan Ponco Celana Army L',
      category_id: getCatId('Setelan Ponco'),
      sku_temp: 'PONCO-ARMY',
      min_stock: 10,
      max_stock: 70,
    },
    {
      seller_sku: 'PONCO-ST-BLUE-XL',
      name: 'Setelan Jas Hujan Ponco Celana Biru XL',
      category_id: getCatId('Setelan Ponco'),
      sku_temp: 'PONCO-BLUE',
      min_stock: 10,
      max_stock: 70,
    },
    {
      seller_sku: 'PONCO-AT-SILVER-ALL',
      name: 'Atasan Jas Hujan Ponco Lengan Silver All Size',
      category_id: getCatId('Atasan Ponco'),
      sku_temp: 'PONCO-SILVER',
      min_stock: 10,
      max_stock: 60,
    },
    {
      seller_sku: 'PONCO-K2-MAROON',
      name: 'Jas Hujan Ponco 2 Kepala Bonceng Maroon',
      category_id: getCatId('Ponco Kepala 2'),
      sku_temp: 'PONCO-DUAL-MAROON',
      min_stock: 8,
      max_stock: 50,
    },
    {
      seller_sku: 'GMS-SILK-EMERALD-XL',
      name: 'Gamis Silk Maxmara Emerald Green XL',
      category_id: getCatId('Gamis'),
      sku_temp: 'GAMIS-EMERALD',
      min_stock: 10,
      max_stock: 60,
    },
    {
      seller_sku: 'GMS-CERUTY-ROSE-L',
      name: 'Gamis Ceruty Babydoll Dusty Rose L',
      category_id: getCatId('Gamis'),
      sku_temp: 'GAMIS-DUSTY',
      min_stock: 12,
      max_stock: 70,
    },
    {
      seller_sku: 'ROK-PLISKET-HITAM',
      name: 'Rok Plisket Premium Hitam All Size',
      category_id: getCatId('Rok'),
      sku_temp: 'PLISKET-BLK',
      min_stock: 15,
      max_stock: 100,
    },
    {
      seller_sku: 'ROK-A-LINE-DENIM-L',
      name: 'Rok A-Line Denim Washed Biru L',
      category_id: getCatId('Rok'),
      sku_temp: 'ROK-DENIM',
      min_stock: 10,
      max_stock: 80,
    },
    {
      seller_sku: 'ROK-SPAN-NAVY-M',
      name: 'Rok Span Rajut Navy M',
      category_id: getCatId('Rok'),
      sku_temp: 'SPAN-NAVY',
      min_stock: 5,
      max_stock: 35, // Diatur rendah agar memicu status Berlebih (Overstock)
    },
  ];

  const productMap = new Map<string, typeof products.$inferSelect>();
  for (const p of simulationProducts) {
    let [prod] = await db.select().from(products).where(eq(products.seller_sku, p.seller_sku)).limit(1);
    if (!prod) {
      [prod] = await db.insert(products).values(p).returning();
    } else {
      await db.update(products).set(p).where(eq(products.id, prod.id));
    }
    productMap.set(p.seller_sku, prod);
  }

  // 5. Inbound Stock Batches (Batch Stok Masuk)
  console.log('📥 Menyiapkan Batch Stok Masuk (Stock In)...');
  const batchesData = [
    {
      batch_code: 'BATCH-20261028-01',
      notes: 'Restock Konveksi Sukma Kloter 1 (Katalog Awal Musim Dingin)',
      created_at: '2026-10-28 09:00:00',
      items: [
        { seller_sku: 'CLN-KULOT-BLK-L', qty: 70 },
        { seller_sku: 'CLN-CHINO-MOKA-XL', qty: 50 },
        { seller_sku: 'CLN-BAGGY-SAGE-M', qty: 15 }, // sengaja sedikit
        { seller_sku: 'ST-JKT-NAVY-XL', qty: 60 },
        { seller_sku: 'ST-JKT-GREY-L', qty: 45 },
        { seller_sku: 'AT-JKT-BOMBER-CREAM-M', qty: 55 },
        { seller_sku: 'ROK-SPAN-NAVY-M', qty: 65 }, // sengaja banyak -> overstock
      ],
    },
    {
      batch_code: 'BATCH-20261101-02',
      notes: 'Kiriman Bahan Musim Hujan: Jas Hujan Ponco & Gamis Sukma',
      created_at: '2026-11-01 10:30:00',
      items: [
        { seller_sku: 'PONCO-ST-ARMY-L', qty: 60 },
        { seller_sku: 'PONCO-ST-BLUE-XL', qty: 50 },
        { seller_sku: 'PONCO-AT-SILVER-ALL', qty: 40 },
        { seller_sku: 'PONCO-K2-MAROON', qty: 35 },
        { seller_sku: 'GMS-SILK-EMERALD-XL', qty: 45 },
        { seller_sku: 'GMS-CERUTY-ROSE-L', qty: 50 },
      ],
    },
    {
      batch_code: 'BATCH-20261103-03',
      notes: 'Restock Cepat Jaket Hoodie & Rok Plisket Siap Kirim',
      created_at: '2026-11-03 14:15:00',
      items: [
        { seller_sku: 'AT-JKT-HOODIE-BLK-XL', qty: 80 },
        { seller_sku: 'ROK-PLISKET-HITAM', qty: 75 },
        { seller_sku: 'ROK-A-LINE-DENIM-L', qty: 50 },
        { seller_sku: 'CLN-KULOT-BLK-L', qty: 30 },
      ],
    },
  ];

  for (const b of batchesData) {
    let [batch] = await db
      .select()
      .from(stock_batches)
      .where(eq(stock_batches.batch_code, b.batch_code))
      .limit(1);

    if (!batch) {
      [batch] = await db
        .insert(stock_batches)
        .values({
          batch_code: b.batch_code,
          notes: b.notes,
          created_by: userId,
          created_at: b.created_at,
        })
        .returning();

      for (const item of b.items) {
        const prod = productMap.get(item.seller_sku);
        await db.insert(stock_batch_items).values({
          stock_batch_id: batch.id,
          product_id: prod?.id ?? null,
          seller_sku: item.seller_sku,
          qty: item.qty,
        });
      }
    }
  }

  // 6. Mutasi Pengurangan (Damage / Hilang / Opname)
  console.log('⚠️ Menyiapkan Data Mutasi Pengurangan Stok...');
  const mutationsData = [
    {
      seller_sku: 'CLN-KULOT-BLK-L',
      type: 'barang_rusak' as const,
      qty: 3,
      notes: 'Jahitan obras samping robek saat quality control',
      created_at: '2026-10-30 11:20:00',
    },
    {
      seller_sku: 'ST-JKT-NAVY-XL',
      type: 'barang_rusak' as const,
      qty: 2,
      notes: 'Resleting macet dan kancing kantong lepas',
      created_at: '2026-11-01 16:45:00',
    },
    {
      seller_sku: 'PONCO-ST-ARMY-L',
      type: 'barang_hilang' as const,
      qty: 1,
      notes: 'Hilang dari sampel gantung ruang display',
      created_at: '2026-11-02 13:10:00',
    },
    {
      seller_sku: 'GMS-SILK-EMERALD-XL',
      type: 'selisih_kurang' as const,
      qty: 2,
      notes: 'Selisih perhitungan stok opname fisik mingguan',
      created_at: '2026-11-03 17:00:00',
    },
  ];

  for (const m of mutationsData) {
    const prod = productMap.get(m.seller_sku);
    const [exist] = await db
      .select()
      .from(stock_mutations)
      .where(eq(stock_mutations.seller_sku, m.seller_sku))
      .limit(1);

    if (!exist) {
      await db.insert(stock_mutations).values({
        product_id: prod?.id ?? null,
        seller_sku: m.seller_sku,
        type: m.type,
        qty: m.qty,
        notes: m.notes,
        created_by: userId,
        created_at: m.created_at,
      });
    }
  }

  // 7. Pesanan Online (Resi Tercetak / TikTok Shop - J&T)
  console.log('🏷️ Menyiapkan Batch & Pesanan Resi Tercetak (Online TikTok Shop)...');
  const onlineBatchName = 'Batch Cetak 31 Okt - 04 Nov (TikTok Shop)';
  let [onlineBatch] = await db
    .select()
    .from(batches)
    .where(eq(batches.name, onlineBatchName))
    .limit(1);

  if (!onlineBatch) {
    [onlineBatch] = await db
      .insert(batches)
      .values({
        name: onlineBatchName,
        source_filename: 'tiktok_labels_gabungan_nov2026.pdf',
        pdf_path: 'data/uploads/pdf/tiktok_labels_gabungan_nov2026.pdf',
        total_orders: 20,
        created_by: userId,
        uploaded_at: '2026-10-31 08:30:00',
      })
      .returning();
  }

  const rawOnlineOrders = [
    // 2026-10-28
    {
      resi: 'JX2810990101',
      order_id: '579102800112345671',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.65,
      recipient_name: 'Anisa Rahmawati',
      recipient_phone: '08123456001',
      recipient_address: 'Jl. Riau No. 45, Coblong, Kota Bandung, Jawa Barat',
      sorting_code: 'BDO-01',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-10-28 10:15:00',
      is_shipped: true,
      shipped_at: '2026-10-28 16:30:00',
      created_at: '2026-10-28 09:30:00',
      ship_date: '28-10-2026',
      items: [{ sku: 'CLN-KULOT-BLK-L', name: 'Celana Kulot Highwaist Katun Hitam L', qty: 2 }],
    },
    {
      resi: 'JX2810990102',
      order_id: '579102800212345672',
      courier: 'J&T Express',
      service: 'COD',
      is_cod: true,
      weight_kg: 0.9,
      recipient_name: 'Budi Santoso',
      recipient_phone: '08571234002',
      recipient_address: 'Perumahan Griya Indah Blok C2, Sukolilo, Surabaya, Jawa Timur',
      sorting_code: 'SUB-04',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-10-28 11:20:00',
      is_shipped: true,
      shipped_at: '2026-10-28 16:30:00',
      created_at: '2026-10-28 10:00:00',
      ship_date: '28-10-2026',
      items: [{ sku: 'ST-JKT-NAVY-XL', name: 'Setelan Jaket Training Parasut Navy XL', qty: 1 }],
    },

    // 2026-10-29
    {
      resi: 'JX2910990201',
      order_id: '579102900112345673',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.45,
      recipient_name: 'Citra Kirana',
      recipient_phone: '08139876003',
      recipient_address: 'Jl. Kaliurang KM 8, Sleman, D.I. Yogyakarta',
      sorting_code: 'JOG-02',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-10-29 13:00:00',
      is_shipped: true,
      shipped_at: '2026-10-29 17:15:00',
      created_at: '2026-10-29 11:15:00',
      ship_date: '29-10-2026',
      items: [{ sku: 'ROK-PLISKET-HITAM', name: 'Rok Plisket Premium Hitam All Size', qty: 2 }],
    },
    {
      resi: 'JX2910990202',
      order_id: '579102900212345674',
      courier: 'J&T Express',
      service: 'COD',
      is_cod: true,
      weight_kg: 0.8,
      recipient_name: 'Dedi Kurniawan',
      recipient_phone: '08781234004',
      recipient_address: 'Jl. Ahmad Yani No. 12, Wonokromo, Surabaya',
      sorting_code: 'SUB-01',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-10-29 14:10:00',
      is_shipped: true,
      shipped_at: '2026-10-29 17:15:00',
      created_at: '2026-10-29 12:45:00',
      ship_date: '29-10-2026',
      items: [
        { sku: 'AT-JKT-BOMBER-CREAM-M', name: 'Atasan Jaket Bomber Taslan Cream M', qty: 1 },
        { sku: 'CLN-CHINO-MOKA-XL', name: 'Celana Chino Stretch Moka XL', qty: 1 },
      ],
    },

    // 2026-10-30
    {
      resi: 'JX3010990301',
      order_id: '579103000112345675',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.75,
      recipient_name: 'Eka Pratiwi',
      recipient_phone: '08215678005',
      recipient_address: 'Komp. Melati Indah Blok D-4, Medan Selayang, Medan',
      sorting_code: 'MES-03',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-10-30 09:40:00',
      is_shipped: true,
      shipped_at: '2026-10-30 16:00:00',
      created_at: '2026-10-30 08:30:00',
      ship_date: '30-10-2026',
      items: [{ sku: 'GMS-SILK-EMERALD-XL', name: 'Gamis Silk Maxmara Emerald Green XL', qty: 1 }],
    },
    {
      resi: 'JX3010990302',
      order_id: '579103000212345676',
      courier: 'J&T Express',
      service: 'COD',
      is_cod: true,
      weight_kg: 1.1,
      recipient_name: 'Fajar Nugraha',
      recipient_phone: '08198765006',
      recipient_address: 'Jl. Pemuda No. 78, Semarang Tengah, Kota Semarang',
      sorting_code: 'SRG-01',
      status: 'dibatalkan', // Canceled order
      is_packed: false,
      packed_at: null,
      is_shipped: false,
      shipped_at: null,
      created_at: '2026-10-30 14:00:00',
      ship_date: '30-10-2026',
      items: [{ sku: 'PONCO-ST-ARMY-L', name: 'Setelan Jas Hujan Ponco Celana Army L', qty: 2 }],
    },

    // 2026-10-31
    {
      resi: 'JX3110990401',
      order_id: '579103100112345677',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.55,
      recipient_name: 'Gita Savitri',
      recipient_phone: '08123456007',
      recipient_address: 'Jl. Margonda Raya No. 100, Beji, Kota Depok',
      sorting_code: 'DPK-02',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-10-31 10:20:00',
      is_shipped: true,
      shipped_at: '2026-10-31 17:00:00',
      created_at: '2026-10-31 09:10:00',
      ship_date: '31-10-2026',
      items: [{ sku: 'ROK-A-LINE-DENIM-L', name: 'Rok A-Line Denim Washed Biru L', qty: 1 }],
    },
    {
      resi: 'JX3110990402',
      order_id: '579103100212345678',
      courier: 'J&T Express',
      service: 'COD',
      is_cod: true,
      weight_kg: 0.95,
      recipient_name: 'Hendra Gunawan',
      recipient_phone: '08561234008',
      recipient_address: 'Jl. Diponegoro No. 22, Pekanbaru, Riau',
      sorting_code: 'PKU-01',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-10-31 11:45:00',
      is_shipped: true,
      shipped_at: '2026-10-31 17:00:00',
      created_at: '2026-10-31 10:30:00',
      ship_date: '31-10-2026',
      items: [{ sku: 'AT-JKT-HOODIE-BLK-XL', name: 'Atasan Jaket Hoodie Fleece Hitam XL', qty: 1 }],
    },

    // 2026-11-01
    {
      resi: 'JX0111990501',
      order_id: '579110100112345679',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 1.2,
      recipient_name: 'Intan Permata',
      recipient_phone: '08129876009',
      recipient_address: 'Komp. Duren Sawit Baru Kav. 14, Duren Sawit, Jakarta Timur',
      sorting_code: 'CGK-05',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-11-01 10:00:00',
      is_shipped: true,
      shipped_at: '2026-11-01 16:30:00',
      created_at: '2026-11-01 08:45:00',
      ship_date: '01-11-2026',
      items: [
        { sku: 'PONCO-ST-ARMY-L', name: 'Setelan Jas Hujan Ponco Celana Army L', qty: 1 },
        { sku: 'PONCO-K2-MAROON', name: 'Jas Hujan Ponco 2 Kepala Bonceng Maroon', qty: 1 },
      ],
    },
    {
      resi: 'JX0111990502',
      order_id: '579110100212345680',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.7,
      recipient_name: 'Joko Widodo',
      recipient_phone: '08134567010',
      recipient_address: 'Jl. Slamet Riyadi No. 99, Banjarsari, Surakarta',
      sorting_code: 'SOC-01',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-11-01 11:30:00',
      is_shipped: true,
      shipped_at: '2026-11-01 16:30:00',
      created_at: '2026-11-01 09:30:00',
      ship_date: '01-11-2026',
      items: [{ sku: 'GMS-CERUTY-ROSE-L', name: 'Gamis Ceruty Babydoll Dusty Rose L', qty: 1 }],
    },

    // 2026-11-02
    {
      resi: 'JX0211990601',
      order_id: '579110200112345681',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.65,
      recipient_name: 'Kartika Sari',
      recipient_phone: '08571234011',
      recipient_address: 'Jl. Cihampelas No. 120, Bandung',
      sorting_code: 'BDO-02',
      status: 'dikirim',
      is_packed: true,
      packed_at: '2026-11-02 09:30:00',
      is_shipped: true,
      shipped_at: '2026-11-02 17:00:00',
      created_at: '2026-11-02 08:15:00',
      ship_date: '02-11-2026',
      items: [{ sku: 'CLN-KULOT-BLK-L', name: 'Celana Kulot Highwaist Katun Hitam L', qty: 2 }],
    },
    {
      resi: 'JX0211990602',
      order_id: '579110200212345682',
      courier: 'J&T Express',
      service: 'COD',
      is_cod: true,
      weight_kg: 0.9,
      recipient_name: 'Lukman Hakim',
      recipient_phone: '08781234012',
      recipient_address: 'Jl. Veteran No. 15, Klojen, Kota Malang',
      sorting_code: 'MLG-01',
      status: 'dikemas', // Siap Kirim
      is_packed: true,
      packed_at: '2026-11-02 14:20:00',
      is_shipped: false,
      shipped_at: null,
      created_at: '2026-11-02 11:30:00',
      ship_date: '02-11-2026',
      items: [{ sku: 'ST-JKT-NAVY-XL', name: 'Setelan Jaket Training Parasut Navy XL', qty: 1 }],
    },

    // 2026-11-03
    {
      resi: 'JX0311990701',
      order_id: '579110300112345683',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.8,
      recipient_name: 'Maya Anggraini',
      recipient_phone: '08123456013',
      recipient_address: 'Jl. Sudirman No. 50, Palembang, Sumatera Selatan',
      sorting_code: 'PLM-01',
      status: 'dikemas', // Siap Kirim
      is_packed: true,
      packed_at: '2026-11-03 10:15:00',
      is_shipped: false,
      shipped_at: null,
      created_at: '2026-11-03 09:00:00',
      ship_date: '03-11-2026',
      items: [{ sku: 'AT-JKT-HOODIE-BLK-XL', name: 'Atasan Jaket Hoodie Fleece Hitam XL', qty: 2 }],
    },
    {
      resi: 'JX0311990702',
      order_id: '579110300212345684',
      courier: 'J&T Express',
      service: 'COD',
      is_cod: true,
      weight_kg: 0.6,
      recipient_name: 'Nanda Pratama',
      recipient_phone: '08219876014',
      recipient_address: 'Komp. Graha Indah Blok F-8, Samarinda',
      sorting_code: 'SMD-02',
      status: 'dikemas', // Siap Kirim
      is_packed: true,
      packed_at: '2026-11-03 15:40:00',
      is_shipped: false,
      shipped_at: null,
      created_at: '2026-11-03 13:20:00',
      ship_date: '03-11-2026',
      items: [{ sku: 'ROK-PLISKET-HITAM', name: 'Rok Plisket Premium Hitam All Size', qty: 1 }],
    },

    // 2026-11-04 (HARI INI)
    {
      resi: 'JX0411990801',
      order_id: '579110400112345685',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.5,
      recipient_name: 'Oki Setiawan',
      recipient_phone: '08571234015',
      recipient_address: 'Jl. Asia Afrika No. 10, Senayan, Jakarta Pusat',
      sorting_code: 'CGK-01',
      status: 'menunggu_dikemas', // Belum Dikemas
      is_packed: false,
      packed_at: null,
      is_shipped: false,
      shipped_at: null,
      created_at: '2026-11-04 07:30:00',
      ship_date: '04-11-2026',
      items: [{ sku: 'CLN-KULOT-BLK-L', name: 'Celana Kulot Highwaist Katun Hitam L', qty: 1 }],
    },
    {
      resi: 'JX0411990802',
      order_id: '579110400212345686',
      courier: 'J&T Express',
      service: 'COD',
      is_cod: true,
      weight_kg: 1.0,
      recipient_name: 'Putri Ayu',
      recipient_phone: '08139876016',
      recipient_address: 'Perumahan Grand Galaxy City Blok R1, Bekasi Selatan',
      sorting_code: 'BKS-03',
      status: 'menunggu_dikemas', // Belum Dikemas
      is_packed: false,
      packed_at: null,
      is_shipped: false,
      shipped_at: null,
      created_at: '2026-11-04 08:45:00',
      ship_date: '04-11-2026',
      items: [
        { sku: 'PONCO-ST-BLUE-XL', name: 'Setelan Jas Hujan Ponco Celana Biru XL', qty: 1 },
        { sku: 'PONCO-AT-SILVER-ALL', name: 'Atasan Jas Hujan Ponco Lengan Silver All Size', qty: 1 },
      ],
    },
    {
      resi: 'JX0411990803',
      order_id: '579110400312345687',
      courier: 'J&T Express',
      service: 'EZ',
      is_cod: false,
      weight_kg: 0.75,
      recipient_name: 'Rian Hidayat',
      recipient_phone: '08123456017',
      recipient_address: 'Jl. Gejayan No. 20, Depok, Sleman, Yogyakarta',
      sorting_code: 'JOG-01',
      status: 'dikemas', // Siap Kirim
      is_packed: true,
      packed_at: '2026-11-04 09:15:00',
      is_shipped: false,
      shipped_at: null,
      created_at: '2026-11-04 08:00:00',
      ship_date: '04-11-2026',
      items: [{ sku: 'GMS-SILK-EMERALD-XL', name: 'Gamis Silk Maxmara Emerald Green XL', qty: 1 }],
    },
  ];

  for (const ordData of rawOnlineOrders) {
    const [existOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.resi, ordData.resi))
      .limit(1);

    if (!existOrder) {
      const [newOrder] = await db
        .insert(orders)
        .values({
          batch_id: onlineBatch.id,
          resi: ordData.resi,
          order_id: ordData.order_id,
          courier: ordData.courier,
          service: ordData.service,
          is_cod: ordData.is_cod,
          weight_kg: ordData.weight_kg,
          ship_date: ordData.ship_date,
          recipient_name: ordData.recipient_name,
          recipient_phone: ordData.recipient_phone,
          recipient_address: ordData.recipient_address,
          sorting_code: ordData.sorting_code,
          status: ordData.status as any,
          is_packed: ordData.is_packed,
          packed_at: ordData.packed_at,
          is_shipped: ordData.is_shipped,
          shipped_at: ordData.shipped_at,
          qty_total: ordData.items.reduce((s, it) => s + it.qty, 0),
          created_at: ordData.created_at,
        })
        .returning();

      for (const item of ordData.items) {
        await db.insert(order_items).values({
          order_id: newOrder.id,
          product_name: item.name,
          sku: item.sku,
          seller_sku: item.sku,
          qty: item.qty,
        });
      }
    }
  }

  // 8. Pesanan Offline (Walk-in / Reseller / WA)
  console.log('🛍️ Menyiapkan Pesanan Offline (Toko Fisik & Reseller)...');
  const offlineOrdersData = [
    {
      order_no: 'OFF-20261029-101',
      order_date: '2026-10-29',
      customer_name: 'Ibu Hj. Dewi (Toko Barokah Busana)',
      customer_phone: '081234567890',
      notes: 'Grosir mingguan, diambil supir toko',
      status: 'selesai' as const,
      created_at: '2026-10-29 11:00:00',
      items: [
        { seller_sku: 'CLN-KULOT-BLK-L', product_name: 'Celana Kulot Highwaist Katun Hitam L', qty: 10, price: 65000 },
        { seller_sku: 'ROK-PLISKET-HITAM', product_name: 'Rok Plisket Premium Hitam All Size', qty: 10, price: 55000 },
      ],
    },
    {
      order_no: 'OFF-20261031-102',
      order_date: '2026-10-31',
      customer_name: 'Reseller Mbak Siti - Pasar Baru',
      customer_phone: '085712345678',
      notes: 'Kirim via travel malam ke Solo',
      status: 'selesai' as const,
      created_at: '2026-10-31 15:30:00',
      items: [
        { seller_sku: 'ST-JKT-NAVY-XL', product_name: 'Setelan Jaket Training Parasut Navy XL', qty: 5, price: 135000 },
        { seller_sku: 'AT-JKT-BOMBER-CREAM-M', product_name: 'Atasan Jaket Bomber Taslan Cream M', qty: 5, price: 110000 },
      ],
    },
    {
      order_no: 'OFF-20261102-103',
      order_date: '2026-11-02',
      customer_name: 'Butik Clarissa Jogja',
      customer_phone: '082198765432',
      notes: 'Restock butik gamis silk dan jaket hoodie',
      status: 'selesai' as const,
      created_at: '2026-11-02 10:20:00',
      items: [
        { seller_sku: 'GMS-SILK-EMERALD-XL', product_name: 'Gamis Silk Maxmara Emerald Green XL', qty: 6, price: 175000 },
        { seller_sku: 'AT-JKT-HOODIE-BLK-XL', product_name: 'Atasan Jaket Hoodie Fleece Hitam XL', qty: 8, price: 120000 },
      ],
    },
    {
      order_no: 'OFF-20261103-104',
      order_date: '2026-11-03',
      customer_name: 'Bpk. H. Rahmat (Grosir Tanah Abang)',
      customer_phone: '081345678901',
      notes: 'Pesanan partai jas hujan ponco, siap dijemput ekspedisi',
      status: 'dikemas' as const, // Siap Kirim
      created_at: '2026-11-03 16:00:00',
      items: [
        { seller_sku: 'PONCO-ST-ARMY-L', product_name: 'Setelan Jas Hujan Ponco Celana Army L', qty: 15, price: 95000 },
        { seller_sku: 'PONCO-K2-MAROON', product_name: 'Jas Hujan Ponco 2 Kepala Bonceng Maroon', qty: 10, price: 85000 },
      ],
    },
    {
      order_no: 'OFF-20261104-105',
      order_date: '2026-11-04',
      customer_name: 'Walk-in Pelanggan Mbak Nisa',
      customer_phone: '087812349876',
      notes: 'Beli langsung di gudang untuk seragam keluarga',
      status: 'dikemas' as const, // Siap Kirim
      created_at: '2026-11-04 09:30:00',
      items: [
        { seller_sku: 'GMS-CERUTY-ROSE-L', product_name: 'Gamis Ceruty Babydoll Dusty Rose L', qty: 4, price: 165000 },
        { seller_sku: 'CLN-CHINO-MOKA-XL', product_name: 'Celana Chino Stretch Moka XL', qty: 3, price: 85000 },
      ],
    },
    {
      order_no: 'OFF-20261104-106',
      order_date: '2026-11-04',
      customer_name: 'Mitra Konveksi Sejahtera (Batal)',
      customer_phone: '081987654321',
      notes: 'Pelanggan minta cancel karena salah ukuran',
      status: 'dibatalkan' as const, // Dibatalkan (stok tidak terpotong)
      created_at: '2026-11-04 10:00:00',
      items: [
        { seller_sku: 'ST-JKT-GREY-L', product_name: 'Setelan Jaket Windbreaker Abu-Abu L', qty: 5, price: 130000 },
      ],
    },
  ];

  for (const off of offlineOrdersData) {
    let [existingOff] = await db
      .select()
      .from(offline_orders)
      .where(eq(offline_orders.order_no, off.order_no))
      .limit(1);

    if (!existingOff) {
      [existingOff] = await db
        .insert(offline_orders)
        .values({
          order_no: off.order_no,
          order_date: off.order_date,
          customer_name: off.customer_name,
          customer_phone: off.customer_phone,
          notes: off.notes,
          status: off.status,
          created_by: userId,
          created_at: off.created_at,
        })
        .returning();

      for (const item of off.items) {
        const prod = productMap.get(item.seller_sku);
        await db.insert(offline_order_items).values({
          offline_order_id: existingOff.id,
          product_id: prod?.id ?? null,
          seller_sku: item.seller_sku,
          product_name: item.product_name,
          qty: item.qty,
          price: item.price,
        });
      }
    }
  }

  console.log('✅ SELURUH DATA SIMULASI BERHASIL DIISI KE DATABASE:');
  console.log(`   - 8 Kategori Garmen`);
  console.log(`   - 16 Produk Katalog Master`);
  console.log(`   - 3 Batch Stok Masuk (Stock In)`);
  console.log(`   - 4 Mutasi Barang (Pengurangan)`);
  console.log(`   - 17 Pesanan Online TikTok Shop (Resi Tercetak)`);
  console.log(`   - 6 Pesanan Offline (Grosir & Toko Fisik)`);
  console.log('🎉 Dashboard dan seluruh menu mini-ERP kini siap dilihat secara lengkap!');
}

// Eksekusi langsung jika dipanggil via CLI
if (process.argv[1] && process.argv[1].endsWith('seedSimulation.ts')) {
  seedSimulationData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Gagal menjalankan seed simulasi:', err);
      process.exit(1);
    });
}
