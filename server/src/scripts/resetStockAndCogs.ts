import { sqlite } from '../db/client.js';

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
    // 1. Hapus alokasi FIFO dan ledger
    const cogsAllocationsDeleted = sqlite.prepare('DELETE FROM stock_cogs_allocations').run().changes;
    const inventoryLedgerDeleted = sqlite.prepare('DELETE FROM inventory_ledger_entries').run().changes;
    const inventoryIssuesDeleted = sqlite.prepare('DELETE FROM inventory_issues').run().changes;

    // 2. Hapus rincian item batch stok dan header batch stok
    const batchItemsDeleted = sqlite.prepare('DELETE FROM stock_batch_items').run().changes;
    const batchesDeleted = sqlite.prepare('DELETE FROM stock_batches').run().changes;

    // 3. Hapus mutasi dan riwayat opname
    const mutationsDeleted = sqlite.prepare('DELETE FROM stock_mutations').run().changes;
    const opnameLogsDeleted = sqlite.prepare('DELETE FROM stock_opname_logs').run().changes;

    // 4. Hapus master HPP produk
    const productCogsDeleted = sqlite.prepare('DELETE FROM product_cogs').run().changes;
    try {
      sqlite.prepare('DELETE FROM cogs_master_estimates').run();
    } catch {
      // Abaikan jika tabel tidak ada
    }

    // 5. Reset unit FIFO pada nota pesanan offline
    const offlineOrderItemsReset = sqlite
      .prepare('UPDATE offline_order_items SET cogs_unit_fifo = NULL')
      .run().changes;

    // 6. Reset saldo stok dan cache modal pada produk master
    const productsStockReset = sqlite
      .prepare('UPDATE products SET stock = 0, reserved_stock = 0, last_cogs = NULL')
      .run().changes;

    // 7. Bersihkan cutoff date agar tidak ada filter tanggal masa lalu yang tertinggal
    sqlite.prepare("DELETE FROM system_settings WHERE key = 'stock_cutoff_date'").run();

    // 8. Tandai baseline telah diatur agar db:migrate tidak otomatis mengisi dummy baseline
    sqlite
      .prepare(
        "INSERT INTO system_settings (key, value) VALUES ('cogs_baseline_seeded', '1') ON CONFLICT(key) DO UPDATE SET value='1'"
      )
      .run();

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
