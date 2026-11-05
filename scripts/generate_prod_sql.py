import openpyxl
from datetime import datetime, timedelta
import re

EXCEL_PATH = r'e:\Coding\ERP-Sukma\tracking\docs\Inventaris Stok ELLITH (4).xlsx'
SQL_OUT_PATH = r'e:\Coding\ERP-Sukma\tracking\scripts\prod_import.sql'

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

def slugify_color(color_name: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9]+', '-', color_name.strip()).strip('-')
    return cleaned.upper()

def run():
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    sql_lines = []
    sql_lines.append("-- MIGRATION & IMPORT SQL UNTUK SERVER PRODUKSI")
    sql_lines.append("-- AMAN: TIDAK MENGHAPUS orders, batches, scan_logs, users")
    sql_lines.append("BEGIN TRANSACTION;\n")

    # 1. Categories
    sql_lines.append("-- 1. Kategori Produk")
    categories_to_ensure = [cfg['category'] for cfg in SHEET_CONFIG]
    for cat in categories_to_ensure:
        cat_escaped = cat.replace("'", "''")
        sql_lines.append(f"INSERT OR IGNORE INTO product_categories (name, created_at) VALUES ('{cat_escaped}', CURRENT_TIMESTAMP);")
    sql_lines.append("")

    # 2. Extract Products & Stock Items
    products_to_insert = []
    total_qty_all = 0

    for cfg in SHEET_CONFIG:
        sheet_name = cfg['sheet']
        cat_name = cfg['category']
        prefix = cfg['prefix']
        name_fmt = cfg['name_format']

        ws = wb[sheet_name]
        for r in range(4, ws.max_row + 1):
            color_val = ws.cell(r, 1).value
            qty_val = ws.cell(r, 2).value

            if color_val is None:
                continue

            color_str = str(color_val).strip()
            if color_str.lower() == 'total':
                continue

            qty = int(qty_val) if qty_val is not None else 0
            total_qty_all += qty

            color_slug = slugify_color(color_str)
            seller_sku = f"{prefix}{color_slug}"
            product_name = name_fmt.format(color=color_str)

            products_to_insert.append({
                'seller_sku': seller_sku,
                'name': product_name,
                'category_name': cat_name,
                'min_stock': 5,
                'max_stock': 200,
                'qty': qty,
            })

    # Offline Product Mappings for variants that might not exist in base sheets
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

    known_skus = {p['seller_sku'] for p in products_to_insert}
    for key, (sku, name, cat_name) in PRODUCT_OFFLINE_MAPPINGS.items():
        if sku not in known_skus:
            products_to_insert.append({
                'seller_sku': sku,
                'name': name,
                'category_name': cat_name,
                'min_stock': 5,
                'max_stock': 200,
                'qty': 0,
            })
            known_skus.add(sku)

    # 3. Insert Products
    sql_lines.append("-- 2. Master Produk (57 SKU)")
    for p in products_to_insert:
        s_sku = p['seller_sku'].replace("'", "''")
        p_name = p['name'].replace("'", "''")
        c_name = p['category_name'].replace("'", "''")
        min_s = p['min_stock']
        max_s = p['max_stock']
        sql_lines.append(
            f"INSERT INTO products (seller_sku, name, category_id, min_stock, max_stock, created_at) "
            f"VALUES ('{s_sku}', '{p_name}', (SELECT id FROM product_categories WHERE name = '{c_name}' LIMIT 1), {min_s}, {max_s}, CURRENT_TIMESTAMP) "
            f"ON CONFLICT(seller_sku) DO UPDATE SET name = excluded.name, category_id = excluded.category_id;"
        )
    sql_lines.append("")

    # 4. Initial Stock Batch
    sql_lines.append("-- 3. Batch Stok Awal Gudang")
    sql_lines.append(
        "INSERT INTO stock_batches (batch_code, notes, created_by, created_at) "
        "VALUES ('BATCH-EXCEL-AWAL', 'Stok Awal Fisik Gudang dari Excel Inventaris Stok ELLITH', 1, CURRENT_TIMESTAMP) "
        "ON CONFLICT(batch_code) DO NOTHING;"
    )
    sql_lines.append("")

    sql_lines.append("-- 4. Item Batch Stok Awal")
    for p in products_to_insert:
        s_sku = p['seller_sku'].replace("'", "''")
        qty = p['qty']
        sql_lines.append(
            f"INSERT INTO stock_batch_items (stock_batch_id, product_id, seller_sku, qty) "
            f"SELECT b.id, p.id, '{s_sku}', {qty} "
            f"FROM stock_batches b, products p "
            f"WHERE b.batch_code = 'BATCH-EXCEL-AWAL' AND p.seller_sku = '{s_sku}';"
        )
    sql_lines.append("")

    # 5. Offline Orders from sheet
    sql_lines.append("-- 5. Pesanan Offline")
    ws_off = wb['Offline']
    excel_base = datetime(1899, 12, 30)

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

        current_off_group['items'].append({
            'seller_sku': target_sku,
            'product_name': target_name,
            'qty': qty,
            'price': harga_act if harga_act > 0 else harga,
        })

    date_counters = {}
    for g in offline_groups:
        date_str = g['date']
        date_num = date_str.replace('-', '')
        date_counters[date_num] = date_counters.get(date_num, 0) + 1
        seq = date_counters[date_num]
        order_no = f"OFF-{date_num}-{seq:03d}"

        order_status = 'selesai' if g['is_lunas'] else 'dikemas'
        notes = "Pembayaran: Lunas (Offline)" if g['is_lunas'] else "Pembayaran: Belum Lunas / Piutang (Offline)"
        cust_escaped = g['customer'].replace("'", "''")
        notes_escaped = notes.replace("'", "''")

        sql_lines.append(
            f"INSERT INTO offline_orders (order_no, order_date, customer_name, customer_phone, notes, status, created_by, created_at) "
            f"VALUES ('{order_no}', '{date_str}', '{cust_escaped}', NULL, '{notes_escaped}', '{order_status}', 1, '{date_str} 10:00:00') "
            f"ON CONFLICT(order_no) DO NOTHING;"
        )

        for it in g['items']:
            s_sku = it['seller_sku'].replace("'", "''")
            p_name = it['product_name'].replace("'", "''")
            qty = it['qty']
            price = it['price']
            sql_lines.append(
                f"INSERT INTO offline_order_items (offline_order_id, product_id, seller_sku, product_name, qty, price) "
                f"SELECT o.id, p.id, '{s_sku}', '{p_name}', {qty}, {price} "
                f"FROM offline_orders o LEFT JOIN products p ON p.seller_sku = '{s_sku}' "
                f"WHERE o.order_no = '{order_no}';"
            )

    sql_lines.append("")
    # 6. Linking 11 legacy online orders to their seller_sku
    sql_lines.append("-- 6. Auto-Link 11 Online Orders to Master SKU")
    sku_links = [
        ('Hijau PNC-ATS-Army Army', 'PNC-TOP-ARMY'),
        ('Navy CLN-Navy', 'CLN-NAVY'),
        ('Maroon CLN-Maroon', 'CLN-MAROON'),
        ('Hitam PNC-ATS-Hitam', 'PNC-TOP-HITAM'),
        ('Maroon PNC-ATS-Maroon', 'PNC-TOP-MAROON'),
        ('Hijau CLN-Army Army', 'CLN-ARMY'),
        ('NAVY JK-Navy', 'JKT-SET-NAVY'),
        ('Hitam CLN-Hitam', 'CLN-HITAM'),
    ]
    for old_sku, new_seller_sku in sku_links:
        sql_lines.append(f"UPDATE order_items SET seller_sku = '{new_seller_sku}' WHERE sku = '{old_sku}' AND (seller_sku IS NULL OR seller_sku = '');")

    sql_lines.append("\nCOMMIT;")

    with open(SQL_OUT_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_lines) + '\n')

    print(f"[OK] Generated {len(sql_lines)} lines of SQL at {SQL_OUT_PATH}")

if __name__ == '__main__':
    run()
