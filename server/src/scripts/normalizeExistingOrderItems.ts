import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { products, order_items, offline_order_items } from '../db/schema.js';
import { findMasterProductForOrderItem } from '../services/stockService.js';

export async function runNormalization() {
  console.log('=== MEMULAI NORMALISASI SELLER SKU ===\n');

  const allProducts = await db.select().from(products);
  console.log(`Ditemukan ${allProducts.length} master produk.`);

  const validSkus = new Set(allProducts.map((p) => p.seller_sku));

  // 1. Normalisasi order_items (Pesanan Online / Batch)
  const allOrderItems = await db.select().from(order_items);
  console.log(`\nMemeriksa ${allOrderItems.length} item pesanan online (order_items)...`);

  let onlineAlreadyValid = 0;
  let onlineUpdated = 0;
  let onlineUnmatched = 0;

  for (const item of allOrderItems) {
    const matched = findMasterProductForOrderItem(item, allProducts);
    if (matched) {
      if (item.seller_sku === matched.seller_sku) {
        onlineAlreadyValid++;
      } else {
        await db
          .update(order_items)
          .set({ seller_sku: matched.seller_sku })
          .where(eq(order_items.id, item.id));

        onlineUpdated++;
        console.log(
          `[ONLINE #${item.id}] "${item.seller_sku}" (sku: "${item.sku}") -> "${matched.seller_sku}" (${matched.name})`
        );
      }
    } else {
      if (item.seller_sku && validSkus.has(item.seller_sku)) {
        onlineAlreadyValid++;
      } else {
        onlineUnmatched++;
        console.warn(
          `[ONLINE UNMATCHED #${item.id}] "${item.seller_sku}" (sku: "${item.sku}", product_name: "${item.product_name}")`
        );
      }
    }
  }

  // 2. Normalisasi offline_order_items (Pesanan Offline)
  const allOfflineItems = await db.select().from(offline_order_items);
  console.log(`\nMemeriksa ${allOfflineItems.length} item pesanan offline (offline_order_items)...`);

  let offlineAlreadyValid = 0;
  let offlineUpdated = 0;
  let offlineUnmatched = 0;

  for (const item of allOfflineItems) {
    const matched = findMasterProductForOrderItem(
      { product_name: item.product_name, seller_sku: item.seller_sku },
      allProducts
    );
    if (matched) {
      if (item.seller_sku === matched.seller_sku && item.product_id === matched.id) {
        offlineAlreadyValid++;
      } else {
        await db
          .update(offline_order_items)
          .set({ seller_sku: matched.seller_sku, product_id: matched.id })
          .where(eq(offline_order_items.id, item.id));

        offlineUpdated++;
        console.log(
          `[OFFLINE #${item.id}] "${item.seller_sku}" -> "${matched.seller_sku}" (${matched.name})`
        );
      }
    } else {
      if (item.seller_sku && validSkus.has(item.seller_sku)) {
        offlineAlreadyValid++;
      } else {
        offlineUnmatched++;
        console.warn(
          `[OFFLINE UNMATCHED #${item.id}] "${item.seller_sku}" (product_name: "${item.product_name}")`
        );
      }
    }
  }

  console.log('\n=== RINGKASAN NORMALISASI ===');
  console.log(`Online Items : Total ${allOrderItems.length} | Sudah Valid: ${onlineAlreadyValid} | Berhasil Dinormalisasi: ${onlineUpdated} | Tidak Cocok: ${onlineUnmatched}`);
  console.log(`Offline Items: Total ${allOfflineItems.length} | Sudah Valid: ${offlineAlreadyValid} | Berhasil Dinormalisasi: ${offlineUpdated} | Tidak Cocok: ${offlineUnmatched}`);
  console.log('=== SELESAI ===\n');
}

runNormalization()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Terjadi error saat normalisasi:', err);
    process.exit(1);
  });
