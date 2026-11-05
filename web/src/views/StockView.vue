<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api, ApiError } from '../api/client';
import Pagination from '../components/Pagination.vue';

interface StockItem {
  id: number;
  seller_sku: string;
  sku_temp: string | null;
  name: string;
  category_id: number;
  category_name: string;
  image_url: string | null;
  min_stock: number;
  max_stock: number;
  total_in: number;
  unpacked: number;
  packed: number;
  shipped: number;
  total_mutations: number;
  current_stock: number;
  stock_status: 'habis' | 'menipis' | 'berlebih' | 'normal';
}

interface StockBatch {
  id: number;
  batch_code: string;
  notes: string | null;
  created_at: string;
  total_items: number;
  total_qty?: number;
}

interface StockMutation {
  id: number;
  seller_sku: string;
  product_name?: string;
  type: 'barang_rusak' | 'barang_hilang' | 'selisih_kurang';
  qty: number;
  notes: string | null;
  created_at: string;
}

const activeTab = ref<'overview' | 'batches' | 'mutations'>('overview');

const stockItems = ref<StockItem[]>([]);
const recentBatches = ref<StockBatch[]>([]);
const recentMutations = ref<StockMutation[]>([]);
const isLoading = ref(false);

const searchQuery = ref('');
const selectedCategory = ref('');
const selectedStatus = ref<'all' | 'habis' | 'menipis' | 'normal' | 'berlebih'>('all');

// Modal: Batch Stok Baru (HANYA SATU-SATUNYA CARA MENAMBAH STOK)
const showBatchModal = ref(false);
const batchNotes = ref('');
const batchItems = ref<Array<{ seller_sku: string; qty: number }>>([{ seller_sku: '', qty: 1 }]);
const isSavingBatch = ref(false);
const batchError = ref('');

// Modal: Catat Mutasi Pengurangan
const showMutationModal = ref(false);
const mutationForm = ref<{
  seller_sku: string;
  type: 'barang_rusak' | 'barang_hilang' | 'selisih_kurang';
  qty: number;
  notes: string;
}>({
  seller_sku: '',
  type: 'barang_rusak',
  qty: 1,
  notes: '',
});
const isSavingMutation = ref(false);
const mutationError = ref('');

// Modal: Ubah Stok Fisik Langsung (Direct Stock Adjustment)
const showAdjustModal = ref(false);
const adjustingItem = ref<StockItem | null>(null);
const adjustTargetStock = ref<number>(0);
const adjustNotes = ref<string>('');
const isSavingAdjust = ref(false);
const adjustError = ref('');

const adjustDiff = computed(() => {
  if (!adjustingItem.value) return 0;
  return (adjustTargetStock.value || 0) - adjustingItem.value.current_stock;
});

function openAdjustStock(item: StockItem) {
  adjustingItem.value = item;
  adjustTargetStock.value = item.current_stock;
  adjustNotes.value = '';
  adjustError.value = '';
  showAdjustModal.value = true;
}

async function submitDirectAdjustment() {
  if (!adjustingItem.value) return;
  if (adjustTargetStock.value < 0) {
    adjustError.value = 'Jumlah stok tidak boleh bernilai negatif.';
    return;
  }

  isSavingAdjust.value = true;
  adjustError.value = '';

  try {
    await api.post('/api/stock/adjust', {
      seller_sku: adjustingItem.value.seller_sku,
      target_stock: Number(adjustTargetStock.value),
      notes: adjustNotes.value.trim() || undefined,
    });
    showAdjustModal.value = false;
    await Promise.all([fetchStock(), fetchBatches(), fetchMutations()]);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      adjustError.value = err.message;
    } else {
      adjustError.value = 'Gagal menyesuaikan stok produk';
    }
  } finally {
    isSavingAdjust.value = false;
  }
}

async function fetchStock() {
  isLoading.value = true;
  try {
    const res = await api.get<{ stock?: StockItem[]; overview?: StockItem[] }>('/api/stock');
    stockItems.value = res.stock || res.overview || [];
  } catch (err) {
    console.error('Gagal mengambil data stok:', err);
  } finally {
    isLoading.value = false;
  }
}

async function fetchBatches() {
  try {
    const res = await api.get<{ batches: StockBatch[] }>('/api/stock/batches');
    recentBatches.value = res.batches || [];
  } catch (err) {
    console.error('Gagal mengambil data batch stok:', err);
  }
}

async function fetchMutations() {
  try {
    const res = await api.get<{ mutations: StockMutation[] }>('/api/stock/mutations');
    recentMutations.value = res.mutations || [];
  } catch (err) {
    console.error('Gagal mengambil data mutasi stok:', err);
  }
}

const categoriesList = computed(() => {
  const cats = new Set<string>();
  for (const it of stockItems.value) {
    if (it.category_name) cats.add(it.category_name);
  }
  return Array.from(cats).sort();
});

const filteredStock = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return stockItems.value.filter((item) => {
    if (selectedCategory.value && item.category_name !== selectedCategory.value) {
      return false;
    }
    if (selectedStatus.value !== 'all' && item.stock_status !== selectedStatus.value) {
      return false;
    }
    if (!q) return true;
    return (
      item.seller_sku.toLowerCase().includes(q) ||
      (item.sku_temp && item.sku_temp.toLowerCase().includes(q)) ||
      item.name.toLowerCase().includes(q)
    );
  });
});

// Grouped Stock per Kategori (Accordion)
interface GroupedStock {
  category_name: string;
  items: StockItem[];
  totalQty: number;
}

const groupedStock = computed<GroupedStock[]>(() => {
  const map: Record<string, GroupedStock> = {};

  for (const item of filteredStock.value) {
    const cat = item.category_name || 'Tanpa Kategori';
    if (!map[cat]) {
      map[cat] = { category_name: cat, items: [], totalQty: 0 };
    }
    map[cat].items.push(item);
    map[cat].totalQty += item.current_stock;
  }

  return Object.values(map).sort((a, b) => a.category_name.localeCompare(b.category_name));
});

// Expand / Collapse State per Kategori Stok
const collapsedStockCategories = ref<Record<string, boolean>>({});

function isStockCategoryExpanded(catName: string): boolean {
  if (searchQuery.value.trim() || selectedStatus.value !== 'all') return true;
  return !collapsedStockCategories.value[catName];
}

function toggleStockCategory(catName: string) {
  collapsedStockCategories.value[catName] = !collapsedStockCategories.value[catName];
}

function expandAllStockCategories() {
  collapsedStockCategories.value = {};
}

function collapseAllStockCategories() {
  const map: Record<string, boolean> = {};
  for (const g of groupedStock.value) {
    map[g.category_name] = true;
  }
  collapsedStockCategories.value = map;
}

// Pagination State (Tab 1: Stock Overview)
const currentPage = ref(1);
const pageSize = ref(25);

const paginatedStock = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredStock.value.slice(start, start + pageSize.value);
});

watch([searchQuery, selectedCategory, selectedStatus], () => {
  currentPage.value = 1;
});

// Pagination State (Tab 2: Batches)
const batchCurrentPage = ref(1);
const batchPageSize = ref(25);
const paginatedBatches = computed(() => {
  const start = (batchCurrentPage.value - 1) * batchPageSize.value;
  return recentBatches.value.slice(start, start + batchPageSize.value);
});

// Pagination State (Tab 3: Mutations)
const mutationCurrentPage = ref(1);
const mutationPageSize = ref(25);
const paginatedMutations = computed(() => {
  const start = (mutationCurrentPage.value - 1) * mutationPageSize.value;
  return recentMutations.value.slice(start, start + mutationPageSize.value);
});

// Summary KPIs
const summary = computed(() => {
  let totalStock = 0;
  let habisCount = 0;
  let menipisCount = 0;
  let normalCount = 0;
  let berlebihCount = 0;

  for (const it of stockItems.value) {
    totalStock += it.current_stock;
    if (it.stock_status === 'habis') habisCount++;
    else if (it.stock_status === 'menipis') menipisCount++;
    else if (it.stock_status === 'berlebih') berlebihCount++;
    else normalCount++;
  }

  return { totalStock, habisCount, menipisCount, normalCount, berlebihCount };
});

// Batch Actions
function openAddBatch() {
  batchNotes.value = '';
  batchItems.value = [{ seller_sku: stockItems.value[0]?.seller_sku || '', qty: 10 }];
  batchError.value = '';
  showBatchModal.value = true;
}

function addBatchItemRow() {
  batchItems.value.push({ seller_sku: stockItems.value[0]?.seller_sku || '', qty: 10 });
}

function removeBatchItemRow(index: number) {
  if (batchItems.value.length > 1) {
    batchItems.value.splice(index, 1);
  }
}

async function submitStockBatch() {
  const validItems = batchItems.value.filter((it) => it.seller_sku && it.qty > 0);
  if (validItems.length === 0) {
    batchError.value = 'Harap isi minimal 1 produk dengan jumlah Qty lebih dari 0.';
    return;
  }

  isSavingBatch.value = true;
  batchError.value = '';

  try {
    await api.post('/api/stock/batches', {
      notes: batchNotes.value.trim() || undefined,
      items: validItems,
    });
    showBatchModal.value = false;
    await Promise.all([fetchStock(), fetchBatches()]);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      batchError.value = err.message;
    } else {
      batchError.value = 'Gagal menyimpan batch stok baru';
    }
  } finally {
    isSavingBatch.value = false;
  }
}

// Mutation Actions
function openAddMutation(defaultSku?: string) {
  mutationForm.value = {
    seller_sku: defaultSku || stockItems.value[0]?.seller_sku || '',
    type: 'barang_rusak',
    qty: 1,
    notes: '',
  };
  mutationError.value = '';
  showMutationModal.value = true;
}

async function submitMutation() {
  if (!mutationForm.value.seller_sku) {
    mutationError.value = 'Pilih Seller SKU produk terlebih dahulu.';
    return;
  }
  if (!mutationForm.value.qty || mutationForm.value.qty <= 0) {
    mutationError.value = 'Qty pengurangan harus lebih besar dari 0.';
    return;
  }

  isSavingMutation.value = true;
  mutationError.value = '';

  try {
    await api.post('/api/stock/mutations', {
      seller_sku: mutationForm.value.seller_sku,
      type: mutationForm.value.type,
      qty: Number(mutationForm.value.qty),
      notes: mutationForm.value.notes.trim() || undefined,
    });
    showMutationModal.value = false;
    await Promise.all([fetchStock(), fetchMutations()]);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      mutationError.value = err.message;
    } else {
      mutationError.value = 'Gagal mencatat mutasi stok';
    }
  } finally {
    isSavingMutation.value = false;
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getMutationLabel(type: string) {
  switch (type) {
    case 'barang_rusak':
      return 'Barang Rusak / Cacat';
    case 'barang_hilang':
      return 'Barang Hilang';
    case 'selisih_kurang':
      return 'Selisih Kurang';
    default:
      return type;
  }
}

onMounted(() => {
  fetchStock();
  fetchBatches();
  fetchMutations();
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <!-- Header -->
    <div
      class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-5"
    >
      <div>
        <div class="flex items-center space-x-2.5">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Manajemen Stok Barang</h1>
          <span
            class="text-[10px] font-bold tracking-widest uppercase bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-2.5 py-0.5 rounded shadow-xs"
          >
            ELLITH
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          Stok real-time dihitung dari: <strong>Stok Masuk (Batch)</strong> dikurangi
          <strong>Pesanan Belum Dikemas</strong>, <strong>Siap Kirim</strong>,
          <strong>Selesai Kirim</strong>, dan <strong>Mutasi Pengurangan</strong>.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <!-- + Batch Stok Baru (Penambahan Stok) -->
        <button
          type="button"
          @click="openAddBatch"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 transition flex items-center space-x-1.5 cursor-pointer"
        >
          <svg
            class="w-4 h-4 text-emerald-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span>Batch Stok Baru</span>
        </button>

        <!-- + Catat Mutasi (Pengurangan) -->
        <button
          type="button"
          @click="openAddMutation()"
          class="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-100 transition shadow-sm flex items-center space-x-1.5 cursor-pointer"
        >
          <svg class="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4" />
          </svg>
          <span>Catat Mutasi</span>
        </button>
      </div>
    </div>

    <!-- KPI Metric Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <!-- Total Stok Tersedia -->
      <div class="bg-gradient-to-br from-slate-50/70 via-white to-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Total Stok Fisik
        </div>
        <div class="text-2xl font-extrabold text-slate-800 mt-1 font-mono tabular-nums">
          {{ summary.totalStock }} <span class="text-xs font-normal text-slate-500">pcs</span>
        </div>
      </div>

      <!-- Normal / Aman -->
      <div class="bg-gradient-to-br from-emerald-50/60 via-white to-white border border-emerald-100/80 rounded-2xl p-4 shadow-xs">
        <div
          class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center space-x-1"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Stok Normal</span>
        </div>
        <div class="text-2xl font-extrabold text-slate-800 mt-1 font-mono tabular-nums">
          {{ summary.normalCount }} <span class="text-xs font-normal text-slate-500">SKU</span>
        </div>
      </div>

      <!-- Menipis -->
      <div class="bg-gradient-to-br from-amber-50/60 via-white to-white border border-amber-100/80 rounded-2xl p-4 shadow-xs">
        <div
          class="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center space-x-1"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Stok Menipis</span>
        </div>
        <div class="text-2xl font-extrabold text-slate-800 mt-1 font-mono tabular-nums">
          {{ summary.menipisCount }} <span class="text-xs font-normal text-slate-500">SKU</span>
        </div>
      </div>

      <!-- Habis -->
      <div class="bg-gradient-to-br from-rose-50/60 via-white to-white border border-rose-100/80 rounded-2xl p-4 shadow-xs">
        <div
          class="text-[10px] font-bold uppercase tracking-wider text-rose-600 flex items-center space-x-1"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Stok Habis</span>
        </div>
        <div class="text-2xl font-extrabold text-slate-800 mt-1 font-mono tabular-nums">
          {{ summary.habisCount }} <span class="text-xs font-normal text-slate-500">SKU</span>
        </div>
      </div>

      <!-- Berlebih -->
      <div class="bg-gradient-to-br from-blue-50/60 via-white to-white border border-blue-100/80 rounded-2xl p-4 shadow-xs">
        <div
          class="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center space-x-1"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          <span>Overstock</span>
        </div>
        <div class="text-2xl font-extrabold text-slate-800 mt-1 font-mono tabular-nums">
          {{ summary.berlebihCount }} <span class="text-xs font-normal text-slate-500">SKU</span>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex border-b border-slate-200 gap-6 text-xs font-bold uppercase tracking-wider">
      <button
        type="button"
        @click="activeTab = 'overview'"
        class="pb-3 border-b-2 transition cursor-pointer"
        :class="[
          activeTab === 'overview'
            ? 'border-slate-900 text-slate-900'
            : 'border-transparent text-slate-400 hover:text-slate-700',
        ]"
      >
        Ringkasan Stok Real-Time ({{ stockItems.length }})
      </button>

      <button
        type="button"
        @click="activeTab = 'batches'"
        class="pb-3 border-b-2 transition cursor-pointer"
        :class="[
          activeTab === 'batches'
            ? 'border-slate-900 text-slate-900'
            : 'border-transparent text-slate-400 hover:text-slate-700',
        ]"
      >
        Riwayat Batch Stok Masuk ({{ recentBatches.length }})
      </button>

      <button
        type="button"
        @click="activeTab = 'mutations'"
        class="pb-3 border-b-2 transition cursor-pointer"
        :class="[
          activeTab === 'mutations'
            ? 'border-slate-900 text-slate-900'
            : 'border-transparent text-slate-400 hover:text-slate-700',
        ]"
      >
        Riwayat Mutasi Pengurangan ({{ recentMutations.length }})
      </button>
    </div>

    <!-- TAB 1: STOCK OVERVIEW TABLE -->
    <div v-if="activeTab === 'overview'" class="space-y-4">
      <!-- Filters Bar -->
      <div
        class="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between"
      >
        <div class="w-full sm:w-80 relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari Seller SKU atau Nama Produk..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition"
          />
          <svg
            class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div class="w-full sm:w-auto flex flex-wrap items-center gap-2">
          <!-- Kategori -->
          <select
            v-model="selectedCategory"
            class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">Semua Kategori</option>
            <option v-for="c in categoriesList" :key="c" :value="c">{{ c }}</option>
          </select>

          <!-- Status Kesehatan -->
          <select
            v-model="selectedStatus"
            class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="all">Semua Status Stok</option>
            <option value="habis">Stok Habis</option>
            <option value="menipis">Stok Menipis</option>
            <option value="normal">Stok Normal</option>
            <option value="berlebih">Overstock</option>
          </select>
        </div>
      </div>

      <!-- Kontrol Buka / Tutup Semua Kategori -->
      <div v-if="filteredStock.length > 0" class="flex flex-wrap items-center justify-between text-xs px-1 text-slate-500 gap-2">
        <div>
          Menampilkan <strong>{{ filteredStock.length }}</strong> SKU dalam <strong>{{ groupedStock.length }}</strong> kategori
        </div>
        <div class="flex items-center space-x-2">
          <button
            type="button"
            @click="expandAllStockCategories"
            class="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
          >
            Buka Semua
          </button>
          <span>&bull;</span>
          <button
            type="button"
            @click="collapseAllStockCategories"
            class="text-slate-600 hover:text-slate-800 font-bold hover:underline cursor-pointer"
          >
            Tutup Semua
          </button>
        </div>
      </div>

      <!-- Real-Time Stock Accordion per Kategori -->
      <div v-if="isLoading" class="bg-white border border-slate-200/80 rounded-3xl p-8 text-center text-xs text-slate-400">
        Memuat data stok real-time...
      </div>

      <div
        v-else-if="filteredStock.length === 0"
        class="bg-white border border-slate-200/80 rounded-3xl p-10 text-center text-xs text-slate-500 font-medium"
      >
        Tidak ada data stok yang sesuai dengan filter.
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="group in groupedStock"
          :key="group.category_name"
          class="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden transition-all duration-200"
        >
          <!-- Accordion Header -->
          <button
            type="button"
            @click="toggleStockCategory(group.category_name)"
            class="w-full px-5 py-4 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 border-b border-slate-100 transition cursor-pointer text-left select-none"
          >
            <div class="flex items-center space-x-3">
              <span class="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/60 text-indigo-700 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </span>
              <div>
                <h4 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                  {{ group.category_name }}
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100/70 text-indigo-800 border border-indigo-200">
                    {{ group.items.length }} SKU
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Total Stok: {{ group.totalQty.toLocaleString('id-ID') }} pcs
                  </span>
                </h4>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <span class="text-xs text-slate-400 font-medium hidden sm:inline">
                {{ isStockCategoryExpanded(group.category_name) ? 'Sembunyikan' : 'Tampilkan' }}
              </span>
              <svg
                class="w-5 h-5 text-slate-400 transform transition-transform duration-200"
                :class="isStockCategoryExpanded(group.category_name) ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          <!-- Accordion Body (Tabel SKU dalam Kategori) -->
          <div v-show="isStockCategoryExpanded(group.category_name)" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100 text-left text-xs">
              <thead class="bg-slate-50/40 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th class="px-4 py-2.5">Produk &amp; Seller SKU</th>
                  <th class="px-3 py-2.5 text-center">Stok Masuk</th>
                  <th class="px-3 py-2.5 text-center" title="Pesanan belum dikemas">Belum Dikemas</th>
                  <th class="px-3 py-2.5 text-center" title="Pesanan siap kirim">Siap Kirim</th>
                  <th class="px-3 py-2.5 text-center" title="Pesanan selesai terkirim">Selesai Kirim</th>
                  <th class="px-3 py-2.5 text-center" title="Mutasi barang rusak/hilang">Mutasi</th>
                  <th class="px-4 py-2.5 text-center">Sisa Tersedia</th>
                  <th class="px-4 py-2.5 text-center">Kesehatan Stok</th>
                  <th class="px-4 py-2.5 text-right">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr v-for="it in group.items" :key="it.id" class="hover:bg-slate-50/70 transition">
                  <!-- Produk -->
                  <td class="px-4 py-3 align-middle">
                    <div class="flex items-center space-x-3">
                      <div
                        class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center"
                      >
                        <img
                          v-if="it.image_url"
                          :src="it.image_url"
                          alt="Foto"
                          class="w-full h-full object-cover"
                        />
                        <svg
                          v-else
                          class="w-5 h-5 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <div class="font-mono font-bold text-slate-900 text-xs">
                          {{ it.seller_sku }}
                        </div>
                        <div class="font-medium text-slate-700 line-clamp-1 text-[11px]">
                          {{ it.name }}
                        </div>
                        <div v-if="it.sku_temp" class="text-[10px] text-slate-400 font-mono">
                          Alias: {{ it.sku_temp }}
                        </div>
                      </div>
                    </div>
                  </td>

                  <!-- Stok Masuk -->
                  <td class="px-3 py-3 align-middle text-center font-mono font-bold text-slate-800">
                    +{{ it.total_in.toLocaleString('id-ID') }}
                  </td>

                  <!-- Belum Dikemas -->
                  <td
                    class="px-3 py-3 align-middle text-center font-mono text-amber-700 font-bold bg-amber-50/40"
                  >
                    {{ it.unpacked > 0 ? `-${it.unpacked}` : '-' }}
                  </td>

                  <!-- Siap Kirim -->
                  <td
                    class="px-3 py-3 align-middle text-center font-mono text-blue-700 font-bold bg-blue-50/40"
                  >
                    {{ it.packed > 0 ? `-${it.packed}` : '-' }}
                  </td>

                  <!-- Selesai Kirim -->
                  <td class="px-3 py-3 align-middle text-center font-mono text-slate-600">
                    {{ it.shipped > 0 ? `-${it.shipped}` : '-' }}
                  </td>

                  <!-- Mutasi -->
                  <td class="px-3 py-3 align-middle text-center font-mono text-rose-600 font-bold">
                    {{ it.total_mutations > 0 ? `-${it.total_mutations}` : '-' }}
                  </td>

                  <!-- Sisa Tersedia -->
                  <td class="px-4 py-3 align-middle text-center whitespace-nowrap">
                    <div
                      class="font-mono font-black text-sm px-2.5 py-1 rounded-xl inline-block"
                      :class="[
                        it.current_stock <= 0
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : it.current_stock < it.min_stock
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-200',
                      ]"
                    >
                      {{ it.current_stock.toLocaleString('id-ID') }} pcs
                    </div>
                  </td>

                  <!-- Kesehatan Stok -->
                  <td class="px-4 py-3 align-middle text-center whitespace-nowrap">
                    <span
                      v-if="it.stock_status === 'habis'"
                      class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center space-x-1"
                    >
                      <span class="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                      <span>Stok Habis</span>
                    </span>
                    <span
                      v-else-if="it.stock_status === 'menipis'"
                      class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center space-x-1"
                    >
                      <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                      <span>Menipis (&lt; {{ it.min_stock }})</span>
                    </span>
                    <span
                      v-else-if="it.stock_status === 'berlebih'"
                      class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 inline-flex items-center space-x-1"
                    >
                      <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      <span>Overstock (&gt; {{ it.max_stock }})</span>
                    </span>
                    <span
                      v-else
                      class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center space-x-1"
                    >
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      <span>Aman / Normal</span>
                    </span>
                  </td>

                  <!-- Aksi Cepat: Edit Stok & Mutasi -->
                  <td class="px-4 py-3 align-middle text-right whitespace-nowrap">
                    <div class="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        @click="openAdjustStock(it)"
                        class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                        title="Ubah jumlah stok fisik secara langsung"
                      >
                        Edit Stok
                      </button>
                      <span class="text-slate-200">|</span>
                      <button
                        type="button"
                        @click="openAddMutation(it.seller_sku)"
                        class="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                        title="Catat mutasi pengurangan untuk item ini"
                      >
                        Mutasi
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: STOCK BATCHES LIST -->
    <div v-if="activeTab === 'batches'" class="space-y-4">
      <div class="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
        <h3 class="text-sm font-bold uppercase tracking-wider text-slate-900 mb-1">
          Riwayat Batch Stok Masuk
        </h3>
        <p class="text-xs text-slate-500 mb-4">
          Setiap penambahan stok produk tercatat melalui nomor batch dan keterangan opsional.
        </p>

        <div v-if="recentBatches.length === 0" class="text-xs text-slate-400 py-6 text-center">
          Belum ada batch stok masuk yang dicatat.
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100 text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
              <tr>
                <th class="px-4 py-3">Kode Batch</th>
                <th class="px-4 py-3">Keterangan / Catatan</th>
                <th class="px-4 py-3 text-center">Total Item Ditambahkan</th>
                <th class="px-4 py-3 text-right">Waktu Input</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="b in paginatedBatches" :key="b.id" class="hover:bg-slate-50">
                <td class="px-4 py-3 font-mono font-bold text-slate-900">{{ b.batch_code }}</td>
                <td class="px-4 py-3 text-slate-700">{{ b.notes || '-' }}</td>
                <td class="px-4 py-3 text-center font-mono font-bold text-emerald-700">
                  +{{ (b.total_qty ?? b.total_items).toLocaleString('id-ID') }} pcs
                </td>
                <td class="px-4 py-3 text-right text-slate-500 font-mono">
                  {{ formatDate(b.created_at) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <Pagination
          v-model:currentPage="batchCurrentPage"
          v-model:pageSize="batchPageSize"
          :totalItems="recentBatches.length"
        />
      </div>
    </div>

    <!-- TAB 3: STOCK MUTATIONS LIST -->
    <div v-if="activeTab === 'mutations'" class="space-y-4">
      <div class="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
        <h3 class="text-sm font-bold uppercase tracking-wider text-slate-900 mb-1">
          Riwayat Mutasi Pengurangan
        </h3>
        <p class="text-xs text-slate-500 mb-4">
          Catatan mutasi pengurangan fisik (barang rusak, barang hilang, selisih kurang).
        </p>

        <div v-if="recentMutations.length === 0" class="text-xs text-slate-400 py-6 text-center">
          Belum ada mutasi stok yang tercatat.
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100 text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
              <tr>
                <th class="px-4 py-3">Seller SKU</th>
                <th class="px-4 py-3">Jenis Mutasi</th>
                <th class="px-4 py-3 text-center">Jumlah Pengurangan</th>
                <th class="px-4 py-3">Alasan / Catatan</th>
                <th class="px-4 py-3 text-right">Waktu Input</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="m in paginatedMutations" :key="m.id" class="hover:bg-slate-50">
                <td class="px-4 py-3 font-mono font-bold text-slate-900">{{ m.seller_sku }}</td>
                <td class="px-4 py-3">
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                  >
                    {{ getMutationLabel(m.type) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-center font-mono font-bold text-rose-600">
                  -{{ m.qty }} pcs
                </td>
                <td class="px-4 py-3 text-slate-700">{{ m.notes || '-' }}</td>
                <td class="px-4 py-3 text-right text-slate-500 font-mono">
                  {{ formatDate(m.created_at) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <Pagination
          v-model:currentPage="mutationCurrentPage"
          v-model:pageSize="mutationPageSize"
          :totalItems="recentMutations.length"
        />
      </div>
    </div>

    <!-- MODAL: BATCH STOK BARU (PENAMBAHAN STOK) -->
    <div
      v-if="showBatchModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 p-6 space-y-4"
      >
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span
              class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-xs shadow-indigo-500/20"
              >+</span
            >
            <h3 class="text-base font-bold text-slate-900">Buat Batch Stok Baru</h3>
          </div>
          <button
            type="button"
            @click="showBatchModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div
          v-if="batchError"
          class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold"
        >
          {{ batchError }}
        </div>

        <div class="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-600">
          <strong class="text-slate-900">Ketentuan Stok:</strong> Penambahan stok barang hanya dapat
          dilakukan dengan membuat batch stok baru.
        </div>

        <form @submit.prevent="submitStockBatch" class="space-y-4">
          <!-- Keterangan Batch (Opsional) -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Keterangan / Catatan Batch (Opsional)
            </label>
            <input
              v-model="batchNotes"
              type="text"
              placeholder="cth: Kiriman dari penjahit Sukma Kloter 3"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <!-- Item Rows -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Daftar Produk &amp; Jumlah Tambahan
              </label>
              <button
                type="button"
                @click="addBatchItemRow"
                class="text-xs font-bold text-slate-900 hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <span>Tambah Baris</span>
              </button>
            </div>

            <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
              <div
                v-for="(row, idx) in batchItems"
                :key="idx"
                class="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200"
              >
                <!-- Seller SKU Dropdown -->
                <select
                  v-model="row.seller_sku"
                  required
                  class="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="" disabled>-- Pilih Seller SKU --</option>
                  <option v-for="p in stockItems" :key="p.id" :value="p.seller_sku">
                    {{ p.seller_sku }} - {{ p.name }}
                  </option>
                </select>

                <!-- Qty Input -->
                <div class="w-24">
                  <input
                    v-model.number="row.qty"
                    type="number"
                    min="1"
                    required
                    placeholder="Qty"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <!-- Hapus Baris -->
                <button
                  type="button"
                  @click="removeBatchItemRow(idx)"
                  class="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  title="Hapus baris"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Buttons -->
          <div class="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              @click="showBatchModal = false"
              class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSavingBatch"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
            >
              <span v-if="isSavingBatch">Menyimpan Batch...</span>
              <span v-else>Simpan Batch Stok</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: CATAT MUTASI PENGURANGAN -->
    <div
      v-if="showMutationModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-200 p-6 space-y-4"
      >
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span
              class="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs font-bold"
              >-</span
            >
            <h3 class="text-base font-bold text-slate-900">Catat Mutasi Pengurangan</h3>
          </div>
          <button
            type="button"
            @click="showMutationModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div
          v-if="mutationError"
          class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold"
        >
          {{ mutationError }}
        </div>

        <form @submit.prevent="submitMutation" class="space-y-3.5">
          <!-- Pilih Produk -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Seller SKU <span class="text-rose-600">*</span>
            </label>
            <select
              v-model="mutationForm.seller_sku"
              required
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="" disabled>-- Pilih Produk --</option>
              <option v-for="p in stockItems" :key="p.id" :value="p.seller_sku">
                {{ p.seller_sku }} - {{ p.name }}
              </option>
            </select>
          </div>

          <!-- Jenis Mutasi (Pengurangan) -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Jenis Pengurangan <span class="text-rose-600">*</span>
            </label>
            <select
              v-model="mutationForm.type"
              required
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="barang_rusak">Barang Rusak / Cacat Jahitan</option>
              <option value="barang_hilang">Barang Hilang</option>
              <option value="selisih_kurang">Selisih Kurang (Stock Opname)</option>
            </select>
          </div>

          <!-- Qty -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Jumlah Pengurangan (Pcs) <span class="text-rose-600">*</span>
            </label>
            <input
              v-model.number="mutationForm.qty"
              type="number"
              min="1"
              required
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <!-- Alasan / Catatan (Opsional) -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Alasan / Keterangan Mutasi (Opsional)
            </label>
            <textarea
              v-model="mutationForm.notes"
              rows="2"
              placeholder="cth: Resleting sobek saat quality control"
              class="mt-1 block w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            ></textarea>
          </div>

          <div class="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              @click="showMutationModal = false"
              class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSavingMutation"
              class="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
            >
              <span v-if="isSavingMutation">Mencatat...</span>
              <span v-else>Kurangi Stok</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: UBAH JUMLAH STOK FISIK LANGSUNG -->
    <div
      v-if="showAdjustModal && adjustingItem"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-indigo-200 p-6 space-y-4"
      >
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span
              class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </span>
            <h3 class="text-base font-bold text-slate-900">Ubah Jumlah Stok Fisik</h3>
          </div>
          <button
            type="button"
            @click="showAdjustModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div
          v-if="adjustError"
          class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold"
        >
          {{ adjustError }}
        </div>

        <!-- Info Produk -->
        <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-slate-500 font-medium">Seller SKU:</span>
            <span class="font-mono font-bold text-slate-900">{{ adjustingItem.seller_sku }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-500 font-medium">Nama Produk:</span>
            <span class="font-bold text-slate-800 truncate max-w-[220px]" :title="adjustingItem.name">
              {{ adjustingItem.name }}
            </span>
          </div>
          <div class="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
            <span class="text-slate-500 font-medium">Stok Fisik Saat Ini:</span>
            <span class="font-mono font-black text-slate-900">{{ adjustingItem.current_stock.toLocaleString('id-ID') }} pcs</span>
          </div>
        </div>

        <form @submit.prevent="submitDirectAdjustment" class="space-y-4">
          <!-- Input Stok Baru -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Jumlah Stok Baru (Pcs) <span class="text-indigo-600">*</span>
            </label>
            <input
              v-model.number="adjustTargetStock"
              type="number"
              min="0"
              required
              class="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Ketik total stok fisik riil..."
            />
          </div>

          <!-- Indikator Selisih Otomatis -->
          <div
            class="p-3 rounded-2xl text-xs border"
            :class="[
              adjustDiff > 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : adjustDiff < 0
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
            ]"
          >
            <div class="font-bold flex items-center justify-between">
              <span>Perubahan Kuantitas:</span>
              <span class="font-mono font-black">
                {{ adjustDiff > 0 ? `+${adjustDiff}` : adjustDiff }} pcs
              </span>
            </div>
            <div class="text-[11px] mt-1 leading-relaxed">
              <span v-if="adjustDiff > 0">
                &bull; Stok bertambah. Perubahan akan <strong>dicatat otomatis di Riwayat Batch Stok Masuk</strong>.
              </span>
              <span v-else-if="adjustDiff < 0">
                &bull; Stok berkurang. Perubahan akan <strong>dicatat otomatis di Riwayat Mutasi Pengurangan</strong>.
              </span>
              <span v-else>
                &bull; Tidak ada perubahan kuantitas stok fisik.
              </span>
            </div>
          </div>

          <!-- Keterangan / Catatan (Opsional) -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Keterangan / Catatan (Opsional)
            </label>
            <input
              v-model="adjustNotes"
              type="text"
              placeholder="cth: Penyesuaian stok opname fisik mingguan"
              class="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <!-- Tombol Aksi -->
          <div class="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              @click="showAdjustModal = false"
              class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSavingAdjust"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
            >
              <span v-if="isSavingAdjust">Menyimpan...</span>
              <span v-else>Simpan Perubahan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
