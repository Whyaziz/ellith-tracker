import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseJtPdf, cleanAddress, joinProductNameLines } from '../server/src/parsers/jnt.js';

describe('J&T Parser (server/src/parsers/jnt.ts)', () => {
  it('correctly parses docs/15.51.pdf into 4 unique orders handling multipage orders', async () => {
    const pdfPath = path.resolve(__dirname, '../docs/15.51.pdf');
    const result = await parseJtPdf(pdfPath);

    expect(result.totalOrders).toBe(4);
    expect(result.totalPages).toBe(5);

    // Verify Order 1 (2 pages combined: Page 1 + Page 2)
    const order1 = result.orders.find((o) => o.resi === 'JY2115316542');
    expect(order1).toBeDefined();
    expect(order1?.order_id).toBe('586887193517983496');
    expect(order1?.service).toBe('NDD');
    expect(order1?.is_cod).toBe(true);
    expect(order1?.sorting_code).toBe('470-2KLP03-24C');
    expect(order1?.recipient_name).toBe('n** i**n');
    expect(order1?.items.length).toBe(1);
    expect(order1?.items[0].sku).toBe('Cream');
    expect(order1?.items[0].qty).toBe(1);

    // Verify Order 3 (Multi-item order: Hijau Army + maroon)
    const order3 = result.orders.find((o) => o.resi === 'JY2185537122');
    expect(order3).toBeDefined();
    expect(order3?.order_id).toBe('586887223079241367');
    expect(order3?.service).toBe('EZ');
    expect(order3?.is_cod).toBe(false);
    expect(order3?.sorting_code).toBe('500-4GSK13A-01C');
    expect(order3?.recipient_name).toBe('I**A A**I');
    expect(order3?.items.length).toBe(2);
    expect(order3?.items[0].sku).toBe('Hijau Army');
    expect(order3?.items[0].qty).toBe(1);
    expect(order3?.items[1].sku).toBe('maroon');
    expect(order3?.items[1].qty).toBe(1);
  });

  it('satisfies all acceptance criteria on the latest sample PDF (docs/9.07.pdf)', async () => {
    const pdfPath = path.resolve(__dirname, '../docs/9.07.pdf');
    const result = await parseJtPdf(pdfPath);

    // 1. JY2139281732 menghasilkan 2 item: (Mint, qty 1) dan (Rose Pink, qty 1), total qty 2,
    // dan nama produk tidak mengandung "Mint" atau angka qty.
    const order1 = result.orders.find((o) => o.resi === 'JY2139281732');
    expect(order1).toBeDefined();
    expect(order1?.items.length).toBe(2);

    expect(order1?.items[0].sku).toBe('Mint');
    expect(order1?.items[0].qty).toBe(1);
    expect(order1?.items[0].product_name).not.toContain('Mint');
    expect(order1?.items[0].product_name).not.toMatch(/\b1\b/);

    expect(order1?.items[1].sku).toBe('Rose Pink');
    expect(order1?.items[1].qty).toBe(1);
    expect(order1?.items[1].product_name).not.toContain('Rose Pink');
    expect(order1?.items[1].product_name).not.toMatch(/\b1\b/);

    const totalQty = order1!.items.reduce((sum, it) => sum + it.qty, 0);
    expect(totalQty).toBe(2);
    expect(order1?.qty_total).toBe(2);
    expect(order1?.needs_review).toBe(false);

    // 3. Nama produk JY2139281732 mengandung "NON-JAHITAN"
    expect(order1?.items[0].product_name).toContain('NON-JAHITAN');
    expect(order1?.items[1].product_name).toContain('NON-JAHITAN');

    // 2. Alamat JY2170211742 mengandung "Kec. Bekasi Utara" dan "Jl. Perum."
    const order2 = result.orders.find((o) => o.resi === 'JY2170211742');
    expect(order2).toBeDefined();
    expect(order2?.recipient_address).toContain('Kec. Bekasi Utara');
    expect(order2?.recipient_address).toContain('Jl. Perum.');

    // 2. Alamat JY2191271742 mengandung "(Queen jus)" dan tidak ada ",,"
    const order3 = result.orders.find((o) => o.resi === 'JY2191271742');
    expect(order3).toBeDefined();
    expect(order3?.recipient_address).toContain('(Queen jus)');
    expect(order3?.recipient_address).not.toContain(',,');

    // 2 & 5. Tidak ada ",," atau " ," dalam alamat mana pun
    for (const order of result.orders) {
      expect(order.recipient_address).not.toContain(',,');
      expect(order.recipient_address).not.toContain(' ,');
      expect(order.recipient_address).not.toMatch(/\.\s*,/);
      expect(order.recipient_address).not.toMatch(/[\s,]+$/);
    }
  });

  it('validates joinProductNameLines hyphen rules', () => {
    // Ends with letter followed by '-' without space before it -> joins without space
    expect(joinProductNameLines(['REMBES - TEKNOLOGI NON-', 'JAHITAN DENGAN RESLETING'])).toBe(
      'REMBES - TEKNOLOGI NON-JAHITAN DENGAN RESLETING'
    );
    // Hyphen with space before it -> joins with space
    expect(joinProductNameLines(['Jas Hujan Ellith -', 'Setelan Celana'])).toBe(
      'Jas Hujan Ellith - Setelan Celana'
    );
  });

  it('validates cleanAddress formatting rules', () => {
    expect(cleanAddress('Jl., Perum., Bekasi ,, Jawa Barat ,')).toBe('Jl. Perum. Bekasi, Jawa Barat');
    expect(cleanAddress('50229 ,sebrang masjid ,,')).toBe('50229, sebrang masjid');
  });
});
