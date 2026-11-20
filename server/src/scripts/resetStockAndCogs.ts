import { sqlite } from '../db/client.js';

function safeDelete(tableName: string): number {
  try {
    const tableExists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(tableName);
    if (!tableExists) return 0;
    return sqlite.prepare(`DELETE FROM ${tableName}`).run().changes;
  } catch {
    return 0;
  }
}

export function resetStockAndCogs(): {
  batchesDeleted: number;
  batchItemsDeleted: number;
  mutationsDeleted: number;
  opnameLogsDeleted: number;
  cogsAllocationsDeleted: number;
  inventoryLedgerDeleted: number;
  inventoryIssuesDeleted: number;
  productCogsDeleted: number;
  offlineOrderItemsReset: number;
  productsStockReset: number;
} {
  console.log('[resetStockAndCogs] Memulai pengosongan data Stok dan HPP...');

  return sqlite.transaction(() => {
    // 1. Hapus alokasi FIFO dan ledger (jika ada)
    const cogsAllocationsDeleted = safeDelete('stock_cogs_allocations');
    const inventoryLedgerDeleted = safeDelete('inventory_ledger_entries');
    const inventoryIssuesDeleted = safeDelete('inventory_issues');

    // 2. Hapus rincian item batch stok dan header batch stok
    const batchItemsDeleted = safeDelete('stock_batch_items');
    const batchesDeleted = safeDelete('stock_batches');

    // 3. Hapus mutasi dan riwayat opname
    const mutationsDeleted = safeDelete('stock_mutations');
    const opnameLogsDeleted = safeDelete('stock_opname_logs');

    // 4. Hapus master HPP produk
    const productCogsDeleted = safeDelete('product_cogs');
    safeDelete('cogs_master_estimates');

    // 5. Reset unit FIFO pada nota pesanan offline (jika tabel ada)
    let offlineOrderItemsReset = 0;
    try {
      const offlineTableExists = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='offline_order_items'")
        .get();
      if (offlineTableExists) {
        offlineOrderItemsReset = sqlite
          .prepare('UPDATE offline_order_items SET cogs_unit_fifo = NULL')
          .run().changes;
      }
    } catch {
      // Abaikan jika kolom atau tabel belum ada
    }

    // 6. Reset saldo stok dan cache modal pada produk master
    let productsStockReset = 0;
    try {
      productsStockReset = sqlite
        .prepare('UPDATE products SET stock = 0, reserved_stock = 0, last_cogs = NULL')
        .run().changes;
    } catch {
      // Fallback jika salah satu kolom tidak ada
      try {
        productsStockReset = sqlite.prepare('UPDATE products SET stock = 0').run().changes;
      } catch {
        // Abaikan
      }
    }

    // 7. Bersihkan cutoff date agar tidak ada filter tanggal masa lalu yang tertinggal
    try {
      sqlite.prepare("DELETE FROM system_settings WHERE key = 'stock_cutoff_date'").run();
    } catch {
      // Abaikan
    }

    // 8. Tandai baseline telah diatur agar db:migrate tidak otomatis mengisi dummy baseline
    try {
      sqlite
        .prepare(
          "INSERT INTO system_settings (key, value) VALUES ('cogs_baseline_seeded', '1') ON CONFLICT(key) DO UPDATE SET value='1'"
        )
        .run();
    } catch {
      // Abaikan
    }

    return {
      batchesDeleted,
      batchItemsDeleted,
      mutationsDeleted,
      opnameLogsDeleted,
      cogsAllocationsDeleted,
      inventoryLedgerDeleted,
      inventoryIssuesDeleted,
      productCogsDeleted,
      offlineOrderItemsReset,
      productsStockReset,
    };
  })();
}

// Jalankan langsung jika dipanggil dari CLI
const isDirectCall =
  process.argv[1] &&
  (process.argv[1].endsWith('resetStockAndCogs.ts') ||
    process.argv[1].endsWith('resetStockAndCogs.js'));

if (isDirectCall) {
  try {
    const result = resetStockAndCogs();
    console.log('[resetStockAndCogs] Sukses mengosongkan seluruh data stok dan HPP:');
    console.table(result);
    process.exit(0);
  } catch (err) {
    console.error('[resetStockAndCogs] Galat saat mengosongkan data:', err);
    process.exit(1);
  }
}
