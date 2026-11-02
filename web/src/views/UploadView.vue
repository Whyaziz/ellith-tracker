<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../api/client';

interface Batch {
  id: number;
  name: string;
  source_filename: string;
  total_orders: number;
  uploaded_at: string;
}

interface ParsedItem {
  product_name: string;
  sku: string;
  seller_sku: string | null;
  qty: number;
}

interface DuplicateInfo {
  batch_id: number;
  batch_name?: string;
  status: string;
  created_at: string;
}

interface ParsedOrder {
  order_id: string;
  resi: string;
  courier: string;
  service: string;
  is_cod: boolean;
  weight_kg: number;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_address: string;
  sorting_code: string | null;
  qty_total: number | null;
  needs_review: boolean;
  validation_notes: string | null;
  items: ParsedItem[];
  is_duplicate?: boolean;
  duplicate_info?: DuplicateInfo | null;
}

const router = useRouter();

const file = ref<File | null>(null);
const batchName = ref('');
const isUploading = ref(false);
const isPreviewing = ref(false);
const errorMessage = ref('');
const uploadSuccess = ref(false);
const successMessage = ref('');

const requiresConfirmation = ref(false);
const isConfirmed = ref(false);
const skipDuplicates = ref(true);

const newOrdersCount = ref(0);
const duplicateOrdersCount = ref(0);

const lastUploadedBatch = ref<Batch | null>(null);
const extractedOrders = ref<ParsedOrder[]>([]);
const recentBatches = ref<Batch[]>([]);

async function generatePreview(selectedFile: File) {
  isPreviewing.value = true;
  errorMessage.value = '';
  uploadSuccess.value = false;
  lastUploadedBatch.value = null;

  const formData = new FormData();
  formData.append('pdf', selectedFile);

  try {
    const res = await api.post<{
      message: string;
      parseResult: {
        orders: ParsedOrder[];
        totalOrders: number;
        newOrdersCount: number;
        duplicateOrdersCount: number;
        hasNeedsReview: boolean;
      };
    }>('/api/batches/preview', formData);

    extractedOrders.value = res.parseResult.orders;
    newOrdersCount.value = res.parseResult.newOrdersCount;
    duplicateOrdersCount.value = res.parseResult.duplicateOrdersCount;
    requiresConfirmation.value = res.parseResult.hasNeedsReview && newOrdersCount.value > 0;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal mempratinjau berkas PDF';
    }
  } finally {
    isPreviewing.value = false;
  }
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    file.value = target.files[0];
    if (!batchName.value) {
      batchName.value = file.value.name.replace(/\.pdf$/i, '');
    }
    errorMessage.value = '';
    requiresConfirmation.value = false;
    isConfirmed.value = false;
    generatePreview(file.value);
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.pdf')) {
      file.value = droppedFile;
      if (!batchName.value) {
        batchName.value = file.value.name.replace(/\.pdf$/i, '');
      }
      errorMessage.value = '';
      requiresConfirmation.value = false;
      isConfirmed.value = false;
      generatePreview(file.value);
    } else {
      errorMessage.value = 'Harap unggah berkas berekstensi .pdf saja';
    }
  }
}

async function fetchBatches() {
  try {
    const data = await api.get<{ batches: Batch[] }>('/api/batches');
    recentBatches.value = data.batches;
  } catch (err) {
    console.error('Gagal mengambil daftar batch:', err);
  }
}

async function handleUpload(forceSave = false) {
  if (!file.value) {
    errorMessage.value = 'Pilih file PDF label resi terlebih dahulu';
    return;
  }

  isUploading.value = true;
  errorMessage.value = '';
  uploadSuccess.value = false;

  const formData = new FormData();
  formData.append('pdf', file.value);
  if (batchName.value.trim()) {
    formData.append('name', batchName.value.trim());
  }
  if (forceSave || isConfirmed.value) {
    formData.append('confirmed', 'true');
  }
  formData.append('skip_duplicates', skipDuplicates.value ? 'true' : 'false');

  try {
    const res = await api.post<{
      message: string;
      batch: Batch;
      stats: {
        total: number;
        inserted: number;
        duplicates: number;
        skipped: number;
        updated: number;
      };
      orders: ParsedOrder[];
      newOrdersCount: number;
      duplicateOrdersCount: number;
    }>('/api/batches/upload', formData);

    lastUploadedBatch.value = res.batch;
    extractedOrders.value = res.orders;
    newOrdersCount.value = res.newOrdersCount;
    duplicateOrdersCount.value = res.duplicateOrdersCount;
    uploadSuccess.value = true;
    successMessage.value = res.message;
    requiresConfirmation.value = false;
    isConfirmed.value = false;
    file.value = null;
    batchName.value = '';
    await fetchBatches();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      if (err.data?.requires_confirmation) {
        requiresConfirmation.value = true;
        extractedOrders.value = err.data.orders || [];
      }
      errorMessage.value = err.message;
    } else {
      errorMessage.value = (err as Error).message || 'Gagal mengunggah dan memproses berkas PDF';
    }
  } finally {
    isUploading.value = false;
  }
}

function goToOrders(batchId?: number) {
  if (batchId) {
    router.push({ path: '/orders', query: { batch_id: batchId } });
  } else {
    router.push('/orders');
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

onMounted(() => {
  fetchBatches();
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
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">Unggah PDF Label Resi J&amp;T</h1>
        <span class="text-[10px] font-black tracking-widest uppercase bg-slate-900 text-white px-2 py-0.5 rounded">
          ELLITH
        </span>
      </div>
      <p class="text-xs sm:text-sm text-slate-500 mt-1">
        Unggah file PDF label cetak dari TikTok Shop Seller Center. Sistem akan mengekstrak No. Resi, Order ID, Alamat, dan Daftar SKU secara otomatis serta mendeteksi duplikat.
      </p>
    </div>

    <!-- Upload Card -->
    <div class="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6 sm:p-8">
      <form @submit.prevent="handleUpload(false)" class="space-y-6">
        <!-- Error Alert -->
        <div v-if="errorMessage" role="alert" class="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-start space-x-2.5">
          <svg class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="flex-1">
            <p class="font-bold">{{ errorMessage }}</p>
            <p v-if="requiresConfirmation" class="text-rose-600 mt-1">
              Periksa resi bertanda kuning di tabel pratinjau bawah. Centang konfirmasi di bawah jika Anda tetap ingin menyimpannya.
            </p>
          </div>
        </div>

        <!-- Duplicate Warning Banner -->
        <div v-if="duplicateOrdersCount > 0 && !uploadSuccess" class="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 space-y-2">
          <div class="flex items-center space-x-2 font-black text-amber-900">
            <svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Terdeteksi {{ duplicateOrdersCount }} Resi Duplikat</span>
          </div>
          <p class="text-amber-800 leading-relaxed font-medium">
            <template v-if="newOrdersCount === 0">
              Seluruh <strong>{{ duplicateOrdersCount }} resi</strong> dalam dokumen ini sudah pernah diunggah sebelumnya. Resi duplikat ditandai sebagai <strong>Duplikat</strong> di tabel bawah dan otomatis <strong>dilewati (discard)</strong> agar tidak terjadi duplikasi pesanan.
            </template>
            <template v-else>
              Terdapat <strong>{{ duplicateOrdersCount }} resi duplikat</strong> yang sudah ada di database dan <strong>{{ newOrdersCount }} resi baru</strong>. Resi duplikat akan otomatis <strong>dilewati (discard)</strong> dan hanya resi baru yang disimpan.
            </template>
          </p>
          <label class="flex items-center space-x-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              v-model="skipDuplicates"
              class="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900"
            />
            <span class="text-xs font-bold text-slate-800">
              Lewati resi duplikat (Discard) — jangan ubah data pesanan yang sudah tersimpan
            </span>
          </label>
        </div>

        <!-- Confirmation Prompt if mismatch found -->
        <div v-if="requiresConfirmation" class="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-900 space-y-3">
          <div class="flex items-center space-x-2 font-bold text-rose-900">
            <svg class="w-5 h-5 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Peringatan Validasi Kuantitas Item</span>
          </div>
          <p class="text-rose-800">
            Satu atau lebih resi baru memiliki total Qty produk yang tidak sesuai dengan Qty Total pada label. Sesuai aturan, resi ini tidak dapat disimpan secara otomatis sebelum Anda memberikan konfirmasi.
          </p>
          <label class="flex items-center space-x-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              v-model="isConfirmed"
              class="w-4 h-4 text-rose-600 border-slate-300 rounded focus:ring-rose-500"
            />
            <span class="text-xs font-bold text-slate-900">
              Saya telah memeriksa data di atas dan mengonfirmasi untuk tetap menyimpan batch ini.
            </span>
          </label>
        </div>

        <!-- Success Alert -->
        <div v-if="uploadSuccess" class="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start justify-between">
          <div class="flex items-start space-x-2.5">
            <svg class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p class="font-bold text-sm">Proses Selesai!</p>
              <p class="text-emerald-800 mt-0.5">
                {{ successMessage || `Batch berhasil diproses dengan total ${extractedOrders.length} resi.` }}
              </p>
            </div>
          </div>
          <button
            v-if="lastUploadedBatch"
            type="button"
            @click="goToOrders(lastUploadedBatch.id)"
            class="px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition cursor-pointer"
          >
            Buka Daftar Pesanan &rarr;
          </button>
        </div>

        <!-- Drag & Drop Zone -->
        <div
          @dragover.prevent
          @drop="onDrop"
          class="border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center transition-all cursor-pointer group"
          :class="[file ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-900 bg-slate-50/50 hover:bg-slate-50']"
          @click="($refs.fileInput as HTMLInputElement).click()"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".pdf"
            class="hidden"
            @change="onFileChange"
          />

          <div class="w-14 h-14 bg-slate-100 group-hover:bg-slate-200 text-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-3 transition">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <div v-if="file">
            <p class="text-sm font-bold text-slate-900">{{ file.name }}</p>
            <p class="text-xs text-slate-500 mt-1">Ukuran: {{ (file.size / 1024).toFixed(1) }} KB &bull; Klik atau seret berkas lain untuk mengganti</p>
          </div>
          <div v-else>
            <p class="text-sm font-bold text-slate-800">
              <span class="text-slate-900 underline underline-offset-2">Klik untuk memilih file</span> atau seret file PDF ke sini
            </p>
            <p class="text-xs text-slate-500 mt-1">Mendukung file PDF resi gabungan TikTok Shop (J&amp;T Express)</p>
          </div>
        </div>

        <!-- Custom Batch Name -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Nama Batch (Opsional)</label>
            <input
              v-model="batchName"
              type="text"
              placeholder="cth: Batch 15.51 (31 Okt)"
              class="mt-1.5 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition"
            />
            <p class="text-[11px] text-slate-400 mt-1">Jika dikosongkan, nama batch akan dibuat otomatis dari nama file.</p>
          </div>
        </div>

        <!-- Action Button -->
        <div class="flex justify-end space-x-3">
          <button
            v-if="requiresConfirmation"
            type="button"
            @click="handleUpload(true)"
            :disabled="!isConfirmed || isUploading || isPreviewing"
            class="px-6 py-3 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer flex items-center space-x-2"
          >
            <svg v-if="isUploading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Konfirmasi &amp; Simpan Batch</span>
          </button>

          <button
            v-else
            type="submit"
            :disabled="!file || isUploading || isPreviewing"
            class="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md hover:bg-slate-800 active:bg-black disabled:opacity-50 transition cursor-pointer flex items-center space-x-2"
          >
            <svg v-if="isUploading || isPreviewing" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span v-if="isPreviewing">Menganalisis Berkas PDF...</span>
            <span v-else-if="isUploading">Menyimpan ke Database...</span>
            <span v-else-if="file && newOrdersCount === 0 && duplicateOrdersCount > 0">
              Proses (Semua {{ duplicateOrdersCount }} Resi Duplikat)
            </span>
            <span v-else-if="file && newOrdersCount > 0 && duplicateOrdersCount > 0">
              Simpan {{ newOrdersCount }} Pesanan Baru ({{ duplicateOrdersCount }} Duplikat Dilewati)
            </span>
            <span v-else>Proses &amp; Simpan Batch</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Live Preview Table -->
    <div v-if="extractedOrders.length > 0" class="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-50/80">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Hasil Ekstraksi Resi ({{ extractedOrders.length }} Pesanan)
            </h2>
            <span v-if="duplicateOrdersCount > 0" class="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-900 rounded-full border border-amber-300">
              {{ duplicateOrdersCount }} Duplikat
            </span>
            <span v-if="newOrdersCount > 0" class="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-900 rounded-full">
              {{ newOrdersCount }} Baru
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Periksa data hasil ekstraksi otomatis di bawah ini sebelum disimpan
          </p>
        </div>
        <button
          v-if="lastUploadedBatch"
          type="button"
          @click="goToOrders(lastUploadedBatch?.id)"
          class="text-xs font-bold text-slate-900 hover:underline cursor-pointer"
        >
          Buka Halaman Pesanan &rarr;
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead class="bg-slate-100/70 text-slate-700 font-bold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">No. Resi &amp; Layanan</th>
              <th class="px-4 py-3">Order ID (18 Digit)</th>
              <th class="px-4 py-3">Penerima &amp; Alamat</th>
              <th class="px-4 py-3">Kode Sortir</th>
              <th class="px-4 py-3">Rincian Barang (Produk &amp; SKU)</th>
              <th class="px-4 py-3 text-center">Status Validasi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr
              v-for="order in extractedOrders"
              :key="order.resi"
              class="hover:bg-slate-50 transition"
              :class="{
                'bg-amber-50/40': order.is_duplicate,
                'bg-rose-50/40': !order.is_duplicate && order.needs_review,
              }"
            >
              <td class="px-4 py-3 align-top whitespace-nowrap">
                <div class="font-bold text-slate-900 font-mono text-xs">{{ order.resi }}</div>
                <div class="flex items-center space-x-1.5 mt-1">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">{{ order.service }}</span>
                  <span v-if="order.is_cod" class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">COD</span>
                  <span class="text-[11px] text-slate-500">{{ order.weight_kg }} kg</span>
                </div>
              </td>

              <td class="px-4 py-3 align-top font-mono text-slate-800 font-medium">
                {{ order.order_id }}
              </td>

              <td class="px-4 py-3 align-top max-w-xs">
                <div class="font-bold text-slate-900">{{ order.recipient_name }}</div>
                <div v-if="order.recipient_phone" class="text-slate-500 font-mono text-[11px]">{{ order.recipient_phone }}</div>
                <div class="text-slate-600 text-[11px] line-clamp-2 mt-0.5" :title="order.recipient_address">
                  {{ order.recipient_address }}
                </div>
              </td>

              <td class="px-4 py-3 align-top font-mono font-bold text-slate-700 whitespace-nowrap">
                {{ order.sorting_code || '-' }}
              </td>

              <td class="px-4 py-3 align-top min-w-[250px]">
                <div class="space-y-1.5">
                  <div
                    v-for="(item, idx) in order.items"
                    :key="idx"
                    class="p-2 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px]"
                  >
                    <div class="font-semibold text-slate-900">{{ item.product_name }}</div>
                    <div class="flex items-center space-x-2 text-slate-600 mt-1">
                      <span class="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px]">SKU: {{ item.sku }}</span>
                      <span class="font-bold text-slate-900 font-mono">Qty: {{ item.qty }}</span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- Status Validasi & Duplikat -->
              <td class="px-4 py-3 align-top text-center whitespace-nowrap">
                <div v-if="order.is_duplicate" class="space-y-1">
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Duplikat
                  </span>
                  <p class="text-[10px] text-amber-800 font-medium max-w-[150px] mx-auto text-center leading-tight">
                    {{ order.duplicate_info?.batch_name ? `Ada di ${order.duplicate_info.batch_name}` : 'Sudah terdaftar' }}
                    <span v-if="order.duplicate_info?.status" class="block text-slate-500 text-[9px] capitalize">
                      (Status: {{ order.duplicate_info.status.replace('_', ' ') }})
                    </span>
                  </p>
                </div>

                <div v-else-if="order.needs_review" class="space-y-1">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Perlu Diperiksa
                  </span>
                  <p class="text-[10px] text-rose-600 font-medium max-w-[130px] mx-auto text-center leading-tight">
                    {{ order.validation_notes }}
                  </p>
                </div>

                <div v-else>
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Baru &amp; Valid
                  </span>
                  <p class="text-[10px] text-slate-400 mt-0.5 font-mono">
                    Total: {{ order.items.reduce((s, it) => s + it.qty, 0) }} pcs
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Recent Batches List -->
    <div class="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6 sm:p-8">
      <h2 class="text-sm font-bold uppercase tracking-wider text-slate-900 mb-4">Riwayat Unggahan Batch</h2>

      <div v-if="recentBatches.length === 0" class="text-xs text-slate-500 text-center py-6 font-medium">
        Belum ada batch yang diunggah. Unggah file PDF resi di atas untuk memulai.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead class="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Nama Batch</th>
              <th class="px-4 py-3">Nama File Sumber</th>
              <th class="px-4 py-3">Jumlah Resi</th>
              <th class="px-4 py-3">Waktu Unggah</th>
              <th class="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr v-for="b in recentBatches" :key="b.id" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-bold text-slate-900">{{ b.name }}</td>
              <td class="px-4 py-3 font-mono text-slate-600">{{ b.source_filename }}</td>
              <td class="px-4 py-3">
                <span class="px-2.5 py-0.5 bg-slate-100 text-slate-900 rounded-full font-bold font-mono">
                  {{ b.total_orders }} Resi
                </span>
              </td>
              <td class="px-4 py-3 text-slate-500 font-mono">{{ formatDate(b.uploaded_at) }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  type="button"
                  @click="goToOrders(b.id)"
                  class="text-xs font-bold text-slate-900 hover:underline cursor-pointer"
                >
                  Buka Pesanan &rarr;
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
