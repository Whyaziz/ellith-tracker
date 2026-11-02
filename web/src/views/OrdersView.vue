<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api/client';

interface Batch {
  id: number;
  name: string;
}

interface OrderItem {
  id: number;
  product_name: string;
  sku: string;
  seller_sku: string | null;
  qty: number;
}

interface Order {
  id: number;
  batch_id: number;
  resi: string;
  order_id: string; // Strictly 18-digit string
  courier: string;
  service: string;
  is_cod: boolean;
  weight_kg: number;
  ship_date: string | null;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_address: string;
  sorting_code: string | null;
  status: string;
  is_packed: boolean;
  packed_at: string | null;
  is_shipped: boolean;
  shipped_at: string | null;
  qty_total: number | null;
  needs_review: boolean;
  validation_notes: string | null;
  created_at: string;
  items: OrderItem[];
}

const route = useRoute();

const orders = ref<Order[]>([]);
const batches = ref<Batch[]>([]);
const isLoading = ref(false);

const selectedBatchId = ref<number | ''>('');
const selectedTab = ref<'all' | 'unpacked' | 'packed' | 'shipped'>('all');
const searchQuery = ref('');

// Copy feedback
const copiedResi = ref(false);

// Detail Modal State
const selectedOrder = ref<Order | null>(null);
const showDetailModal = ref(false);

function openDetail(order: Order) {
  selectedOrder.value = order;
  showDetailModal.value = true;
  copiedResi.value = false;
}

function closeDetail() {
  selectedOrder.value = null;
  showDetailModal.value = false;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    copiedResi.value = true;
    setTimeout(() => {
      copiedResi.value = false;
    }, 2000);
  });
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showDetailModal.value) {
    closeDetail();
  }
}

// Statistics
const stats = computed(() => {
  const total = orders.value.length;
  const unpacked = orders.value.filter((o) => !o.is_packed).length;
  const packed = orders.value.filter((o) => o.is_packed && !o.is_shipped).length;
  const shipped = orders.value.filter((o) => o.is_shipped).length;
  return { total, unpacked, packed, shipped };
});

// Filtered list
const filteredOrders = computed(() => {
  return orders.value.filter((order) => {
    // Tab filter
    if (selectedTab.value === 'unpacked' && order.is_packed) return false;
    if (selectedTab.value === 'packed' && (!order.is_packed || order.is_shipped)) return false;
    if (selectedTab.value === 'shipped' && !order.is_shipped) return false;

    // Search query filter
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const matchResi = order.resi.toLowerCase().includes(q);
      const matchOrderId = order.order_id.toLowerCase().includes(q);
      const matchName = order.recipient_name.toLowerCase().includes(q);
      const matchSorting = (order.sorting_code || '').toLowerCase().includes(q);
      const matchItem = order.items.some(
        (it) =>
          it.product_name.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          (it.seller_sku && it.seller_sku.toLowerCase().includes(q))
      );
      return matchResi || matchOrderId || matchName || matchSorting || matchItem;
    }

    return true;
  });
});

async function fetchBatches() {
  try {
    const res = await api.get<{ batches: Batch[] }>('/api/batches');
    batches.value = res.batches;
  } catch (err) {
    console.error('Gagal mengambil daftar batch:', err);
  }
}

async function fetchOrders() {
  isLoading.value = true;
  try {
    const params = new URLSearchParams();
    if (selectedBatchId.value !== '') {
      params.append('batch_id', selectedBatchId.value.toString());
    }

    const res = await api.get<{ orders: Order[]; total: number }>(
      `/api/orders?${params.toString()}`
    );
    orders.value = res.orders;
  } catch (err) {
    console.error('Gagal mengambil pesanan:', err);
  } finally {
    isLoading.value = false;
  }
}

function formatDate(isoStr: string | null) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

watch(selectedBatchId, () => {
  fetchOrders();
});

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  await fetchBatches();
  if (route.query.batch_id) {
    selectedBatchId.value = Number(route.query.batch_id);
  }
  await fetchOrders();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <!-- Header with ELLITH Branding & Action Buttons -->
    <div
      class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-5"
    >
      <div>
        <div class="flex items-center space-x-2.5">
          <h1 class="text-2xl font-black text-slate-900 tracking-tight">
            Daftar Pesanan &amp; Status Resi
          </h1>
          <span
            class="text-[10px] font-black tracking-widest uppercase bg-slate-900 text-white px-2 py-0.5 rounded"
          >
            ELLITH
          </span>
        </div>
      </div>

      <!-- Action Buttons: Refresh, Export, + Upload -->
      <div class="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
        <button
          type="button"
          @click="fetchOrders"
          :disabled="isLoading"
          class="whitespace-nowrap shrink-0 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition shadow-sm flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          title="Muat ulang data pesanan"
        >
          <svg
            class="w-4 h-4 text-slate-500 shrink-0"
            :class="{ 'animate-spin': isLoading }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span class="whitespace-nowrap">Segarkan</span>
        </button>

        <RouterLink
          to="/export"
          class="whitespace-nowrap shrink-0 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition shadow-sm flex items-center space-x-1.5 cursor-pointer"
        >
          <svg
            class="w-4 h-4 text-slate-500 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          <span class="whitespace-nowrap">Export</span>
        </RouterLink>

        <RouterLink
          to="/upload"
          class="whitespace-nowrap shrink-0 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 active:bg-black transition shadow-sm shadow-slate-900/10 flex items-center space-x-1.5 cursor-pointer"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span class="whitespace-nowrap">Unggah PDF</span>
        </RouterLink>
      </div>
    </div>

    <!-- Quick Stats Bento Grid (Clickable to Filter) -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <!-- Total -->
      <button
        type="button"
        @click="selectedTab = 'all'"
        class="bg-white p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer shadow-sm hover:shadow"
        :class="
          selectedTab === 'all'
            ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50/50'
            : 'border-slate-200 hover:border-slate-300'
        "
      >
        <div class="flex items-center justify-between">
          <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Pesanan</p>
          <span class="w-2 h-2 rounded-full bg-slate-400"></span>
        </div>
        <p class="text-2xl font-black text-slate-900 mt-1 font-mono">{{ stats.total }}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Semua data resi aktif</p>
      </button>

      <!-- Belum Dikemas -->
      <button
        type="button"
        @click="selectedTab = 'unpacked'"
        class="p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer shadow-sm hover:shadow"
        :class="
          selectedTab === 'unpacked'
            ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/40'
            : 'bg-white border-amber-200/80 hover:border-amber-300'
        "
      >
        <div class="flex items-center justify-between">
          <p class="text-[11px] font-bold uppercase tracking-wider text-amber-800">Belum Dikemas</p>
          <span class="relative flex h-2 w-2">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"
            ></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
        </div>
        <p class="text-2xl font-black text-amber-600 mt-1 font-mono">{{ stats.unpacked }}</p>
        <p class="text-[11px] text-amber-700/70 mt-0.5">Menunggu packing barang</p>
      </button>

      <!-- Siap Kirim (Sudah Packing) -->
      <button
        type="button"
        @click="selectedTab = 'packed'"
        class="p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer shadow-sm hover:shadow"
        :class="
          selectedTab === 'packed'
            ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/40'
            : 'bg-white border-blue-200/80 hover:border-blue-300'
        "
      >
        <div class="flex items-center justify-between">
          <p class="text-[11px] font-bold uppercase tracking-wider text-blue-800">Siap Kirim</p>
          <span class="w-2 h-2 rounded-full bg-blue-500"></span>
        </div>
        <p class="text-2xl font-black text-blue-600 mt-1 font-mono">{{ stats.packed }}</p>
        <p class="text-[11px] text-blue-700/70 mt-0.5">Selesai dikemas (Packing)</p>
      </button>

      <!-- Selesai Dikirim -->
      <button
        type="button"
        @click="selectedTab = 'shipped'"
        class="p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer shadow-sm hover:shadow"
        :class="
          selectedTab === 'shipped'
            ? 'border-emerald-600 ring-2 ring-emerald-600/20 bg-emerald-50/40'
            : 'bg-white border-emerald-200/80 hover:border-emerald-300'
        "
      >
        <div class="flex items-center justify-between">
          <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Selesai Dikirim
          </p>
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
        </div>
        <p class="text-2xl font-black text-emerald-600 mt-1 font-mono">{{ stats.shipped }}</p>
        <p class="text-[11px] text-emerald-700/70 mt-0.5">Diserahkan ke kurir J&amp;T</p>
      </button>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <!-- Status Filter Tabs -->
        <div class="flex space-x-1 bg-slate-100/80 p-1 rounded-xl overflow-x-auto shrink-0">
          <button
            type="button"
            @click="selectedTab = 'all'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer"
            :class="[
              selectedTab === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ]"
          >
            Semua ({{ stats.total }})
          </button>
          <button
            type="button"
            @click="selectedTab = 'unpacked'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer"
            :class="[
              selectedTab === 'unpacked'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ]"
          >
            Belum Dikemas ({{ stats.unpacked }})
          </button>
          <button
            type="button"
            @click="selectedTab = 'packed'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer"
            :class="[
              selectedTab === 'packed'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ]"
          >
            Siap Kirim ({{ stats.packed }})
          </button>
          <button
            type="button"
            @click="selectedTab = 'shipped'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer"
            :class="[
              selectedTab === 'shipped'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ]"
          >
            Selesai Kirim ({{ stats.shipped }})
          </button>
        </div>

        <!-- Right Side: Batch Picker & Search Bar -->
        <div
          class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 md:justify-end"
        >
          <!-- Batch Selector Dropdown -->
          <div class="relative shrink-0">
            <select
              v-model="selectedBatchId"
              class="w-full sm:w-auto px-3.5 py-2 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer transition"
            >
              <option value="">Semua Batch Upload</option>
              <option v-for="b in batches" :key="b.id" :value="b.id">
                Batch #{{ b.id }} - {{ b.name }}
              </option>
            </select>
          </div>

          <!-- Search Input with Clear Button -->
          <div class="relative flex-1 max-w-md">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari Resi, Order ID, Penerima, SKU..."
              class="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition"
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
            <button
              v-if="searchQuery"
              type="button"
              @click="searchQuery = ''"
              class="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Bersihkan pencarian"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Orders Table (Compact, High Contrast, Legible Multi-Item Support) -->
    <div class="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      <!-- Loading State -->
      <div v-if="isLoading" class="p-16 text-center text-slate-400">
        <svg
          class="animate-spin w-8 h-8 text-slate-800 mx-auto mb-3"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <p class="text-xs font-bold text-slate-600">Memuat data pesanan...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredOrders.length === 0" class="p-16 text-center text-slate-500">
        <div
          class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400"
        >
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p class="text-sm font-bold text-slate-800">Tidak ada pesanan yang sesuai</p>
        <p class="text-xs text-slate-400 mt-1">
          Coba sesuaikan kata kunci pencarian atau pilih filter batch/status lain.
        </p>
      </div>

      <!-- Table View -->
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-left text-xs border-collapse">
          <thead
            class="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200/80"
          >
            <tr>
              <th class="px-3.5 py-3 w-[145px] whitespace-nowrap">No. Resi</th>
              <th class="px-3.5 py-3 min-w-[210px]">Judul Barang</th>
              <th class="px-3 py-3 w-[115px]">SKU</th>
              <th class="px-3 py-3 w-[105px]">SKU Penjual</th>
              <th class="px-2 py-3 w-[55px] text-center">Qty</th>
              <th class="px-3.5 py-3 w-[210px]">Data Penerima</th>
              <th class="px-2.5 py-3 w-[105px] text-center">Status Packing</th>
              <th class="px-2.5 py-3 w-[95px] text-center">Status Kirim</th>
              <th class="px-2.5 py-3 w-[50px] text-center">Aksi</th>
            </tr>
          </thead>

          <!-- Setiap Pesanan Dibungkus dalam 1 Tbody -->
          <tbody
            v-for="order in filteredOrders"
            :key="order.resi"
            @click="openDetail(order)"
            class="border-b-2 border-slate-200/70 hover:bg-slate-50/70 transition-colors cursor-pointer group"
          >
            <!-- Baris Pertama: Memuat Item Pertama + Kolom Bersama (Resi, Penerima, Status) -->
            <tr>
              <!-- 1. No. Resi -->
              <td
                :rowspan="Math.max(1, order.items.length)"
                class="px-3.5 py-3 w-[145px] align-top whitespace-nowrap bg-white group-hover:bg-slate-50/70 border-r border-slate-100 transition-colors"
              >
                <div
                  class="font-bold text-slate-900 font-mono text-xs group-hover:text-blue-700 transition-colors"
                >
                  {{ order.resi }}
                </div>
                <div class="flex items-center space-x-1 mt-1 flex-wrap gap-y-1">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    J&amp;T {{ order.service }}
                  </span>
                  <span
                    v-if="order.is_cod"
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
                  >
                    COD
                  </span>
                </div>
                <div v-if="order.items.length > 1" class="mt-1">
                  <span
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    {{ order.items.length }} Barang ({{
                      order.items.reduce((s, it) => s + it.qty, 0)
                    }}
                    pcs)
                  </span>
                </div>
                <div v-if="order.needs_review" class="mt-1">
                  <span
                    class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                    :title="order.validation_notes || 'Kuantitas item tidak cocok'"
                  >
                    ⚠️ Periksa
                  </span>
                </div>
              </td>

              <!-- 2. Judul Barang (Item 1) -->
              <td class="px-3.5 py-3 align-top font-medium text-slate-800 leading-snug">
                {{ order.items[0]?.product_name ?? '-' }}
              </td>

              <!-- 3. SKU (Item 1) -->
              <td class="px-3 py-3 w-[115px] align-top">
                <span
                  v-if="order.items[0]"
                  class="inline-block bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border border-slate-200 break-words max-w-full"
                  :title="order.items[0].sku"
                >
                  {{ order.items[0].sku }}
                </span>
                <span v-else class="text-slate-400">-</span>
              </td>

              <!-- 4. SKU Penjual (Item 1) -->
              <td
                class="px-3 py-3 w-[105px] align-top font-mono text-[11px] text-slate-600 truncate"
                :title="order.items[0]?.seller_sku || '-'"
              >
                {{ order.items[0]?.seller_sku || '-' }}
              </td>

              <!-- 5. Qty (Item 1) -->
              <td class="px-2 py-3 w-[55px] align-top text-center whitespace-nowrap">
                <span
                  v-if="order.items[0]"
                  class="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md font-black text-xs bg-slate-100 text-slate-900 border border-slate-200 font-mono"
                >
                  {{ order.items[0].qty }}
                </span>
                <span v-else class="text-slate-400">-</span>
              </td>

              <!-- 6. Data Penerima -->
              <td
                :rowspan="Math.max(1, order.items.length)"
                class="px-3.5 py-3 w-[210px] align-top bg-white group-hover:bg-slate-50/70 border-l border-slate-100 transition-colors"
              >
                <div class="font-bold text-slate-900 truncate" :title="order.recipient_name">
                  {{ order.recipient_name }}
                </div>
                <div
                  v-if="order.recipient_phone"
                  class="text-slate-500 font-mono text-[11px] mt-0.5"
                >
                  {{ order.recipient_phone }}
                </div>
                <div
                  class="text-slate-500 text-[11px] line-clamp-2 mt-0.5"
                  :title="order.recipient_address"
                >
                  {{ order.recipient_address }}
                </div>
              </td>

              <!-- 7. Status Packing -->
              <td
                :rowspan="Math.max(1, order.items.length)"
                class="px-2.5 py-3 w-[105px] align-top text-center whitespace-nowrap bg-white group-hover:bg-slate-50/70 transition-colors"
              >
                <span
                  v-if="order.is_packed"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  Dikemas
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60"
                >
                  Menunggu
                </span>
              </td>

              <!-- 8. Status Kirim -->
              <td
                :rowspan="Math.max(1, order.items.length)"
                class="px-2.5 py-3 w-[95px] align-top text-center whitespace-nowrap bg-white group-hover:bg-slate-50/70 transition-colors"
              >
                <span
                  v-if="order.is_shipped"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200/80"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  Dikirim
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500"
                >
                  Belum
                </span>
              </td>

              <!-- Aksi Detail Button -->
              <td
                :rowspan="Math.max(1, order.items.length)"
                class="px-2.5 py-3 w-[50px] align-top text-center whitespace-nowrap bg-white group-hover:bg-slate-50/70 transition-colors"
              >
                <button
                  type="button"
                  @click.stop="openDetail(order)"
                  class="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                  title="Lihat Detail Lengkap"
                  aria-label="Lihat Detail Lengkap"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </td>
            </tr>

            <!-- Baris Sub-Item ke-2, ke-3, dst. dengan Batas Garis Putus-putus -->
            <tr
              v-for="(item, idx) in order.items.slice(1)"
              :key="idx"
              class="border-t border-slate-200/80 border-dashed bg-slate-50/40 transition-colors group-hover:bg-slate-50/70"
            >
              <!-- 2. Judul Barang -->
              <td class="px-3.5 py-2.5 align-top font-medium text-slate-800 leading-snug">
                {{ item.product_name }}
              </td>

              <!-- 3. SKU -->
              <td class="px-3 py-2.5 w-[115px] align-top">
                <span
                  class="inline-block bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border border-slate-200 break-words max-w-full"
                  :title="item.sku"
                >
                  {{ item.sku }}
                </span>
              </td>

              <!-- 4. SKU Penjual -->
              <td
                class="px-3 py-2.5 w-[105px] align-top font-mono text-[11px] text-slate-600 truncate"
                :title="item.seller_sku || '-'"
              >
                {{ item.seller_sku || '-' }}
              </td>

              <!-- 5. Qty -->
              <td class="px-2 py-2.5 w-[55px] align-top text-center whitespace-nowrap">
                <span
                  class="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md font-black text-xs bg-slate-100 text-slate-900 border border-slate-200 font-mono"
                >
                  {{ item.qty }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL DETAIL LENGKAP PESANAN -->
    <div
      v-if="showDetailModal && selectedOrder"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      @click.self="closeDetail"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col"
      >
        <!-- Modal Header with ELLITH Style -->
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-3">
            <div
              class="h-9 w-9 rounded-xl bg-white border border-slate-700 shadow-sm flex items-center justify-center p-1 overflow-hidden shrink-0"
            >
              <img src="/logo.jpg" alt="ELLITH" class="h-full w-full object-contain" />
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h3 class="text-base font-extrabold tracking-tight">Detail Pesanan &amp; Resi</h3>
                <span
                  class="text-[9px] font-black uppercase bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded"
                  >ELLITH</span
                >
              </div>
              <p class="text-xs text-slate-400 font-mono mt-0.5">
                No. Resi: {{ selectedOrder.resi }}
              </p>
            </div>
          </div>

          <button
            type="button"
            @click="closeDetail"
            class="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            aria-label="Tutup jendela detail"
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

        <!-- Modal Body (Scrollable) -->
        <div class="p-6 space-y-5 overflow-y-auto flex-1 text-sm text-slate-800">
          <!-- Primary Resi & Courier Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- No Resi & TikTok ID -->
            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500"
                  >Nomor Resi J&amp;T</span
                >
                <button
                  type="button"
                  @click="copyToClipboard(selectedOrder.resi)"
                  class="text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                >
                  <span v-if="copiedResi" class="text-emerald-600">Tersalin ✓</span>
                  <span v-else>Salin</span>
                </button>
              </div>
              <div class="text-xl font-black font-mono text-slate-900 mt-1 select-all">
                {{ selectedOrder.resi }}
              </div>

              <div class="mt-3 pt-3 border-t border-slate-200/70">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Order ID TikTok Shop (18 Digit)
                </span>
                <div class="font-mono text-xs font-bold text-slate-800 mt-0.5 select-all">
                  {{ selectedOrder.order_id }}
                </div>
              </div>
            </div>

            <!-- Service & Sorting Code -->
            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Layanan &amp; Atribut Pengiriman
              </span>
              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span class="px-2.5 py-0.5 bg-slate-900 text-white font-bold text-xs rounded-md">
                  J&amp;T {{ selectedOrder.service }}
                </span>
                <span
                  v-if="selectedOrder.is_cod"
                  class="px-2.5 py-0.5 bg-amber-100 text-amber-900 font-bold text-xs rounded-md border border-amber-300"
                >
                  COD
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 bg-slate-200 text-slate-700 font-semibold text-xs rounded-md"
                >
                  Non-COD
                </span>
                <span class="text-xs text-slate-600 font-semibold">
                  {{ selectedOrder.weight_kg }} kg
                </span>
              </div>

              <div class="mt-3 pt-3 border-t border-slate-200/70">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500"
                  >Kode Sortir J&amp;T</span
                >
                <div class="font-mono text-xs font-bold text-slate-800 mt-0.5">
                  {{ selectedOrder.sorting_code || '-' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Status Packing & Shipping Timestamps -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Packing Status -->
            <div
              class="p-4 rounded-2xl border"
              :class="
                selectedOrder.is_packed
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200/80'
              "
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-xs font-bold uppercase tracking-wider"
                  :class="selectedOrder.is_packed ? 'text-emerald-900' : 'text-slate-500'"
                >
                  Status Packing
                </span>
                <span
                  class="px-2.5 py-0.5 rounded text-[10px] font-bold"
                  :class="
                    selectedOrder.is_packed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  "
                >
                  {{ selectedOrder.is_packed ? 'SUDAH DIKEMAS' : 'BELUM DIKEMAS' }}
                </span>
              </div>
              <div class="text-xs text-slate-600 mt-2 font-medium">
                Waktu Scan:
                <strong class="text-slate-900">{{ formatDate(selectedOrder.packed_at) }}</strong>
              </div>
            </div>

            <!-- Shipping Status -->
            <div
              class="p-4 rounded-2xl border"
              :class="
                selectedOrder.is_shipped
                  ? 'bg-blue-50/50 border-blue-200'
                  : 'bg-slate-50 border-slate-200/80'
              "
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-xs font-bold uppercase tracking-wider"
                  :class="selectedOrder.is_shipped ? 'text-blue-900' : 'text-slate-500'"
                >
                  Status Pengiriman
                </span>
                <span
                  class="px-2.5 py-0.5 rounded text-[10px] font-bold"
                  :class="
                    selectedOrder.is_shipped
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  "
                >
                  {{ selectedOrder.is_shipped ? 'SUDAH DIKIRIM' : 'BELUM DIKIRIM' }}
                </span>
              </div>
              <div class="text-xs text-slate-600 mt-2 font-medium">
                Waktu Scan:
                <strong class="text-slate-900">{{ formatDate(selectedOrder.shipped_at) }}</strong>
              </div>
            </div>
          </div>

          <!-- Recipient Full Address -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Data Penerima &amp; Alamat Pengiriman
            </span>
            <div class="font-bold text-slate-900 text-base">
              {{ selectedOrder.recipient_name }}
              <span
                v-if="selectedOrder.recipient_phone"
                class="font-mono text-xs font-normal text-slate-500 ml-2"
              >
                ({{ selectedOrder.recipient_phone }})
              </span>
            </div>
            <p class="text-xs text-slate-700 leading-relaxed pt-1">
              {{ selectedOrder.recipient_address }}
            </p>
          </div>

          <!-- Items Table -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-700">
                Rincian Barang Pesanan
              </span>
              <span class="text-xs text-slate-500 font-semibold">
                Total Qty: {{ selectedOrder.items.reduce((s, it) => s + it.qty, 0) }} pcs
              </span>
            </div>

            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <table class="min-w-full divide-y divide-slate-200 text-xs">
                <thead class="bg-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <th class="px-3.5 py-2.5 text-left">Nama Produk</th>
                    <th class="px-3.5 py-2.5 text-left">SKU / Variasi</th>
                    <th class="px-3.5 py-2.5 text-left">SKU Penjual</th>
                    <th class="px-3.5 py-2.5 text-center w-20">Kuantitas</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr v-for="(it, idx) in selectedOrder.items" :key="idx" class="hover:bg-slate-50">
                    <td class="px-3.5 py-2.5 font-medium text-slate-900">{{ it.product_name }}</td>
                    <td class="px-3.5 py-2.5">
                      <span
                        class="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono font-semibold text-[11px] border border-slate-200"
                      >
                        {{ it.sku }}
                      </span>
                    </td>
                    <td class="px-3.5 py-2.5 font-mono text-slate-500">
                      {{ it.seller_sku || '-' }}
                    </td>
                    <td
                      class="px-3.5 py-2.5 text-center font-bold text-slate-900 bg-slate-50/50 font-mono"
                    >
                      {{ it.qty }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Metadata Footer -->
          <div
            class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-100 font-medium"
          >
            <div>
              Terdaftar di Batch: <strong>#{{ selectedOrder.batch_id }}</strong>
            </div>
            <div>Waktu Ditambahkan: {{ formatDate(selectedOrder.created_at) }}</div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            @click="closeDetail"
            class="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
