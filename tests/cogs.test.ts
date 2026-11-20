import { db } from '../server/src/db/client.js';
import { products, product_cogs } from '../server/src/db/schema.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  computeCogsMetrics,
  getCogsOverview,
  getBatchCogsHistory,
  getProfitPerformance,
  getFifoCostForSku,
  getMovingAverageCostForSku,
} from '../server/src/services/cogsService.js';

describe('COGS & Profit Calculation Service', () => {
  beforeAll(() => {
    const product = db.insert(products).values({ seller_sku: 'CLN-SAGE', name: 'Celana uji' }).returning().get();
    db.insert(product_cogs).values({ product_id: product.id, bahan_utama: 10000 }).run();
  });

  it('correctly calculates metrics for PC1 (Atasan Ponco K1) matching client Excel', () => {
    const metrics = computeCogsMetrics({
      bahan_utama: 21500,
      aksesori: 4454,
      kemasan: 2734,
      tenaga_kerja: 3600,
      overhead: 3520,
      target_price: 54900,
      tiktok_fee_percent: 25,
      target_margin_percent: 40,
    });

    expect(metrics.bb_langsung).toBe(28688);
    expect(metrics.total_biaya).toBe(35808);
    expect(metrics.gross_margin_percent).toBeCloseTo(34.78, 1);
    expect(metrics.tiktok_fee_nominal).toBe(13725);
    expect(metrics.tiktok_payout).toBe(41175);
    expect(metrics.net_profit).toBe(5367);
    expect(metrics.if_target_margin_price).toBe(59680);
  });

  it('correctly calculates metrics for CLN (Celana) matching client Excel', () => {
    const metrics = computeCogsMetrics({
      bahan_utama: 7370,
      aksesori: 0,
      kemasan: 0,
      tenaga_kerja: 3450,
      overhead: 3520,
      target_price: 27000,
      tiktok_fee_percent: 25,
      target_margin_percent: 40,
    });

    expect(metrics.bb_langsung).toBe(7370);
    expect(metrics.total_biaya).toBe(14340);
    expect(metrics.gross_margin_percent).toBeCloseTo(46.89, 1);
    expect(metrics.tiktok_fee_nominal).toBe(6750);
    expect(metrics.tiktok_payout).toBe(20250);
    expect(metrics.net_profit).toBe(5910);
    expect(metrics.if_target_margin_price).toBe(23900);
  });

  it('correctly handles editable TikTok fee (e.g. 30% on PC2-C / JKT)', () => {
    const metrics = computeCogsMetrics({
      bahan_utama: 15600,
      aksesori: 4446,
      kemasan: 2734,
      tenaga_kerja: 3600,
      overhead: 3520,
      target_price: 49900,
      tiktok_fee_percent: 30,
      target_margin_percent: 40,
    });

    expect(metrics.total_biaya).toBe(29900);
    expect(metrics.tiktok_payout).toBe(34930);
    expect(metrics.net_profit).toBe(5030);
    expect(metrics.if_target_margin_price).toBe(49833.33);
  });

  it('gracefully handles zero or missing fields without throwing NaN', () => {
    const metrics = computeCogsMetrics({});
    expect(metrics.bb_langsung).toBe(0);
    expect(metrics.total_biaya).toBe(0);
    expect(metrics.gross_margin_percent).toBe(0);
    expect(metrics.net_profit).toBe(0);
    expect(metrics.if_target_margin_price).toBe(0);
  });

  it('retrieves overview with warehouse stock valuation (FIFO vs Moving Average)', async () => {
    const overview = await getCogsOverview();
    expect(overview).toBeDefined();
    expect(overview.summary.total_products).toBeGreaterThan(0);
    expect(overview.valuation).toBeDefined();
    expect(overview.valuation.fifo_total_valuation).toBeGreaterThanOrEqual(0);
    expect(overview.valuation.ma_total_valuation).toBeGreaterThanOrEqual(0);
    expect(overview.items.length).toBeGreaterThan(0);

    const first = overview.items[0];
    expect(first.seller_sku).toBeDefined();
    expect(first.current_fifo_cogs).toBeGreaterThanOrEqual(0);
    expect(first.moving_average_cogs).toBeGreaterThanOrEqual(0);
  });

  it('retrieves batch history without error', async () => {
    const batches = await getBatchCogsHistory();
    expect(Array.isArray(batches)).toBe(true);
  });

  it('calculates profit performance response structure with channel filter', async () => {
    const perfOffline = await getProfitPerformance({ channel: 'offline' });
    expect(perfOffline).toBeDefined();
    expect(perfOffline.summary).toBeDefined();
    expect(perfOffline.summary.channel).toBe('offline');
    expect(typeof perfOffline.summary.actual_revenue).toBe('number');
    expect(typeof perfOffline.summary.actual_cogs_fifo).toBe('number');
    expect(typeof perfOffline.summary.actual_net_profit).toBe('number');
    expect(perfOffline.summary.actual_platform_fees).toBe(0); // Offline has no platform fee

    const perfAll = await getProfitPerformance({ channel: 'all' });
    expect(perfAll).toBeDefined();
    expect(perfAll.summary.channel).toBe('all');
    expect(Array.isArray(perfAll.items)).toBe(true);

    const perfOnline = await getProfitPerformance({ channel: 'online' });
    expect(perfOnline).toBeDefined();
    expect(perfOnline.summary.channel).toBe('online');
    expect(perfOnline.summary.actual_revenue).toBe(0);
    expect(perfOnline.summary.actual_cogs_fifo).toBe(0);
    expect(perfOnline.summary.actual_net_profit).toBe(0);
    expect(perfOnline.items).toHaveLength(0);
  });

  it('retrieves FIFO and MA cost for existing SKU', async () => {
    const fifo = await getFifoCostForSku('CLN-SAGE');
    const ma = await getMovingAverageCostForSku('CLN-SAGE');
    expect(typeof fifo).toBe('number');
    expect(typeof ma).toBe('number');
    expect(fifo).toBeGreaterThan(0);
    expect(ma).toBeGreaterThan(0);
  });
});
