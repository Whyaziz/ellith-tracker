import type Database from 'better-sqlite3';

// Each issue owns its portion of every lot. Removing an issue releases exactly those units.
export function installInventoryLedger(sqlite: Database.Database) {
  if (sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='inventory_issues'").get()) return;
  sqlite
    .transaction(() => {
      sqlite.exec(`
      ALTER TABLE offline_order_items ADD COLUMN cogs_unit_ma REAL;
      CREATE TABLE inventory_issues (
        id INTEGER PRIMARY KEY, source TEXT NOT NULL, item_id INTEGER NOT NULL,
        sku TEXT NOT NULL, qty INTEGER NOT NULL, occurred_at TEXT NOT NULL,
        UNIQUE(source, item_id)
      );
      CREATE TABLE inventory_allocations (
        issue_id INTEGER NOT NULL REFERENCES inventory_issues(id) ON DELETE CASCADE,
        lot_id INTEGER NOT NULL REFERENCES stock_batch_items(id),
        qty INTEGER NOT NULL CHECK(qty > 0), unit_cost REAL NOT NULL,
        PRIMARY KEY(issue_id, lot_id)
      );
      CREATE VIEW inventory_lots AS
        SELECT i.id, i.seller_sku sku, i.remaining_qty qty, b.created_at,
          COALESCE(i.cogs_total, c.bahan_utama+c.aksesori+c.kemasan+c.tenaga_kerja+c.overhead,0) cost
        FROM stock_batch_items i JOIN stock_batches b ON b.id=i.stock_batch_id
        LEFT JOIN product_cogs c ON c.product_id=i.product_id;
      CREATE TRIGGER restore_issue BEFORE DELETE ON inventory_issues BEGIN
        UPDATE stock_batch_items SET remaining_qty=remaining_qty+
          (SELECT qty FROM inventory_allocations WHERE issue_id=OLD.id AND lot_id=stock_batch_items.id)
          WHERE id IN (SELECT lot_id FROM inventory_allocations WHERE issue_id=OLD.id);
      END;
    `);
      const eligible = `sku=NEW.sku COLLATE NOCASE AND qty>0
      AND datetime(created_at)<=datetime(NEW.occurred_at)
      AND (datetime(created_at)>=datetime((SELECT value FROM system_settings WHERE key='stock_cutoff_date'))
        OR datetime(NEW.occurred_at)<datetime((SELECT value FROM system_settings WHERE key='stock_cutoff_date'))
        OR NOT EXISTS(SELECT 1 FROM system_settings WHERE key='stock_cutoff_date'))`;
      const fallback = `COALESCE((SELECT c.bahan_utama+c.aksesori+c.kemasan+c.tenaga_kerja+c.overhead
      FROM product_cogs c JOIN products p ON p.id=c.product_id WHERE p.seller_sku=NEW.sku COLLATE NOCASE),0)`;
      sqlite.exec(`CREATE TRIGGER allocate_issue AFTER INSERT ON inventory_issues BEGIN
      UPDATE offline_order_items SET cogs_unit_ma=COALESCE(
        (SELECT SUM(qty*cost)*1.0/SUM(qty) FROM inventory_lots WHERE ${eligible}), ${fallback})
        WHERE NEW.source='offline' AND id=NEW.item_id;
      INSERT INTO inventory_allocations
        SELECT NEW.id,id,MIN(qty,NEW.qty-prior),cost FROM (
          SELECT *, COALESCE(SUM(qty) OVER (ORDER BY datetime(created_at),id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior
          FROM inventory_lots WHERE ${eligible}
        ) WHERE prior<NEW.qty;
      UPDATE stock_batch_items SET remaining_qty=remaining_qty-
        (SELECT qty FROM inventory_allocations WHERE issue_id=NEW.id AND lot_id=stock_batch_items.id)
        WHERE id IN (SELECT lot_id FROM inventory_allocations WHERE issue_id=NEW.id);
      ${['online', 'offline']
        .map(
          (source) => `UPDATE ${source === 'online' ? 'order_items' : 'offline_order_items'}
        SET cogs_unit_fifo=(SELECT (COALESCE(SUM(qty*unit_cost),0)+(NEW.qty-COALESCE(SUM(qty),0))*${fallback})*1.0/NEW.qty
        FROM inventory_allocations WHERE issue_id=NEW.id) WHERE NEW.source='${source}' AND id=NEW.item_id;`
        )
        .join('\n')}
    END`);
      const histories: string[] = [];
      for (const source of ['offline', 'online', 'mutation']) {
        const offline = source === 'offline';
        const mutation = source === 'mutation';
        const items = mutation
          ? 'stock_mutations'
          : offline
            ? 'offline_order_items'
            : 'order_items';
        const parent = offline ? 'offline_orders' : 'orders';
        const fk = offline ? 'offline_order_id' : 'order_id';
        const active = offline
          ? "p.status!='dibatalkan'"
          : "p.is_packed=1 AND p.status!='dibatalkan'";
        const time = offline ? 'p.created_at' : 'COALESCE(p.packed_at,p.created_at)';
        const select = mutation
          ? "SELECT 'mutation',i.id,i.seller_sku,i.qty,i.created_at event_time FROM stock_mutations i WHERE i.qty>0"
          : `SELECT '${source}',i.id,i.seller_sku,i.qty,${time} event_time FROM ${items} i JOIN ${parent} p
          ON p.id=i.${fk} WHERE ${active} AND i.seller_sku IS NOT NULL AND i.qty>0`;
        const insert = 'INSERT INTO inventory_issues(source,item_id,sku,qty,occurred_at) ';
        histories.push(select);
        sqlite.exec(`CREATE TRIGGER issue_${source}_insert AFTER INSERT ON ${items} BEGIN
        ${insert}${select} AND i.id=NEW.id; END;
        CREATE TRIGGER issue_${source}_delete BEFORE DELETE ON ${items} BEGIN
        DELETE FROM inventory_issues WHERE source='${source}' AND item_id=OLD.id; END;`);
        if (!mutation) {
          const condition = (row: string) => active.replaceAll('p.', row + '.');
          sqlite.exec(`CREATE TRIGGER issue_${source}_status AFTER UPDATE OF status ON ${parent}
          WHEN (${condition('OLD')}) != (${condition('NEW')}) BEGIN
          DELETE FROM inventory_issues WHERE source='${source}' AND item_id IN (SELECT id FROM ${items} WHERE ${fk}=NEW.id);
          ${insert}${select} AND p.id=NEW.id; END;`);
        }
      }
      sqlite.exec('UPDATE stock_batch_items SET remaining_qty=qty');
      sqlite.exec(
        'INSERT INTO inventory_issues(source,item_id,sku,qty,occurred_at) SELECT * FROM (' +
          histories.join(' UNION ALL ') +
          ') ORDER BY julianday(event_time),1,2'
      );
    })
    .immediate();
}
