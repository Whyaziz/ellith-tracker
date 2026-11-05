<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '../api/client';
import DateRangePicker from '../components/DateRangePicker.vue';
import Pagination from '../components/Pagination.vue';

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
const startDate = ref('');
const endDate = ref('');
const selectedTab = ref<'all' | 'unpacked' | 'packed' | 'shipped' | 'cancelled'>('all');
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
  if (e.key === 'Escape') {
    if (cancellingOrder.value) {
      cancellingOrder.value = null;
    } else if (showEditOrderModal.value) {
      showEditOrderModal.value = false;
    } else if (deletingOrder.value) {
      deletingOrder.value = null;
    } else if (editingBatch.value) {
      editingBatch.value = null;
    } else if (deletingBatch.value) {
      deletingBatch.value = null;
    } else if (showDetailModal.value) {
      closeDetail();
    }
  }
}

// ----------------- EDIT & DELETE ORDER STATE -----------------
interface EditableItem {
  id?: number;
  product_name: string;
  sku: string;
  seller_sku: string;
  qty: number;
}

const showEditOrderModal = ref(false);
const isSavingOrder = ref(false);
const editOrderForm = ref<{
  id: number;
  resi: string;
  order_id: string;
  courier: string;
  service: string;
  is_cod: boolean;
  weight_kg: number;
  ship_date: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  sorting_code: string;
  needs_review: boolean;
  validation_notes: string;
  items: EditableItem[];
}>({
  id: 0,
  resi: '',
  order_id: '',
  courier: 'J&T',
  service: 'EZ',
  is_cod: false,
  weight_kg: 1,
  ship_date: '',
  recipient_name: '',
  recipient_phone: '',
  recipient_address: '',
  sorting_code: '',
  needs_review: false,
  validation_notes: '',
  items: [],
});

function openEditOrder(order: Order) {
  editOrderForm.value = {
    id: order.id,
    resi: order.resi,
    order_id: order.order_id,
    courier: order.courier,
    service: order.service,
    is_cod: order.is_cod,
    weight_kg: order.weight_kg ?? 1,
    ship_date: order.ship_date || '',
    recipient_name: order.recipient_name,
    recipient_phone: order.recipient_phone || '',
    recipient_address: order.recipient_address,
    sorting_code: order.sorting_code || '',
    needs_review: order.needs_review,
    validation_notes: order.validation_notes || '',
    items: order.items.map((it) => ({
      id: it.id,
      product_name: it.product_name,
      sku: it.sku,
      seller_sku: it.seller_sku || '',
      qty: it.qty,
    })),
  };
  showEditOrderModal.value = true;
}

function addEditItem() {
  editOrderForm.value.items.push({
    product_name: '',
    sku: '',
    seller_sku: '',
    qty: 1,
  });
}

function removeEditItem(index: number) {
  if (editOrderForm.value.items.length <= 1) {
    alert('Pesanan harus memiliki minimal 1 barang');
    return;
  }
  editOrderForm.value.items.splice(index, 1);
}

async function saveEditOrder() {
  if (!editOrderForm.value.resi.trim() || !editOrderForm.value.recipient_name.trim()) {
    alert('No. Resi dan Nama Penerima wajib diisi');
    return;
  }
  if (editOrderForm.value.items.length === 0) {
    alert('Pesanan harus memiliki minimal 1 barang');
    return;
  }
  for (const it of editOrderForm.value.items) {
    if (!it.product_name.trim() || !it.sku.trim()) {
      alert('Nama barang dan SKU tidak boleh kosong');
      return;
    }
    if (it.qty <= 0) {
      alert('Kuantitas (Qty) barang minimal 1');
      return;
    }
  }

  isSavingOrder.value = true;
  try {
    const payload = {
      resi: editOrderForm.value.resi.trim(),
      order_id: editOrderForm.value.order_id.trim(),
      courier: editOrderForm.value.courier.trim(),
      service: editOrderForm.value.service.trim(),
      is_cod: editOrderForm.value.is_cod,
      weight_kg: editOrderForm.value.weight_kg,
      ship_date: editOrderForm.value.ship_date.trim() || null,
      recipient_name: editOrderForm.value.recipient_name.trim(),
      recipient_phone: editOrderForm.value.recipient_phone.trim() || null,
      recipient_address: editOrderForm.value.recipient_address.trim(),
      sorting_code: editOrderForm.value.sorting_code.trim() || null,
      needs_review: editOrderForm.value.needs_review,
      validation_notes: editOrderForm.value.validation_notes.trim() || null,
      items: editOrderForm.value.items.map((it) => ({
        product_name: it.product_name.trim(),
        sku: it.sku.trim(),
        seller_sku: it.seller_sku.trim() || null,
        qty: it.qty,
      })),
    };

    const res = await api.put<{ message: string; order: Order }>(
      `/api/orders/${editOrderForm.value.id}`,
      payload
    );

    const idx = orders.value.findIndex((o) => o.id === res.order.id);
    if (idx !== -1) {
      orders.value[idx] = res.order;
    }
    if (selectedOrder.value?.id === res.order.id) {
      selectedOrder.value = res.order;
    }

    showEditOrderModal.value = false;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal menyimpan perubahan: ${err.message}`);
    } else {
      alert('Gagal menyimpan perubahan pesanan');
    }
  } finally {
    isSavingOrder.value = false;
  }
}

const deletingOrder = ref<Order | null>(null);
const isDeletingOrder = ref(false);

function openDeleteOrder(order: Order) {
  deletingOrder.value = order;
}

async function confirmDeleteOrder() {
  if (!deletingOrder.value) return;
  isDeletingOrder.value = true;
  try {
    await api.delete(`/api/orders/${deletingOrder.value.id}`);
    orders.value = orders.value.filter((o) => o.id !== deletingOrder.value!.id);
    if (selectedOrder.value?.id === deletingOrder.value.id) {
      closeDetail();
    }
    deletingOrder.value = null;
    await fetchBatches();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal menghapus pesanan: ${err.message}`);
    } else {
      alert('Gagal menghapus pesanan');
    }
  } finally {
    isDeletingOrder.value = false;
  }
}

// ----------------- BATCH EDIT & DELETE STATE -----------------
const editingBatch = ref<Batch | null>(null);
const editBatchName = ref('');
const isSavingBatch = ref(false);

const deletingBatch = ref<Batch | null>(null);
const isDeletingBatch = ref(false);

function openEditCurrentBatch() {
  const current = batches.value.find((b) => b.id === selectedBatchId.value);
  if (current) {
    editingBatch.value = current;
    editBatchName.value = current.name;
  }
}

async function saveEditBatch() {
  if (!editingBatch.value || !editBatchName.value.trim()) return;
  isSavingBatch.value = true;
  try {
    const res = await api.put<{ message: string; batch: Batch }>(
      `/api/batches/${editingBatch.value.id}`,
      {
        name: editBatchName.value.trim(),
      }
    );
    const idx = batches.value.findIndex((b) => b.id === editingBatch.value!.id);
    if (idx !== -1) {
      batches.value[idx].name = res.batch.name;
    }
    editingBatch.value = null;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal mengubah nama batch: ${err.message}`);
    } else {
      alert('Gagal mengubah nama batch');
    }
  } finally {
    isSavingBatch.value = false;
  }
}

function openDeleteCurrentBatch() {
  const current = batches.value.find((b) => b.id === selectedBatchId.value);
  if (current) {
    deletingBatch.value = current;
  }
}

async function confirmDeleteBatch() {
  if (!deletingBatch.value) return;
  isDeletingBatch.value = true;
  try {
    await api.delete(`/api/batches/${deletingBatch.value.id}`);
    batches.value = batches.value.filter((b) => b.id !== deletingBatch.value!.id);
    selectedBatchId.value = '';
    deletingBatch.value = null;
    await fetchOrders();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal menghapus batch: ${err.message}`);
    } else {
      alert('Gagal menghapus batch');
    }
  } finally {
    isDeletingBatch.value = false;
  }
}

// ----------------- CANCEL & RESTORE ORDER STATE -----------------
const cancellingOrder = ref<Order | null>(null);
const isCancelling = ref(false);
const isRestoring = ref(false);

function openCancelOrder(order: Order) {
  cancellingOrder.value = order;
}

async function confirmCancelOrder() {
  if (!cancellingOrder.value) return;
  isCancelling.value = true;
  try {
    const res = await api.post<{ message: string; order: Order }>(
      `/api/orders/${cancellingOrder.value.id}/cancel`
    );
    const idx = orders.value.findIndex((o) => o.id === res.order.id);
    if (idx !== -1) {
      orders.value[idx] = res.order;
    }
    if (selectedOrder.value?.id === res.order.id) {
      selectedOrder.value = res.order;
    }
    cancellingOrder.value = null;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal membatalkan pesanan: ${err.message}`);
    } else {
      alert('Gagal membatalkan pesanan');
    }
  } finally {
    isCancelling.value = false;
  }
}

async function handleRestoreOrder(order: Order) {
  if (!confirm(`Pulihkan pesanan ${order.resi} ke status aktif?`)) return;
  isRestoring.value = true;
  try {
    const res = await api.post<{ message: string; order: Order }>(
      `/api/orders/${order.id}/restore`
    );
    const idx = orders.value.findIndex((o) => o.id === res.order.id);
    if (idx !== -1) {
      orders.value[idx] = res.order;
    }
    if (selectedOrder.value?.id === res.order.id) {
      selectedOrder.value = res.order;
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal memulihkan pesanan: ${err.message}`);
    } else {
      alert('Gagal memulihkan pesanan');
    }
  } finally {
    isRestoring.value = false;
  }
}

// Statistics
const stats = computed(() => {
  const total = orders.value.length;
  const cancelled = orders.value.filter((o) => o.status === 'dibatalkan').length;
  const unpacked = orders.value.filter((o) => o.status !== 'dibatalkan' && !o.is_packed).length;
  const packed = orders.value.filter(
    (o) => o.status !== 'dibatalkan' && o.is_packed && !o.is_shipped
  ).length;
  const shipped = orders.value.filter((o) => o.status !== 'dibatalkan' && o.is_shipped).length;
  return { total, unpacked, packed, shipped, cancelled };
});

function getOrderDateYmd(order: Order): string {
  if (order.ship_date) {
    const parts = order.ship_date.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  if (order.created_at) {
    return order.created_at.slice(0, 10);
  }
  return '';
}

// Filtered list
const filteredOrders = computed(() => {
  return orders.value.filter((order) => {
    // Tab filter
    if (selectedTab.value === 'unpacked') {
      if (order.status === 'dibatalkan' || order.is_packed) return false;
    } else if (selectedTab.value === 'packed') {
      if (order.status === 'dibatalkan' || !order.is_packed || order.is_shipped) return false;
    } else if (selectedTab.value === 'shipped') {
      if (order.status === 'dibatalkan' || !order.is_shipped) return false;
    } else if (selectedTab.value === 'cancelled') {
      if (order.status !== 'dibatalkan') return false;
    }

    // Filter rentang tanggal (Start Date & End Date)
    if (startDate.value || endDate.value) {
      const orderYmd = getOrderDateYmd(order);
      if (!orderYmd) return false;
      if (startDate.value && orderYmd < startDate.value) return false;
      if (endDate.value && orderYmd > endDate.value) return false;
    }

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

// Pagination State
const currentPage = ref(1);
const pageSize = ref(25);

const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredOrders.value.slice(start, start + pageSize.value);
});

// Reset ke halaman 1 saat filter atau pencarian berubah
watch([searchQuery, selectedTab, selectedBatchId, startDate, endDate], () => {
  currentPage.value = 1;
});

const isFilterActive = computed(() => {
  return (
    selectedTab.value !== 'all' ||
    selectedBatchId.value !== '' ||
    startDate.value !== '' ||
    endDate.value !== '' ||
    searchQuery.value.trim() !== ''
  );
});

function resetFilters() {
  selectedTab.value = 'all';
  selectedBatchId.value = '';
  startDate.value = '';
  endDate.value = '';
  searchQuery.value = '';
}

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
    if (startDate.value) {
      params.append('start_date', startDate.value);
    }
    if (endDate.value) {
      params.append('end_date', endDate.value);
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
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

function formatOrderDate(order: Order) {
  if (order.ship_date) return order.ship_date;
  if (!order.created_at) return '-';
  try {
    const d = new Date(order.created_at);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return order.created_at;
  }
}

function formatShortUploadDate(isoStr: string | null) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '';
  }
}

watch([selectedBatchId, startDate, endDate], () => {
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
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Resi Tercetak</h1>
          <span
            class="text-[10px] font-bold tracking-widest uppercase bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-2.5 py-0.5 rounded shadow-xs"
          >
            ELLITH
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          Pelacakan &amp; Validasi Label Cetak PDF (TikTok Shop &bull; J&amp;T Express)
        </p>
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
          class="whitespace-nowrap shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm shadow-indigo-500/20 flex items-center space-x-1.5 cursor-pointer"
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
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
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

      <!-- Dibatalkan (Cancel) -->
      <button
        type="button"
        @click="selectedTab = 'cancelled'"
        class="p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer shadow-sm hover:shadow col-span-2 sm:col-span-1"
        :class="
          selectedTab === 'cancelled'
            ? 'border-rose-600 ring-2 ring-rose-600/20 bg-rose-50/40'
            : 'bg-white border-rose-200/80 hover:border-rose-300'
        "
      >
        <div class="flex items-center justify-between">
          <p class="text-[11px] font-bold uppercase tracking-wider text-rose-800">Dibatalkan</p>
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
        </div>
        <p class="text-2xl font-black text-rose-600 mt-1 font-mono">{{ stats.cancelled }}</p>
        <p class="text-[11px] text-rose-700/70 mt-0.5">Pesanan di-cancel</p>
      </button>
    </div>

    <!-- Filters & Search Toolbar (2 Baris Rapi & Ergonomis) -->
    <div class="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
      <!-- Baris 1: Status Tabs (Kiri) & Kotak Search Lebar (Kanan) -->
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <!-- Status Filter Tabs -->
        <div class="flex space-x-1 bg-slate-100/90 p-1 rounded-xl overflow-x-auto shrink-0">
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
          <button
            type="button"
            @click="selectedTab = 'cancelled'"
            class="px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer"
            :class="[
              selectedTab === 'cancelled'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ]"
          >
            Dibatalkan ({{ stats.cancelled }})
          </button>
        </div>

        <!-- Prominent Wide Search Input -->
        <div class="relative flex-1 lg:max-w-xl">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari Resi, Order ID TikTok, Nama Penerima, SKU..."
            class="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition"
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

      <!-- Baris 2: Filter Batch Kompak, Filter Rentang Tanggal, & Indikator Hasil -->
      <div
        class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-3 border-t border-slate-100"
      >
        <div class="flex flex-wrap items-center gap-2.5">
          <!-- Compact Batch Selector Dropdown & Quick Actions -->
          <div class="flex items-center gap-1.5 shrink-0">
            <select
              v-model="selectedBatchId"
              class="w-44 sm:w-52 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer transition truncate"
              title="Filter berdasarkan Batch Upload"
            >
              <option value="">Semua Batch Upload</option>
              <option v-for="b in batches" :key="b.id" :value="b.id">
                Batch #{{ b.id }} - {{ b.name }}
              </option>
            </select>

            <template v-if="selectedBatchId !== ''">
              <button
                type="button"
                @click="openEditCurrentBatch"
                class="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs transition cursor-pointer"
                title="Ubah nama batch terpilih"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                type="button"
                @click="openDeleteCurrentBatch"
                class="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs transition cursor-pointer"
                title="Hapus batch ini beserta semua pesanannya"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </template>
          </div>

          <!-- Single Date Range Picker Component -->
          <div class="w-full sm:w-72 shrink-0">
            <DateRangePicker
              v-model:startDate="startDate"
              v-model:endDate="endDate"
              placeholder="Filter rentang tanggal..."
            />
          </div>
        </div>

        <!-- Right Side: Counter & Reset Filter Button -->
        <div class="flex items-center gap-3 text-xs justify-between md:justify-end">
          <span class="text-slate-500">
            Menampilkan
            <strong class="text-slate-900 font-mono">{{ filteredOrders.length }}</strong> dari
            <strong class="text-slate-900 font-mono">{{ stats.total }}</strong> pesanan
          </span>
          <button
            v-if="isFilterActive"
            type="button"
            @click="resetFilters"
            class="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
          >
            Reset Filter
          </button>
        </div>
      </div>
    </div>

    <!-- Active Date Range Filter Pill (jika rentang tanggal aktif) -->
    <div
      v-if="startDate || endDate"
      class="bg-blue-50/70 border border-blue-200/80 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-blue-900"
    >
      <div class="flex items-center gap-2">
        <svg
          class="w-4 h-4 text-blue-600 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span>
          Filter Rentang Tanggal:
          <strong class="font-mono">{{
            startDate ? startDate.split('-').reverse().join('-') : 'Awal'
          }}</strong>
          s/d
          <strong class="font-mono">{{
            endDate ? endDate.split('-').reverse().join('-') : 'Hari ini'
          }}</strong>
          &mdash; Ditemukan <strong>{{ filteredOrders.length }}</strong> pesanan.
        </span>
      </div>
      <button
        type="button"
        @click="
          startDate = '';
          endDate = '';
        "
        class="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer text-xs"
      >
        Hapus Filter Tanggal
      </button>
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
              <th class="px-3 py-3 w-[115px] whitespace-nowrap">Tgl Pesanan</th>
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
            v-for="order in paginatedOrders"
            :key="order.resi"
            @click="openDetail(order)"
            class="border-b-2 border-slate-200/70 hover:bg-slate-50/70 transition-colors cursor-pointer group"
          >
            <!-- Baris Pertama: Memuat Item Pertama + Kolom Bersama (Resi, Tanggal, Penerima, Status) -->
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
                    v-if="order.status === 'dibatalkan'"
                    class="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 uppercase tracking-wider"
                  >
                    Dibatalkan
                  </span>
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

              <!-- 2. Tanggal Pesanan -->
              <td
                :rowspan="Math.max(1, order.items.length)"
                class="px-3 py-3 w-[115px] align-top whitespace-nowrap bg-white group-hover:bg-slate-50/70 border-r border-slate-100 transition-colors"
              >
                <div class="font-bold text-slate-800 text-xs font-mono">
                  {{ formatOrderDate(order) }}
                </div>
                <div
                  v-if="order.ship_date && order.created_at"
                  class="text-[10px] text-slate-400 mt-0.5"
                  :title="`Diupload ke sistem: ${formatDate(order.created_at)}`"
                >
                  Upload: {{ formatShortUploadDate(order.created_at) }}
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
                  class="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md text-xs font-mono"
                  :class="[
                    order.items[0].qty > 1
                      ? 'bg-rose-600 text-white shadow-xs font-black ring-2 ring-rose-300'
                      : 'bg-slate-100 text-slate-900 font-black border border-slate-200',
                  ]"
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
                  v-if="order.status === 'dibatalkan'"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Dibatalkan
                </span>
                <span
                  v-else-if="order.is_packed"
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
                  v-if="order.status === 'dibatalkan'"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Dibatalkan
                </span>
                <span
                  v-else-if="order.is_shipped"
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
                  class="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-md text-xs font-mono"
                  :class="[
                    item.qty > 1
                      ? 'bg-rose-600 text-white shadow-xs font-black ring-2 ring-rose-300'
                      : 'bg-slate-100 text-slate-900 font-black border border-slate-200',
                  ]"
                >
                  {{ item.qty }}
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
          <!-- Peringatan Pesanan Dibatalkan -->
          <div
            v-if="selectedOrder.status === 'dibatalkan'"
            class="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex items-start space-x-3 text-rose-900 shadow-sm"
          >
            <div
              class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div class="flex-1 text-xs">
              <h4 class="font-extrabold text-sm text-rose-900">
                PERINGATAN: PESANAN INI TELAH DIBATALKAN
              </h4>
              <p class="mt-0.5 text-rose-800 leading-relaxed">
                Pesanan telah dibatalkan oleh pembeli atau sistem. Jika paket sudah terlanjur
                dikemas (packing),
                <strong>harap bongkar paket dan kembalikan produk ke rak stok</strong>. Sistem
                scanner otomatis menolak resi ini jika discan untuk pengiriman.
              </p>
            </div>
          </div>

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

          <!-- Order Date & Upload Timestamp Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tanggal Pesanan / Label Kirim
              </span>
              <div class="font-mono text-sm font-bold text-slate-900 mt-1">
                {{ selectedOrder.ship_date || '-' }}
              </div>
            </div>

            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Waktu Import / Upload Sistem
              </span>
              <div class="text-sm font-bold text-slate-900 mt-1">
                {{ formatDate(selectedOrder.created_at) }}
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
                      class="px-3.5 py-2.5 text-center font-mono"
                      :class="it.qty > 1 ? 'font-black text-rose-600 bg-rose-50/50' : 'font-bold text-slate-900 bg-slate-50/50'"
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

        <!-- Modal Footer with Edit & Delete Actions -->
        <div
          class="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0"
        >
          <button
            type="button"
            @click="openDeleteOrder(selectedOrder)"
            class="px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
            title="Hapus pesanan ini dari database"
          >
            <svg
              class="w-4 h-4 text-rose-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>Hapus Pesanan</span>
          </button>

          <div class="flex items-center space-x-2">
            <!-- Batalkan Pesanan Button (jika belum dibatalkan) -->
            <button
              v-if="selectedOrder.status !== 'dibatalkan'"
              type="button"
              @click="openCancelOrder(selectedOrder)"
              class="px-4 py-2 border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
              title="Tandai pesanan ini sebagai Dibatalkan (Cancel)"
            >
              <svg
                class="w-4 h-4 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
              <span>Batalkan Pesanan</span>
            </button>

            <!-- Pulihkan Pesanan Button (jika status dibatalkan) -->
            <button
              v-else
              type="button"
              @click="handleRestoreOrder(selectedOrder)"
              :disabled="isRestoring"
              class="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
              title="Pulihkan pesanan ini ke status aktif"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span v-if="isRestoring">Memulihkan...</span>
              <span v-else>Pulihkan Pesanan</span>
            </button>

            <button
              type="button"
              @click="openEditOrder(selectedOrder)"
              class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition cursor-pointer flex items-center space-x-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <span>Edit Data &amp; Barang</span>
            </button>
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

    <!-- MODAL EDIT PESANAN & BARANG -->
    <div
      v-if="showEditOrderModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col"
      >
        <!-- Edit Modal Header -->
        <div class="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-3">
            <div
              class="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-sm"
            >
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-extrabold tracking-tight">Edit Pesanan &amp; Barang</h3>
              <p class="text-xs text-slate-400 font-mono">
                Perbaiki kesalahan parsing atau data salah upload
              </p>
            </div>
          </div>
          <button
            type="button"
            @click="showEditOrderModal = false"
            class="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
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

        <!-- Edit Modal Form Body (Scrollable) -->
        <form
          @submit.prevent="saveEditOrder"
          class="p-6 space-y-5 overflow-y-auto flex-1 text-xs text-slate-800"
        >
          <!-- Identitas Resi & Kurir -->
          <div
            class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80"
          >
            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-700 mb-1"
                >No. Resi J&amp;T *</label
              >
              <input
                v-model="editOrderForm.resi"
                type="text"
                required
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-700 mb-1"
                >Order ID TikTok (18 Digit) *</label
              >
              <input
                v-model="editOrderForm.order_id"
                type="text"
                required
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-700 mb-1"
                >Kode Sortir J&amp;T</label
              >
              <input
                v-model="editOrderForm.sorting_code"
                type="text"
                placeholder="cth: 470-2KLP03-24C"
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-700 mb-1"
                >Layanan Kurir</label
              >
              <input
                v-model="editOrderForm.service"
                type="text"
                placeholder="EZ, NDD, ECO..."
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 uppercase"
              />
            </div>

            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-700 mb-1"
                >Berat Paket (kg)</label
              >
              <input
                v-model.number="editOrderForm.weight_kg"
                type="number"
                step="0.01"
                min="0"
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label class="block font-bold uppercase tracking-wider text-slate-700 mb-1"
                >Tanggal Pesanan / Label</label
              >
              <input
                v-model="editOrderForm.ship_date"
                type="text"
                placeholder="cth: 28-10-2026"
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div class="flex items-center pt-5">
              <label class="flex items-center space-x-2 cursor-pointer font-bold text-slate-800">
                <input
                  v-model="editOrderForm.is_cod"
                  type="checkbox"
                  class="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900"
                />
                <span>Metode Pembayaran COD</span>
              </label>
            </div>
          </div>

          <!-- Data Penerima & Alamat -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 class="font-bold uppercase tracking-wider text-slate-700">
              Data Penerima &amp; Alamat
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-medium text-slate-600 mb-1">Nama Penerima *</label>
                <input
                  v-model="editOrderForm.recipient_name"
                  type="text"
                  required
                  class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label class="block font-medium text-slate-600 mb-1">Nomor Telepon</label>
                <input
                  v-model="editOrderForm.recipient_phone"
                  type="text"
                  class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
            <div>
              <label class="block font-medium text-slate-600 mb-1">Alamat Lengkap Penerima</label>
              <textarea
                v-model="editOrderForm.recipient_address"
                rows="2"
                required
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-slate-900 leading-relaxed"
              ></textarea>
            </div>
          </div>

          <!-- Rincian Item Barang (Dinamis: Tambah/Edit/Hapus) -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-bold uppercase tracking-wider text-slate-700">
                  Rincian Barang yang Harus Dikemas
                </h4>
                <p class="text-[11px] text-slate-400 mt-0.5">
                  Total Qty:
                  <strong class="text-slate-900 font-mono"
                    >{{ editOrderForm.items.reduce((s, it) => s + (it.qty || 0), 0) }} pcs</strong
                  >
                </p>
              </div>
              <button
                type="button"
                @click="addEditItem"
                class="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-xl font-bold text-xs flex items-center space-x-1 cursor-pointer transition shadow-sm"
              >
                <span>Tambah Barang</span>
              </button>
            </div>

            <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table class="min-w-full divide-y divide-slate-200 text-xs">
                <thead class="bg-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <th class="px-3 py-2 text-left">Nama Produk *</th>
                    <th class="px-3 py-2 text-left w-36">SKU / Variasi *</th>
                    <th class="px-3 py-2 text-left w-36">SKU Penjual</th>
                    <th class="px-2 py-2 text-center w-20">Qty *</th>
                    <th class="px-2 py-2 text-center w-12">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr
                    v-for="(it, idx) in editOrderForm.items"
                    :key="idx"
                    class="hover:bg-slate-50/50"
                  >
                    <td class="px-3 py-2">
                      <input
                        v-model="it.product_name"
                        type="text"
                        required
                        placeholder="Nama produk..."
                        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        v-model="it.sku"
                        type="text"
                        required
                        placeholder="SKU produk..."
                        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        v-model="it.seller_sku"
                        type="text"
                        placeholder="SKU penjual..."
                        class="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-700 focus:bg-white focus:ring-2 focus:ring-slate-900"
                      />
                    </td>
                    <td class="px-2 py-2 text-center">
                      <input
                        v-model.number="it.qty"
                        type="number"
                        min="1"
                        required
                        class="w-16 px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-center text-slate-900 focus:bg-white focus:ring-2 focus:ring-slate-900"
                      />
                    </td>
                    <td class="px-2 py-2 text-center">
                      <button
                        type="button"
                        @click="removeEditItem(idx)"
                        :disabled="editOrderForm.items.length <= 1"
                        class="p-1 rounded text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                        title="Hapus baris barang ini"
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
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Status Verifikasi & Catatan -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
            <label class="flex items-center space-x-2 cursor-pointer font-bold text-slate-800">
              <input
                v-model="editOrderForm.needs_review"
                type="checkbox"
                class="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
              />
              <span>Tandai Perlu Diperiksa (Needs Review / Peringatan Validasi)</span>
            </label>
            <div v-if="editOrderForm.needs_review">
              <input
                v-model="editOrderForm.validation_notes"
                type="text"
                placeholder="Catatan validasi / alasan perlu diperiksa..."
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <!-- Modal Action Buttons -->
          <div class="flex justify-end space-x-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              @click="showEditOrderModal = false"
              class="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSavingOrder"
              class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
            >
              <span v-if="isSavingOrder">Menyimpan Perubahan...</span>
              <span v-else>Simpan Perubahan Pesanan</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL KONFIRMASI HAPUS PESANAN -->
    <div
      v-if="deletingOrder"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-200 p-6 space-y-4"
      >
        <div class="flex items-center space-x-3 text-rose-600">
          <div class="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Hapus Pesanan Ini?</h3>
            <p class="text-xs text-slate-500 font-mono">No. Resi: {{ deletingOrder.resi }}</p>
          </div>
        </div>

        <div
          class="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl text-xs text-rose-900 leading-relaxed"
        >
          <p>
            Pesanan atas nama <strong>{{ deletingOrder.recipient_name }}</strong> beserta seluruh
            <strong>{{ deletingOrder.items.length }} barang</strong> di dalamnya akan dihapus
            permanen dari sistem.
          </p>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            @click="deletingOrder = null"
            class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="confirmDeleteOrder"
            :disabled="isDeletingOrder"
            class="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
          >
            <span v-if="isDeletingOrder">Menghapus...</span>
            <span v-else>Ya, Hapus Pesanan</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL KONFIRMASI BATALKAN PESANAN (CANCEL) -->
    <div
      v-if="cancellingOrder"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-amber-200 p-6 space-y-4"
      >
        <div class="flex items-center space-x-3 text-amber-600">
          <div class="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Batalkan Pesanan Ini?</h3>
            <p class="text-xs text-slate-500 font-mono">No. Resi: {{ cancellingOrder.resi }}</p>
          </div>
        </div>

        <div
          class="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-relaxed space-y-1.5"
        >
          <p>
            Pesanan atas nama <strong>{{ cancellingOrder.recipient_name }}</strong> akan ditandai
            dengan status <strong>DIBATALKAN</strong>.
          </p>
          <p class="text-[11px] text-amber-800">
            &bull; Operator gudang tidak akan bisa men-scan resi ini untuk pengiriman.<br />
            &bull; Jika paket sudah terlanjur dipacking, segera pisahkan dari tumpukan siap kirim
            dan kembalikan produk ke rak stok.
          </p>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            @click="cancellingOrder = null"
            class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="confirmCancelOrder"
            :disabled="isCancelling"
            class="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
          >
            <span v-if="isCancelling">Membatalkan...</span>
            <span v-else>Ya, Batalkan Pesanan</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL EDIT NAMA BATCH (DARI ORDERS VIEW) -->
    <div
      v-if="editingBatch"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 p-6 space-y-4"
      >
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-bold text-slate-900">Ubah Nama Batch #{{ editingBatch.id }}</h3>
          <button
            type="button"
            @click="editingBatch = null"
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

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-700"
            >Nama Batch Baru</label
          >
          <input
            v-model="editBatchName"
            type="text"
            required
            class="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="Masukkan nama batch..."
            @keyup.enter="saveEditBatch"
          />
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            @click="editingBatch = null"
            class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="saveEditBatch"
            :disabled="isSavingBatch || !editBatchName.trim()"
            class="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
          >
            <span v-if="isSavingBatch">Menyimpan...</span>
            <span v-else>Simpan Perubahan</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL KONFIRMASI HAPUS BATCH (DARI ORDERS VIEW) -->
    <div
      v-if="deletingBatch"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-200 p-6 space-y-4"
      >
        <div class="flex items-center space-x-3 text-rose-600">
          <div class="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Hapus Batch #{{ deletingBatch.id }}?</h3>
            <p class="text-xs text-slate-500 font-mono">{{ deletingBatch.name }}</p>
          </div>
        </div>

        <div
          class="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl text-xs text-rose-900 leading-relaxed"
        >
          <p class="font-bold">Peringatan Penghapusan:</p>
          <p class="mt-1">
            Seluruh pesanan beserta daftar barang di dalam batch ini akan
            <strong>dihapus permanen</strong> dari sistem.
          </p>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            @click="deletingBatch = null"
            class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="confirmDeleteBatch"
            :disabled="isDeletingBatch"
            class="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
          >
            <span v-if="isDeletingBatch">Menghapus...</span>
            <span v-else>Ya, Hapus Batch Ini</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
