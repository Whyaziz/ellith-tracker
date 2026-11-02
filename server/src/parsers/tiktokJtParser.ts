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
  order_id: string; // Strictly string 18-digit
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
  items: ParsedItem[];
}

export interface ParseResult {
  orders: ParsedOrder[];
  totalPages: number;
  totalOrders: number;
}

function parseProductItems(tableText: string, pageFullText?: string): ParsedItem[] {
  const lines = tableText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Extract top summary 'Barang : ...' and 'Qty Total' if available
  const barangMatch = pageFullText?.match(/Barang\s*:\s*([^\n]+)/);
  const topBarang = barangMatch
    ? barangMatch[1].replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
    : null;

  const qtyTotalMatch = pageFullText?.match(/Qty Total:\s*(\d+)/i);
  const qtyTotal = qtyTotalMatch ? parseInt(qtyTotalMatch[1], 10) : 1;

  // Case 1: Single item order where topBarang is reliably provided by TikTok Shop label header
  if (topBarang && qtyTotal === 1) {
    const topTokens = topBarang
      .split(/\s+/)
      .map((t) => t.toLowerCase().replace(/[,.-]/g, ''))
      .filter(Boolean);
    const firstToken = topTokens[0];

    // Find the first line in the table that starts with the SKU's first word
    let splitIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const lineClean = lines[i].toLowerCase().replace(/[,.-]/g, '').trim();
      if (lineClean.startsWith(firstToken)) {
        splitIdx = i;
        break;
      }
    }

    if (splitIdx > 0) {
      const prodName = lines.slice(0, splitIdx).join(' ').replace(/\s+/g, ' ').trim();
      return [
        {
          product_name: prodName || 'Produk TikTok Shop',
          sku: topBarang,
          seller_sku: null,
          qty: 1,
        },
      ];
    } else {
      const lastLine = lines[lines.length - 1];
      const isQty = /^\d+$/.test(lastLine);
      const nameLines = isQty ? lines.slice(0, -1) : lines;
      return [
        {
          product_name: nameLines.join(' ').replace(/\s+/g, ' ').trim() || 'Produk TikTok Shop',
          sku: topBarang,
          seller_sku: null,
          qty: 1,
        },
      ];
    }
  }

  // Case 2: Multi-item orders or fallback table parsing
  const items: ParsedItem[] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern A: line contains text followed by integer quantity at the end (e.g. 'Cream \t1' or 'maroon 1')
    const tabMatch = line.match(/^(.+?)\s+(\d+)$/);
    // Pattern B: line is a standalone integer quantity (e.g. '1' or '2')
    const isSingleQty = /^\d+$/.test(line);

    if (
      tabMatch &&
      !line.startsWith('Jas Hujan') &&
      !line.startsWith('Celana') &&
      !line.startsWith('ELLITH') &&
      isNaN(Number(tabMatch[1]))
    ) {
      const sku = tabMatch[1].replace(/\t/g, ' ').trim();
      const qty = parseInt(tabMatch[2], 10);
      const prodName = currentBlock.join(' ').replace(/\s+/g, ' ').trim();
      items.push({
        product_name: prodName || 'Produk TikTok Shop',
        sku: sku || '-',
        seller_sku: null,
        qty: qty || 1,
      });
      currentBlock = [];
    } else if (isSingleQty && currentBlock.length > 0) {
      const qty = parseInt(line, 10);
      const skuLines: string[] = [];
      const nameLines = [...currentBlock];

      // In TikTok Shop labels, the variant/SKU consists of the last 1-2 short tokens
      if (
        nameLines.length >= 2 &&
        nameLines[nameLines.length - 1].length < 20 &&
        nameLines[nameLines.length - 2].length < 20
      ) {
        const last = nameLines.pop();
        const prev = nameLines.pop();
        if (prev) skuLines.push(prev);
        if (last) skuLines.push(last);
      } else if (nameLines.length >= 1) {
        const last = nameLines.pop();
        if (last) skuLines.push(last);
      }

      items.push({
        product_name: nameLines.join(' ').replace(/\s+/g, ' ').trim() || 'Produk TikTok Shop',
        sku: skuLines.join(' ').trim() || '-',
        seller_sku: null,
        qty: qty || 1,
      });
      currentBlock = [];
    } else {
      currentBlock.push(line);
    }
  }

  return items;
}

export async function parseTikTokJtPdf(input: string | Buffer): Promise<ParseResult> {
  const buffer = typeof input === 'string' ? fs.readFileSync(input) : input;
  const parser = new PDFParse({ data: buffer });
  await parser.load();
  const text = await parser.getText();

  // Group pages by 18-digit Order ID (handles multi-page orders cleanly)
  const ordersMap = new Map<string, Array<{ text: string; num: number }>>();

  for (const page of text.pages) {
    const orderIdMatch =
      page.text.match(/Order ID:\s*(\d{18})/i) ||
      page.text.match(/Order Id\s*:\s*(\d{18})/i) ||
      page.text.match(/\b(\d{18})\b/);

    if (!orderIdMatch) continue;
    const orderId = orderIdMatch[1];
    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, []);
    }
    ordersMap.get(orderId)!.push(page);
  }

  const orders: ParsedOrder[] = [];

  for (const [orderId, pages] of ordersMap.entries()) {
    // Find the main shipping label page (has resi barcode)
    const labelPage =
      pages.find((p) => p.text.match(/\b(JY\d{10,12})\b/)) || pages[0];
    const pageText = labelPage.text;

    // Resi (J&T usually begins with JY + 10 digits)
    const resiMatch = pageText.match(/\b(JY\d{10,12})\b/);
    const resi = resiMatch ? resiMatch[1] : `TEMP-${orderId}`;

    // Service (NDD, EZ, ECO)
    const serviceMatch = pageText.match(/\b(NDD|EZ|ECO)\b/);
    const service = serviceMatch ? serviceMatch[1] : 'EZ';

    // COD detection
    const isCod = /\bCOD\b/.test(pageText);

    // Weight in KG
    const weightMatch = pageText.match(/(\d+(?:\.\d+)?)\s*KG/i);
    const weightKg = weightMatch ? parseFloat(weightMatch[1]) : 0;

    // Ship date
    const dateMatch = pageText.match(/\b(\d{2}-\d{2}-\d{4})\b/);
    const shipDate = dateMatch ? dateMatch[1] : null;

    // Sorting code (e.g. 470-2KLP03-24C)
    const sortingMatch = pageText.match(/\b\d{3}-[A-Z0-9]+-[A-Z0-9]+\b/);
    const sortingCode = sortingMatch ? sortingMatch[0] : null;

    // Recipient name, phone, address
    const lines = pageText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    let recipientName = 'Penerima';
    let recipientPhone: string | null = null;
    let recipientAddress = '';

    const phoneMatches = pageText.match(/\(\+62\)[0-9*]+/g) || [];
    if (phoneMatches.length >= 2) {
      recipientPhone = phoneMatches[1];
    } else if (phoneMatches.length === 1) {
      recipientPhone = phoneMatches[0];
    }

    const senderPhoneIdx = lines.findIndex(
      (l) => l.includes('(+62)81215564477') || (l.includes('(+62)') && l.includes('812'))
    );

    if (senderPhoneIdx !== -1 && senderPhoneIdx + 1 < lines.length) {
      recipientName = lines[senderPhoneIdx + 1]
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const recPhoneIdx = recipientPhone
        ? lines.findIndex((l, idx) => idx > senderPhoneIdx && l.includes(recipientPhone!))
        : -1;

      if (recPhoneIdx !== -1) {
        const streetLines = lines.slice(senderPhoneIdx + 2, recPhoneIdx);
        const resiLastIdx = lines.findLastIndex((l) => l.includes(resi));
        let cityLine = '';
        if (resiLastIdx !== -1 && resiLastIdx + 1 < lines.length) {
          cityLine = lines[resiLastIdx + 1];
        }
        recipientAddress = [...streetLines, cityLine]
          .filter(Boolean)
          .join(', ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    if (!recipientAddress) {
      recipientAddress = 'Alamat pada label pengiriman';
    }

    // Extract product items across all pages of this order
    const items: ParsedItem[] = [];
    for (const p of pages) {
      const prodHeaderIdx = p.text.indexOf('Product Name');
      if (prodHeaderIdx !== -1) {
        let prodContent = p.text.substring(
          prodHeaderIdx + 'Product Name \tSKU \tSeller SKU \tQty'.length
        );
        const endIdx = prodContent.search(/(?:Qty Total:|Order ID:)/i);
        if (endIdx !== -1) {
          prodContent = prodContent.substring(0, endIdx);
        }
        const extracted = parseProductItems(prodContent, p.text);
        items.push(...extracted);
      }
    }

    orders.push({
      order_id: orderId,
      resi,
      courier: 'J&T Express',
      service,
      is_cod: isCod,
      weight_kg: weightKg,
      ship_date: shipDate,
      sorting_code: sortingCode,
      recipient_name: recipientName,
      recipient_phone: recipientPhone,
      recipient_address: recipientAddress,
      items,
    });
  }

  return {
    orders,
    totalPages: text.total,
    totalOrders: orders.length,
  };
}
