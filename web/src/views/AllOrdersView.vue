<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api, ApiError } from '../api/client';
import DateRangePicker from '../components/DateRangePicker.vue';
import Pagination from '../components/Pagination.vue';
import SearchSelect from '../components/SearchSelect.vue';

interface UnifiedOrderItem {
  seller_sku: string;
  sku?: string;
  product_name: string;
  qty: number;
  price?: number;
}

interface UnifiedOrder {
  id: string | number;
  type: 'online' | 'offline';
  order_code: string; // Resi / Order ID (online) or Order No (offline)
  reference_id: string; // Order ID (online) or Customer Name (offline)
  customer_name: string;
  customer_phone: string | null;
  customer_address?: string | null;
  order_date: string;
  status: 'belum_dikemas' | 'siap_kirim' | 'selesai_kirim' | 'dibatalkan';
  items_count: number;
  total_qty: number;
  total_amount?: number;
  notes?: string | null;
  raw_online_id?: number;
  raw_offline_id?: number;
  items: UnifiedOrderItem[];
}

interface Product {
  id: number;
  seller_sku: string;
  name: string;
}

const activeTypeTab = ref<'all' | 'online' | 'offline'>('all');
const activeStatusTab = ref<string>('all');
const searchQuery = ref('');
const startDate = ref('');
const endDate = ref('');

const unifiedOrders = ref<UnifiedOrder[]>([]);
const availableProducts = ref<Product[]>([]);
const isLoading = ref(false);

// Modal Input Pesanan Offline
const showOfflineModal = ref(false);
const isSavingOffline = ref(false);
const offlineError = ref('');

interface CustomerOption {
  id: number;
  name: string;
  phone: string | null;
}
const availableCustomers = ref<CustomerOption[]>([]);

const offlineForm = ref({
  order_no: '',
  order_date: new Date().toISOString().slice(0, 10),
  customer_id: null as number | null,
  customer_name: '',
  customer_phone: '',
  notes: '',
  status: 'siap_kirim' as 'siap_kirim' | 'selesai_kirim' | 'dibatalkan',
  items: [{ seller_sku: '', product_name: '', qty: 1, price: 0 }],
});

// Modal Detail Pesanan
const showDetailModal = ref(false);
const selectedOrder = ref<UnifiedOrder | null>(null);
const isUpdatingStatus = ref(false);

// Modal Konfirmasi Hapus Pesanan Offline
const showDeleteConfirmModal = ref(false);
const orderToDelete = ref<UnifiedOrder | null>(null);
const isDeletingOffline = ref(false);

async function loadData() {
  isLoading.value = true;
  try {
    const [onlineRes, offlineRes, prodRes, custRes] = await Promise.all([
      api.get<{ orders: any[] }>('/api/orders?limit=2000'),
      api.get<{ orders: any[] }>('/api/offline-orders'),
      api.get<{ products: Product[] }>('/api/products?limit=1000'),
      api.get<{ customers: CustomerOption[] }>('/api/customers').catch(() => ({ customers: [] })),
    ]);

    availableProducts.value = prodRes.products || [];
    availableCustomers.value = custRes.customers || [];

    const list: UnifiedOrder[] = [];

    // Map Online Orders
    for (const o of onlineRes.orders || []) {
      const totalQty = (o.items || []).reduce((s: number, it: any) => s + (it.qty || 1), 0);
      let normalizedStatus: 'belum_dikemas' | 'siap_kirim' | 'selesai_kirim' | 'dibatalkan' = 'siap_kirim';
      if (o.status === 'menunggu_dikemas' || o.status === 'belum_dikemas') {
        normalizedStatus = 'belum_dikemas';
      } else if (o.status === 'dikemas' || o.status === 'siap_kirim') {
        normalizedStatus = 'siap_kirim';
      } else if (o.status === 'dikirim' || o.status === 'selesai' || o.status === 'selesai_kirim') {
        normalizedStatus = 'selesai_kirim';
      } else if (o.status === 'dibatalkan' || o.status === 'batal') {
        normalizedStatus = 'dibatalkan';
      }

      list.push({
        id: `online_${o.id}`,
        type: 'online',
        order_code: o.resi,
        reference_id: o.order_id,
        customer_name: o.recipient_name,
        customer_phone: o.recipient_phone,
        customer_address: o.recipient_address,
        order_date: o.created_at,
        status: normalizedStatus,
        items_count: (o.items || []).length,
        total_qty: totalQty,
        raw_online_id: o.id,
        items: (o.items || []).map((it: any) => ({
          seller_sku: it.seller_sku || it.sku,
          sku: it.sku || '-',
          product_name: it.product_name,
          qty: it.qty,
          price: it.price,
        })),
      });
    }

    // Map Offline Orders
    for (const off of offlineRes.orders || []) {
      const totalQty = (off.items || []).reduce((s: number, it: any) => s + (it.qty || 1), 0);
      const totalAmount = (off.items || []).reduce(
        (s: number, it: any) => s + (it.qty || 1) * (it.price || 0),
        0
      );
      let normalizedStatus: 'belum_dikemas' | 'siap_kirim' | 'selesai_kirim' | 'dibatalkan' = 'siap_kirim';
      if (off.status === 'belum_dikemas') normalizedStatus = 'belum_dikemas';
      else if (off.status === 'siap_kirim') normalizedStatus = 'siap_kirim';
      else if (off.status === 'selesai_kirim' || off.status === 'selesai') normalizedStatus = 'selesai_kirim';
      else if (off.status === 'dibatalkan') normalizedStatus = 'dibatalkan';

      list.push({
        id: `offline_${off.id}`,
        type: 'offline',
        order_code: off.order_no,
        reference_id: off.customer_name,
        customer_name: off.customer_name,
        customer_phone: off.customer_phone,
        customer_address: off.notes || '',
        order_date: off.order_date || off.created_at,
        status: normalizedStatus,
        items_count: (off.items || []).length,
        total_qty: totalQty,
        total_amount: totalAmount,
        notes: off.notes,
        raw_offline_id: off.id,
        items: (off.items || []).map((it: any) => ({
          seller_sku: it.seller_sku,
          sku: '-',
          product_name: it.product_name,
          qty: it.qty,
          price: it.price,
        })),
      });
    }

    // Sort by order_date descending
    list.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());
    unifiedOrders.value = list;
  } catch (err) {
    console.error('Gagal memuat daftar pesanan:', err);
  } finally {
    isLoading.value = false;
  }
}

const filteredOrders = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return unifiedOrders.value.filter((o) => {
    // Type Filter
    if (activeTypeTab.value !== 'all' && o.type !== activeTypeTab.value) {
      return false;
    }

    // Status Filter
    if (activeStatusTab.value !== 'all' && o.status !== activeStatusTab.value) {
      return false;
    }

    // Date Range Filter
    if (startDate.value) {
      const orderDateStr = o.order_date.slice(0, 10);
      if (orderDateStr < startDate.value) return false;
    }
    if (endDate.value) {
      const orderDateStr = o.order_date.slice(0, 10);
      if (orderDateStr > endDate.value) return false;
    }

    // Search Query
    if (q) {
      const matchCode = o.order_code.toLowerCase().includes(q);
      const matchRef = o.reference_id.toLowerCase().includes(q);
      const matchCust = o.customer_name.toLowerCase().includes(q);
      const matchItem = o.items.some(
        (it) => it.seller_sku.toLowerCase().includes(q) || it.product_name.toLowerCase().includes(q)
      );
      if (!matchCode && !matchRef && !matchCust && !matchItem) return false;
    }

    return true;
  });
});

// Pagination State
const currentPage = ref(1);
const pageSize = ref(25);

const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredOrders.value.slice(start, start + pageSize.value);
});

// Reset ke halaman 1 saat filter atau pencarian berubah
watch([searchQuery, activeTypeTab, activeStatusTab, startDate, endDate], () => {
  currentPage.value = 1;
});

const stats = computed(() => {
  let onlineCount = 0;
  let offlineCount = 0;
  let siapKirimCount = 0;
  let selesaiKirimCount = 0;
  let belumDikemasCount = 0;
  let dibatalkanCount = 0;

  for (const o of unifiedOrders.value) {
    if (o.type === 'online') onlineCount++;
    else offlineCount++;

    if (o.status === 'siap_kirim') siapKirimCount++;
    else if (o.status === 'selesai_kirim') selesaiKirimCount++;
    else if (o.status === 'belum_dikemas') belumDikemasCount++;
    else if (o.status === 'dibatalkan') dibatalkanCount++;
  }

  return {
    total: unifiedOrders.value.length,
    onlineCount,
    offlineCount,
    siapKirimCount,
    selesaiKirimCount,
    belumDikemasCount,
    dibatalkanCount,
  };
});

// Modal Offline Order
function openCreateOfflineOrder() {
  offlineForm.value = {
    order_no: '',
    order_date: new Date().toISOString().slice(0, 10),
    customer_id: null,
    customer_name: '',
    customer_phone: '',
    notes: '',
    status: 'siap_kirim', // Default Siap Kirim sesuai instruksi client
    items: [
      {
        seller_sku: availableProducts.value[0]?.seller_sku || '',
        product_name: availableProducts.value[0]?.name || '',
        qty: 1,
        price: 0,
      },
    ],
  };
  offlineError.value = '';
  showOfflineModal.value = true;
}

function onCustomerSelected(customerId: number | '') {
  if (!customerId) {
    offlineForm.value.customer_id = null;
    return;
  }
  const cust = availableCustomers.value.find((c) => c.id === customerId);
  if (cust) {
    offlineForm.value.customer_id = cust.id;
    offlineForm.value.customer_name = cust.name;
    if (cust.phone) offlineForm.value.customer_phone = cust.phone;
  }
}

const productSelectOptions = computed(() => {
  return availableProducts.value.map((p) => ({
    value: p.seller_sku,
    label: p.name,
  }));
});

function onProductSelect(idx: number) {
  const item = offlineForm.value.items[idx];
  const prod = availableProducts.value.find((p) => p.seller_sku === item.seller_sku);
  if (prod) {
    item.product_name = prod.name;
  }
}

function addOfflineItemRow() {
  offlineForm.value.items.push({
    seller_sku: availableProducts.value[0]?.seller_sku || '',
    product_name: availableProducts.value[0]?.name || '',
    qty: 1,
    price: 0,
  });
}

function removeOfflineItemRow(idx: number) {
  if (offlineForm.value.items.length > 1) {
    offlineForm.value.items.splice(idx, 1);
  }
}

const offlineFormTotal = computed(() => {
  return offlineForm.value.items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0),
    0
  );
});

async function submitOfflineOrder() {
  if (!offlineForm.value.customer_name.trim()) {
    offlineError.value = 'Nama pelanggan wajib diisi';
    return;
  }
  const validItems = offlineForm.value.items.filter((it) => it.seller_sku && it.qty > 0);
  if (validItems.length === 0) {
    offlineError.value = 'Minimal masukkan 1 produk dengan jumlah Qty > 0';
    return;
  }

  isSavingOffline.value = true;
  offlineError.value = '';

  try {
    await api.post('/api/offline-orders', {
      order_no: offlineForm.value.order_no.trim() || undefined,
      order_date: offlineForm.value.order_date,
      customer_id: offlineForm.value.customer_id || undefined,
      customer_name: offlineForm.value.customer_name.trim(),
      customer_phone: offlineForm.value.customer_phone.trim() || undefined,
      notes: offlineForm.value.notes.trim() || undefined,
      status: offlineForm.value.status,
      items: validItems,
    });
    showOfflineModal.value = false;
    await loadData();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      offlineError.value = err.message;
    } else {
      offlineError.value = 'Gagal menyimpan pesanan offline';
    }
  } finally {
    isSavingOffline.value = false;
  }
}

// Detail & Status Changing
function openDetail(o: UnifiedOrder) {
  selectedOrder.value = o;
  showDetailModal.value = true;
}

async function updateOfflineStatus(newStatus: 'siap_kirim' | 'selesai_kirim' | 'dibatalkan') {
  if (!selectedOrder.value || !selectedOrder.value.raw_offline_id) return;
  isUpdatingStatus.value = true;
  try {
    await api.put(`/api/offline-orders/${selectedOrder.value.raw_offline_id}/status`, {
      status: newStatus,
    });
    selectedOrder.value.status = newStatus;
    const match = unifiedOrders.value.find((it) => it.id === selectedOrder.value?.id);
    if (match) match.status = newStatus;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal mengubah status: ${err.message}`);
    } else {
      alert('Gagal mengubah status');
    }
  } finally {
    isUpdatingStatus.value = false;
  }
}

// Hapus Pesanan Offline
function promptDeleteOfflineOrder(o: UnifiedOrder) {
  orderToDelete.value = o;
  showDeleteConfirmModal.value = true;
}

async function executeDeleteOfflineOrder() {
  if (!orderToDelete.value || !orderToDelete.value.raw_offline_id) return;
  isDeletingOffline.value = true;
  try {
    await api.delete(`/api/offline-orders/${orderToDelete.value.raw_offline_id}`);
    showDeleteConfirmModal.value = false;
    // Jika pesanan yang dihapus sedang dibuka di modal detail, tutup modal detail
    if (selectedOrder.value?.id === orderToDelete.value.id) {
      showDetailModal.value = false;
      selectedOrder.value = null;
    }
    orderToDelete.value = null;
    await loadData();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal menghapus pesanan offline: ${err.message}`);
    } else {
      alert('Gagal menghapus pesanan offline');
    }
  } finally {
    isDeletingOffline.value = false;
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatCurrency(val?: number) {
  if (val === undefined || val === null) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);
}

onMounted(() => {
  loadData();
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
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Daftar Semua Pesanan</h1>
          <span
            class="text-[10px] font-bold tracking-widest uppercase bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-2.5 py-0.5 rounded shadow-xs"
          >
            ELLITH
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          Konsolidasi terpadu pesanan <strong>Online (Resi Tercetak)</strong> dan
          <strong>Pesanan Offline (Toko Fisik / Reseller)</strong>.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="openCreateOfflineOrder"
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
          <span>Input Pesanan Offline</span>
        </button>

        <button
          type="button"
          @click="loadData"
          class="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition shadow-sm cursor-pointer"
          title="Muat Ulang"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- KPI Metric Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-6 gap-3">
      <div class="bg-gradient-to-br from-slate-50/70 via-white to-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Total Pesanan
        </div>
        <div class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tabular-nums">{{ stats.total }}</div>
      </div>

      <div class="bg-gradient-to-br from-blue-50/60 via-white to-white border border-blue-100/80 rounded-2xl p-4 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wider text-blue-600">
          Online (TikTok)
        </div>
        <div class="text-2xl font-extrabold text-blue-700 mt-1 font-mono tabular-nums">{{ stats.onlineCount }}</div>
      </div>

      <div class="bg-gradient-to-br from-emerald-50/60 via-white to-white border border-emerald-100/80 rounded-2xl p-4 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
          Pesanan Offline
        </div>
        <div class="text-2xl font-extrabold text-emerald-700 mt-1 font-mono tabular-nums">
          {{ stats.offlineCount }}
        </div>
      </div>

      <div class="bg-gradient-to-br from-amber-50/60 via-white to-white border border-amber-100/80 rounded-2xl p-4 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wider text-amber-600">
          Belum Dikemas
        </div>
        <div class="text-2xl font-extrabold text-amber-700 mt-1 font-mono tabular-nums">
          {{ stats.belumDikemasCount }}
        </div>
      </div>

      <div class="bg-gradient-to-br from-indigo-50/60 via-white to-white border border-indigo-100/80 rounded-2xl p-4 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Siap Kirim</div>
        <div class="text-2xl font-extrabold text-indigo-700 mt-1 font-mono tabular-nums">
          {{ stats.siapKirimCount }}
        </div>
      </div>

      <div class="bg-gradient-to-br from-emerald-50/60 via-white to-white border border-emerald-100/80 rounded-2xl p-4 shadow-xs">
        <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
          Selesai Kirim
        </div>
        <div class="text-2xl font-extrabold text-emerald-700 mt-1 font-mono tabular-nums">
          {{ stats.selesaiKirimCount }}
        </div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
      <!-- Tabs Channel: Semua vs Online vs Offline -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div class="flex items-center space-x-2">
          <button
            type="button"
            @click="activeTypeTab = 'all'"
            class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
            :class="[
              activeTypeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ]"
          >
            Semua ({{ unifiedOrders.length }})
          </button>
          <button
            type="button"
            @click="activeTypeTab = 'online'"
            class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1"
            :class="[
              activeTypeTab === 'online'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ]"
          >
            <span>Online (Resi)</span>
            <span class="text-[10px] opacity-75 font-mono">({{ stats.onlineCount }})</span>
          </button>
          <button
            type="button"
            @click="activeTypeTab = 'offline'"
            class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1"
            :class="[
              activeTypeTab === 'offline'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ]"
          >
            <span>Offline</span>
            <span class="text-[10px] opacity-75 font-mono">({{ stats.offlineCount }})</span>
          </button>
        </div>

        <!-- Filter Status Dropdown -->
        <div class="flex items-center space-x-2">
          <label class="text-xs font-bold text-slate-500">Status:</label>
          <select
            v-model="activeStatusTab"
            class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="all">Semua Status</option>
            <option value="belum_dikemas">Belum Dikemas</option>
            <option value="siap_kirim">Siap Kirim</option>
            <option value="selesai_kirim">Selesai Kirim</option>
            <option value="dibatalkan">Dibatalkan</option>
          </select>
        </div>
      </div>

      <!-- Search & Date Filter -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <!-- Search Query -->
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari Resi, No. Pesanan, Pelanggan, atau SKU..."
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

        <!-- Single Date Range Picker -->
        <div class="w-full sm:w-72 shrink-0">
          <DateRangePicker
            v-model:startDate="startDate"
            v-model:endDate="endDate"
            placeholder="Filter rentang tanggal..."
          />
        </div>
      </div>
    </div>

    <!-- Orders Table (Struktur Kolom Identik dengan Resi Tercetak) -->
    <div class="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      <div v-if="isLoading" class="p-12 text-center text-xs text-slate-400">
        <svg
          class="animate-spin w-7 h-7 text-indigo-600 mx-auto mb-2"
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
        <span>Memuat data pesanan...</span>
      </div>

      <div
        v-else-if="filteredOrders.length === 0"
        class="p-12 text-center text-xs text-slate-500 font-medium"
      >
        Tidak ada pesanan yang sesuai dengan filter.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-left text-xs border-collapse">
          <thead
            class="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200/80"
          >
            <tr>
              <th class="px-3.5 py-3 w-[150px] whitespace-nowrap">No. Resi / Pesanan</th>
              <th class="px-3 py-3 w-[115px] whitespace-nowrap">Tgl Pesanan</th>
              <th class="px-3.5 py-3 min-w-[210px]">Judul Barang</th>
              <th class="px-3 py-3 w-[115px]">SKU</th>
              <th class="px-3 py-3 w-[110px]">SKU Penjual</th>
              <th class="px-2 py-3 w-[55px] text-center">Qty</th>
              <th class="px-3.5 py-3 w-[210px]">Data Penerima</th>
              <th class="px-2.5 py-3 w-[105px] text-center">Status Packing</th>
              <th class="px-2.5 py-3 w-[100px] text-center">Status Kirim</th>
              <th class="px-2.5 py-3 w-[70px] text-center">Aksi</th>
            </tr>
          </thead>

          <!-- Setiap Pesanan Dibungkus dalam 1 Tbody (Row-spanning per item) -->
          <tbody
            v-for="o in paginatedOrders"
            :key="o.id"
            @click="openDetail(o)"
            class="border-b-2 border-slate-200/70 hover:bg-slate-50/70 transition-colors cursor-pointer group"
          >
            <!-- Baris Pertama: Memuat Item Pertama + Kolom Spanned -->
            <tr>
              <!-- 1. No. Resi / Pesanan -->
              <td
                :rowspan="Math.max(1, o.items.length)"
                class="px-3.5 py-3 w-[150px] align-top whitespace-nowrap bg-white group-hover:bg-slate-50/70 border-r border-slate-100 transition-colors"
              >
                <div
                  class="font-bold text-slate-900 font-mono text-xs group-hover:text-indigo-600 transition-colors"
                >
                  {{ o.order_code }}
                </div>
                <div class="flex items-center space-x-1 mt-1 flex-wrap gap-1">
                  <!-- Tag Keterangan Asal Pesanan (Resi Tercetak vs Offline) -->
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
                    :class="[
                      o.type === 'online'
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                    ]"
                  >
                    {{ o.type === 'online' ? 'Resi Tercetak' : 'Offline' }}
                  </span>
                  <span
                    v-if="o.status === 'dibatalkan'"
                    class="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 uppercase tracking-wider"
                  >
                    Batal
                  </span>
                </div>
                <div
                  v-if="o.type === 'online' && o.reference_id"
                  class="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[130px]"
                  :title="o.reference_id"
                >
                  ID: {{ o.reference_id }}
                </div>
                <div v-if="o.items.length > 1" class="mt-1">
                  <span
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    {{ o.items.length }} Barang ({{ o.total_qty }} pcs)
                  </span>
                </div>
              </td>

              <!-- 2. Tanggal Pesanan -->
              <td
                :rowspan="Math.max(1, o.items.length)"
                class="px-3 py-3 w-[115px] align-top whitespace-nowrap bg-white group-hover:bg-slate-50/70 border-r border-slate-100 transition-colors"
              >
                <div class="font-bold text-slate-800 text-xs font-mono">
                  {{ formatDate(o.order_date) }}
                </div>
              </td>

              <!-- 3. Judul Barang (Item 1) -->
              <td class="px-3.5 py-3 align-top font-medium text-slate-800 leading-snug">
                {{ o.items[0]?.product_name ?? '-' }}
              </td>

              <!-- 4. SKU (Item 1) -->
              <td class="px-3 py-3 w-[115px] align-top">
                <span
                  v-if="o.items[0]?.sku && o.items[0].sku !== '-'"
                  class="inline-block bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border border-slate-200 break-words max-w-full"
                  :title="o.items[0].sku"
                >
                  {{ o.items[0].sku }}
                </span>
                <span v-else class="text-slate-400 font-mono text-[11px]">-</span>
              </td>

              <!-- 5. SKU Penjual (Item 1) -->
              <td
                class="px-3 py-3 w-[110px] align-top font-mono text-[11px] text-slate-700 font-bold truncate"
                :title="o.items[0]?.seller_sku || '-'"
              >
                {{ o.items[0]?.seller_sku || '-' }}
              </td>

              <!-- 6. Qty (Item 1) -->
              <td class="px-2 py-3 w-[55px] align-top text-center whitespace-nowrap">
                <span
                  v-if="o.items[0]"
                  class="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md text-xs font-mono tabular-nums"
                  :class="[
                    o.items[0].qty > 1
                      ? 'bg-rose-600 text-white shadow-xs font-black ring-2 ring-rose-300'
                      : 'bg-slate-100 text-slate-900 font-black border border-slate-200',
                  ]"
                >
                  {{ o.items[0].qty }}
                </span>
                <span v-else class="text-slate-400">-</span>
              </td>

              <!-- 7. Data Penerima -->
              <td
                :rowspan="Math.max(1, o.items.length)"
                class="px-3.5 py-3 w-[210px] align-top bg-white group-hover:bg-slate-50/70 border-l border-slate-100 transition-colors"
              >
                <div class="font-bold text-slate-900 truncate" :title="o.customer_name">
                  {{ o.customer_name }}
                </div>
                <div v-if="o.customer_phone" class="text-slate-500 font-mono text-[11px] mt-0.5">
                  {{ o.customer_phone }}
                </div>
                <div
                  v-if="o.notes || o.customer_address"
                  class="text-slate-500 text-[11px] line-clamp-2 mt-0.5"
                  :title="(o.notes || o.customer_address) ?? undefined"
                >
                  {{ o.notes || o.customer_address }}
                </div>
              </td>

              <!-- 8. Status Packing -->
              <td
                :rowspan="Math.max(1, o.items.length)"
                class="px-2.5 py-3 w-[105px] align-top text-center whitespace-nowrap bg-white group-hover:bg-slate-50/70 transition-colors"
              >
                <span
                  v-if="o.status === 'dibatalkan'"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Dibatalkan
                </span>
                <span
                  v-else-if="o.status === 'siap_kirim' || o.status === 'selesai_kirim'"
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

              <!-- 9. Status Kirim -->
              <td
                :rowspan="Math.max(1, o.items.length)"
                class="px-2.5 py-3 w-[100px] align-top text-center whitespace-nowrap bg-white group-hover:bg-slate-50/70 transition-colors"
              >
                <span
                  v-if="o.status === 'dibatalkan'"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Batal
                </span>
                <span
                  v-else-if="o.status === 'selesai_kirim'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                  Terkirim
                </span>
                <span
                  v-else-if="o.status === 'siap_kirim'"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  Siap Kirim
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"
                >
                  Belum Kirim
                </span>
              </td>

              <!-- 10. Aksi -->
              <td
                :rowspan="Math.max(1, o.items.length)"
                class="px-2 py-3 w-[70px] align-top text-center whitespace-nowrap bg-white group-hover:bg-slate-50/70 transition-colors"
              >
                <div class="flex items-center justify-center space-x-1">
                  <button
                    type="button"
                    @click.stop="openDetail(o)"
                    class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                    title="Lihat rincian pesanan"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </button>

                  <button
                    v-if="o.type === 'offline'"
                    type="button"
                    @click.stop="promptDeleteOfflineOrder(o)"
                    class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Hapus pesanan offline"
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
              </td>
            </tr>

            <!-- Baris Tambahan jika Pesanan Memiliki > 1 Item -->
            <tr
              v-for="(it, i) in o.items.slice(1)"
              :key="i"
              class="border-t border-slate-100/70"
            >
              <!-- Judul Barang (Item N) -->
              <td class="px-3.5 py-2.5 align-top font-medium text-slate-800 leading-snug">
                {{ it.product_name ?? '-' }}
              </td>
              <!-- SKU (Item N) -->
              <td class="px-3 py-2.5 w-[115px] align-top">
                <span
                  v-if="it.sku && it.sku !== '-'"
                  class="inline-block bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border border-slate-200 break-words max-w-full"
                  :title="it.sku"
                >
                  {{ it.sku }}
                </span>
                <span v-else class="text-slate-400 font-mono text-[11px]">-</span>
              </td>
              <!-- SKU Penjual (Item N) -->
              <td
                class="px-3 py-2.5 w-[110px] align-top font-mono text-[11px] text-slate-700 font-bold truncate"
                :title="it.seller_sku || '-'"
              >
                {{ it.seller_sku || '-' }}
              </td>
              <!-- Qty (Item N) -->
              <td class="px-2 py-2.5 w-[55px] align-top text-center whitespace-nowrap">
                <span
                  class="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md text-xs font-mono tabular-nums"
                  :class="[
                    it.qty > 1
                      ? 'bg-rose-600 text-white shadow-xs font-black ring-2 ring-rose-300'
                      : 'bg-slate-100 text-slate-900 font-black border border-slate-200',
                  ]"
                >
                  {{ it.qty }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <Pagination
        v-model:currentPage="currentPage"
        v-model:pageSize="pageSize"
        :totalItems="filteredOrders.length"
      />
    </div>

    <!-- MODAL DETAIL PESANAN -->
    <div
      v-if="showDetailModal && selectedOrder"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 p-6 space-y-4"
      >
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span
              class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider"
              :class="[
                selectedOrder.type === 'online'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-emerald-100 text-emerald-800',
              ]"
            >
              {{ selectedOrder.type === 'online' ? 'Online' : 'Offline' }}
            </span>
            <h3 class="text-base font-bold text-slate-900">{{ selectedOrder.order_code }}</h3>
          </div>
          <button
            type="button"
            @click="showDetailModal = false"
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

        <!-- Info Header -->
        <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs">
          <div class="flex justify-between">
            <span class="text-slate-500">Pelanggan / Penerima:</span>
            <span class="font-bold text-slate-900">{{ selectedOrder.customer_name }}</span>
          </div>
          <div v-if="selectedOrder.customer_phone" class="flex justify-between">
            <span class="text-slate-500">Nomor Telepon:</span>
            <span class="font-mono text-slate-800">{{ selectedOrder.customer_phone }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Tanggal Pesanan:</span>
            <span class="font-mono text-slate-800">{{ formatDate(selectedOrder.order_date) }}</span>
          </div>
          <div v-if="selectedOrder.notes" class="flex justify-between">
            <span class="text-slate-500">Catatan:</span>
            <span class="text-slate-800 italic">{{ selectedOrder.notes }}</span>
          </div>
        </div>

        <!-- Items Table -->
        <div>
          <div class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
            Item Barang:
          </div>
          <div
            class="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs"
          >
            <div
              v-for="(it, i) in selectedOrder.items"
              :key="i"
              class="p-3 flex items-center justify-between hover:bg-slate-50"
            >
              <div>
                <div class="font-mono font-bold text-slate-900">{{ it.seller_sku }}</div>
                <div class="text-[11px] text-slate-600">{{ it.product_name }}</div>
              </div>
              <div class="text-right">
                <div
                  class="font-mono"
                  :class="it.qty > 1 ? 'font-black text-rose-600' : 'font-bold text-slate-900'"
                >
                  {{ it.qty }} pcs
                </div>
                <div v-if="it.price" class="text-[10px] text-slate-500">
                  @ {{ formatCurrency(it.price) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Status Management (For Offline Orders) -->
        <div v-if="selectedOrder.type === 'offline'" class="pt-3 border-t border-slate-100 space-y-3">
          <div>
            <div class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Ubah Status Pengiriman:
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="selectedOrder.status !== 'siap_kirim'"
                type="button"
                @click="updateOfflineStatus('siap_kirim')"
                :disabled="isUpdatingStatus"
                class="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 transition cursor-pointer"
              >
                Set Siap Kirim
              </button>
              <button
                v-if="selectedOrder.status !== 'selesai_kirim'"
                type="button"
                @click="updateOfflineStatus('selesai_kirim')"
                :disabled="isUpdatingStatus"
                class="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition cursor-pointer"
              >
                Tandai Selesai Kirim
              </button>
              <button
                v-if="selectedOrder.status !== 'dibatalkan'"
                type="button"
                @click="updateOfflineStatus('dibatalkan')"
                :disabled="isUpdatingStatus"
                class="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
              >
                Batalkan Pesanan
              </button>
            </div>
          </div>

          <!-- Danger Action: Hapus Pesanan Offline -->
          <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span class="text-xs text-slate-500">Salah input? Hapus pesanan offline ini:</span>
            <button
              type="button"
              @click="promptDeleteOfflineOrder(selectedOrder)"
              class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span>Hapus Pesanan</span>
            </button>
          </div>
        </div>

        <!-- Link to Resi Tercetak (For Online Orders) -->
        <div v-else class="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-500">Pesanan ini dikelola pada menu Resi Tercetak.</span>
          <RouterLink
            :to="`/printed-orders?search=${selectedOrder.order_code}`"
            class="text-xs font-bold text-slate-900 hover:underline cursor-pointer"
          >
            Buka di Resi Tercetak &rarr;
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- MODAL INPUT PESANAN OFFLINE -->
    <div
      v-if="showOfflineModal"
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
              class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold"
              >+</span
            >
            <h3 class="text-base font-bold text-slate-900">Input Pesanan Offline</h3>
          </div>
          <button
            type="button"
            @click="showOfflineModal = false"
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
          v-if="offlineError"
          class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold"
        >
          {{ offlineError }}
        </div>

        <form @submit.prevent="submitOfflineOrder" class="space-y-4">
          <!-- Hubungkan ke Pelanggan CRM (Opsional) -->
          <div v-if="availableCustomers.length > 0" class="bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span class="text-xs font-bold text-indigo-950">Pilih dari CRM Pelanggan</span>
              <p class="text-[11px] text-indigo-600">Otomatis mengisi nama &amp; kontak pelanggan</p>
            </div>
            <select
              :value="offlineForm.customer_id || ''"
              @change="onCustomerSelected(($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : '')"
              class="px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
            >
              <option value="">-- Ketik Manual / Pelanggan Baru --</option>
              <option v-for="c in availableCustomers" :key="c.id" :value="c.id">
                {{ c.name }} {{ c.phone ? `(${c.phone})` : '' }}
              </option>
            </select>
          </div>

          <!-- Info Pelanggan & Tanggal -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >Nama Pelanggan <span class="text-rose-600">*</span></label
              >
              <input
                v-model="offlineForm.customer_name"
                type="text"
                required
                placeholder="cth: Ibu Hj. Nurma"
                class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >No. HP / WhatsApp</label
              >
              <input
                v-model="offlineForm.customer_phone"
                type="text"
                placeholder="cth: 08123456789"
                class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >Tanggal Pesanan</label
              >
              <input
                v-model="offlineForm.order_date"
                type="date"
                required
                class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <!-- Item Rows -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >Item Produk yang Dipesan</label
              >
              <button
                type="button"
                @click="addOfflineItemRow"
                class="text-xs font-bold text-slate-900 hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <span>Tambah Produk</span>
              </button>
            </div>

            <div class="space-y-2 max-h-80 overflow-y-auto pr-1 pb-16">
              <div
                v-for="(row, idx) in offlineForm.items"
                :key="idx"
                class="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs"
              >
                <!-- SKU Search Dropdown -->
                <div class="flex-1 min-w-[200px]">
                  <SearchSelect
                    v-model="row.seller_sku"
                    :options="productSelectOptions"
                    placeholder="-- Pilih Seller SKU --"
                    searchPlaceholder="Cari Seller SKU atau nama..."
                    @change="onProductSelect(idx)"
                    required
                  />
                </div>

                <!-- Qty -->
                <div class="w-20">
                  <input
                    v-model.number="row.qty"
                    type="number"
                    min="1"
                    required
                    placeholder="Qty"
                    class="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-bold text-center font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <!-- Price -->
                <div class="w-28">
                  <input
                    v-model.number="row.price"
                    type="number"
                    min="0"
                    placeholder="Harga"
                    class="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-medium text-right font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <!-- Delete button -->
                <button
                  type="button"
                  @click="removeOfflineItemRow(idx)"
                  class="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
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

          <!-- Total & Status Info -->
          <div
            class="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs"
          >
            <div>
              <span class="text-slate-500">Status Awal: </span>
              <span
                class="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
              >
                Siap Kirim (Otomatis)
              </span>
            </div>
            <div class="text-right">
              <span class="text-slate-500">Estimasi Total: </span>
              <span class="font-black text-slate-900 font-mono text-sm">{{
                formatCurrency(offlineFormTotal)
              }}</span>
            </div>
          </div>

          <!-- Catatan -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >Catatan Pesanan (Opsional)</label
            >
            <input
              v-model="offlineForm.notes"
              type="text"
              placeholder="cth: Ambil langsung di gudang jam 16.00"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <!-- Buttons -->
          <div class="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              @click="showOfflineModal = false"
              class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSavingOffline"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
            >
              <span v-if="isSavingOffline">Menyimpan...</span>
              <span v-else>Simpan Pesanan Offline</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL KONFIRMASI HAPUS PESANAN OFFLINE -->
    <div
      v-if="showDeleteConfirmModal && orderToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 p-6 space-y-4"
      >
        <div
          class="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>

        <div class="text-center space-y-1">
          <h3 class="text-sm font-bold text-slate-900">Hapus Pesanan Offline?</h3>
          <p class="text-xs text-slate-500">
            Anda akan menghapus pesanan <strong>#{{ orderToDelete.order_code }}</strong> (Pelanggan:
            <strong>{{ orderToDelete.customer_name }}</strong
            >). Tindakan ini tidak dapat dibatalkan dan alokasi stok untuk pesanan ini akan dibatalkan.
          </p>
        </div>

        <div class="flex items-center space-x-2 pt-2">
          <button
            type="button"
            @click="showDeleteConfirmModal = false"
            class="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executeDeleteOfflineOrder"
            :disabled="isDeletingOffline"
            class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold shadow-sm shadow-rose-500/25 transition cursor-pointer disabled:opacity-50"
          >
            {{ isDeletingOffline ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
