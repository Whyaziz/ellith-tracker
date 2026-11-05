<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api, ApiError } from '../api/client';
import Pagination from '../components/Pagination.vue';

interface CustomerSummary {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  channel: 'offline' | 'online' | 'omnichannel';
  notes: string | null;
  created_at: string;
  updated_at: string;
  total_items_purchased: number;
  total_orders_count: number;
  last_order_date: string | null;
}

interface OrderItemDetail {
  id: number;
  seller_sku: string;
  product_name: string;
  qty: number;
  price: number;
}

interface CustomerOrderDetail {
  id: number;
  order_no: string;
  order_date: string;
  status: string;
  notes: string | null;
  total_qty: number;
  total_amount: number;
  items: OrderItemDetail[];
}

interface CustomerDetailProfile extends CustomerSummary {
  total_spent_amount: number;
  orders: CustomerOrderDetail[];
}

const customers = ref<CustomerSummary[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');
const selectedChannel = ref<'all' | 'offline' | 'online' | 'omnichannel'>('all');

// Pagination
const currentPage = ref(1);
const pageSize = ref(15);

// Modal Create / Edit
const showFormModal = ref(false);
const isEditing = ref(false);
const editingCustomerId = ref<number | null>(null);
const formError = ref('');
const isSaving = ref(false);

const formData = ref({
  name: '',
  phone: '',
  email: '',
  address: '',
  channel: 'offline' as 'offline' | 'online' | 'omnichannel',
  notes: '',
});

// Modal Detail Pelanggan
const showDetailModal = ref(false);
const isLoadingDetail = ref(false);
const selectedCustomer = ref<CustomerDetailProfile | null>(null);

// Modal Konfirmasi Hapus
const showDeleteModal = ref(false);
const customerToDelete = ref<CustomerSummary | null>(null);
const isDeleting = ref(false);

async function loadCustomers() {
  isLoading.value = true;
  try {
    const res = await api.get<{ customers: CustomerSummary[]; total: number }>('/api/customers');
    customers.value = res.customers || [];
  } catch (err) {
    console.error('Gagal memuat daftar pelanggan:', err);
  } finally {
    isLoading.value = false;
  }
}

const filteredCustomers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const ch = selectedChannel.value;

  return customers.value.filter((c) => {
    if (ch !== 'all' && c.channel !== ch) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  });
});

const paginatedCustomers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCustomers.value.slice(start, start + pageSize.value);
});

// KPI Aggregates
const totalCustomersCount = computed(() => customers.value.length);
const totalPurchasedQty = computed(() =>
  customers.value.reduce((sum, c) => sum + (c.total_items_purchased || 0), 0)
);
const activeCustomersCount = computed(
  () => customers.value.filter((c) => (c.total_orders_count || 0) > 0).length
);
const avgQtyPerCustomer = computed(() => {
  if (totalCustomersCount.value === 0) return 0;
  return Math.round(totalPurchasedQty.value / totalCustomersCount.value);
});

function openCreateModal() {
  isEditing.value = false;
  editingCustomerId.value = null;
  formData.value = {
    name: '',
    phone: '',
    email: '',
    address: '',
    channel: 'offline',
    notes: '',
  };
  formError.value = '';
  showFormModal.value = true;
}

function openEditModal(c: CustomerSummary) {
  isEditing.value = true;
  editingCustomerId.value = c.id;
  formData.value = {
    name: c.name,
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    channel: c.channel,
    notes: c.notes || '',
  };
  formError.value = '';
  showFormModal.value = true;
}

async function saveCustomer() {
  if (!formData.value.name.trim()) {
    formError.value = 'Nama pelanggan wajib diisi';
    return;
  }

  isSaving.value = true;
  formError.value = '';

  try {
    if (isEditing.value && editingCustomerId.value) {
      await api.put(`/api/customers/${editingCustomerId.value}`, formData.value);
    } else {
      await api.post('/api/customers', formData.value);
    }
    showFormModal.value = false;
    await loadCustomers();
  } catch (err: any) {
    if (err instanceof ApiError) {
      formError.value = err.message;
    } else {
      formError.value = 'Terjadi kesalahan saat menyimpan data pelanggan';
    }
  } finally {
    isSaving.value = false;
  }
}

async function openDetailModal(c: CustomerSummary) {
  selectedCustomer.value = null;
  showDetailModal.value = true;
  isLoadingDetail.value = true;

  try {
    const res = await api.get<{ customer: CustomerDetailProfile }>(`/api/customers/${c.id}`);
    selectedCustomer.value = res.customer;
  } catch (err) {
    console.error('Gagal mengambil rincian pelanggan:', err);
  } finally {
    isLoadingDetail.value = false;
  }
}

function confirmDelete(c: CustomerSummary) {
  customerToDelete.value = c;
  showDeleteModal.value = true;
}

async function executeDelete() {
  if (!customerToDelete.value) return;

  isDeleting.value = true;
  try {
    await api.delete(`/api/customers/${customerToDelete.value.id}`);
    showDeleteModal.value = false;
    customerToDelete.value = null;
    await loadCustomers();
  } catch (err) {
    console.error('Gagal menghapus pelanggan:', err);
  } finally {
    isDeleting.value = false;
  }
}

function getInitials(name: string): string {
  if (!name) return 'PL';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getWhatsAppUrl(phone: string | null): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^0-9]/g, '');
  if (!clean) return null;
  let formatted = clean;
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.slice(1);
  } else if (!formatted.startsWith('62')) {
    formatted = '62' + formatted;
  }
  return `https://wa.me/${formatted}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

onMounted(() => {
  loadCustomers();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">CRM &amp; Data Pelanggan</h1>
        <p class="text-xs text-slate-500 font-medium mt-1">
          Pelacakan profil pelanggan, kontak WhatsApp, kanal transaksi, dan riwayat pembelian barang.
        </p>
      </div>

      <div class="flex items-center space-x-2">
        <button
          type="button"
          @click="openCreateModal"
          class="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-500/25 transition cursor-pointer"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Tambah Pelanggan</span>
        </button>
      </div>
    </div>

    <!-- KPI Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- 1. Total Pelanggan -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500">
          <span class="text-xs font-bold uppercase tracking-wider">Total Pelanggan</span>
          <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>
        <div class="mt-3">
          <span class="text-2xl font-black text-slate-900 tracking-tight tabular-nums">{{ totalCustomersCount }}</span>
          <span class="text-xs text-slate-400 font-medium ml-1">orang</span>
        </div>
      </div>

      <!-- 2. Total Barang Terbeli (pcs) -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500">
          <span class="text-xs font-bold uppercase tracking-wider">Total Barang Dibeli</span>
          <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
        </div>
        <div class="mt-3">
          <span class="text-2xl font-black text-emerald-600 tracking-tight tabular-nums">{{ totalPurchasedQty.toLocaleString('id-ID') }}</span>
          <span class="text-xs text-slate-400 font-bold ml-1">pcs</span>
        </div>
      </div>

      <!-- 3. Pelanggan Aktif -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500">
          <span class="text-xs font-bold uppercase tracking-wider">Pelanggan Aktif</span>
          <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div class="mt-3">
          <span class="text-2xl font-black text-blue-600 tracking-tight tabular-nums">{{ activeCustomersCount }}</span>
          <span class="text-xs text-slate-400 font-medium ml-1">bertransaksi</span>
        </div>
      </div>

      <!-- 4. Rata-rata per Pelanggan -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500">
          <span class="text-xs font-bold uppercase tracking-wider">Rata-rata Pembelian</span>
          <div class="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
        <div class="mt-3">
          <span class="text-2xl font-black text-purple-700 tracking-tight tabular-nums">{{ avgQtyPerCustomer }}</span>
          <span class="text-xs text-slate-400 font-bold ml-1">pcs / orang</span>
        </div>
      </div>
    </div>

    <!-- Filter & Search Controls -->
    <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
      <div class="flex-1 w-full md:w-auto relative">
        <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari nama pelanggan, nomor telepon/WA, atau alamat..."
          class="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 transition"
        />
      </div>

      <!-- Filter Kanal -->
      <div class="flex items-center space-x-2 w-full md:w-auto">
        <label class="text-xs font-bold text-slate-500 whitespace-nowrap">Kanal:</label>
        <select
          v-model="selectedChannel"
          class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
        >
          <option value="all">Semua Kanal</option>
          <option value="offline">Offline</option>
          <option value="online">Online</option>
          <option value="omnichannel">Omnichannel</option>
        </select>
      </div>
    </div>

    <!-- Customers Table -->
    <div class="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
      <div v-if="isLoading" class="p-12 text-center text-xs text-slate-400">
        <svg class="animate-spin w-7 h-7 text-indigo-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Memuat data pelanggan...</span>
      </div>

      <div v-else-if="filteredCustomers.length === 0" class="p-12 text-center text-xs text-slate-500 font-medium">
        Tidak ada data pelanggan yang sesuai dengan kriteria pencarian.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-left text-xs border-collapse">
          <thead class="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200/80">
            <tr>
              <th class="px-4 py-3.5 min-w-[220px]">Nama Pelanggan</th>
              <th class="px-3.5 py-3.5 w-[160px]">No. Telepon / WA</th>
              <th class="px-3 py-3.5 w-[110px] text-center">Kanal</th>
              <th class="px-3.5 py-3.5 w-[140px] text-center">Total Pembelian</th>
              <th class="px-3.5 py-3.5 min-w-[180px]">Alamat &amp; Catatan</th>
              <th class="px-3 py-3.5 w-[130px] text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="c in paginatedCustomers"
              :key="c.id"
              class="hover:bg-slate-50/70 transition-colors group"
            >
              <!-- 1. Nama Pelanggan -->
              <td class="px-4 py-3.5 align-middle">
                <div class="flex items-center space-x-3">
                  <div class="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0 shadow-xs">
                    {{ getInitials(c.name) }}
                  </div>
                  <div>
                    <div class="font-bold text-slate-900 group-hover:text-indigo-600 transition">{{ c.name }}</div>
                    <div v-if="c.email" class="text-[11px] text-slate-400 font-normal truncate max-w-[200px]">{{ c.email }}</div>
                    <div v-else class="text-[10px] text-slate-400">ID #{{ c.id }}</div>
                  </div>
                </div>
              </td>

              <!-- 2. No. Telepon / WA -->
              <td class="px-3.5 py-3.5 align-middle font-mono whitespace-nowrap">
                <div v-if="c.phone" class="flex items-center space-x-1.5">
                  <span class="text-slate-800 font-medium">{{ c.phone }}</span>
                  <a
                    v-if="getWhatsAppUrl(c.phone)"
                    :href="getWhatsAppUrl(c.phone)!"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Kirim pesan WhatsApp"
                    class="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition cursor-pointer"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </a>
                </div>
                <span v-else class="text-slate-400 font-normal">-</span>
              </td>

              <!-- 3. Kanal -->
              <td class="px-3 py-3.5 align-middle text-center whitespace-nowrap">
                <span
                  v-if="c.channel === 'offline'"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                >
                  Offline
                </span>
                <span
                  v-else-if="c.channel === 'online'"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                >
                  Online
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                >
                  Omnichannel
                </span>
              </td>

              <!-- 4. Total Pembelian (Strictly Total Pcs / Jumlah Barang) -->
              <td class="px-3.5 py-3.5 align-middle text-center whitespace-nowrap">
                <div>
                  <span
                    class="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-mono font-black"
                    :class="[
                      c.total_items_purchased > 0
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    ]"
                  >
                    {{ c.total_items_purchased }} pcs
                  </span>
                  <div v-if="c.total_orders_count > 0" class="text-[10px] text-slate-400 font-medium mt-0.5">
                    {{ c.total_orders_count }} pesanan
                  </div>
                </div>
              </td>

              <!-- 5. Alamat & Catatan -->
              <td class="px-3.5 py-3.5 align-middle text-slate-600">
                <div v-if="c.address" class="text-[11px] line-clamp-1" :title="c.address">
                  {{ c.address }}
                </div>
                <div v-if="c.notes" class="text-[10px] text-slate-400 italic line-clamp-1" :title="c.notes">
                  Catatan: {{ c.notes }}
                </div>
                <span v-if="!c.address && !c.notes" class="text-slate-400 font-mono text-[11px]">-</span>
              </td>

              <!-- 6. Aksi -->
              <td class="px-3.5 py-3.5 align-middle text-center whitespace-nowrap">
                <div class="flex items-center justify-center space-x-1">
                  <!-- Lihat Detail -->
                  <button
                    type="button"
                    @click="openDetailModal(c)"
                    class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                    title="Lihat riwayat transaksi & detail pelanggan"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>

                  <!-- Ubah -->
                  <button
                    type="button"
                    @click="openEditModal(c)"
                    class="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                    title="Ubah data pelanggan"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  <!-- Hapus -->
                  <button
                    type="button"
                    @click="confirmDelete(c)"
                    class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Hapus pelanggan"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <Pagination
        v-model:currentPage="currentPage"
        v-model:pageSize="pageSize"
        :totalItems="filteredCustomers.length"
      />
    </div>

    <!-- MODAL TAMBAH / UBAH PELANGGAN -->
    <div
      v-if="showFormModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div class="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <h3 class="text-base font-bold text-slate-900">
              {{ isEditing ? 'Ubah Data Pelanggan' : 'Tambah Pelanggan Baru' }}
            </h3>
          </div>
          <button
            type="button"
            @click="showFormModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          v-if="formError"
          class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold"
        >
          {{ formError }}
        </div>

        <form @submit.prevent="saveCustomer" class="space-y-3.5">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Nama Pelanggan <span class="text-rose-600">*</span>
            </label>
            <input
              v-model="formData.name"
              type="text"
              required
              placeholder="cth: Ibu Hj. Nurma atau Toko Berkah"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
                No. HP / WhatsApp
              </label>
              <input
                v-model="formData.phone"
                type="text"
                placeholder="cth: 08123456789"
                class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
              />
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Kanal Penjualan
              </label>
              <select
                v-model="formData.channel"
                class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
              >
                <option value="offline">Offline (Toko / Grosir / Walk-in)</option>
                <option value="online">Online (TikTok / Marketplace)</option>
                <option value="omnichannel">Omnichannel (Multi-kanal)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Email (Opsional)
            </label>
            <input
              v-model="formData.email"
              type="email"
              placeholder="cth: nurma@example.com"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Alamat Lengkap
            </label>
            <textarea
              v-model="formData.address"
              rows="2"
              placeholder="Alamat toko, kota, ekspedisi langganan..."
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            ></textarea>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Catatan Khusus
            </label>
            <input
              v-model="formData.notes"
              type="text"
              placeholder="cth: Pelanggan grosir dropship / langganan gamis silk"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div class="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              @click="showFormModal = false"
              class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSaving"
              class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm shadow-indigo-500/25 transition cursor-pointer disabled:opacity-50"
            >
              {{ isSaving ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambah Pelanggan' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL DETAIL & RIWAYAT PEMBELIAN PELANGGAN -->
    <div
      v-if="showDetailModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div class="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-sm">
              {{ selectedCustomer ? getInitials(selectedCustomer.name) : 'PL' }}
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900">
                {{ selectedCustomer?.name || 'Rincian Pelanggan' }}
              </h3>
              <p class="text-[11px] text-slate-400 font-medium">
                Riwayat transaksi pembelian dan detail barang
              </p>
            </div>
          </div>
          <button
            type="button"
            @click="showDetailModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Body Content -->
        <div class="p-6 overflow-y-auto space-y-5 flex-1">
          <div v-if="isLoadingDetail" class="p-12 text-center text-xs text-slate-400">
            <svg class="animate-spin w-7 h-7 text-indigo-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Memuat rincian transaksi pelanggan...</span>
          </div>

          <template v-else-if="selectedCustomer">
            <!-- Profile Info Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <!-- Total Barang Dibeli -->
              <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Barang Dibeli</div>
                <div class="text-xl font-black text-slate-900 mt-1 font-mono">
                  {{ selectedCustomer.total_items_purchased }} pcs
                </div>
              </div>

              <!-- Total Transaksi -->
              <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Nota / Transaksi</div>
                <div class="text-xl font-black text-slate-900 mt-1 font-mono">
                  {{ selectedCustomer.total_orders_count }} transaksi
                </div>
              </div>

              <!-- Kontak & Kanal -->
              <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kanal &amp; Telepon</div>
                <div class="text-xs font-bold text-slate-800 mt-1 flex items-center space-x-1.5">
                  <span class="capitalize">{{ selectedCustomer.channel }}</span>
                  <span v-if="selectedCustomer.phone" class="font-mono text-slate-500 font-normal">({{ selectedCustomer.phone }})</span>
                </div>
              </div>
            </div>

            <!-- Detail Alamat & Catatan -->
            <div v-if="selectedCustomer.address || selectedCustomer.notes" class="text-xs text-slate-600 bg-slate-50/50 p-3 rounded-xl border border-slate-200 space-y-1">
              <div v-if="selectedCustomer.address">
                <strong class="text-slate-800 font-semibold">Alamat:</strong> {{ selectedCustomer.address }}
              </div>
              <div v-if="selectedCustomer.notes">
                <strong class="text-slate-800 font-semibold">Catatan:</strong> {{ selectedCustomer.notes }}
              </div>
            </div>

            <!-- Riwayat Pesanan Section -->
            <div>
              <div class="flex items-center justify-between mb-2.5">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Riwayat Pembelian Barang
                </h4>
                <span class="text-xs text-slate-500 font-medium font-mono">
                  {{ selectedCustomer.orders?.length || 0 }} Transaksi Terkait
                </span>
              </div>

              <div v-if="!selectedCustomer.orders || selectedCustomer.orders.length === 0" class="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400">
                Belum ada transaksi pembelian yang tercatat untuk pelanggan ini.
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="ord in selectedCustomer.orders"
                  :key="ord.id"
                  class="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
                >
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div class="flex items-center space-x-2">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        {{ ord.order_no }}
                      </span>
                      <span class="text-xs text-slate-500 font-medium">
                        Tanggal: {{ ord.order_date }}
                      </span>
                    </div>

                    <div class="flex items-center space-x-3">
                      <span class="text-xs font-bold text-slate-900 font-mono">
                        {{ ord.total_qty }} pcs
                      </span>
                      <span
                        class="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                        :class="[
                          ord.status === 'selesai'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        ]"
                      >
                        {{ ord.status.replace('_', ' ') }}
                      </span>
                    </div>
                  </div>

                  <!-- Items Table -->
                  <div class="overflow-x-auto">
                    <table class="min-w-full text-xs">
                      <thead class="text-slate-400 font-semibold border-b border-slate-100">
                        <tr>
                          <th class="text-left py-1.5 w-[140px]">SKU Penjual</th>
                          <th class="text-left py-1.5">Nama Produk</th>
                          <th class="text-center py-1.5 w-[70px]">Qty</th>
                          <th class="text-right py-1.5 w-[110px]">Harga Satuan</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        <tr v-for="it in ord.items" :key="it.id">
                          <td class="py-1.5 font-mono text-slate-800 font-bold">{{ it.seller_sku }}</td>
                          <td class="py-1.5 text-slate-700">{{ it.product_name }}</td>
                          <td class="py-1.5 text-center font-mono font-bold text-slate-900">{{ it.qty }}</td>
                          <td class="py-1.5 text-right font-mono text-slate-500">
                            {{ it.price > 0 ? formatCurrency(it.price) : '-' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            @click="showDetailModal = false"
            class="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL KONFIRMASI HAPUS PELANGGAN -->
    <div
      v-if="showDeleteModal && customerToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div class="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 p-6 space-y-4">
        <div class="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>

        <div class="text-center space-y-1">
          <h3 class="text-sm font-bold text-slate-900">Hapus Data Pelanggan?</h3>
          <p class="text-xs text-slate-500">
            Anda akan menghapus data pelanggan <strong>{{ customerToDelete.name }}</strong>. Pesanan terkait tidak akan terhapus, namun tidak lagi terhubung ke pelanggan ini.
          </p>
        </div>

        <div class="flex items-center space-x-2 pt-2">
          <button
            type="button"
            @click="showDeleteModal = false"
            class="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executeDelete"
            :disabled="isDeleting"
            class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold shadow-sm shadow-rose-500/25 transition cursor-pointer disabled:opacity-50"
          >
            {{ isDeleting ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
