<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../api/client';
import Pagination from '../components/Pagination.vue';
import {
  Calculator,
  TrendingUp,
  Percent,
  Coins,
  Download,
  Search,
  RefreshCw,
  Edit3,
  X,
  Info,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Sparkles,
  ArrowUpRight,
  FileSpreadsheet,
  History,
  BarChart3,
  Layers,
  Calendar,
  DollarSign,
  PackageCheck,
  PackageMinus,
  Check,
  HelpCircle,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Boxes,
  Eye,
  Plus,
} from 'lucide-vue-next';

// ----------------- TYPES -----------------

interface CogsMetrics {
  bahan_utama: number;
  aksesori: number;
  kemasan: number;
  bb_langsung: number;
  tenaga_kerja: number;
  overhead: number;
  total_biaya: number;
  target_price: number;
  gross_margin_percent: number;
  tiktok_fee_percent: number;
  tiktok_fee_nominal: number;
  tiktok_payout: number;
  net_profit: number;
  net_profit_percent: number;
  target_margin_percent: number;
  if_target_margin_price: number;
  if_target_margin_payout: number;
  if_target_margin_net_profit: number;
}

interface ProductCogsItem {
  id?: number | null;
  product_id: number;
  seller_sku: string;
  name: string;
  category_name: string | null;
  label_color: string;
  image_url: string | null;
  notes: string | null;
  updated_at?: string | null;
  metrics: CogsMetrics;
  current_fifo_cogs: number;
  moving_average_cogs: number;
  current_stock_qty: number;
}

interface InventoryValuationSummary {
  total_stock_qty: number;
  fifo_total_valuation: number;
  ma_total_valuation: number;
  valuation_diff_nominal: number;
  valuation_diff_percent: number;
}

interface BatchCogsHistoryItem {
  id: number;
  stock_batch_id: number;
  batch_code: string;
  batch_created_at: string;
  batch_notes: string | null;
  product_id: number | null;
  seller_sku: string;
  product_name: string;
  category_name: string | null;
  label_color: string;
  qty_in: number;
  remaining_qty: number;
  cogs_bahan_utama: number;
  cogs_aksesori: number;
  cogs_kemasan: number;
  cogs_tenaga_kerja: number;
  cogs_overhead: number;
  cogs_total: number;
  total_batch_value: number;
  remaining_batch_value: number;
  target_price: number;
  tiktok_fee_percent: number;
  status: 'aktif' | 'habis';
}

interface SkuAccordionBatch extends BatchCogsHistoryItem {
  fifo_status: 'sedang_aktif' | 'antrean' | 'habis';
}

interface SkuAccordionItem {
  seller_sku: string;
  product_id: number;
  product_name: string;
  category_name: string | null;
  label_color: string;
  image_url: string | null;
  current_fifo_cogs: number;
  moving_average_cogs: number;
  current_stock_qty: number;
  target_price: number;
  target_margin_percent: number;
  gross_margin_percent: number;
  tiktok_payout: number;
  net_profit: number;
  net_profit_percent: number;
  master_total_cogs: number;
  batches: SkuAccordionBatch[];
  total_batches: number;
  active_batches: number;
  total_qty_in: number;
  total_remaining_qty: number;
  total_initial_value: number;
  total_remaining_value: number;
  active_fifo_batch: SkuAccordionBatch | null;
}

interface SkuProfitPerformance {
  seller_sku: string;
  product_name: string;
  category_name: string | null;
  label_color: string;
  offline_qty_sold: number;
  online_qty_sold: number;
  total_qty_sold: number;
  total_revenue: number;
  offline_revenue: number;
  online_revenue: number;
  avg_selling_price: number;
  cogs_fifo_total: number;
  cogs_fifo_per_unit: number;
  cogs_ma_total: number;
  cogs_ma_per_unit: number;
  total_platform_fees: number;
  actual_net_profit: number;
  actual_net_profit_percent: number;
  expected_net_profit: number;
  expected_net_profit_percent: number;
  variance_nominal: number;
  status: 'di_atas_target' | 'di_bawah_target';
  channel_label: 'Offline Riil' | 'Online Estimasi' | 'Gabungan';
}

interface ProfitPerformanceResponse {
  period: {
    startDate?: string;
    endDate?: string;
    channel: 'offline' | 'online' | 'all';
  };
  summary: {
    channel: 'offline' | 'online' | 'all';
    total_qty_sold: number;
    offline_qty_sold: number;
    unallocated_offline_qty: number;
    online_qty_sold: number;
    actual_revenue: number;
    offline_revenue: number;
    online_revenue: number;
    actual_cogs_fifo: number;
    actual_cogs_ma: number;
    cogs_method_diff_nominal: number;
    actual_platform_fees: number;
    actual_net_profit: number;
    actual_net_margin_percent: number;
    expected_net_profit: number;
    expected_margin_percent: number;
    margin_variance_nominal: number;
    margin_variance_percent: number;
    target_achieved_count: number;
    total_skus: number;
  };
  items: SkuProfitPerformance[];
}

// ----------------- TABS STATE -----------------
const activeTab = ref<'master' | 'batches' | 'performance'>('master');

// ----------------- GLOBAL STATE -----------------
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// ----------------- TAB 1: MASTER COGS STATE -----------------
const cogsItems = ref<ProductCogsItem[]>([]);
const masterSummary = ref({
  total_products: 0,
  avg_total_cogs: 0,
  avg_gross_margin: 0,
  avg_net_profit: 0,
  target_achieved_count: 0,
});
const valuation = ref<InventoryValuationSummary>({
  total_stock_qty: 0,
  fifo_total_valuation: 0,
  ma_total_valuation: 0,
  valuation_diff_nominal: 0,
  valuation_diff_percent: 0,
});

const searchQuery = ref('');
const selectedCategory = ref('');
const selectedMarginFilter = ref<'all' | 'achieved' | 'below'>('all');
const masterCurrentPage = ref(1);
const masterPageSize = ref(25);

// Edit Modal State
const showEditModal = ref(false);
const isSaving = ref(false);
const editingItem = ref<ProductCogsItem | null>(null);
const editForm = ref({
  bahan_utama: 0,
  aksesori: 0,
  kemasan: 0,
  tenaga_kerja: 0,
  overhead: 0,
  target_price: 0,
  tiktok_fee_percent: 25,
  target_margin_percent: 40,
  notes: '',
});

// Sandbox Modal State
const showSandboxModal = ref(false);
const sandboxForm = ref({
  bahan_utama: 25000,
  aksesori: 4500,
  kemasan: 2750,
  tenaga_kerja: 3600,
  overhead: 3500,
  target_price: 65000,
  tiktok_fee_percent: 25,
  target_margin_percent: 40,
});

// ----------------- ROUTER -----------------
const router = useRouter();

// ----------------- TAB 2: BATCH HISTORY STATE & ACCORDION -----------------
const batchViewMode = ref<'accordion' | 'flat_table'>('accordion');
const batchHistoryItems = ref<BatchCogsHistoryItem[]>([]);
const isBatchLoading = ref(false);
const selectedBatchDetail = ref<BatchCogsHistoryItem | null>(null);

// Flat table controls
const batchSearchQuery = ref('');
const batchStatusFilter = ref<'all' | 'aktif' | 'habis'>('all');
const batchCurrentPage = ref(1);
const batchPageSize = ref(25);

// Accordion per SKU controls
const expandedSkus = ref<Set<string>>(new Set());
const accordionSearchQuery = ref('');
const accordionFilter = ref<'all' | 'active_stock' | 'with_batches' | 'no_batches' | 'achieved' | 'below'>('all');
const accordionCurrentPage = ref(1);
const accordionPageSize = ref(15);

function toggleSkuAccordion(sku: string) {
  const next = new Set(expandedSkus.value);
  if (next.has(sku)) {
    next.delete(sku);
  } else {
    next.add(sku);
  }
  expandedSkus.value = next;
}

function expandAllSkus() {
  const next = new Set<string>();
  for (const item of filteredSkuAccordionList.value) {
    next.add(item.seller_sku);
  }
  expandedSkus.value = next;
}

function collapseAllSkus() {
  expandedSkus.value = new Set();
}

function isSkuExpanded(sku: string): boolean {
  return expandedSkus.value.has(sku);
}

watch([accordionSearchQuery, accordionFilter], () => {
  accordionCurrentPage.value = 1;
});

// ----------------- TAB 3: PROFIT PERFORMANCE STATE -----------------
const performanceData = ref<ProfitPerformanceResponse | null>(null);
const isPerfLoading = ref(false);
const perfChannel = ref<'offline' | 'online' | 'all'>('offline');
const perfDatePreset = ref<'all' | 'today' | '7days' | 'month' | 'custom'>('month');
const perfStartDate = ref('');
const perfEndDate = ref('');
const perfSearchQuery = ref('');
const perfCurrentPage = ref(1);
const perfPageSize = ref(25);

function setPerfChannel(channel: 'offline' | 'online' | 'all') {
  perfChannel.value = channel;
  perfCurrentPage.value = 1;
  loadPerformanceData();
}

// ----------------- FORMATTERS -----------------
function formatRupiah(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return 'Rp 0';
  return 'Rp ' + Math.round(val).toLocaleString('id-ID');
}

function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0%';
  return (
    Number(val).toLocaleString('id-ID', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }) + '%'
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function computeCogsMetrics(data: {
  bahan_utama?: number | null;
  aksesori?: number | null;
  kemasan?: number | null;
  tenaga_kerja?: number | null;
  overhead?: number | null;
  target_price?: number | null;
  tiktok_fee_percent?: number | null;
  target_margin_percent?: number | null;
}): CogsMetrics {
  const bu = Number(data.bahan_utama) || 0;
  const aks = Number(data.aksesori) || 0;
  const kem = Number(data.kemasan) || 0;
  const tk = Number(data.tenaga_kerja) || 0;
  const ovh = Number(data.overhead) || 0;
  const targetPrice = Number(data.target_price) || 0;
  const tiktokFeePct = Number(data.tiktok_fee_percent) || 0;
  const targetMarginPct = Number(data.target_margin_percent ?? 40);

  const bb_langsung = bu + aks + kem;
  const total_biaya = bb_langsung + tk + ovh;

  const gross_margin_percent =
    targetPrice > 0 ? ((targetPrice - total_biaya) / targetPrice) * 100 : 0;
  const tiktok_fee_nominal = targetPrice * (tiktokFeePct / 100);
  const tiktok_payout = targetPrice - tiktok_fee_nominal;
  const net_profit = tiktok_payout - total_biaya;
  const net_profit_percent =
    targetPrice > 0 ? (net_profit / targetPrice) * 100 : 0;

  const if_target_margin_price = targetMarginPct >= 0 && targetMarginPct < 100 ? total_biaya / (1 - targetMarginPct / 100) : 0;
  const if_target_margin_payout =
    if_target_margin_price * (1 - tiktokFeePct / 100);
  const if_target_margin_net_profit =
    if_target_margin_payout - total_biaya;

  return {
    bahan_utama: bu,
    aksesori: aks,
    kemasan: kem,
    bb_langsung,
    tenaga_kerja: tk,
    overhead: ovh,
    total_biaya,
    target_price: targetPrice,
    gross_margin_percent: Math.round(gross_margin_percent * 100) / 100,
    tiktok_fee_percent: tiktokFeePct,
    tiktok_fee_nominal: Math.round(tiktok_fee_nominal),
    tiktok_payout: Math.round(tiktok_payout),
    net_profit: Math.round(net_profit),
    net_profit_percent: Math.round(net_profit_percent * 100) / 100,
    target_margin_percent: targetMarginPct,
    if_target_margin_price: Math.round(if_target_margin_price * 100) / 100,
    if_target_margin_payout: Math.round(if_target_margin_payout * 100) / 100,
    if_target_margin_net_profit: Math.round(if_target_margin_net_profit * 100) / 100,
  };
}

// ----------------- DATA LOADERS -----------------

async function loadMasterData() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.get<{ data: { summary: any; valuation: any; items: ProductCogsItem[] } }>('/api/cogs');
    if (res.data) {
      cogsItems.value = res.data.items || [];
      masterSummary.value = res.data.summary || masterSummary.value;
      valuation.value = res.data.valuation || valuation.value;
    }
  } catch (err) {
    const e = err as ApiError;
    errorMessage.value = e.message || 'Gagal memuat data master HPP';
  } finally {
    isLoading.value = false;
  }
}

async function loadBatchHistory() {
  isBatchLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.get<{ data: BatchCogsHistoryItem[] }>('/api/cogs/batches');
    if (res.data) {
      batchHistoryItems.value = res.data || [];
    }
  } catch (err) {
    const e = err as ApiError;
    errorMessage.value = e.message || 'Gagal memuat riwayat kloter HPP';
  } finally {
    isBatchLoading.value = false;
  }
}

async function loadPerformanceData() {
  isPerfLoading.value = true;
  errorMessage.value = '';
  try {
    let url = '/api/cogs/performance';
    const params = new URLSearchParams();
    if (perfStartDate.value) params.append('startDate', perfStartDate.value);
    if (perfEndDate.value) params.append('endDate', perfEndDate.value);
    if (perfChannel.value) params.append('channel', perfChannel.value);
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const res = await api.get<{ data: ProfitPerformanceResponse }>(url);
    if (res.data) {
      performanceData.value = res.data;
    }
  } catch (err) {
    const e = err as ApiError;
    errorMessage.value = e.message || 'Gagal memuat analisis laba rugi';
  } finally {
    isPerfLoading.value = false;
  }
}

// Preset date changes
function applyDatePreset(preset: 'all' | 'today' | '7days' | 'month' | 'custom') {
  perfDatePreset.value = preset;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    const today = formatIsoDate(now);
    perfStartDate.value = today;
    perfEndDate.value = today;
  } else if (preset === '7days') {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    perfStartDate.value = formatIsoDate(sevenDaysAgo);
    perfEndDate.value = formatIsoDate(now);
  } else if (preset === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    perfStartDate.value = formatIsoDate(firstDay);
    perfEndDate.value = formatIsoDate(now);
  } else if (preset === 'all') {
    perfStartDate.value = '';
    perfEndDate.value = '';
  }
  loadPerformanceData();
}

// Tab Watcher
watch(activeTab, (newTab) => {
  if (newTab === 'master') {
    if (cogsItems.value.length === 0) loadMasterData();
  } else if (newTab === 'batches') {
    if (cogsItems.value.length === 0) loadMasterData();
    if (batchHistoryItems.value.length === 0) loadBatchHistory();
  } else if (newTab === 'performance' && !performanceData.value) {
    applyDatePreset('month');
  }
});

// ----------------- TAB 1 COMPUTEDS -----------------
const categoriesList = computed(() => {
  const set = new Set<string>();
  for (const item of cogsItems.value) {
    if (item.category_name) set.add(item.category_name);
  }
  return Array.from(set).sort();
});

const filteredMasterItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return cogsItems.value.filter((item) => {
    if (
      q &&
      !item.seller_sku.toLowerCase().includes(q) &&
      !item.name.toLowerCase().includes(q) &&
      !(item.category_name && item.category_name.toLowerCase().includes(q))
    ) {
      return false;
    }
    if (selectedCategory.value && item.category_name !== selectedCategory.value) {
      return false;
    }
    if (selectedMarginFilter.value === 'achieved') {
      return (
        item.metrics.gross_margin_percent >= item.metrics.target_margin_percent &&
        item.metrics.target_price > 0
      );
    }
    if (selectedMarginFilter.value === 'below') {
      return (
        item.metrics.gross_margin_percent < item.metrics.target_margin_percent ||
        item.metrics.target_price === 0
      );
    }
    return true;
  });
});

const paginatedMasterItems = computed(() => {
  const start = (masterCurrentPage.value - 1) * masterPageSize.value;
  return filteredMasterItems.value.slice(start, start + masterPageSize.value);
});

// Edit Modal Live Calculations
function openEditModal(item: ProductCogsItem) {
  editingItem.value = item;
  editForm.value = {
    bahan_utama: item.metrics.bahan_utama,
    aksesori: item.metrics.aksesori,
    kemasan: item.metrics.kemasan,
    tenaga_kerja: item.metrics.tenaga_kerja,
    overhead: item.metrics.overhead,
    target_price: item.metrics.target_price,
    tiktok_fee_percent: item.metrics.tiktok_fee_percent,
    target_margin_percent: item.metrics.target_margin_percent,
    notes: item.notes || '',
  };
  errorMessage.value = '';
  showEditModal.value = true;
}

const liveEditMetrics = computed<CogsMetrics>(() => {
  return computeCogsMetrics(editForm.value);
});

async function saveProductCogs() {
  if (!editingItem.value) return;
  isSaving.value = true;
  errorMessage.value = '';
  try {
    await api.put(`/api/cogs/${editingItem.value.product_id}`, editForm.value);
    showEditModal.value = false;
    successMessage.value = `Master HPP untuk "${editingItem.value.seller_sku}" berhasil diperbarui. Kloter berikutnya akan otomatis menggunakan acuan ini.`;
    setTimeout(() => {
      successMessage.value = '';
    }, 4500);
    await loadMasterData();
  } catch (err) {
    const e = err as ApiError;
    errorMessage.value = e.message || 'Gagal menyimpan perubahan HPP';
  } finally {
    isSaving.value = false;
  }
}

// ----------------- TAB 2 COMPUTEDS -----------------
const filteredBatchHistory = computed(() => {
  const q = batchSearchQuery.value.trim().toLowerCase();
  return batchHistoryItems.value.filter((b) => {
    if (
      q &&
      !b.batch_code.toLowerCase().includes(q) &&
      !b.seller_sku.toLowerCase().includes(q) &&
      !b.product_name.toLowerCase().includes(q) &&
      !(b.batch_notes && b.batch_notes.toLowerCase().includes(q))
    ) {
      return false;
    }
    if (batchStatusFilter.value !== 'all' && b.status !== batchStatusFilter.value) {
      return false;
    }
    return true;
  });
});

const paginatedBatchHistory = computed(() => {
  const start = (batchCurrentPage.value - 1) * batchPageSize.value;
  return filteredBatchHistory.value.slice(start, start + batchPageSize.value);
});

const batchSummaryStats = computed(() => {
  const items = batchHistoryItems.value;
  const totalBatches = items.length;
  const activeBatches = items.filter((b) => b.status === 'aktif').length;
  const totalInitialValue = items.reduce((s, b) => s + b.total_batch_value, 0);
  const totalRemainingValue = items.reduce((s, b) => s + b.remaining_batch_value, 0);

  return {
    totalBatches,
    activeBatches,
    totalInitialValue,
    totalRemainingValue,
  };
});

// ----------------- TAB 2 ACCORDION COMPUTEDS -----------------
const skuAccordionList = computed<SkuAccordionItem[]>(() => {
  const batchesBySku = new Map<string, BatchCogsHistoryItem[]>();
  for (const b of batchHistoryItems.value) {
    const key = (b.seller_sku || '').trim().toLowerCase();
    if (!batchesBySku.has(key)) {
      batchesBySku.set(key, []);
    }
    batchesBySku.get(key)!.push(b);
  }

  const result: SkuAccordionItem[] = [];
  const processedSkus = new Set<string>();

  for (const master of cogsItems.value) {
    const key = (master.seller_sku || '').trim().toLowerCase();
    processedSkus.add(key);

    const rawBatches = batchesBySku.get(key) || [];
    // Sort chronologically (earliest first) to determine FIFO sequence
    const chronological = [...rawBatches].sort((a, b) => {
      const timeA = new Date(a.batch_created_at || '').getTime() || a.id;
      const timeB = new Date(b.batch_created_at || '').getTime() || b.id;
      return timeA - timeB;
    });

    let foundActiveFifo = false;
    let activeFifoBatch: SkuAccordionBatch | null = null;
    const taggedBatches: SkuAccordionBatch[] = chronological.map((b) => {
      let fifo_status: 'sedang_aktif' | 'antrean' | 'habis';
      if (b.remaining_qty > 0) {
        if (!foundActiveFifo) {
          fifo_status = 'sedang_aktif';
          foundActiveFifo = true;
        } else {
          fifo_status = 'antrean';
        }
      } else {
        fifo_status = 'habis';
      }
      const tagged: SkuAccordionBatch = { ...b, fifo_status };
      if (fifo_status === 'sedang_aktif') {
        activeFifoBatch = tagged;
      }
      return tagged;
    });

    // Display batches newest first for historical view
    const displayBatches = [...taggedBatches].reverse();

    const total_qty_in = rawBatches.reduce((sum, b) => sum + (b.qty_in || 0), 0);
    const total_remaining_qty = rawBatches.reduce((sum, b) => sum + (b.remaining_qty || 0), 0);
    const total_initial_value = rawBatches.reduce((sum, b) => sum + (b.total_batch_value || 0), 0);
    const total_remaining_value = rawBatches.reduce((sum, b) => sum + (b.remaining_batch_value || 0), 0);
    const active_batches = rawBatches.filter((b) => b.remaining_qty > 0).length;

    result.push({
      seller_sku: master.seller_sku,
      product_id: master.product_id,
      product_name: master.name,
      category_name: master.category_name,
      label_color: master.label_color || '#4f46e5',
      image_url: master.image_url,
      current_fifo_cogs: master.current_fifo_cogs,
      moving_average_cogs: master.moving_average_cogs,
      current_stock_qty: master.current_stock_qty,
      target_price: master.metrics.target_price,
      target_margin_percent: master.metrics.target_margin_percent,
      gross_margin_percent: master.metrics.gross_margin_percent,
      tiktok_payout: master.metrics.tiktok_payout,
      net_profit: master.metrics.net_profit,
      net_profit_percent: master.metrics.net_profit_percent,
      master_total_cogs: master.metrics.total_biaya,
      batches: displayBatches,
      total_batches: rawBatches.length,
      active_batches,
      total_qty_in,
      total_remaining_qty,
      total_initial_value,
      total_remaining_value,
      active_fifo_batch: activeFifoBatch,
    });
  }

  // Include any extra SKU in batches that wasn't in master cogs
  for (const [key, rawBatches] of batchesBySku.entries()) {
    if (processedSkus.has(key)) continue;
    const first = rawBatches[0];
    const chronological = [...rawBatches].sort((a, b) => {
      const timeA = new Date(a.batch_created_at || '').getTime() || a.id;
      const timeB = new Date(b.batch_created_at || '').getTime() || b.id;
      return timeA - timeB;
    });

    let foundActiveFifo = false;
    let activeFifoBatch: SkuAccordionBatch | null = null;
    const taggedBatches: SkuAccordionBatch[] = chronological.map((b) => {
      let fifo_status: 'sedang_aktif' | 'antrean' | 'habis';
      if (b.remaining_qty > 0) {
        if (!foundActiveFifo) {
          fifo_status = 'sedang_aktif';
          foundActiveFifo = true;
        } else {
          fifo_status = 'antrean';
        }
      } else {
        fifo_status = 'habis';
      }
      const tagged: SkuAccordionBatch = { ...b, fifo_status };
      if (fifo_status === 'sedang_aktif') {
        activeFifoBatch = tagged;
      }
      return tagged;
    });

    const displayBatches = [...taggedBatches].reverse();
    const total_qty_in = rawBatches.reduce((sum, b) => sum + (b.qty_in || 0), 0);
    const total_remaining_qty = rawBatches.reduce((sum, b) => sum + (b.remaining_qty || 0), 0);
    const total_initial_value = rawBatches.reduce((sum, b) => sum + (b.total_batch_value || 0), 0);
    const total_remaining_value = rawBatches.reduce((sum, b) => sum + (b.remaining_batch_value || 0), 0);
    const active_batches = rawBatches.filter((b) => b.remaining_qty > 0).length;

    result.push({
      seller_sku: first.seller_sku,
      product_id: first.product_id || 0,
      product_name: first.product_name,
      category_name: first.category_name,
      label_color: first.label_color || '#4f46e5',
      image_url: null,
      current_fifo_cogs: activeFifoBatch ? (activeFifoBatch as SkuAccordionBatch).cogs_total : (rawBatches[0]?.cogs_total || 0),
      moving_average_cogs: total_remaining_qty > 0 ? Math.round(total_remaining_value / total_remaining_qty) : (rawBatches[0]?.cogs_total || 0),
      current_stock_qty: total_remaining_qty,
      target_price: first.target_price || 0,
      target_margin_percent: 40,
      gross_margin_percent: 0,
      tiktok_payout: 0,
      net_profit: 0,
      net_profit_percent: 0,
      master_total_cogs: rawBatches[0]?.cogs_total || 0,
      batches: displayBatches,
      total_batches: rawBatches.length,
      active_batches,
      total_qty_in,
      total_remaining_qty,
      total_initial_value,
      total_remaining_value,
      active_fifo_batch: activeFifoBatch,
    });
  }

  return result;
});

const filteredSkuAccordionList = computed(() => {
  const q = accordionSearchQuery.value.trim().toLowerCase();
  const filter = accordionFilter.value;

  return skuAccordionList.value.filter((item) => {
    if (q) {
      const matchSku = item.seller_sku.toLowerCase().includes(q);
      const matchName = item.product_name.toLowerCase().includes(q);
      const matchCat = item.category_name && item.category_name.toLowerCase().includes(q);
      const matchBatch = item.batches.some(
        (b) =>
          b.batch_code.toLowerCase().includes(q) ||
          (b.batch_notes && b.batch_notes.toLowerCase().includes(q))
      );
      if (!matchSku && !matchName && !matchCat && !matchBatch) {
        return false;
      }
    }

    if (filter === 'active_stock' && item.current_stock_qty <= 0) {
      return false;
    }
    if (filter === 'with_batches' && item.total_batches === 0) {
      return false;
    }
    if (filter === 'no_batches' && item.total_batches > 0) {
      return false;
    }
    if (filter === 'achieved' && item.gross_margin_percent < item.target_margin_percent) {
      return false;
    }
    if (filter === 'below' && (item.gross_margin_percent >= item.target_margin_percent || item.target_price === 0)) {
      return false;
    }

    return true;
  });
});

const paginatedSkuAccordionList = computed(() => {
  const start = (accordionCurrentPage.value - 1) * accordionPageSize.value;
  return filteredSkuAccordionList.value.slice(start, start + accordionPageSize.value);
});

// ----------------- TAB 3 COMPUTEDS -----------------
const filteredPerfItems = computed(() => {
  if (!performanceData.value) return [];
  const q = perfSearchQuery.value.trim().toLowerCase();
  return performanceData.value.items.filter((it) => {
    if (
      q &&
      !it.seller_sku.toLowerCase().includes(q) &&
      !it.product_name.toLowerCase().includes(q) &&
      !(it.category_name && it.category_name.toLowerCase().includes(q))
    ) {
      return false;
    }
    return true;
  });
});

const paginatedPerfItems = computed(() => {
  const start = (perfCurrentPage.value - 1) * perfPageSize.value;
  return filteredPerfItems.value.slice(start, start + perfPageSize.value);
});

// ----------------- CSV EXPORTS -----------------
function exportMasterCsv() {
  const headers = [
    'SKU',
    'Produk',
    'Kategori',
    'Bahan Utama',
    'Aksesori',
    'Kemasan',
    'BB Langsung',
    'Tenaga Kerja',
    'Overhead',
    'Total Biaya (HPP Master)',
    'HPP FIFO Aktif',
    'HPP Moving Average',
    'Sisa Stok di Rak',
    'Harga Jual Target',
    'Gross Margin (%)',
    'Potongan TikTok (%)',
    'Net Payout TikTok',
    'Net Profit Target',
    'Harga Target Margin',
  ];

  const escapeCsv = (str: string | number) => `"${String(str ?? '').replace(/"/g, '""')}"`;
  const rows = filteredMasterItems.value.map((it) => [
    escapeCsv(it.seller_sku),
    escapeCsv(it.name),
    escapeCsv(it.category_name || '-'),
    it.metrics.bahan_utama,
    it.metrics.aksesori,
    it.metrics.kemasan,
    it.metrics.bb_langsung,
    it.metrics.tenaga_kerja,
    it.metrics.overhead,
    it.metrics.total_biaya,
    it.current_fifo_cogs,
    it.moving_average_cogs,
    it.current_stock_qty,
    it.metrics.target_price,
    it.metrics.gross_margin_percent,
    it.metrics.tiktok_fee_percent,
    it.metrics.tiktok_payout,
    it.metrics.net_profit,
    it.metrics.if_target_margin_price,
  ]);

  downloadCsv(headers, rows, 'Master_HPP_Sukma');
}

function exportBatchHistoryCsv() {
  const headers = [
    'Kode Batch',
    'Tanggal Kloter',
    'SKU',
    'Nama Produk',
    'Qty Awal',
    'Sisa Stok',
    'HPP Kloter',
    'Total Modal Masuk',
    'Sisa Modal Kloter',
    'Status Kloter',
    'Catatan / Vendor',
  ];

  const escapeCsv = (str: string | number) => `"${String(str ?? '').replace(/"/g, '""')}"`;
  const rows = filteredBatchHistory.value.map((b) => [
    escapeCsv(b.batch_code),
    escapeCsv(formatDate(b.batch_created_at)),
    escapeCsv(b.seller_sku),
    escapeCsv(b.product_name),
    b.qty_in,
    b.remaining_qty,
    b.cogs_total,
    b.total_batch_value,
    b.remaining_batch_value,
    escapeCsv(b.status === 'aktif' ? 'Aktif' : 'Habis Terjual'),
    escapeCsv(b.batch_notes || '-'),
  ]);

  downloadCsv(headers, rows, 'Riwayat_Kloter_HPP_Sukma');
}

function exportPerformanceCsv() {
  if (!performanceData.value || filteredPerfItems.value.length === 0) {
    alert(
      perfChannel.value === 'online'
        ? 'Data penjualan online belum tersedia. Menunggu integrasi API TikTok Shop.'
        : 'Tidak ada data penjualan untuk diekspor pada filter ini.'
    );
    return;
  }
  if (perfChannel.value === 'online') {
    downloadCsv(['SKU', 'Unit online'], filteredPerfItems.value.map(it => [`"${it.seller_sku.replace(/"/g, '""')}"`, it.online_qty_sold]), 'Volume_Pesanan_Online');
    return;
  }
  const headers = [
    'SKU',
    'Nama Produk',
    'Kategori',
    'Sumber Penjualan',
    'Terjual Offline',
    'Terjual Online',
    'Total Terjual',
    'Rata-rata Harga Jual',
    'Omzet Offline',
    'Omzet Online (belum tersedia)',
    'Total Omzet',
    'Total HPP Terjual (FIFO)',
    'HPP FIFO per unit',
    'HPP Moving Average per unit',
    'Potongan Komisi',
    'Net Profit',
    'Net Margin (%)',
    'Expected Net Profit',
    'Selisih Variance',
    'Status vs Target SKU',
  ];

  const escapeCsv = (str: string | number) => `"${String(str ?? '').replace(/"/g, '""')}"`;
  const rows = filteredPerfItems.value.map((it) => {
    const channelName =
      it.channel_label === 'Offline Riil'
        ? 'Offline'
        : it.channel_label === 'Online Estimasi'
        ? 'Online'
        : 'Gabungan';

    return [
      escapeCsv(it.seller_sku),
      escapeCsv(it.product_name),
      escapeCsv(it.category_name || '-'),
      escapeCsv(channelName),
      it.offline_qty_sold,
      it.online_qty_sold,
      it.total_qty_sold,
      it.avg_selling_price,
      it.offline_revenue,
      '',
      it.total_revenue,
      it.cogs_fifo_total,
      it.cogs_fifo_per_unit,
      it.cogs_ma_per_unit,
      it.total_platform_fees,
      it.actual_net_profit,
      it.actual_net_profit_percent,
      it.expected_net_profit,
      it.variance_nominal,
      escapeCsv(it.status === 'di_atas_target' ? 'Di Atas Target' : 'Di Bawah Target'),
    ];
  });

  downloadCsv(headers, rows, `Realisasi_Laba_Rugi_${performanceData.value.summary.channel || 'Sukma'}`);
}

function downloadCsv(headers: string[], rows: any[][], baseName: string) {
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${baseName}_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  await Promise.all([loadMasterData(), loadBatchHistory()]);
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6">
    <!-- TOP HEADER -->
    <div
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs"
    >
      <div class="flex items-center space-x-3.5">
        <div
          class="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0"
        >
          <Calculator class="w-6 h-6" />
        </div>
        <div>
          <h1 class="text-xl font-black text-slate-900 tracking-tight">
            Kalkulator HPP
          </h1>
          <p class="text-xs text-slate-500 mt-0.5">
            Manajemen HPP produk, riwayat kloter stok, dan realisasi laba rugi.
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          @click="showSandboxModal = true"
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition border border-indigo-200/60 cursor-pointer shadow-2xs"
        >
          <Sparkles class="w-4 h-4 text-indigo-600" />
          <span>Simulasi HPP Baru</span>
        </button>

        <button
          type="button"
          @click="
            activeTab === 'master'
              ? exportMasterCsv()
              : activeTab === 'batches'
              ? exportBatchHistoryCsv()
              : exportPerformanceCsv()
          "
          class="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
        >
          <FileSpreadsheet class="w-4 h-4" />
          <span>Ekspor CSV</span>
        </button>

        <button
          type="button"
          @click="
            activeTab === 'master'
              ? loadMasterData()
              : activeTab === 'batches'
              ? loadBatchHistory()
              : loadPerformanceData()
          "
          :disabled="isLoading || isBatchLoading || isPerfLoading"
          class="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition border border-slate-200/80 cursor-pointer"
          title="Muat Ulang Data"
        >
          <RefreshCw
            class="w-4 h-4"
            :class="{ 'animate-spin': isLoading || isBatchLoading || isPerfLoading }"
          />
        </button>
      </div>
    </div>

    <!-- NOTIFICATIONS -->
    <div
      v-if="errorMessage"
      class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-semibold flex items-center space-x-2"
    >
      <AlertCircle class="w-4 h-4 shrink-0 text-rose-600" />
      <span>{{ errorMessage }}</span>
    </div>

    <div
      v-if="successMessage"
      class="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-semibold flex items-center space-x-2"
    >
      <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600" />
      <span>{{ successMessage }}</span>
    </div>

    <!-- NAVIGATION TABS -->
    <div class="flex items-center space-x-2 border-b border-slate-200 pb-1">
      <button
        type="button"
        @click="activeTab = 'master'"
        class="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
        :class="[
          activeTab === 'master'
            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
            : 'bg-white text-slate-600 hover:text-indigo-900 hover:bg-slate-100 border border-slate-200/70',
        ]"
      >
        <Sliders class="w-4 h-4" />
        <span>Tab 1: Master Acuan &amp; Simulasi</span>
      </button>

      <button
        type="button"
        @click="activeTab = 'batches'"
        class="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
        :class="[
          activeTab === 'batches'
            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
            : 'bg-white text-slate-600 hover:text-indigo-900 hover:bg-slate-100 border border-slate-200/70',
        ]"
      >
        <History class="w-4 h-4" />
        <span>Tab 2: Riwayat Kloter HPP (Batch)</span>
      </button>

      <button
        type="button"
        @click="activeTab = 'performance'"
        class="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
        :class="[
          activeTab === 'performance'
            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
            : 'bg-white text-slate-600 hover:text-indigo-900 hover:bg-slate-100 border border-slate-200/70',
        ]"
      >
        <BarChart3 class="w-4 h-4" />
        <span>Tab 3: Realisasi Laba Rugi (Expected vs Actual)</span>
      </button>
    </div>

    <!-- ==================== TAB 1: MASTER ACUAN & SIMULASI ==================== -->
    <div v-if="activeTab === 'master'" class="space-y-6">
      <!-- KPI SUMMARY CARDS -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Total Produk</span>
            <span class="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Coins class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-slate-900 font-mono">
            {{ masterSummary.total_products }}
            <span class="text-xs font-normal text-slate-500">SKU</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-medium">Acuan standar aktif</div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Rata HPP Master</span>
            <span class="w-7 h-7 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Calculator class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-indigo-600 font-mono">
            {{ formatRupiah(masterSummary.avg_total_cogs) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-medium">BB + TK + Overhead</div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Rata Net Profit</span>
            <span class="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Percent class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-amber-600 font-mono">
            {{ formatRupiah(masterSummary.avg_net_profit) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-medium">Margin: {{ formatPercent(masterSummary.avg_gross_margin) }}</div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Target tercapai</span>
            <span class="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <ArrowUpRight class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-slate-900 font-mono">
            {{ masterSummary.target_achieved_count }}
            <span class="text-xs font-normal text-slate-500">/ {{ masterSummary.total_products }}</span>
          </div>
          <div class="text-[10px] text-emerald-600 font-bold mt-1">
            {{
              masterSummary.total_products > 0
                ? Math.round((masterSummary.target_achieved_count / masterSummary.total_products) * 100)
                : 0
            }}% Produk Memenuhi
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs col-span-2 md:col-span-1">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Valuasi Stok</span>
            <span class="w-7 h-7 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
              <Layers class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-slate-900 font-mono">
            {{ formatRupiah(valuation.fifo_total_valuation) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-medium">
            {{ valuation.total_stock_qty }} pcs di rak (MA: {{ formatRupiah(valuation.ma_total_valuation) }})
          </div>
        </div>
      </div>

      <!-- MASTER COGS TABLE (CONTAINER DATA INTI) -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <!-- HEADER KONTROL & FILTER -->
        <div class="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div class="flex items-center gap-2 flex-1 flex-wrap">
            <div class="relative flex-1 min-w-[220px] max-w-sm">
              <Search class="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Cari SKU atau nama produk..."
                class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <select
              v-model="selectedCategory"
              class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
            >
              <option value="">Semua Kategori</option>
              <option v-for="cat in categoriesList" :key="cat" :value="cat">
                {{ cat }}
              </option>
            </select>

            <select
              v-model="selectedMarginFilter"
              class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
            >
              <option value="all">Semua Margin</option>
              <option value="achieved">Target Tercapai</option>
              <option value="below">Di Bawah Target</option>
            </select>
          </div>

          <div class="text-xs text-slate-500 font-medium">
            {{ filteredMasterItems.length }} produk
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs whitespace-nowrap">
            <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th scope="col" class="px-4 py-3 sticky left-0 bg-slate-50 z-10">Produk &amp; SKU</th>
                <th scope="col" class="px-3 py-3 text-right">Bahan Utama</th>
                <th scope="col" class="px-3 py-3 text-right">Aksesori</th>
                <th scope="col" class="px-3 py-3 text-right">Kemasan</th>
                <th scope="col" class="px-3 py-3 text-right bg-slate-100/70 font-black text-slate-800">BB Langsung</th>
                <th scope="col" class="px-3 py-3 text-right">Tenaga Kerja</th>
                <th scope="col" class="px-3 py-3 text-right">Overhead</th>
                <th scope="col" class="px-4 py-3 text-right bg-indigo-50/70 font-black text-indigo-900">Total HPP Master</th>
                <th scope="col" class="px-3 py-3 text-right font-mono text-emerald-800 bg-emerald-50/40">HPP FIFO Aktif</th>
                <th scope="col" class="px-3 py-3 text-right font-mono text-sky-800 bg-sky-50/40">HPP MA (Rata2)</th>
                <th scope="col" class="px-4 py-3 text-right font-black text-slate-900">Harga Jual Target</th>
                <th scope="col" class="px-3 py-3 text-center">Gross Margin</th>
                <th scope="col" class="px-3 py-3 text-right">Potongan TikTok</th>
                <th scope="col" class="px-3 py-3 text-right">Net Payout TikTok</th>
                <th scope="col" class="px-4 py-3 text-right font-black text-emerald-800 bg-emerald-50/50">Net Profit Target</th>
                <th scope="col" class="px-3 py-3 text-right bg-sky-50/60 font-black text-sky-900">Harga Target Margin</th>
                <th scope="col" class="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="item in paginatedMasterItems"
                :key="item.product_id"
                class="hover:bg-slate-50/80 transition-colors"
              >
                <td class="px-4 py-3 sticky left-0 bg-white hover:bg-slate-50/80 z-10 shadow-[1px_0_2px_0_rgba(0,0,0,0.03)]">
                  <div class="flex items-center space-x-2.5">
                    <span
                      class="w-2.5 h-7 rounded-full shrink-0"
                      :style="{ backgroundColor: item.label_color || '#4f46e5' }"
                    ></span>
                    <div>
                      <div class="font-bold text-slate-900 font-mono text-xs">{{ item.seller_sku }}</div>
                      <div class="text-[11px] text-slate-600 truncate max-w-[190px]" :title="item.name">
                        {{ item.name }}
                      </div>
                      <div v-if="item.category_name" class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {{ item.category_name }}
                      </div>
                    </div>
                  </div>
                </td>

                <td class="px-3 py-3 text-right font-mono text-slate-700">{{ formatRupiah(item.metrics.bahan_utama) }}</td>
                <td class="px-3 py-3 text-right font-mono text-slate-700">{{ formatRupiah(item.metrics.aksesori) }}</td>
                <td class="px-3 py-3 text-right font-mono text-slate-700">{{ formatRupiah(item.metrics.kemasan) }}</td>
                <td class="px-3 py-3 text-right font-mono font-bold bg-slate-50 text-slate-900">
                  {{ formatRupiah(item.metrics.bb_langsung) }}
                </td>
                <td class="px-3 py-3 text-right font-mono text-slate-700">{{ formatRupiah(item.metrics.tenaga_kerja) }}</td>
                <td class="px-3 py-3 text-right font-mono text-slate-700">{{ formatRupiah(item.metrics.overhead) }}</td>
                <td class="px-4 py-3 text-right font-mono font-black bg-indigo-50/50 text-indigo-900">
                  {{ formatRupiah(item.metrics.total_biaya) }}
                </td>
                <td class="px-3 py-3 text-right font-mono font-bold bg-emerald-50/30 text-emerald-800">
                  {{ formatRupiah(item.current_fifo_cogs) }}
                </td>
                <td class="px-3 py-3 text-right font-mono font-bold bg-sky-50/30 text-sky-800">
                  {{ formatRupiah(item.moving_average_cogs) }}
                </td>
                <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">
                  {{ formatRupiah(item.metrics.target_price) }}
                </td>
                <td class="px-3 py-3 text-center">
                  <span
                    class="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono inline-block"
                    :class="[
                      item.metrics.gross_margin_percent >= item.metrics.target_margin_percent
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : item.metrics.gross_margin_percent >= 30
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200',
                    ]"
                  >
                    {{ formatPercent(item.metrics.gross_margin_percent) }}
                  </span>
                </td>
                <td class="px-3 py-3 text-right font-mono text-slate-600">
                  <div>{{ formatRupiah(item.metrics.tiktok_fee_nominal) }}</div>
                  <div class="text-[10px] text-slate-400">({{ item.metrics.tiktok_fee_percent }}%)</div>
                </td>
                <td class="px-3 py-3 text-right font-mono text-slate-700 font-semibold">
                  {{ formatRupiah(item.metrics.tiktok_payout) }}
                </td>
                <td class="px-4 py-3 text-right font-mono font-black bg-emerald-50/40">
                  <div :class="[item.metrics.net_profit >= 0 ? 'text-emerald-700' : 'text-rose-600']">
                    {{ formatRupiah(item.metrics.net_profit) }}
                  </div>
                  <div
                    class="text-[10px] font-medium"
                    :class="[item.metrics.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-500']"
                  >
                    {{ formatPercent(item.metrics.net_profit_percent) }}
                  </div>
                </td>
                <td class="px-3 py-3 text-right font-mono bg-sky-50/40 text-sky-900 font-bold">
                  {{ formatRupiah(item.metrics.if_target_margin_price) }}
                </td>
                <td class="px-4 py-3 text-center">
                  <button
                    type="button"
                    @click="openEditModal(item)"
                    class="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                  >
                    <Edit3 class="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                </td>
              </tr>

              <tr v-if="filteredMasterItems.length === 0">
                <td colspan="17" class="px-4 py-12 text-center text-slate-400">
                  <Calculator class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p class="text-sm font-semibold">Tidak ada produk yang sesuai filter</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <Pagination
          v-model:currentPage="masterCurrentPage"
          v-model:pageSize="masterPageSize"
          :totalItems="filteredMasterItems.length"
        />
      </div>
    </div>

    <!-- ==================== TAB 2: RIWAYAT KLOTER HPP ==================== -->
    <div v-else-if="activeTab === 'batches'" class="space-y-6">
      <!-- BATCH STATS CARDS -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Kloter Masuk</div>
          <div class="text-xl font-black text-slate-900 font-mono mt-1">
            {{ batchSummaryStats.totalBatches }}
            <span class="text-xs font-normal text-slate-500">Kloter</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-1">Histori batch tercatat</div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Kloter Aktif di Rak</div>
          <div class="text-xl font-black text-emerald-600 font-mono mt-1">
            {{ batchSummaryStats.activeBatches }}
            <span class="text-xs font-normal text-slate-500">Kloter Sisa</span>
          </div>
          <div class="text-[10px] text-emerald-600 mt-1 font-bold">Siap terpotong FIFO</div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Nilai Modal Masuk</div>
          <div class="text-xl font-black text-indigo-600 font-mono mt-1">
            {{ formatRupiah(batchSummaryStats.totalInitialValue) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1">Akumulasi modal kloter</div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sisa Modal Aktif di Rak</div>
          <div class="text-xl font-black text-sky-600 font-mono mt-1">
            {{ formatRupiah(batchSummaryStats.totalRemainingValue) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1">Valuasi stok sisa kloter</div>
        </div>
      </div>

      <!-- CONTAINER DATA INTI KLOTER -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <!-- HEADER KONTROL & FILTER -->
        <div class="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50">
          <div class="flex items-center gap-2.5 flex-wrap flex-1">
            <!-- Tampilan Mode Switcher -->
            <div class="inline-flex p-1 bg-slate-200/70 rounded-xl space-x-1">
              <button
                type="button"
                @click="batchViewMode = 'accordion'"
                class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                :class="[
                  batchViewMode === 'accordion'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                <Boxes class="w-3.5 h-3.5" />
                <span>Akordion per SKU</span>
              </button>
              <button
                type="button"
                @click="batchViewMode = 'flat_table'"
                class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                :class="[
                  batchViewMode === 'flat_table'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                <FileSpreadsheet class="w-3.5 h-3.5" />
                <span>Tabel Rata</span>
              </button>
            </div>

            <!-- Pencarian -->
            <div class="relative min-w-[200px] max-w-xs">
              <Search class="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                v-if="batchViewMode === 'accordion'"
                v-model="accordionSearchQuery"
                type="text"
                placeholder="Cari SKU atau nama produk..."
                class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <input
                v-else
                v-model="batchSearchQuery"
                type="text"
                placeholder="Cari kode kloter atau SKU..."
                class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <!-- Filter Status -->
            <select
              v-if="batchViewMode === 'accordion'"
              v-model="accordionFilter"
              class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
            >
              <option value="all">Semua SKU</option>
              <option value="active_stock">Stok Tersedia (&gt; 0 pcs)</option>
              <option value="with_batches">Memiliki Kloter</option>
              <option value="no_batches">Belum Ada Kloter</option>
            </select>

            <select
              v-else
              v-model="batchStatusFilter"
              class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
            >
              <option value="all">Semua Status</option>
              <option value="aktif">Masih Ada Sisa</option>
              <option value="habis">Habis Terjual</option>
            </select>

            <!-- Buka/Tutup Semua (Accordion) -->
            <div v-if="batchViewMode === 'accordion'" class="flex items-center space-x-1">
              <button
                type="button"
                @click="expandAllSkus"
                class="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
              >
                Buka Semua
              </button>
              <button
                type="button"
                @click="collapseAllSkus"
                class="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
              >
                Tutup Semua
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2.5 flex-wrap">
            <span class="text-xs text-slate-500 font-medium">
              {{ batchViewMode === 'accordion' ? filteredSkuAccordionList.length + ' SKU' : filteredBatchHistory.length + ' item kloter' }}
            </span>
            <button
              type="button"
              @click="router.push('/stock')"
              class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Input Stok Masuk</span>
            </button>
          </div>
        </div>

        <!-- ISI CONTAINER: ACCORDION -->
        <div v-if="batchViewMode === 'accordion'">
          <div class="p-4 space-y-3">
          <div
            v-for="skuItem in paginatedSkuAccordionList"
            :key="skuItem.seller_sku"
            class="bg-white rounded-2xl border transition-all duration-150 overflow-hidden"
            :class="[
              isSkuExpanded(skuItem.seller_sku)
                ? 'border-indigo-300 ring-2 ring-indigo-500/10 shadow-sm'
                : 'border-slate-200/80 shadow-xs hover:border-slate-300',
            ]"
          >
            <!-- ACCORDION HEADER (DATA SAAT INI SEBAGAI YANG UTAMA) -->
            <div
              @click="toggleSkuAccordion(skuItem.seller_sku)"
              class="p-4 sm:p-5 cursor-pointer select-none transition-colors space-y-3"
              :class="[isSkuExpanded(skuItem.seller_sku) ? 'bg-indigo-50/20' : 'hover:bg-slate-50/60']"
            >
              <!-- BARIS 1: IDENTITAS SKU & STATUS KLOTER -->
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex items-center space-x-3 min-w-0 flex-1">
                  <div
                    class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                    :class="[
                      isSkuExpanded(skuItem.seller_sku)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    ]"
                  >
                    <ChevronUp v-if="isSkuExpanded(skuItem.seller_sku)" class="w-4 h-4" />
                    <ChevronDown v-else class="w-4 h-4" />
                  </div>

                  <span
                    class="w-2.5 h-6 rounded-full shrink-0"
                    :style="{ backgroundColor: skuItem.label_color || '#4f46e5' }"
                  ></span>

                  <div class="flex items-center space-x-2 flex-wrap min-w-0">
                    <span class="font-mono font-black text-sm text-slate-900 tracking-tight">
                      {{ skuItem.seller_sku }}
                    </span>
                    <span
                      v-if="skuItem.category_name"
                      class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wider"
                    >
                      {{ skuItem.category_name }}
                    </span>
                    <span class="text-xs text-slate-600 font-medium truncate max-w-md" :title="skuItem.product_name">
                      {{ skuItem.product_name }}
                    </span>
                  </div>
                </div>

                <div class="flex items-center space-x-2 shrink-0">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono"
                    :class="[
                      skuItem.active_batches > 0
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : skuItem.total_batches > 0
                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200',
                    ]"
                  >
                    {{
                      skuItem.total_batches === 0
                        ? 'Belum Ada Kloter'
                        : `${skuItem.total_batches} Kloter (${skuItem.active_batches} Aktif)`
                    }}
                  </span>
                  <span class="text-[11px] text-slate-400 font-medium hidden sm:inline">
                    {{ isSkuExpanded(skuItem.seller_sku) ? 'Tutup Rincian' : 'Lihat Riwayat Kloter' }}
                  </span>
                </div>
              </div>

              <!-- BARIS 2: 6 METRIK DATA SAAT INI (GRID FLUID RESPONSIF: 2 col mobile, 3 col tablet, 6 col desktop) -->
              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 text-xs">
                <!-- 1. HPP FIFO Saat Ini -->
                <div class="p-2.5 bg-indigo-50/70 border border-indigo-200/70 rounded-xl">
                  <div class="text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                    <span>HPP FIFO Aktif</span>
                  </div>
                  <div class="font-mono font-black text-indigo-950 text-sm mt-0.5 truncate">
                    {{ formatRupiah(skuItem.current_fifo_cogs) }}
                  </div>
                  <div class="text-[9px] text-indigo-600 font-medium truncate" :title="skuItem.active_fifo_batch ? skuItem.active_fifo_batch.batch_code : 'Master Acuan'">
                    {{ skuItem.active_fifo_batch ? skuItem.active_fifo_batch.batch_code : 'Master Acuan' }}
                  </div>
                </div>

                <!-- 2. HPP Moving Average -->
                <div class="p-2.5 bg-sky-50/70 border border-sky-200/70 rounded-xl">
                  <div class="text-[10px] font-bold text-sky-800 uppercase tracking-wider flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                    <span>HPP Rata2 (MA)</span>
                  </div>
                  <div class="font-mono font-bold text-sky-950 text-sm mt-0.5 truncate">
                    {{ formatRupiah(skuItem.moving_average_cogs) }}
                  </div>
                  <div class="text-[9px] text-sky-600 font-medium truncate">Referensi analitis</div>
                </div>

                <!-- 3. Stok Aktif di Rak -->
                <div class="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stok di Rak</div>
                  <div
                    class="font-mono font-black text-sm mt-0.5 truncate"
                    :class="[skuItem.current_stock_qty > 0 ? 'text-slate-900' : 'text-rose-500']"
                  >
                    {{ skuItem.current_stock_qty }} pcs
                  </div>
                  <div class="text-[9px] text-slate-400 font-medium truncate">
                    {{ skuItem.active_batches }} kloter aktif
                  </div>
                </div>

                <!-- 4. Harga Jual Target -->
                <div class="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Jual</div>
                  <div class="font-mono font-bold text-slate-900 text-sm mt-0.5 truncate">
                    {{ formatRupiah(skuItem.target_price) }}
                  </div>
                  <div class="text-[9px] text-slate-400 font-medium truncate">TikTok fee 25%</div>
                </div>

                <!-- 5. Gross Margin % -->
                <div
                  class="p-2.5 rounded-xl border"
                  :class="[
                    skuItem.gross_margin_percent >= skuItem.target_margin_percent
                      ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
                      : skuItem.gross_margin_percent >= 30
                      ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                      : 'bg-rose-50/70 border-rose-200/80 text-rose-950',
                  ]"
                >
                  <div
                    class="text-[10px] font-bold uppercase tracking-wider"
                    :class="[
                      skuItem.gross_margin_percent >= skuItem.target_margin_percent
                        ? 'text-emerald-700'
                        : skuItem.gross_margin_percent >= 30
                        ? 'text-amber-700'
                        : 'text-rose-700',
                    ]"
                  >
                    Gross Margin
                  </div>
                  <div class="font-mono font-black text-sm mt-0.5 truncate">
                    {{ formatPercent(skuItem.gross_margin_percent) }}
                  </div>
                  <div class="text-[9px] font-bold truncate">
                    {{ skuItem.gross_margin_percent >= skuItem.target_margin_percent ? 'Target Terpenuhi' : 'Margin Tipis' }}
                  </div>
                </div>

                <!-- 6. Estimasi Net Profit -->
                <div class="p-2.5 bg-emerald-50/60 border border-emerald-200/70 rounded-xl">
                  <div class="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Net Profit Est.</div>
                  <div class="font-mono font-black text-emerald-900 text-sm mt-0.5 truncate">
                    {{ formatRupiah(skuItem.net_profit) }}
                  </div>
                  <div class="text-[9px] text-emerald-700 font-bold font-mono truncate">
                    {{ formatPercent(skuItem.net_profit_percent) }} margin
                  </div>
                </div>
              </div>
            </div>

            <!-- ACCORDION BODY (RIWAYAT KLOTER BATCH) -->
            <div
              v-if="isSkuExpanded(skuItem.seller_sku)"
              class="border-t border-slate-200/80 bg-slate-50/60 p-4 sm:p-5 space-y-4"
            >
              <!-- Summary Strip for this SKU -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white rounded-xl border border-slate-200/80 text-xs">
                <div class="flex items-center space-x-4 flex-wrap">
                  <div>
                    <span class="text-slate-500 font-medium">Total Modal Masuk:</span>
                    <span class="font-mono font-bold text-slate-900 ml-1.5">{{ formatRupiah(skuItem.total_initial_value) }}</span>
                    <span class="text-[10px] text-slate-400 ml-1">({{ skuItem.total_qty_in }} pcs)</span>
                  </div>
                  <div class="hidden sm:block text-slate-300">|</div>
                  <div>
                    <span class="text-slate-500 font-medium">Sisa Modal di Rak:</span>
                    <span class="font-mono font-bold text-sky-800 ml-1.5">{{ formatRupiah(skuItem.total_remaining_value) }}</span>
                    <span class="text-[10px] text-slate-400 ml-1">({{ skuItem.total_remaining_qty }} pcs)</span>
                  </div>
                  <div class="hidden sm:block text-slate-300">|</div>
                  <div>
                    <span class="text-slate-500 font-medium">Acuan Master HPP:</span>
                    <span class="font-mono font-bold text-indigo-900 ml-1.5">{{ formatRupiah(skuItem.master_total_cogs) }}</span>
                  </div>
                </div>

                <div class="flex items-center space-x-2">
                  <span class="text-[11px] text-slate-500">Kloter Aktif FIFO:</span>
                  <span
                    class="font-mono font-bold px-2 py-0.5 rounded text-[11px]"
                    :class="[
                      skuItem.active_fifo_batch
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600',
                    ]"
                  >
                    {{ skuItem.active_fifo_batch ? skuItem.active_fifo_batch.batch_code : 'Tidak ada kloter aktif' }}
                  </span>
                </div>
              </div>

              <!-- Empty State for this SKU -->
              <div
                v-if="skuItem.batches.length === 0"
                class="p-8 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-2"
              >
                <History class="w-8 h-8 text-slate-300 mx-auto" />
                <div class="text-xs font-bold text-slate-700">Belum ada riwayat kloter stok masuk untuk SKU ini</div>
                <p class="text-[11px] text-slate-500 max-w-md mx-auto">
                  HPP saat ini menggunakan standar acuan Master HPP. Saat stok batch baru dimasukkan pada menu Stok Masuk, rincian biaya kloter akan otomatis tercatat di sini.
                </p>
                <div class="pt-2">
                  <button
                    type="button"
                    @click="router.push('/stock')"
                    class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <Plus class="w-3.5 h-3.5" />
                    <span>Input Stok Masuk</span>
                  </button>
                </div>
              </div>

              <!-- Batches Table for this SKU -->
              <div v-else class="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs whitespace-nowrap">
                    <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                      <tr>
                        <th scope="col" class="px-4 py-3">Status FIFO</th>
                        <th scope="col" class="px-3 py-3">Kode Batch</th>
                        <th scope="col" class="px-3 py-3">Tanggal Inbound</th>
                        <th scope="col" class="px-3 py-3 text-right">Qty Masuk</th>
                        <th scope="col" class="px-3 py-3 text-right">Sisa Stok</th>
                        <th scope="col" class="px-4 py-3 text-right bg-indigo-50/60 font-black text-indigo-900">
                          HPP Kloter / unit
                        </th>
                        <th scope="col" class="px-4 py-3 text-left">Komponen Biaya</th>
                        <th scope="col" class="px-3 py-3 text-right">Sisa Modal di Rak</th>
                        <th scope="col" class="px-3 py-3">Catatan / Vendor</th>
                        <th scope="col" class="px-3 py-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      <tr
                        v-for="b in skuItem.batches"
                        :key="b.id"
                        class="hover:bg-slate-50/70 transition-colors"
                        :class="[b.fifo_status === 'sedang_aktif' ? 'bg-emerald-50/30' : '']"
                      >
                        <!-- Status FIFO Badge -->
                        <td class="px-4 py-3">
                          <span
                            v-if="b.fifo_status === 'sedang_aktif'"
                            class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                          >
                            <span class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                            <span>Sedang Terpotong FIFO (Aktif)</span>
                          </span>
                          <span
                            v-else-if="b.fifo_status === 'antrean'"
                            class="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300"
                          >
                            <span>Antrean Kloter Berikutnya</span>
                          </span>
                          <span
                            v-else
                            class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200"
                          >
                            <span>Habis Terjual</span>
                          </span>
                        </td>

                        <!-- Kode Batch -->
                        <td class="px-3 py-3 font-mono font-bold text-slate-900">
                          {{ b.batch_code }}
                        </td>

                        <!-- Tanggal -->
                        <td class="px-3 py-3 text-slate-500">
                          {{ formatDate(b.batch_created_at) }}
                        </td>

                        <!-- Qty Masuk -->
                        <td class="px-3 py-3 text-right font-mono font-bold text-slate-800">
                          {{ b.qty_in }} pcs
                        </td>

                        <!-- Sisa Stok + Progress Bar -->
                        <td class="px-3 py-3 text-right font-mono font-bold">
                          <div
                            :class="[
                              b.remaining_qty > 0 ? 'text-emerald-700' : 'text-slate-400',
                            ]"
                          >
                            {{ b.remaining_qty }} pcs
                          </div>
                          <div class="w-16 bg-slate-200 h-1 rounded-full mt-1 ml-auto overflow-hidden">
                            <div
                              class="bg-emerald-500 h-full rounded-full"
                              :style="{ width: `${Math.min(100, Math.round((b.remaining_qty / b.qty_in) * 100))}%` }"
                            ></div>
                          </div>
                        </td>

                        <!-- HPP Kloter -->
                        <td class="px-4 py-3 text-right font-mono font-black bg-indigo-50/40 text-indigo-900">
                          {{ formatRupiah(b.cogs_total) }}
                        </td>

                        <!-- Komponen Biaya Chips -->
                        <td class="px-4 py-3">
                          <div class="flex items-center space-x-1.5 text-[10px]">
                            <span class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono" title="Bahan Baku Langsung">
                              BB: {{ formatRupiah(b.cogs_bahan_utama + b.cogs_aksesori + b.cogs_kemasan) }}
                            </span>
                            <span class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono" title="Tenaga Kerja">
                              TK: {{ formatRupiah(b.cogs_tenaga_kerja) }}
                            </span>
                            <span class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono" title="Overhead">
                              OVH: {{ formatRupiah(b.cogs_overhead) }}
                            </span>
                          </div>
                        </td>

                        <!-- Sisa Modal di Rak -->
                        <td class="px-3 py-3 text-right font-mono font-bold text-sky-800">
                          {{ formatRupiah(b.remaining_batch_value) }}
                        </td>

                        <!-- Catatan -->
                        <td class="px-3 py-3 text-slate-500 text-[11px] truncate max-w-[150px]">
                          {{ b.batch_notes || '-' }}
                        </td>

                        <!-- Aksi -->
                        <td class="px-3 py-3 text-center">
                          <button
                            type="button"
                            @click="selectedBatchDetail = b"
                            class="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-[10px] font-bold transition cursor-pointer"
                          >
                            <Eye class="w-3 h-3" />
                            <span>Rincian</span>
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty Filter Results -->
          <div
            v-if="filteredSkuAccordionList.length === 0"
            class="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 space-y-2"
          >
            <Boxes class="w-10 h-10 text-slate-300 mx-auto" />
            <div class="text-sm font-semibold text-slate-700">Tidak ada SKU yang sesuai filter</div>
            <p class="text-xs text-slate-500">Coba ubah kata kunci pencarian atau ganti filter status di atas.</p>
          </div>
        </div>

        <!-- ACCORDION PAGINATION -->
        <Pagination
          v-model:currentPage="accordionCurrentPage"
          v-model:pageSize="accordionPageSize"
          :totalItems="filteredSkuAccordionList.length"
        />
      </div>

        <!-- ISI CONTAINER: FLAT TABLE -->
        <div v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs whitespace-nowrap">
              <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th scope="col" class="px-4 py-3">Kode Batch</th>
                  <th scope="col" class="px-3 py-3">Tanggal Kloter</th>
                  <th scope="col" class="px-4 py-3">SKU &amp; Produk</th>
                  <th scope="col" class="px-3 py-3 text-right">Qty Masuk</th>
                  <th scope="col" class="px-3 py-3 text-right">Sisa Stok Kloter</th>
                  <th scope="col" class="px-4 py-3 text-right bg-indigo-50/60 font-black text-indigo-900">
                    HPP Kloter / unit
                  </th>
                  <th scope="col" class="px-3 py-3 text-right">Total Modal Kloter</th>
                  <th scope="col" class="px-3 py-3 text-right">Sisa Modal di Rak</th>
                  <th scope="col" class="px-3 py-3 text-center">Status</th>
                  <th scope="col" class="px-4 py-3">Catatan / Vendor</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr
                  v-for="b in paginatedBatchHistory"
                  :key="b.id"
                  class="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  @click="selectedBatchDetail = b"
                >
                  <td class="px-4 py-3 font-mono font-bold text-slate-900">{{ b.batch_code }}</td>
                  <td class="px-3 py-3 text-slate-500">{{ formatDate(b.batch_created_at) }}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center space-x-2">
                      <span
                        class="w-2.5 h-6 rounded-full shrink-0"
                        :style="{ backgroundColor: b.label_color || '#4f46e5' }"
                      ></span>
                      <div>
                        <div class="font-bold text-slate-900 font-mono text-xs">{{ b.seller_sku }}</div>
                        <div class="text-[11px] text-slate-500 truncate max-w-[180px]">{{ b.product_name }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-3 py-3 text-right font-mono font-bold text-slate-800">{{ b.qty_in }} pcs</td>
                  <td class="px-3 py-3 text-right font-mono font-bold">
                    <div
                      :class="[
                        b.remaining_qty > 0 ? 'text-emerald-700' : 'text-slate-400',
                      ]"
                    >
                      {{ b.remaining_qty }} pcs
                    </div>
                    <div class="w-16 bg-slate-200 h-1 rounded-full mt-1 ml-auto overflow-hidden">
                      <div
                        class="bg-emerald-500 h-full rounded-full"
                        :style="{ width: `${Math.min(100, Math.round((b.remaining_qty / b.qty_in) * 100))}%` }"
                      ></div>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right font-mono font-black bg-indigo-50/40 text-indigo-900">
                    {{ formatRupiah(b.cogs_total) }}
                  </td>
                  <td class="px-3 py-3 text-right font-mono text-slate-700">
                    {{ formatRupiah(b.total_batch_value) }}
                  </td>
                  <td class="px-3 py-3 text-right font-mono font-bold text-sky-800">
                    {{ formatRupiah(b.remaining_batch_value) }}
                  </td>
                  <td class="px-3 py-3 text-center">
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono inline-block"
                      :class="[
                        b.status === 'aktif'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200',
                      ]"
                    >
                      {{ b.status === 'aktif' ? 'Aktif' : 'Habis' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-500 text-[11px] truncate max-w-[200px]">
                    {{ b.batch_notes || '-' }}
                  </td>
                </tr>

                <tr v-if="filteredBatchHistory.length === 0">
                  <td colspan="10" class="px-4 py-12 text-center text-slate-400">
                    <History class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p class="text-sm font-semibold">Tidak ada riwayat kloter yang sesuai</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Pagination
            v-model:currentPage="batchCurrentPage"
            v-model:pageSize="batchPageSize"
            :totalItems="filteredBatchHistory.length"
          />
        </div>
      </div>

      <!-- MODAL DETAIL KLOTER BATCH -->
      <div
        v-if="selectedBatchDetail"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div class="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 p-6 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div class="text-xs font-bold text-slate-400 uppercase">Rincian HPP Kloter</div>
              <h3 class="text-base font-black text-slate-900 font-mono">{{ selectedBatchDetail.batch_code }}</h3>
            </div>
            <button
              type="button"
              @click="selectedBatchDetail = null"
              class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <div class="p-3 bg-slate-50 rounded-xl space-y-1">
              <div class="font-bold text-slate-900">{{ selectedBatchDetail.seller_sku }} - {{ selectedBatchDetail.product_name }}</div>
              <div class="text-[11px] text-slate-500">Tanggal Kloter: {{ formatDate(selectedBatchDetail.batch_created_at) }}</div>
              <div v-if="selectedBatchDetail.batch_notes" class="text-[11px] text-slate-600 italic">
                Catatan: {{ selectedBatchDetail.batch_notes }}
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="p-2.5 bg-slate-50 rounded-lg">
                <span class="text-slate-500 block text-[10px] uppercase font-bold">Qty Masuk</span>
                <span class="font-mono font-bold text-slate-900 text-sm">{{ selectedBatchDetail.qty_in }} pcs</span>
              </div>
              <div class="p-2.5 bg-slate-50 rounded-lg">
                <span class="text-slate-500 block text-[10px] uppercase font-bold">Sisa Stok</span>
                <span class="font-mono font-bold text-emerald-700 text-sm">{{ selectedBatchDetail.remaining_qty }} pcs</span>
              </div>
            </div>

            <div class="space-y-1.5 pt-2 border-t border-slate-100">
              <div class="flex justify-between py-1 border-b border-slate-100">
                <span class="text-slate-600">Bahan Utama:</span>
                <span class="font-mono font-semibold">{{ formatRupiah(selectedBatchDetail.cogs_bahan_utama) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-100">
                <span class="text-slate-600">Aksesori:</span>
                <span class="font-mono font-semibold">{{ formatRupiah(selectedBatchDetail.cogs_aksesori) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-100">
                <span class="text-slate-600">Kemasan:</span>
                <span class="font-mono font-semibold">{{ formatRupiah(selectedBatchDetail.cogs_kemasan) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-100">
                <span class="text-slate-600">Tenaga Kerja / Ongkos Jahit:</span>
                <span class="font-mono font-semibold">{{ formatRupiah(selectedBatchDetail.cogs_tenaga_kerja) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-slate-100">
                <span class="text-slate-600">Overhead Operasional:</span>
                <span class="font-mono font-semibold">{{ formatRupiah(selectedBatchDetail.cogs_overhead) }}</span>
              </div>
              <div class="flex justify-between py-2 bg-indigo-50 px-2.5 rounded-lg text-indigo-950 font-black">
                <span>Total Biaya (HPP Kloter):</span>
                <span class="font-mono text-sm">{{ formatRupiah(selectedBatchDetail.cogs_total) }}</span>
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              @click="selectedBatchDetail = null"
              class="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== TAB 3: REALISASI LABA RUGI ==================== -->
    <div v-else-if="activeTab === 'performance'" class="space-y-6">
      <!-- TINGKAT 3: CARD INFORMASI / KPI SUMMARY CARDS -->
      <div v-if="performanceData && perfChannel !== 'online'" class="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <!-- 1. Omzet Penjualan -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Omzet riil offline</span>
            <span class="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <DollarSign class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-slate-900 font-mono">
            {{ formatRupiah(performanceData.summary.actual_revenue) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-medium">
            
            <span v-if="perfChannel === 'offline'">{{ performanceData.summary.offline_qty_sold }} pcs offline</span>
            <span v-else>{{ performanceData.summary.offline_qty_sold }} off &bull; {{ performanceData.summary.online_qty_sold }} on</span>
          </div>
        </div>

        <!-- 2. HPP Terjual (FIFO) -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Beban HPP (FIFO)</span>
            <span class="w-7 h-7 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Calculator class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-indigo-600 font-mono">
            {{ formatRupiah(performanceData.summary.actual_cogs_fifo) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-medium">
            
            <span v-if="performanceData.summary.unallocated_offline_qty">{{ performanceData.summary.unallocated_offline_qty }} pcs tanpa kloter; HPP memakai biaya master saat alokasi.</span>
            <span v-else>Modal kloter terpakai</span>
          </div>
        </div>

        <!-- 3. Laba Bersih -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Laba Bersih</span>
            <span class="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <TrendingUp class="w-3.5 h-3.5" />
            </span>
          </div>
          <div class="text-xl font-black text-emerald-600 font-mono">
            {{ formatRupiah(performanceData.summary.actual_net_profit) }}
          </div>
          <div class="text-[10px] text-emerald-600 font-bold mt-1">
            
            <span>Margin: {{ formatPercent(performanceData.summary.actual_net_margin_percent) }}</span>
          </div>
        </div>

        <!-- 4. Variance vs Target -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div class="flex items-center justify-between text-slate-500 mb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider">Variance vs Target</span>
            <span class="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Sparkles class="w-3.5 h-3.5" />
            </span>
          </div>
          <div
            class="text-xl font-black font-mono"
            :class="[performanceData.summary.margin_variance_nominal >= 0 ? 'text-emerald-600' : 'text-rose-600']"
          >
            {{ performanceData.summary.margin_variance_nominal >= 0 ? '+' : '' }}
            {{ formatRupiah(performanceData.summary.margin_variance_nominal) }}
          </div>
          <div class="text-[10px] text-slate-400 mt-1 font-medium">
            
            <span>Target: {{ formatRupiah(performanceData.summary.expected_net_profit) }}</span>
          </div>
        </div>
      </div>

      <!-- TINGKAT 4: CONTAINER DATA INTI (TABEL & SEMUA FILTER) -->
      <div v-if="performanceData" class="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <!-- HEADER KONTROL & FILTER -->
        <div class="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50">
          <div class="flex items-center gap-2.5 flex-wrap">
            <!-- Filter Sumber Penjualan -->
            <div class="inline-flex p-1 bg-white border border-slate-200 rounded-xl space-x-1">
              <button
                type="button"
                @click="setPerfChannel('all')"
                class="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                :class="[
                  perfChannel === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                Semua
              </button>
              <button
                type="button"
                @click="setPerfChannel('offline')"
                class="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                :class="[
                  perfChannel === 'offline'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                Offline
              </button>
              <button
                type="button"
                @click="setPerfChannel('online')"
                class="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                :class="[
                  perfChannel === 'online'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                Online
              </button>
            </div>

            <!-- Filter Periode Waktu Presets -->
            <div class="inline-flex p-1 bg-white border border-slate-200 rounded-xl space-x-1">
              <button
                type="button"
                @click="applyDatePreset('today')"
                class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
                :class="[
                  perfDatePreset === 'today'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                Hari Ini
              </button>
              <button
                type="button"
                @click="applyDatePreset('7days')"
                class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
                :class="[
                  perfDatePreset === '7days'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                7 Hari
              </button>
              <button
                type="button"
                @click="applyDatePreset('month')"
                class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
                :class="[
                  perfDatePreset === 'month'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                @click="applyDatePreset('all')"
                class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
                :class="[
                  perfDatePreset === 'all'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'text-slate-600 hover:text-slate-900',
                ]"
              >
                Semua
              </button>
            </div>

            <!-- Custom Date Range -->
            <div class="flex items-center gap-1.5">
              <input
                v-model="perfStartDate"
                type="date"
                class="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                @change="perfDatePreset = 'custom'; loadPerformanceData();"
              />
              <span class="text-xs text-slate-400">s/d</span>
              <input
                v-model="perfEndDate"
                type="date"
                class="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                @change="perfDatePreset = 'custom'; loadPerformanceData();"
              />
            </div>
          </div>

          <!-- Right: Search & Count -->
          <div class="flex items-center gap-2.5">
            <div class="relative min-w-[200px]">
              <Search class="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                v-model="perfSearchQuery"
                type="text"
                placeholder="Cari SKU atau produk..."
                class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <span class="text-xs text-slate-500 font-medium whitespace-nowrap">
              {{ filteredPerfItems.length }} produk
            </span>
          </div>
        </div>

        <!-- EMPTY STATE: ONLINE -->
        <div v-if="perfChannel === 'online'" class="px-6 py-16 text-center">
          <div class="max-w-md mx-auto space-y-3">
            <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-slate-100 text-slate-500">
              <AlertCircle class="w-6 h-6" />
            </div>
            <div class="space-y-1">
              <h4 class="text-sm font-bold text-slate-900">Data belum tersedia</h4>
              <p class="text-xs text-slate-500 leading-relaxed">
                {{ performanceData?.summary.online_qty_sold ?? 0 }} pcs online dalam periode ini. Data transaksi penjualan online belum tersedia. Menunggu integrasi API TikTok Shop untuk sinkronisasi harga jual.
              </p>
            </div>
            <div class="pt-2">
              <button
                type="button"
                @click="setPerfChannel('offline')"
                class="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <span>Lihat Pesanan Offline</span>
              </button>
            </div>
          </div>
        </div>

        <!-- EMPTY STATE: NO DATA FOR FILTER -->
        <div v-else-if="filteredPerfItems.length === 0" class="px-6 py-16 text-center">
          <div class="max-w-md mx-auto space-y-2">
            <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-slate-100 text-slate-400">
              <BarChart3 class="w-6 h-6" />
            </div>
            <h4 class="text-sm font-bold text-slate-900">Tidak ada data transaksi</h4>
            <p class="text-xs text-slate-500">
              Tidak ditemukan transaksi penjualan yang sesuai dengan filter yang dipilih.
            </p>
          </div>
        </div>

        <!-- DATA TABLE -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-xs whitespace-nowrap">
            <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th scope="col" class="px-4 py-3 sticky left-0 bg-slate-50 z-10">Produk &amp; SKU</th>
                <th scope="col" class="px-3 py-3 text-center">Sumber</th>
                <th scope="col" class="px-3 py-3 text-right">Qty Terjual</th>
                <th scope="col" class="px-3 py-3 text-right">Rata Jual / unit</th>
                <th scope="col" class="px-4 py-3 text-right font-black text-slate-900">Total Omzet</th>
                <th scope="col" class="px-3 py-3 text-right bg-indigo-50/60 font-black text-indigo-900">HPP FIFO</th>
                <th scope="col" class="px-3 py-3 text-right text-sky-800">HPP MA</th>
                <th scope="col" class="px-3 py-3 text-right text-rose-600">Potongan Komisi</th>
                <th scope="col" class="px-4 py-3 text-right font-black text-emerald-800 bg-emerald-50/50">Laba Bersih</th>
                <th scope="col" class="px-3 py-3 text-right">Target</th>
                <th scope="col" class="px-3 py-3 text-right">Variance</th>
                <th scope="col" class="px-3 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="it in paginatedPerfItems" :key="it.seller_sku" class="hover:bg-slate-50/80 transition-colors">
                <td class="px-4 py-3 sticky left-0 bg-white hover:bg-slate-50/80 z-10">
                  <div class="flex items-center space-x-2">
                    <span
                      class="w-2.5 h-6 rounded-full shrink-0"
                      :style="{ backgroundColor: it.label_color || '#4f46e5' }"
                    ></span>
                    <div>
                      <div class="font-bold text-slate-900 font-mono">{{ it.seller_sku }}</div>
                      <div class="text-[11px] text-slate-500 truncate max-w-[170px]">{{ it.product_name }}</div>
                    </div>
                  </div>
                </td>
                <td class="px-3 py-3 text-center">
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-bold font-mono inline-block"
                    :class="[
                      it.channel_label === 'Offline Riil'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : it.channel_label === 'Online Estimasi'
                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200',
                    ]"
                  >
                    {{ it.channel_label === 'Offline Riil' ? 'Offline' : it.channel_label === 'Online Estimasi' ? 'Online' : 'Gabungan' }}
                  </span>
                </td>
                <td class="px-3 py-3 text-right font-mono font-bold text-slate-800">
                  {{ it.total_qty_sold }} pcs
                  <span v-if="perfChannel === 'all'" class="block text-[9px] text-slate-400 font-normal">
                    ({{ it.offline_qty_sold }} off &bull; {{ it.online_qty_sold }} on)
                  </span>
                </td>
                <td v-if="!it.offline_qty_sold" colspan="10" class="text-center text-slate-500">Nominal transaksi online belum tersedia</td>
                <template v-else>
                <td class="px-3 py-3 text-right font-mono text-slate-700">{{ formatRupiah(it.avg_selling_price) }}</td>
                <td class="px-4 py-3 text-right font-mono font-bold text-slate-900">{{ formatRupiah(it.total_revenue) }}</td>
                <td class="px-3 py-3 text-right font-mono font-black bg-indigo-50/30 text-indigo-900">
                  {{ formatRupiah(it.cogs_fifo_total) }}
                  <span class="block text-[9px] text-indigo-600 font-normal">@ {{ formatRupiah(it.cogs_fifo_per_unit) }}</span>
                </td>
                <td class="px-3 py-3 text-right font-mono text-sky-800">
                  {{ formatRupiah(it.cogs_ma_total) }}
                  <span class="block text-[9px] text-sky-600 font-normal">@ {{ formatRupiah(it.cogs_ma_per_unit) }}</span>
                </td>
                <td class="px-3 py-3 text-right font-mono">
                  <span v-if="it.total_platform_fees > 0" class="text-rose-600">
                    -{{ formatRupiah(it.total_platform_fees) }}
                  </span>
                  <span v-else class="text-slate-400 text-[10px]">
                    Rp 0
                  </span>
                </td>
                <td class="px-4 py-3 text-right font-mono font-black bg-emerald-50/40">
                  <div :class="[it.actual_net_profit >= 0 ? 'text-emerald-700' : 'text-rose-600']">
                    {{ formatRupiah(it.actual_net_profit) }}
                  </div>
                  <div class="text-[10px] text-emerald-600 font-semibold">
                    {{ formatPercent(it.actual_net_profit_percent) }}
                  </div>
                </td>
                <td class="px-3 py-3 text-right font-mono text-slate-600">{{ formatRupiah(it.expected_net_profit) }}</td>
                <td class="px-3 py-3 text-right font-mono font-bold">
                  <span :class="[it.variance_nominal >= 0 ? 'text-emerald-600' : 'text-rose-600']">
                    {{ it.variance_nominal >= 0 ? '+' : '' }}{{ formatRupiah(it.variance_nominal) }}
                  </span>
                </td>
                <td class="px-3 py-3 text-center">
                  <span
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono inline-block"
                    :class="[
                      it.status === 'di_atas_target'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200',
                    ]"
                  >
                    {{ it.status === 'di_atas_target' ? 'Di Atas Target' : 'Di Bawah Target' }}
                  </span>
                </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>

        <Pagination
          v-if="filteredPerfItems.length > 0 && perfChannel !== 'online'"
          v-model:currentPage="perfCurrentPage"
          v-model:pageSize="perfPageSize"
          :totalItems="filteredPerfItems.length"
        />
      </div>
    </div>

    <!-- MODAL EDIT MASTER HPP -->
    <div
      v-if="showEditModal && editingItem"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
      >
        <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div class="flex items-center space-x-3">
            <span
              class="w-3 h-8 rounded-full"
              :style="{ backgroundColor: editingItem.label_color || '#4f46e5' }"
            ></span>
            <div>
              <div class="flex items-center space-x-2">
                <h3 class="text-base font-black text-slate-900 font-mono">{{ editingItem.seller_sku }}</h3>
                <span
                  v-if="editingItem.category_name"
                  class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 uppercase"
                >
                  {{ editingItem.category_name }}
                </span>
              </div>
              <p class="text-xs text-slate-500">{{ editingItem.name }}</p>
            </div>
          </div>
          <button
            type="button"
            @click="showEditModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6">
          <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
            Perubahan HPP Master berlaku untuk kloter stok baru berikutnya. Riwayat modal kloter lama tetap tersimpan.
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center space-x-1.5 border-b border-slate-100 pb-2">
                <Sliders class="w-3.5 h-3.5 text-indigo-600" />
                <span>Komponen Biaya Acuan (HPP)</span>
              </h4>

              <div>
                <label class="block text-xs font-semibold text-slate-700">Bahan Utama (Rp)</label>
                <input
                  v-model.number="editForm.bahan_utama"
                  type="number"
                  min="0"
                  class="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700">Aksesori (Rp)</label>
                <input
                  v-model.number="editForm.aksesori"
                  type="number"
                  min="0"
                  class="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700">Kemasan (Rp)</label>
                <input
                  v-model.number="editForm.kemasan"
                  type="number"
                  min="0"
                  class="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700">Tenaga Kerja / Ongkos Jahit (Rp)</label>
                <input
                  v-model.number="editForm.tenaga_kerja"
                  type="number"
                  min="0"
                  class="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700">Overhead Operasional (Rp)</label>
                <input
                  v-model.number="editForm.overhead"
                  type="number"
                  min="0"
                  class="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center space-x-1.5 border-b border-slate-100 pt-2 pb-2">
                <TrendingUp class="w-3.5 h-3.5 text-emerald-600" />
                <span>Target Penjualan &amp; Komisi</span>
              </h4>

              <div>
                <label class="block text-xs font-semibold text-slate-700">Harga Jual Target (Rp)</label>
                <input
                  v-model.number="editForm.target_price"
                  type="number"
                  min="0"
                  class="mt-1 block w-full px-3 py-2 bg-indigo-50/50 border border-indigo-300 rounded-xl text-xs font-mono font-black text-indigo-950 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-700">Komisi TikTok (%)</label>
                  <input
                    v-model.number="editForm.tiktok_fee_percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    class="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-700">Target Margin (%)</label>
                  <input
                    v-model.number="editForm.target_margin_percent"
                    type="number"
                    min="0"
                    max="99.99"
                    step="1"
                    class="mt-1 block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>
            </div>

            <!-- Right Preview -->
            <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200/90 flex flex-col justify-between space-y-4">
              <div>
                <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                  <h4 class="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                    <Calculator class="w-4 h-4 text-indigo-600" />
                    <span>Hasil Simulasi Target</span>
                  </h4>
                  <span
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono"
                    :class="[
                      liveEditMetrics.gross_margin_percent >= liveEditMetrics.target_margin_percent
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800',
                    ]"
                  >
                    {{
                      liveEditMetrics.gross_margin_percent >= liveEditMetrics.target_margin_percent
                        ? 'Target Tercapai'
                        : 'Di Bawah Target'
                    }}
                  </span>
                </div>

                <div class="space-y-2.5 text-xs">
                  <div class="flex items-center justify-between py-1 border-b border-slate-200/60">
                    <span class="text-slate-500 font-medium">Bahan Baku Langsung:</span>
                    <span class="font-mono font-bold text-slate-800">{{ formatRupiah(liveEditMetrics.bb_langsung) }}</span>
                  </div>

                  <div class="flex items-center justify-between py-1.5 border-b border-slate-200 bg-indigo-50/60 px-2 rounded-lg">
                    <span class="text-indigo-900 font-bold">Total HPP Master:</span>
                    <span class="font-mono font-black text-indigo-900 text-sm">{{ formatRupiah(liveEditMetrics.total_biaya) }}</span>
                  </div>

                  <div class="flex items-center justify-between py-1 border-b border-slate-200/60">
                    <span class="text-slate-500 font-medium">Gross Margin:</span>
                    <span
                      class="font-mono font-black text-sm"
                      :class="[liveEditMetrics.gross_margin_percent >= liveEditMetrics.target_margin_percent ? 'text-emerald-600' : 'text-amber-600']"
                    >
                      {{ formatPercent(liveEditMetrics.gross_margin_percent) }}
                    </span>
                  </div>

                  <div class="flex items-center justify-between py-1 border-b border-slate-200/60">
                    <span class="text-slate-500 font-medium">Penerimaan Bersih TikTok:</span>
                    <span class="font-mono font-bold text-slate-800">{{ formatRupiah(liveEditMetrics.tiktok_payout) }}</span>
                  </div>

                  <div class="flex items-center justify-between py-2 border-b border-slate-200 bg-emerald-50/70 px-2 rounded-lg">
                    <span class="text-emerald-950 font-bold">Net Profit Target:</span>
                    <div class="text-right">
                      <div class="font-mono font-black text-emerald-800 text-sm">
                        {{ formatRupiah(liveEditMetrics.net_profit) }}
                      </div>
                      <div class="text-[10px] text-emerald-700 font-semibold">
                        {{ formatPercent(liveEditMetrics.net_profit_percent) }}
                      </div>
                    </div>
                  </div>

                  <div class="p-3 bg-sky-50 rounded-xl border border-sky-100 text-sky-950 space-y-1">
                    <div class="flex items-center justify-between font-bold">
                      <span class="text-[11px]">Harga Jual jika Margin {{ liveEditMetrics.target_margin_percent }}%:</span>
                      <span class="font-mono font-black">{{ formatRupiah(liveEditMetrics.if_target_margin_price) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            @click="showEditModal = false"
            class="px-4 py-2 bg-white text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition border border-slate-200 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="saveProductCogs"
            :disabled="isSaving"
            class="inline-flex items-center space-x-1.5 px-5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm shadow-indigo-500/20"
          >
            <RefreshCw v-if="isSaving" class="w-4 h-4 animate-spin" />
            <span v-else>Simpan Acuan Master</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL SIMULASI BEBAS -->
    <div
      v-if="showSandboxModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
      >
        <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
          <div class="flex items-center space-x-2.5">
            <div class="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-base font-black text-slate-900">Simulasi Bebas &amp; Uji Coba Margin</h3>
              <p class="text-xs text-slate-500">Hitung profitabilitas tanpa mengubah database master.</p>
            </div>
          </div>
          <button
            type="button"
            @click="showSandboxModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-5">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-slate-700">Bahan Utama (Rp)</label>
              <input v-model.number="sandboxForm.bahan_utama" type="number" class="mt-1 w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-700">Aksesori (Rp)</label>
              <input v-model.number="sandboxForm.aksesori" type="number" class="mt-1 w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-700">Kemasan (Rp)</label>
              <input v-model.number="sandboxForm.kemasan" type="number" class="mt-1 w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-700">Tenaga Kerja (Rp)</label>
              <input v-model.number="sandboxForm.tenaga_kerja" type="number" class="mt-1 w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-700">Overhead (Rp)</label>
              <input v-model.number="sandboxForm.overhead" type="number" class="mt-1 w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-700">Harga Jual (Rp)</label>
              <input v-model.number="sandboxForm.target_price" type="number" class="mt-1 w-full px-3 py-1.5 bg-indigo-50 border border-indigo-300 rounded-lg text-xs font-mono font-black text-indigo-900" />
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            @click="showSandboxModal = false"
            class="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
