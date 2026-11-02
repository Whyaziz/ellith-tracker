<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
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
  order_id: string;
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
  created_at: string;
  items: OrderItem[];
}

const batches = ref<Batch[]>([]);
const orders = ref<Order[]>([]);
const isLoading = ref(false);
const isExporting = ref(false);

const selectedBatchId = ref<number | ''>('');
const selectedStatus = ref<'all' | 'unpacked' | 'packed' | 'shipped'>('all');

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
    const res = await api.get<{ orders: Order[]; total: number }>(`/api/orders?${params.toString()}`);
    orders.value = res.orders;
  } catch (err) {
    console.error('Gagal memuat data pesanan untuk export:', err);
  } finally {
    isLoading.value = false;
  }
}

const filteredOrders = computed(() => {
  return orders.value.filter((o) => {
    if (selectedStatus.value === 'unpacked') return !o.is_packed;
    if (selectedStatus.value === 'packed') return o.is_packed && !o.is_shipped;
    if (selectedStatus.value === 'shipped') return o.is_shipped;
    return true;
  });
});

function exportToCsv() {
  isExporting.value = true;
  try {
    const headers = [
      'No. Resi',
      'Order ID',
      'Kurir',
      'Layanan',
      'COD',
      'Berat (kg)',
      'Nama Penerima',
      'No. Telepon',
      'Alamat Penerima',
      'Kode Sortir',
      'Status Packing',
      'Waktu Packing',
      'Status Pengiriman',
      'Waktu Pengiriman',
      'Nama Produk',
      'SKU',
      'SKU Penjual',
      'Qty',
      'Batch ID',
    ];

    const rows: string[][] = [];

    for (const ord of filteredOrders.value) {
      if (ord.items && ord.items.length > 0) {
        for (const item of ord.items) {
          rows.push([
            ord.resi,
            ord.order_id,
            ord.courier,
            ord.service,
            ord.is_cod ? 'COD' : 'NON-COD',
            ord.weight_kg?.toString() ?? '',
            ord.recipient_name,
            ord.recipient_phone ?? '',
            ord.recipient_address.replace(/\n|\r/g, ' '),
            ord.sorting_code ?? '',
            ord.is_packed ? 'Sudah Dikemas' : 'Belum Dikemas',
            ord.packed_at ?? '',
            ord.is_shipped ? 'Sudah Dikirim' : 'Belum Dikirim',
            ord.shipped_at ?? '',
            item.product_name.replace(/\n|\r/g, ' '),
            item.sku,
            item.seller_sku ?? '',
            item.qty.toString(),
            ord.batch_id.toString(),
          ]);
        }
      } else {
        rows.push([
          ord.resi,
          ord.order_id,
          ord.courier,
          ord.service,
          ord.is_cod ? 'COD' : 'NON-COD',
          ord.weight_kg?.toString() ?? '',
          ord.recipient_name,
          ord.recipient_phone ?? '',
          ord.recipient_address.replace(/\n|\r/g, ' '),
          ord.sorting_code ?? '',
          ord.is_packed ? 'Sudah Dikemas' : 'Belum Dikemas',
          ord.packed_at ?? '',
          ord.is_shipped ? 'Sudah Dikirim' : 'Belum Dikirim',
          ord.shipped_at ?? '',
          '-',
          '-',
          '-',
          '0',
          ord.batch_id.toString(),
        ]);
      }
    }

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((e) =>
          e
            .map((field) => {
              const str = field.replace(/"/g, '""');
              return `"${str}"`;
            })
            .join(',')
        )
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `ELLITH_Laporan_Pesanan_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } finally {
    isExporting.value = false;
  }
}

onMounted(async () => {
  await fetchBatches();
  await fetchOrders();
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <!-- Breadcrumb back link -->
    <div>
      <RouterLink
        to="/orders"
        class="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer"
      >
        <span>&larr; Kembali ke Daftar Pesanan</span>
      </RouterLink>

      <div class="flex items-center space-x-2.5 mt-2">
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">Export Laporan Pesanan</h1>
        <span class="text-[10px] font-black tracking-widest uppercase bg-slate-900 text-white px-2 py-0.5 rounded">
          ELLITH
        </span>
      </div>
      <p class="text-xs sm:text-sm text-slate-500 mt-1">
        Unduh berkas CSV pesanan TikTok Shop (J&amp;T Express) lengkap dengan status packing dan pengiriman untuk arsip atau laporan kurir.
      </p>
    </div>

    <!-- Export Configuration Card -->
    <div class="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Batch Filter -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Pilih Batch Upload</label>
          <select
            v-model="selectedBatchId"
            @change="fetchOrders"
            class="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer transition"
          >
            <option value="">Semua Batch (Seluruh Pesanan)</option>
            <option v-for="b in batches" :key="b.id" :value="b.id">
              Batch #{{ b.id }} &bull; {{ b.name }}
            </option>
          </select>
        </div>

        <!-- Status Filter -->
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Filter Status Operasional</label>
          <select
            v-model="selectedStatus"
            class="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer transition"
          >
            <option value="all">Semua Status</option>
            <option value="unpacked">Hanya yang Belum Dikemas</option>
            <option value="packed">Hanya yang Sudah Dikemas (Siap Kirim)</option>
            <option value="shipped">Hanya yang Sudah Dikirim (Diserahkan ke Kurir)</option>
          </select>
        </div>
      </div>

      <!-- Summary Stats Preview -->
      <div class="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Resi yang Akan Diexport</p>
          <p class="text-2xl font-black text-slate-900 mt-0.5 font-mono">
            {{ filteredOrders.length }} <span class="text-sm font-semibold text-slate-500">Resi</span>
          </p>
        </div>

        <button
          type="button"
          @click="exportToCsv"
          :disabled="isLoading || filteredOrders.length === 0 || isExporting"
          class="px-6 py-3 bg-slate-900 hover:bg-slate-800 active:bg-black text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/10 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span v-if="isExporting">Membuat Berkas...</span>
          <span v-else>Unduh Laporan CSV (.csv)</span>
        </button>
      </div>

      <div class="border-t border-slate-100 pt-3">
        <p class="text-[11px] text-slate-400">
          * Berkas CSV diformat dengan UTF-8 BOM sehingga langsung terbaca rapi pada Microsoft Excel dan Google Sheets.
        </p>
      </div>
    </div>
  </div>
</template>
