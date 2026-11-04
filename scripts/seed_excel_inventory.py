import os
import sqlite3
import openpyxl
from datetime import datetime, timedelta

EXCEL_PATH = r'e:\Coding\ERP-Sukma\tracking\docs\Inventaris Stok ELLITH (4).xlsx'
DB_PATH = r'e:\Coding\ERP-Sukma\tracking\data\app.db'

# Konfigurasi mapping sheet ke Kategori & SKU prefix
SHEET_CONFIG = [
    {
        'sheet': 'Celana',
        'category': 'Celana',
        'prefix': 'CLN-',
        'name_format': 'Celana ({color})',
    },
    {
        'sheet': 'Setelan Jaket',
        'category': 'Setelan Jaket',
        'prefix': 'JKT-SET-',
        'name_format': 'Setelan Jaket ({color})',
    },
    {
        'sheet': 'Jaket Beda Warna',
        'category': 'Jaket Beda Warna',
        'prefix': 'JKT-BW-',
        'name_format': 'Jaket Beda Warna ({color})',
    },
    {
        'sheet': 'Atasan Jaket',
        'category': 'Atasan Jaket',
        'prefix': 'JKT-TOP-',
        'name_format': 'Atasan Jaket ({color})',
    },
    {
        'sheet': 'Setelan Ponco (KL)',
        'category': 'Setelan Ponco (KL)',
        'prefix': 'PNC-SET-',
        'name_format': 'Setelan Ponco KL ({color})',
    },
    {
        'sheet': 'Ponco(KL) Beda Warna',
        'category': 'Ponco(KL) Beda Warna',
        'prefix': 'PNC-BW-',
        'name_format': 'Ponco KL Beda Warna ({color})',
    },
    {
        'sheet': 'Atasan Ponco (KL)',
        'category': 'Atasan Ponco (KL)',
        'prefix': 'PNC-TOP-',
        'name_format': 'Atasan Ponco KL ({color})',
    },
    {
        'sheet': 'Ponco Kepala 2 (KL2)',
        'category': 'Ponco Kepala 2 (KL2)',
        'prefix': 'KL2-',
        'name_format': 'Ponco Kepala 2 ({color})',
    },
    {
        'sheet': 'Gamis',
        'category': 'Gamis',
        'prefix': 'GMS-',
        'name_format': 'Gamis ({color})',
    },
    {
        'sheet': 'Rok',
        'category': 'Rok',
        'prefix': 'ROK-',
        'name_format': 'Rok ({color})',
    },
]

def slugify_color(color: str) -> str:
    color = color.strip().upper()
    color = color.replace(' ', '-')
    return color

def run():
    print(f"[*] Membuka workbook Excel: {EXCEL_PATH}...")
    if not os.path.exists(EXCEL_PATH):
        raise FileNotFoundError(f"File excel tidak ditemukan: {EXCEL_PATH}")

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    
    print(f"[*] Menghubungkan ke SQLite database: {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Nonaktifkan foreign keys untuk reset bersih
    cur.execute("PRAGMA foreign_keys = OFF;")

    print("[*] Mengosongkan data transaksi, pesanan, mutasi, stok lama, dan produk lama...")
    tables_to_clear = [
        'scan_logs',
        'order_items',
        'orders',
        'batches',
        'offline_order_items',
        'offline_orders',
        'stock_mutations',
        'stock_batch_items',
        'stock_batches',
        'products',
        'product_categories',
    ]

    for table in tables_to_clear:
        cur.execute(f"DELETE FROM {table};")
        print(f"  - Tabel {table} dikosongkan.")

    # Reset SQLite autoincrement sequence
    placeholders = ",".join([f"'{t}'" for t in tables_to_clear])
    cur.execute(f"DELETE FROM sqlite_sequence WHERE name IN ({placeholders});")

    # Pastikan user admin ada
    cur.execute("SELECT id FROM users WHERE username = 'admin' LIMIT 1;")
    user_row = cur.fetchone()
    if not user_row:
        print("[*] Membuat akun admin default...")
        # Hash bcrypt admin123
        default_hash = "$2b$10$Fj8OuJ8l17T6xtMbYmOb8.O9LGQBVTPhOm4kxM3u8wmLSTlEay0Ce"
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin');",
            (default_hash,)
        )
        admin_id = cur.lastrowid
    else:
        admin_id = user_row[0]
    print(f"[*] User admin siap (ID: {admin_id}).")

    cur.execute("PRAGMA foreign_keys = ON;")

    # 2. Insert Kategori Produk
    print("\n[*] Menambahkan Kategori Produk...")
    category_map = {}
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for cfg in SHEET_CONFIG:
        cat_name = cfg['category']
        cur.execute(
            "INSERT INTO product_categories (name, created_at) VALUES (?, ?);",
            (cat_name, now_str)
        )
        cat_id = cur.lastrowid
        category_map[cat_name] = cat_id
        print(f"  + Kategori [{cat_id}]: {cat_name}")

    # 3. Ekstraksi Produk & Stok dari Excel
    print("\n[*] Mengekstraksi Produk dan Stok Fisik dari Excel...")
    products_to_insert = []
    stock_items_to_insert = []
    
    total_qty_all = 0
    overstock_count = 0
    understock_count = 0
    stockout_count = 0
    normal_count = 0

    for cfg in SHEET_CONFIG:
        sheet_name = cfg['sheet']
        cat_name = cfg['category']
        cat_id = category_map[cat_name]
        prefix = cfg['prefix']
        name_fmt = cfg['name_format']

        ws = wb[sheet_name]
        cat_qty = 0

        for r in range(4, ws.max_row + 1):
            color_val = ws.cell(r, 1).value
            qty_val = ws.cell(r, 2).value

            if color_val is None:
                continue

            color_str = str(color_val).strip()
            if color_str.lower() == 'total':
                continue

            qty = int(qty_val) if qty_val is not None else 0
            cat_qty += qty
            total_qty_all += qty

            color_slug = slugify_color(color_str)
            seller_sku = f"{prefix}{color_slug}"
            product_name = name_fmt.format(color=color_str)

            # Batas stok: min 5, max 200
            min_stock = 5
            max_stock = 200

            if qty == 0:
                stockout_count += 1
            elif qty < min_stock:
                understock_count += 1
            elif qty > max_stock:
                overstock_count += 1
            else:
                normal_count += 1

            products_to_insert.append({
                'seller_sku': seller_sku,
                'name': product_name,
                'category_id': cat_id,
                'min_stock': min_stock,
                'max_stock': max_stock,
                'qty': qty,
                'category_name': cat_name,
            })

        print(f"  > {sheet_name}: {cat_qty} pcs")

    # 4. Insert Produk ke Tabel `products`
    print(f"\n[*] Memasukkan {len(products_to_insert)} produk ke tabel 'products'...")
    product_id_map = {}
    for p in products_to_insert:
        cur.execute(
            """INSERT INTO products (seller_sku, name, category_id, min_stock, max_stock, created_at)
               VALUES (?, ?, ?, ?, ?, ?);""",
            (p['seller_sku'], p['name'], p['category_id'], p['min_stock'], p['max_stock'], now_str)
        )
        prod_id = cur.lastrowid
        product_id_map[p['seller_sku']] = prod_id

    # 5. Buat Batch Stok Masuk (Stock In) Awal
    print("\n[*] Membuat Batch Stok Awal Gudang di 'stock_batches'...")
    batch_code = "BATCH-EXCEL-AWAL"
    batch_notes = "Stok Awal Fisik Gudang dari Excel Inventaris Stok ELLITH"
    cur.execute(
        """INSERT INTO stock_batches (batch_code, notes, created_by, created_at)
           VALUES (?, ?, ?, ?);""",
        (batch_code, batch_notes, admin_id, now_str)
    )
    batch_id = cur.lastrowid
    print(f"  + Batch Stok ID: {batch_id} (Kode: {batch_code})")

    # 6. Masukkan semua item stok ke 'stock_batch_items'
    print(f"[*] Memasukkan {len(products_to_insert)} item ke 'stock_batch_items'...")
    for p in products_to_insert:
        prod_id = product_id_map[p['seller_sku']]
        cur.execute(
            """INSERT INTO stock_batch_items (stock_batch_id, product_id, seller_sku, qty)
               VALUES (?, ?, ?, ?);""",
            (batch_id, prod_id, p['seller_sku'], p['qty'])
        )

    # 7. Impor Data Pesanan Offline dari Sheet 'Offline'
    print("\n[*] Mengimpor Pesanan Offline dari Sheet 'Offline'...")
    ws_off = wb['Offline']
    excel_base = datetime(1899, 12, 30)

    PRODUCT_OFFLINE_MAPPINGS = {
        ('celana', 'navy'): ('CLN-NAVY', 'Celana (Navy)', 'Celana'),
        ('gamis', 'army'): ('GMS-ARMY', 'Gamis (Army)', 'Gamis'),
        ('gamis', 'biru muda'): ('GMS-BIRU-LAUT', 'Gamis (Biru Laut)', 'Gamis'),
        ('gamis', 'cream'): ('GMS-CREAM', 'Gamis (Cream)', 'Gamis'),
        ('gamis', 'navy'): ('GMS-NAVY', 'Gamis (Navy)', 'Gamis'),
        ('gamis', 'pink'): ('GMS-PINK', 'Gamis (Pink)', 'Gamis'),
        ('gamis', 'sage'): ('GMS-SAGE', 'Gamis (Sage)', 'Gamis'),
        ('jaket (atasan)', 'navy'): ('JKT-TOP-NAVY', 'Atasan Jaket (Navy)', 'Atasan Jaket'),
        ('jaket (setelan)', 'army'): ('JKT-BW-ARMY', 'Jaket Beda Warna (Army)', 'Jaket Beda Warna'),
        ('jaket (setelan)', 'biru muda'): ('JKT-SET-BIRU-LAUT', 'Setelan Jaket (Biru Laut)', 'Setelan Jaket'),
        ('jaket (setelan)', 'cream'): ('JKT-SET-CREAM', 'Setelan Jaket (Cream)', 'Setelan Jaket'),
        ('jaket (setelan)', 'hitam'): ('JKT-BW-HITAM', 'Jaket Beda Warna (Hitam)', 'Jaket Beda Warna'),
        ('jaket (setelan)', 'maroon'): ('JKT-SET-MAROON', 'Setelan Jaket (Maroon)', 'Setelan Jaket'),
        ('jaket (setelan)', 'navy'): ('JKT-SET-NAVY', 'Setelan Jaket (Navy)', 'Setelan Jaket'),
        ('jaket (setelan)', 'pink'): ('JKT-SET-PINK', 'Setelan Jaket (Pink)', 'Setelan Jaket'),
        ('jaket (setelan)', 'sage'): ('JKT-SET-SAGE', 'Setelan Jaket (Sage)', 'Setelan Jaket'),
        ('jaket (setelan)', 'violet'): ('JKT-SET-VIOLET', 'Setelan Jaket (Violet)', 'Setelan Jaket'),
        ('ponco (setelan)', 'army'): ('PNC-BW-ARMY', 'Ponco KL Beda Warna (Army)', 'Ponco(KL) Beda Warna'),
        ('ponco (setelan)', 'cream'): ('PNC-SET-CREAM', 'Setelan Ponco KL (Cream)', 'Setelan Ponco (KL)'),
        ('ponco (setelan)', 'hitam'): ('PNC-SET-HITAM', 'Setelan Ponco KL (Hitam)', 'Setelan Ponco (KL)'),
        ('ponco (setelan)', 'maroon'): ('PNC-SET-MAROON', 'Setelan Ponco KL (Maroon)', 'Setelan Ponco (KL)'),
        ('ponco (setelan)', 'navy'): ('PNC-SET-NAVY', 'Setelan Ponco KL (Navy)', 'Setelan Ponco (KL)'),
        ('ponco (setelan)', 'pink'): ('PNC-SET-PINK', 'Setelan Ponco KL (Pink)', 'Setelan Ponco (KL)'),
        ('rok', 'navy'): ('ROK-NAVY', 'Rok (Navy)', 'Rok'),
    }

    # Pastikan varian offline yang belum ada di produk dibuatkan
    for key, (sku, name, cat_name) in PRODUCT_OFFLINE_MAPPINGS.items():
        if sku not in product_id_map:
            cat_id = category_map.get(cat_name, 1)
            cur.execute(
                """INSERT INTO products (seller_sku, name, category_id, min_stock, max_stock, created_at)
                   VALUES (?, ?, ?, 5, 200, ?)""",
                (sku, name, cat_id, now_str)
            )
            product_id_map[sku] = cur.lastrowid

    offline_groups = []
    current_off_group = None

    for r in range(8, 81):
        serial_date = ws_off.cell(r, 2).value
        pembeli = ws_off.cell(r, 3).value
        sku_name = str(ws_off.cell(r, 4).value).strip() if ws_off.cell(r, 4).value else ''
        warna = str(ws_off.cell(r, 5).value).strip() if ws_off.cell(r, 5).value else ''
        qty = int(ws_off.cell(r, 6).value) if ws_off.cell(r, 6).value else 1
        harga = float(ws_off.cell(r, 7).value) if ws_off.cell(r, 7).value else 0.0
        harga_act = float(ws_off.cell(r, 8).value) if ws_off.cell(r, 8).value else harga
        status = ws_off.cell(r, 9).value

        date_str = (excel_base + timedelta(days=serial_date)).strftime('%Y-%m-%d')
        cust_name = str(pembeli).strip() if pembeli else 'Pelanggan Offline'

        key = (date_str, cust_name.lower())
        if current_off_group is None or current_off_group['key'] != key:
            current_off_group = {
                'key': key,
                'date': date_str,
                'customer': cust_name,
                'is_lunas': status is True,
                'items': []
            }
            offline_groups.append(current_off_group)

        lookup_key = (sku_name.lower(), warna.lower())
        mapping = PRODUCT_OFFLINE_MAPPINGS.get(lookup_key)
        if mapping:
            target_sku, target_name, _ = mapping
        else:
            target_sku = f"{sku_name.upper().replace(' ', '-')}-{warna.upper().replace(' ', '-')}"
            target_name = f"{sku_name} ({warna})"

        prod_id = product_id_map.get(target_sku)

        current_off_group['items'].append({
            'product_id': prod_id,
            'seller_sku': target_sku,
            'product_name': target_name,
            'qty': qty,
            'price': harga_act if harga_act > 0 else harga,
        })

    date_counters = {}
    inserted_orders_count = 0
    inserted_items_count = 0
    total_offline_qty = 0
    total_offline_revenue = 0.0

    for g in offline_groups:
        date_str = g['date']
        date_num = date_str.replace('-', '')
        date_counters[date_num] = date_counters.get(date_num, 0) + 1
        seq = date_counters[date_num]
        order_no = f"OFF-{date_num}-{seq:03d}"

        order_status = 'selesai' if g['is_lunas'] else 'dikemas'
        notes = "Pembayaran: Lunas (Offline)" if g['is_lunas'] else "Pembayaran: Belum Lunas / Piutang (Offline)"

        cur.execute(
            """INSERT INTO offline_orders (order_no, order_date, customer_name, customer_phone, notes, status, created_by, created_at)
               VALUES (?, ?, ?, NULL, ?, ?, ?, ?)""",
            (order_no, date_str, g['customer'], notes, order_status, admin_id, f"{date_str} 10:00:00")
        )
        order_id = cur.lastrowid
        inserted_orders_count += 1

        for it in g['items']:
            cur.execute(
                """INSERT INTO offline_order_items (offline_order_id, product_id, seller_sku, product_name, qty, price)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (order_id, it['product_id'], it['seller_sku'], it['product_name'], it['qty'], it['price'])
            )
            inserted_items_count += 1
            total_offline_qty += it['qty']
            total_offline_revenue += it['qty'] * it['price']

    conn.commit()
    conn.close()

    print("\n" + "=" * 60)
    print("           RINGKASAN POPULASI DATABASE DARI EXCEL          ")
    print("=" * 60)
    print(f"  Jumlah Kategori Produk  : {len(SHEET_CONFIG)}")
    print(f"  Jumlah Varian Produk    : {len(products_to_insert)} SKU")
    print(f"  Total Stok Fisik Masuk  : {total_qty_all:,} pcs")
    print(f"  Total Pesanan Offline   : {inserted_orders_count} pesanan ({inserted_items_count} item / {total_offline_qty} pcs)")
    print(f"  Total Omset Offline     : Rp {total_offline_revenue:,.0f}")
    print("-" * 60)
    print("  Status Kesehatan Stok Awal:")
    print(f"    - Normal (5 - 200 pcs) : {normal_count} SKU")
    print(f"    - Overstock (> 200 pcs): {overstock_count} SKU")
    print(f"    - Understock (< 5 pcs) : {understock_count} SKU")
    print(f"    - Stockout (0 pcs)     : {stockout_count} SKU")
    print("=" * 60)
    print("[OK] Database SQLite berhasil direset dan diisi lengkap sesuai Excel!\n")

if __name__ == '__main__':
    run()
