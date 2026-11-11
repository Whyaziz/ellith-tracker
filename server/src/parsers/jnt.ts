import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

export interface ParsedItem {
  product_name: string;
  sku: string;
  seller_sku: string | null;
  qty: number;
}

export interface ParsedOrder {
  order_id: string; // Strictly 18-digit string
  resi: string;
  courier: string;
  service: string;
  is_cod: boolean;
  weight_kg: number;
  ship_date: string | null;
  sorting_code: string | null;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_address: string;
  qty_total: number | null;
  needs_review: boolean;
  validation_notes: string | null;
  items: ParsedItem[];
}

export interface ParseResult {
  orders: ParsedOrder[];
  totalPages: number;
  totalOrders: number;
  hasNeedsReview: boolean;
}

/**
 * 2. Alamat: gabungkan baris yang terpotong dengan SPASI, bukan koma.
 * Hapus koma ganda dan koma tepat setelah titik (mis. "Jl.," jadi "Jl.").
 * Hapus koma/spasi di akhir alamat (label J&T memang mengakhiri alamat dengan " ,").
 * Pastikan tidak ada ",," atau " ," dalam alamat mana pun.
 */
export function cleanAddress(raw: string): string {
  if (!raw) return '';
  let addr = raw;

  // Hapus spasi sebelum koma (mis. '50229 ,sebrang' -> '50229, sebrang')
  addr = addr.replace(/\s+,/g, ',');

  // Hapus koma tepat setelah titik (mis. 'Jl.,' -> 'Jl.', 'Perum.,' -> 'Perum.')
  addr = addr.replace(/\.\s*,+/g, '.');

  // Hapus koma ganda (mis. ',,' atau ', ,' -> ', ')
  addr = addr.replace(/,\s*,+/g, ',');

  // Pastikan ada spasi setelah koma jika diikuti karakter
  addr = addr.replace(/,([^\s])/g, ', $1');

  // Hapus koma/spasi di akhir alamat (label J&T sering berakhiran ' ,')
  addr = addr.replace(/[\s,]+$/, '');

  // Normalisasi spasi berlebih
  addr = addr.replace(/\s+/g, ' ').trim();

  // Pengulangan pembersihan akhir untuk menjamin tidak ada residu ',,' atau ' ,'
  addr = addr.replace(/,{2,}/g, ', ');
  addr = addr.replace(/\s+,/g, ', ');
  addr = addr.replace(/\.\s*,/g, '.');
  addr = addr.replace(/[\s,]+$/, '').trim();

  return addr;
}

/**
 * 3. Nama produk: bila baris berakhir dengan huruf lalu tanda hubung "-" TANPA spasi
 * sebelum tanda hubung (mis. "NON-"), gabungkan dengan baris berikutnya TANPA spasi ("NON-JAHITAN").
 * Tanda hubung dengan spasi di sekelilingnya (" - ") tidak berubah.
 */
export function joinProductNameLines(lines: string[]): string {
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!result) {
      result = line;
    } else {
      // Periksa apakah baris sebelumnya berakhiran huruf/angka lalu '-' tanpa spasi sebelum '-'
      if (/[a-zA-Z0-9]-$/.test(result)) {
        result += line;
      } else {
        result += ' ' + line;
      }
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * 1. Item produk: pisahkan item berdasarkan BARIS TABEL, bukan berdasarkan nama produk.
 * Satu item = satu kelompok baris yang diawali nilai di kolom Qty, atau jarak Y yang jelas dari baris item sebelumnya.
 * Dua item boleh punya nama produk identik dan hanya berbeda di SKU; jangan digabung atau di-dedupe.
 * Kolom SKU dan Qty diambil dari kolom (koordinat X), bukan dari teks tabel yang digabung.
 */
async function extractItemsByCoordinates(page: any): Promise<ParsedItem[]> {
  const textContent = await page.getTextContent();
  const rawItems = textContent.items.filter((it: any) => it.str && it.str.trim());

  // Temukan header tabel 'Product Name'
  const headerIt = rawItems.find(
    (it: any) => it.str === 'Product Name' || it.str === 'Product'
  );
  if (!headerIt) return [];
  const headerY = headerIt.transform[5];

  // Temukan header 'Seller SKU' jika ada (untuk mendeteksi batas kolom Seller SKU)
  const sellerSkuHeaderIt = rawItems.find(
    (it: any) => it.str.includes('Seller SKU') && Math.abs(it.transform[5] - headerY) < 5
  );
  const sellerSkuBoundaryX = sellerSkuHeaderIt ? sellerSkuHeaderIt.transform[4] - 4 : 250;

  // Temukan footer: 'Qty Total:' atau 'Order ID:'
  const footerIt = rawItems.find(
    (it: any) =>
      (it.str.includes('Qty Total') ||
        it.str.includes('Order ID:') ||
        it.str === 'tokopedia') &&
      it.transform[5] < headerY
  );
  const footerY = footerIt ? footerIt.transform[5] : 15;

  // Filter teks yang berada di dalam area tabel (di bawah header dan di atas footer)
  const tableItems = rawItems.filter(
    (it: any) => it.transform[5] < headerY - 4 && it.transform[5] > footerY
  );
  if (tableItems.length === 0) return [];

  // Urutkan berdasarkan koordinat Y dari atas ke bawah, lalu X dari kiri ke kanan
  tableItems.sort(
    (a: any, b: any) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
  );

  // Kelompokkan item teks ke dalam baris visual yang sama (toleransi vertikal Y <= 2.5)
  const lines: Array<{ y: number; items: any[] }> = [];
  let currentLine: any[] = [];
  let currentY: number | null = null;

  for (const it of tableItems) {
    const itY = it.transform[5];
    if (currentY === null || Math.abs(itY - currentY) > 2.5) {
      if (currentLine.length > 0) lines.push({ y: currentY!, items: currentLine });
      currentLine = [it];
      currentY = itY;
    } else {
      currentLine.push(it);
    }
  }
  if (currentLine.length > 0) lines.push({ y: currentY!, items: currentLine });

  // Batas Kolom berdasarkan koordinat horizontal X:
  // Kolom Product Name : X < 125
  // Kolom SKU          : 125 <= X < sellerSkuBoundaryX
  // Kolom Seller SKU   : sellerSkuBoundaryX <= X < 250
  // Kolom Qty          : X >= 250
  const parsedItems: ParsedItem[] = [];
  let currentItem: {
    prodLines: string[];
    skuLines: string[];
    sellerSkuLines: string[];
    qty: number;
    startY: number;
  } | null = null;

  for (const line of lines) {
    const prodTokens: string[] = [];
    const skuTokens: string[] = [];
    const sellerSkuTokens: string[] = [];
    let qtyVal: number | null = null;

    for (const it of line.items) {
      const x = it.transform[4];
      const str = it.str.trim();
      if (!str) continue;

      if (x < 125) {
        prodTokens.push(str);
      } else if (x < sellerSkuBoundaryX) {
        skuTokens.push(str);
      } else if (x < 250) {
        sellerSkuTokens.push(str);
      } else {
        // Kolom Qty
        if (/^\d+$/.test(str)) {
          qtyVal = parseInt(str, 10);
        }
      }
    }

    // Penentuan awal item baru:
    // Terjadi jika baris memuat nilai Qty baru, atau belum ada item sama sekali
    if (qtyVal !== null || currentItem === null) {
      if (currentItem) {
        const skuStr = currentItem.skuLines.join(' ').replace(/\s+/g, ' ').trim() || '-';
        const sellerSkuStr = currentItem.sellerSkuLines.join(' ').replace(/\s+/g, ' ').trim() || null;
        parsedItems.push({
          product_name: joinProductNameLines(currentItem.prodLines) || 'Produk TikTok Shop',
          sku: skuStr,
          seller_sku: sellerSkuStr,
          qty: currentItem.qty || 1,
        });
      }
      currentItem = {
        prodLines: prodTokens.length > 0 ? [prodTokens.join(' ')] : [],
        skuLines: skuTokens.length > 0 ? [skuTokens.join(' ')] : [],
        sellerSkuLines: sellerSkuTokens.length > 0 ? [sellerSkuTokens.join(' ')] : [],
        qty: qtyVal || 1,
        startY: line.y,
      };
    } else {
      // Kelanjutan baris dari item yang sama (wrap teks)
      if (prodTokens.length > 0) currentItem.prodLines.push(prodTokens.join(' '));
      if (skuTokens.length > 0) currentItem.skuLines.push(skuTokens.join(' '));
      if (sellerSkuTokens.length > 0) currentItem.sellerSkuLines.push(sellerSkuTokens.join(' '));
    }
  }

  if (currentItem && (currentItem.prodLines.length > 0 || currentItem.skuLines.length > 0 || currentItem.sellerSkuLines.length > 0)) {
    const skuStr = currentItem.skuLines.join(' ').replace(/\s+/g, ' ').trim() || '-';
    const sellerSkuStr = currentItem.sellerSkuLines.join(' ').replace(/\s+/g, ' ').trim() || null;
    parsedItems.push({
      product_name: joinProductNameLines(currentItem.prodLines) || 'Produk TikTok Shop',
      sku: skuStr,
      seller_sku: sellerSkuStr,
      qty: currentItem.qty || 1,
    });
  }

  return parsedItems;
}

export async function parseJtPdf(input: string | Buffer): Promise<ParseResult> {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input;
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const text = await parser.getText();

  // Kelompokkan nomor halaman berdasarkan Order ID 18-digit
  const ordersMap = new Map<
    string,
    Array<{ pageNum: number; text: string }>
  >();

  for (let i = 0; i < text.pages.length; i++) {
    const page = text.pages[i];
    const orderIdMatch =
      page.text.match(/Order ID:\s*(\d{18})/i) ||
      page.text.match(/Order Id\s*:\s*(\d{18})/i) ||
      page.text.match(/\b(\d{18})\b/);

    if (!orderIdMatch) continue;
    const orderId = orderIdMatch[1];
    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, []);
    }
    ordersMap.get(orderId)!.push({ pageNum: i + 1, text: page.text });
  }

  const orders: ParsedOrder[] = [];
  let hasNeedsReview = false;

  for (const [orderId, pageObjs] of ordersMap.entries()) {
    // Cari halaman label pengiriman utama (yang memuat barcode/nomor resi J&T Express atau Cargo)
    const labelPageObj =
      pageObjs.find((po) => po.text.match(/\b(JY\d{10,12}|JTC\d{9,12}|\d{12})\b/)) || pageObjs[0];
    const pageText = labelPageObj.text;

    // Resi J&T Express (JY + 10-12 digit atau JTC...) atau J&T Cargo (12 digit numeric)
    const standardResiMatch = pageText.match(/\b(JY\d{10,12}|JTC\d{9,12})\b/);
    const cargoResiMatch = pageText.match(/\b(\d{12})\b/);

    let resi = `TEMP-${orderId}`;
    let isCargo = false;
    if (standardResiMatch) {
      resi = standardResiMatch[1];
    } else if (cargoResiMatch) {
      resi = cargoResiMatch[1];
      isCargo = true;
    }

    if (!isCargo && /\b(Standard|Cargo)\b/i.test(pageText) && !/\b(EZ|NDD|ECO)\b/.test(pageText)) {
      isCargo = true;
    }

    // Courier
    const courier = isCargo ? 'J&T Cargo' : 'J&T Express';

    // Service (NDD, EZ, ECO, Standard, Cargo)
    const serviceMatch = pageText.match(/\b(NDD|EZ|ECO|Standard|Cargo)\b/i);
    let service = isCargo ? 'Standard' : 'EZ';
    if (serviceMatch) {
      service = serviceMatch[1];
    }

    // Deteksi COD
    let isCod = false;
    if (isCargo) {
      isCod = /\bCOD\s*:\s*(?:Rp\s*)?[1-9]/i.test(pageText);
    } else {
      isCod = /\bCOD\b/.test(pageText);
    }

    // Berat dalam KG
    const weightMatch = pageText.match(/(\d+(?:\.\d+)?)\s*KG/i);
    const weightKg = weightMatch ? parseFloat(weightMatch[1]) : 0;

    // Tanggal kirim
    let shipDate: string | null = null;
    const dmyMatch = pageText.match(/\b(\d{2}-\d{2}-\d{4})\b/);
    const slashMatch = pageText.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    const ymdMatch = pageText.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

    if (dmyMatch) {
      shipDate = dmyMatch[1];
    } else if (slashMatch) {
      shipDate = `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
    } else if (ymdMatch) {
      shipDate = `${ymdMatch[3]}-${ymdMatch[2]}-${ymdMatch[1]}`;
    }

    // Kode sortir (cth: 470-2KLP03-24C atau BJA-BJA002A-XX)
    const sortingMatch = pageText.match(/\b([A-Z0-9]{3}-[A-Z0-9]+-[A-Z0-9]+)\b/);
    const sortingCode = sortingMatch ? sortingMatch[1] : null;

    // Ekstraksi Penerima & Alamat
    const lines = pageText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let recipientName = 'Penerima';
    let recipientPhone: string | null = null;

    const phoneMatches = pageText.match(/\(\+62\)[0-9*]+/g) || [];
    // Abaikan nomor telepon pengirim toko Ellith (81215564477)
    const nonSenderPhones = phoneMatches.filter((p) => !p.includes('81215564477'));
    if (nonSenderPhones.length > 0) {
      recipientPhone = nonSenderPhones[0];
    } else if (phoneMatches.length > 1) {
      recipientPhone = phoneMatches[1];
    } else if (phoneMatches.length === 1) {
      recipientPhone = phoneMatches[0];
    }

    let recipientAddress = 'Alamat pada label pengiriman';

    if (isCargo) {
      // CARGO:
      const penerimaIdx = lines.findIndex((l) => /^Penerima\b/i.test(l));
      if (penerimaIdx !== -1) {
        if (
          penerimaIdx > 0 &&
          !lines[penerimaIdx - 1].includes('(+62)') &&
          !/^(Standard|\d+)$/i.test(lines[penerimaIdx - 1])
        ) {
          recipientName = lines[penerimaIdx - 1].replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
        } else if (
          penerimaIdx + 1 < lines.length &&
          !lines[penerimaIdx + 1].includes('Ellith') &&
          !lines[penerimaIdx + 1].includes('Daerah Istimewa')
        ) {
          recipientName = lines[penerimaIdx + 1].replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }

      // Alamat Cargo di antara Print Time / Weight dan TT Order ID
      let streetLines: string[] = [];
      const printTimeIdx = lines.findLastIndex((l) => /Print Time|Weight/i.test(l));
      const ttOrderIdx = lines.findIndex((l) => /TT Order ID|Order ID/i.test(l));
      if (printTimeIdx !== -1 && ttOrderIdx !== -1 && ttOrderIdx > printTimeIdx) {
        streetLines = lines.slice(printTimeIdx + 1, ttOrderIdx).filter((l) => !/Print Time|Weight/i.test(l));
      }
      let rawAddr = '';
      for (const line of streetLines) {
        const l = line.trim();
        if (!l) continue;
        if (!rawAddr) {
          rawAddr = l;
        } else if (/[a-zA-Z]$/.test(rawAddr) && /^[a-z],/.test(l)) {
          rawAddr += l;
        } else {
          rawAddr += ' ' + l;
        }
      }
      recipientAddress = cleanAddress(rawAddr) || 'Alamat pada label pengiriman';
    } else {
      // STANDARD J&T:
      const senderPhoneIdx = lines.findIndex(
        (l) => l.includes('(+62)81215564477') || (l.includes('(+62)') && l.includes('812'))
      );

      let streetLines: string[] = [];
      if (senderPhoneIdx !== -1 && senderPhoneIdx + 1 < lines.length) {
        recipientName = lines[senderPhoneIdx + 1]
          .replace(/\t/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const recPhoneIdx = recipientPhone
          ? lines.findIndex((l, idx) => idx > senderPhoneIdx && l.includes(recipientPhone!))
          : -1;

        if (recPhoneIdx !== -1) {
          streetLines = lines.slice(senderPhoneIdx + 2, recPhoneIdx);
        }
      }

      // Kota tujuan di bawah deretan nomor resi
      const resiLastIdx = lines.findLastIndex((l) => l.includes(resi));
      let cityLine = '';
      if (resiLastIdx !== -1 && resiLastIdx + 1 < lines.length) {
        cityLine = lines[resiLastIdx + 1];
      }

      // Gabungkan baris alamat dengan SPASI (bukan koma!)
      const streetCombined = streetLines.join(' ');
      const fullRawAddress = cityLine ? `${streetCombined}, ${cityLine}` : streetCombined;
      recipientAddress = cleanAddress(fullRawAddress) || 'Alamat pada label pengiriman';
    }

    // Ekstraksi item produk menggunakan koordinat X & baris tabel
    const items: ParsedItem[] = [];
    let expectedTotalQty: number | null = null;

    for (const po of pageObjs) {
      const pageDoc = await parser.doc.getPage(po.pageNum);
      const pageItems = await extractItemsByCoordinates(pageDoc);
      items.push(...pageItems);

      // Cari 'Qty Total:' di halaman
      const qtyTotalM = po.text.match(/Qty Total:\s*(\d+)/i);
      if (qtyTotalM) {
        expectedTotalQty = parseInt(qtyTotalM[1], 10);
      }
      if (expectedTotalQty === null) {
        const jmlM = po.text.match(/Jumlah\s*:\s*(\d+)pcs/i);
        if (jmlM) expectedTotalQty = parseInt(jmlM[1], 10);
      }
    }

    // 4. Validasi: jumlah Qty semua item harus sama dengan "Qty Total"
    const totalItemsQty = items.reduce((sum, it) => sum + (it.qty || 0), 0);
    let needsReview = false;
    let validationNotes: string | null = null;

    if (expectedTotalQty !== null && totalItemsQty !== expectedTotalQty) {
      needsReview = true;
      hasNeedsReview = true;
      validationNotes = `Jumlah Qty item (${totalItemsQty}) tidak sesuai dengan Qty Total (${expectedTotalQty})`;
    }

    orders.push({
      order_id: orderId,
      resi,
      courier,
      service,
      is_cod: isCod,
      weight_kg: weightKg,
      ship_date: shipDate,
      sorting_code: sortingCode,
      recipient_name: recipientName,
      recipient_phone: recipientPhone,
      recipient_address: recipientAddress,
      qty_total: expectedTotalQty,
      needs_review: needsReview,
      validation_notes: validationNotes,
      items,
    });
  }

  return {
    orders,
    totalPages: text.total,
    totalOrders: orders.length,
    hasNeedsReview,
  };
}

// Alias export untuk kompatibilitas
export const parseTikTokJtPdf = parseJtPdf;
