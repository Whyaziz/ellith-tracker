<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { api, ApiError } from '../api/client';

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
  weight_kg: number | null;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_address: string;
  sorting_code: string | null;
  status: string;
  is_packed: boolean;
  packed_at: string | null;
  is_shipped: boolean;
  shipped_at: string | null;
}

interface ScanResponse {
  logId: number;
  result: 'ok' | 'duplikat' | 'tidak_ditemukan' | 'status_tidak_valid';
  message: string;
  order: Order | null;
  items: OrderItem[];
  packedAt?: string | null;
  packedBy?: string | null;
  shippedAt?: string | null;
  shippedBy?: string | null;
}

interface ScanLogItem {
  id: number;
  order_id: number | null;
  resi_scanned: string;
  mode: 'packing' | 'pengiriman';
  result: 'ok' | 'duplikat' | 'tidak_ditemukan' | 'status_tidak_valid';
  scanned_at: string;
  username: string | null;
  recipient_name: string | null;
  recipient_address: string | null;
  order_status: string | null;
}

interface ScanStats {
  totalLogs: number;
  packingSuccess: number;
  shippingSuccess: number;
  duplicates: number;
  notFound: number;
  invalidStatus: number;
  totalOrders: number;
  waitingPacked: number;
  packed: number;
  shipped: number;
}

// Mode scan: packing vs pengiriman
const currentMode = ref<'packing' | 'pengiriman'>('packing');
const barcodeQuery = ref('');
const isScanning = ref(false);
const soundEnabled = ref(true);

// Focus reference
const barcodeInput = ref<HTMLInputElement | null>(null);

// Modal popup state
const showModal = ref(false);
const activeScan = ref<ScanResponse | null>(null);
const timerRemaining = ref(5);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// History logs & stats
const recentLogs = ref<ScanLogItem[]>([]);
const stats = ref<ScanStats | null>(null);
const errorMessage = ref<string | null>(null);
const toastMessage = ref<string | null>(null);

// Modal Konfirmasi Bersihkan Riwayat Log Scan (dengan Password)
const showClearLogsModal = ref(false);
const clearPassword = ref('');
const clearError = ref<string | null>(null);
const isClearingLogs = ref(false);
const clearPasswordInput = ref<HTMLInputElement | null>(null);

function openClearLogsModal() {
  clearPassword.value = '';
  clearError.value = null;
  showClearLogsModal.value = true;
  setTimeout(() => {
    clearPasswordInput.value?.focus();
  }, 60);
}

function closeClearLogsModal() {
  showClearLogsModal.value = false;
  clearPassword.value = '';
  clearError.value = null;
  focusInput();
}

async function submitClearLogs() {
  if (!clearPassword.value.trim()) {
    clearError.value = 'Password konfirmasi wajib diisi';
    return;
  }

  isClearingLogs.value = true;
  clearError.value = null;

  try {
    const res = await api.post<{ success: boolean; message: string }>('/api/scan/clear-logs', {
      password: clearPassword.value,
    });

    closeClearLogsModal();
    toastMessage.value = res.message || 'Riwayat scan berhasil dibersihkan.';
    await loadLogsAndStats();

    setTimeout(() => {
      if (toastMessage.value?.includes('dibersihkan')) {
        toastMessage.value = null;
      }
    }, 4000);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      clearError.value = err.message;
    } else {
      clearError.value = 'Gagal membersihkan riwayat scan. Pastikan password benar.';
    }
  } finally {
    isClearingLogs.value = false;
  }
}

function focusInput() {
  if (showModal.value || showClearLogsModal.value) return;
  nextTick(() => {
    if (!showModal.value && !showClearLogsModal.value) {
      barcodeInput.value?.focus();
    }
  });
}

function onBarcodeBlur() {
  if (showModal.value || showClearLogsModal.value) return;
  setTimeout(() => {
    if (showModal.value || showClearLogsModal.value) return;
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'BUTTON' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.tagName === 'TEXTAREA')
    ) {
      return;
    }
    barcodeInput.value?.focus();
  }, 100);
}

// Web Audio API beep
function playAudioFeedback(type: 'ok' | 'duplikat' | 'error') {
  if (!soundEnabled.value) return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'ok') {
      // High pitch double-chirp success
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'duplikat') {
      // Double warning buzz
      const now = ctx.currentTime;
      [0, 0.12].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now + offset);
        gain.gain.setValueAtTime(0.18, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.08);
        osc.start(now + offset);
        osc.stop(now + offset + 0.08);
      });
    } else {
      // Low error buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // Ignore audio context autoplay restriction errors
  }
}

// Fetch scan logs & stats
async function loadLogsAndStats() {
  try {
    const [logsRes, statsRes] = await Promise.all([
      api.get<{ logs: ScanLogItem[] }>('/api/scan/logs?limit=25'),
      api.get<{ stats: ScanStats }>('/api/scan/stats'),
    ]);
    recentLogs.value = logsRes.logs;
    stats.value = statsRes.stats;
  } catch (err) {
    console.error('Gagal memuat log scan:', err);
  }
}

// Start 5-second popup timer
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  timerRemaining.value = 5;

  countdownInterval = setInterval(() => {
    timerRemaining.value -= 1;
    if (timerRemaining.value <= 0) {
      closeModal();
    }
  }, 1000);
}

function closeModal() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  showModal.value = false;
  activeScan.value = null;
  focusInput();
}

// Handle scan submit
async function handleScan() {
  const code = barcodeQuery.value.trim();
  if (!code || isScanning.value) return;

  isScanning.value = true;
  errorMessage.value = null;
  toastMessage.value = null;

  try {
    const res = await api.post<ScanResponse>('/api/scan', {
      resi: code,
      mode: currentMode.value,
    });

    activeScan.value = res;
    showModal.value = true;
    barcodeQuery.value = '';

    // Play sound feedback
    if (res.result === 'ok') {
      playAudioFeedback('ok');
    } else if (res.result === 'duplikat') {
      playAudioFeedback('duplikat');
    } else {
      playAudioFeedback('error');
    }

    startCountdown();
    await loadLogsAndStats();
  } catch (err: unknown) {
    playAudioFeedback('error');
    if (err instanceof ApiError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Terjadi kesalahan sistem saat memproses scan.';
    }
  } finally {
    isScanning.value = false;
  }
}

// Undo action
async function handleUndo(orderId: number, mode: 'packing' | 'pengiriman', logId?: number) {
  try {
    const res = await api.post<{ success: boolean; message: string }>('/api/scan/undo', {
      orderId,
      mode,
      logId,
    });

    toastMessage.value = res.message;
    closeModal();
    await loadLogsAndStats();

    setTimeout(() => {
      if (toastMessage.value === res.message) {
        toastMessage.value = null;
      }
    }, 4000);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal membatalkan: ${err.message}`);
    }
  }
}

function switchMode(mode: 'packing' | 'pengiriman') {
  currentMode.value = mode;
  focusInput();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Keyboard shortcuts
function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showClearLogsModal.value) {
      closeClearLogsModal();
      return;
    }
    if (showModal.value) {
      closeModal();
      return;
    }
  }

  // If Enter pressed while scan result modal is open, quickly dismiss modal to continue scanning
  if (e.key === 'Enter' && showModal.value) {
    closeModal();
    return;
  }

  // Jika modal pembersihan riwayat sedang terbuka, biarkan user mengetik password tanpa gangguan
  if (showClearLogsModal.value) {
    return;
  }

  // Jika fokus sedang berada di input/textarea/select lain, jangan rebut fokus
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
    return;
  }

  // Auto focus input barcode jika user mulai mengetik/scan saat tidak ada modal aktif
  if (!showModal.value && !showClearLogsModal.value && document.activeElement !== barcodeInput.value) {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      barcodeInput.value?.focus();
    }
  }
}

onMounted(() => {
  focusInput();
  loadLogsAndStats();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
    <!-- Header with ELLITH Branding & Mode Switcher -->
    <div
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5"
    >
      <div>
        <div class="flex items-center space-x-2.5">
          <h1 class="text-2xl font-black text-slate-900 tracking-tight">Scan Barcode Resi</h1>
          <span
            class="text-[10px] font-black tracking-widest uppercase bg-slate-900 text-white px-2 py-0.5 rounded"
          >
            ELLITH
          </span>
        </div>
      </div>

      <!-- Mode Buttons & Sound Toggle -->
      <div class="flex items-center gap-2.5">
        <!-- Audio Mute Toggle -->
        <button
          type="button"
          @click="soundEnabled = !soundEnabled"
          class="p-2.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer"
          :class="
            soundEnabled
              ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          "
          :title="
            soundEnabled
              ? 'Suara Aktif (Klik untuk Membisukan)'
              : 'Suara Bisu (Klik untuk Mengaktifkan)'
          "
          aria-label="Toggle suara feedback"
        >
          <svg
            v-if="soundEnabled"
            class="w-5 h-5 text-slate-800"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          </svg>
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
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
            />
          </svg>
        </button>

        <!-- Mode Toggle Selector -->
        <div
          class="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200/80 shadow-inner"
        >
          <button
            type="button"
            @click="switchMode('packing')"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
            :class="
              currentMode === 'packing'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            "
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            1. Mode Packing
          </button>
          <button
            type="button"
            @click="switchMode('pengiriman')"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
            :class="
              currentMode === 'pengiriman'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            "
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
              />
            </svg>
            2. Mode Pengiriman
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification (Undo/Success) -->
    <div
      v-if="toastMessage"
      role="status"
      class="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in"
    >
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clip-rule="evenodd"
          />
        </svg>
        <span>{{ toastMessage }}</span>
      </div>
      <button
        @click="toastMessage = null"
        class="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
      >
        Tutup
      </button>
    </div>

    <!-- Error Alert -->
    <div
      v-if="errorMessage"
      role="alert"
      class="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm"
    >
      <span>{{ errorMessage }}</span>
      <button
        @click="errorMessage = null"
        class="text-rose-700 hover:text-rose-900 text-xs font-bold cursor-pointer"
      >
        Tutup
      </button>
    </div>

    <!-- Active Scan Card & Input Box -->
    <div
      class="rounded-3xl border-2 p-6 transition-all duration-200 shadow-sm"
      :class="
        currentMode === 'packing'
          ? 'bg-slate-900/5 border-slate-300'
          : 'bg-emerald-50/50 border-emerald-300'
      "
    >
      <div class="flex flex-col md:flex-row items-center gap-6">
        <!-- Visual Status Icon -->
        <div
          class="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
          :class="
            currentMode === 'packing' ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'
          "
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
        </div>

        <!-- Barcode Form Input -->
        <div class="flex-1 w-full">
          <div class="flex items-center justify-between mb-2">
            <label
              for="barcode"
              class="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2"
            >
              <span>Input Barcode Resi J&amp;T</span>
              <span
                class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider"
                :class="
                  currentMode === 'packing'
                    ? 'bg-slate-900 text-white'
                    : 'bg-emerald-600 text-white'
                "
              >
                MODE {{ currentMode.toUpperCase() }}
              </span>
            </label>
            <span class="text-xs text-slate-400 font-medium"
              >Auto-focus aktif &bull; Tekan Enter</span
            >
          </div>

          <form @submit.prevent="handleScan" class="flex gap-2.5">
            <div class="relative flex-1">
              <input
                id="barcode"
                ref="barcodeInput"
                v-model="barcodeQuery"
                type="text"
                autocomplete="off"
                placeholder="Scan barcode"
                :disabled="isScanning"
                @blur="onBarcodeBlur"
                class="w-full text-lg font-mono font-bold tracking-wider px-4 py-3.5 bg-white border-2 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 transition-all"
                :class="
                  currentMode === 'packing'
                    ? 'border-slate-300 focus:border-slate-900 focus:ring-slate-900/10'
                    : 'border-emerald-300 focus:border-emerald-600 focus:ring-emerald-500/10'
                "
              />
              <div v-if="isScanning" class="absolute right-4 top-4">
                <svg class="animate-spin h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24">
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
              </div>
            </div>

            <button
              type="submit"
              :disabled="isScanning || !barcodeQuery.trim()"
              class="px-6 py-3.5 rounded-2xl text-white font-bold text-sm transition-all shadow-md flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
              :class="
                currentMode === 'packing'
                  ? 'bg-slate-900 hover:bg-slate-800 active:bg-black shadow-slate-900/10'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/10'
              "
            >
              <span>Scan</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>

    <!-- Quick Statistics Summary Bento Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <div class="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Total Pesanan
        </div>
        <div class="text-2xl font-black text-slate-900 mt-1 font-mono">
          {{ stats?.totalOrders ?? 0 }}
        </div>
        <div class="text-[11px] text-slate-400 mt-0.5">Database ELLITH</div>
      </div>
      <div class="bg-white border border-amber-200/80 rounded-2xl p-4 shadow-sm">
        <div class="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
          Menunggu Packing
        </div>
        <div class="text-2xl font-black text-amber-600 mt-1 font-mono">
          {{ stats?.waitingPacked ?? 0 }}
        </div>
        <div class="text-[11px] text-amber-700/70 mt-0.5">Belum dikemas</div>
      </div>
      <div class="bg-white border border-blue-200/80 rounded-2xl p-4 shadow-sm">
        <div class="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
          Siap Kirim (Dikemas)
        </div>
        <div class="text-2xl font-black text-blue-600 mt-1 font-mono">{{ stats?.packed ?? 0 }}</div>
        <div class="text-[11px] text-blue-700/70 mt-0.5">Selesai packing</div>
      </div>
      <div class="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-sm">
        <div class="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
          Selesai Dikirim
        </div>
        <div class="text-2xl font-black text-emerald-600 mt-1 font-mono">
          {{ stats?.shipped ?? 0 }}
        </div>
        <div class="text-[11px] text-emerald-700/70 mt-0.5">Diserahkan ke kurir J&amp;T</div>
      </div>
    </div>

    <!-- Recent Scan Logs Table -->
    <div class="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
      <div
        class="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Riwayat Scan Terkini
          </h2>
          <span
            class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono"
          >
            {{ recentLogs.length }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <!-- Tombol Bersihkan Riwayat (dengan Konfirmasi Password) -->
          <button
            type="button"
            @click="openClearLogsModal"
            :disabled="recentLogs.length === 0"
            class="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 font-bold inline-flex items-center gap-1.5 cursor-pointer transition px-3 py-1.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            title="Bersihkan seluruh riwayat scan barcode"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>Bersihkan Riwayat</span>
          </button>

          <!-- Tombol Segarkan -->
          <button
            type="button"
            @click="loadLogsAndStats"
            class="text-xs text-slate-600 hover:text-slate-900 font-bold inline-flex items-center gap-1 cursor-pointer transition px-2.5 py-1.5 rounded-xl hover:bg-slate-100"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-xs text-left">
          <thead class="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Waktu</th>
              <th class="px-4 py-3">No. Resi</th>
              <th class="px-4 py-3">Mode</th>
              <th class="px-4 py-3">Hasil Scan</th>
              <th class="px-4 py-3">Penerima</th>
              <th class="px-4 py-3">Operator</th>
              <th class="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="recentLogs.length === 0">
              <td colspan="7" class="px-6 py-10 text-center text-slate-400 font-medium">
                Belum ada data riwayat scan. Arahkan barcode scanner ke label resi.
              </td>
            </tr>
            <tr
              v-for="log in recentLogs"
              :key="log.id"
              class="hover:bg-slate-50/70 transition-colors"
            >
              <td class="px-4 py-3 whitespace-nowrap text-slate-500 font-mono">
                {{ formatDate(log.scanned_at) }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap font-mono font-bold text-slate-900">
                {{ log.resi_scanned }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold capitalize"
                  :class="
                    log.mode === 'packing'
                      ? 'bg-slate-100 text-slate-800 border border-slate-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  "
                >
                  {{ log.mode }}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span
                  v-if="log.result === 'ok'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  BERHASIL
                </span>
                <span
                  v-else-if="log.result === 'duplikat'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                  DUPLIKAT
                </span>
                <span
                  v-else-if="log.result === 'status_tidak_valid'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                  BELUM DIKEMAS
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                  TIDAK DITEMUKAN
                </span>
              </td>
              <td class="px-4 py-3 text-slate-700">
                <div class="font-bold">{{ log.recipient_name ?? '-' }}</div>
                <div class="text-[11px] text-slate-400 truncate max-w-xs">
                  {{ log.recipient_address ?? '-' }}
                </div>
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-slate-500">
                {{ log.username ?? 'admin' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-right">
                <button
                  v-if="log.result === 'ok' && log.order_id"
                  type="button"
                  @click="handleUndo(log.order_id, log.mode, log.id)"
                  class="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer hover:underline"
                  title="Batalkan status scan ini"
                >
                  Batalkan
                </button>
                <span v-else class="text-slate-300">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 5-SECOND DETAIL POPUP MODAL -->
    <div
      v-if="showModal && activeScan"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border transform transition-all animate-scale-up"
        :class="
          activeScan.result === 'ok'
            ? 'border-emerald-400 ring-4 ring-emerald-500/20'
            : activeScan.result === 'duplikat'
              ? 'border-amber-400 ring-4 ring-amber-500/20'
              : 'border-rose-400 ring-4 ring-rose-500/20'
        "
      >
        <!-- Modal Header Banner -->
        <div
          class="px-6 py-4 flex items-center justify-between"
          :class="
            activeScan.result === 'ok'
              ? 'bg-emerald-600 text-white'
              : activeScan.result === 'duplikat'
                ? 'bg-amber-500 text-white'
                : 'bg-rose-600 text-white'
          "
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0"
            >
              <svg
                v-if="activeScan.result === 'ok'"
                class="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <svg
                v-else-if="activeScan.result === 'duplikat'"
                class="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <svg
                v-else
                class="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-black tracking-wide">
                <template v-if="activeScan.result === 'ok'">
                  {{
                    currentMode === 'packing'
                      ? 'BERHASIL DIKEMAS'
                      : 'BERHASIL DISIAPKAN UNTUK PENGIRIMAN'
                  }}
                </template>
                <template v-else-if="activeScan.result === 'duplikat'">
                  RESI DUPLIKAT (SUDAH DI-SCAN)
                </template>
                <template v-else-if="activeScan.result === 'status_tidak_valid'">
                  STATUS TIDAK VALID: BELUM DIKEMAS
                </template>
                <template v-else> RESI TIDAK DITEMUKAN </template>
              </h3>
              <p class="text-xs text-white/90 font-medium">{{ activeScan.message }}</p>
            </div>
          </div>

          <!-- Timer Badge -->
          <div
            class="bg-black/25 text-white font-mono text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5"
          >
            <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span>{{ timerRemaining }}s</span>
          </div>
        </div>

        <!-- 5-Second Animated Progress Bar -->
        <div class="w-full bg-slate-100 h-1.5">
          <div
            class="h-full transition-all duration-1000 ease-linear"
            :style="{ width: `${(timerRemaining / 5) * 100}%` }"
            :class="
              activeScan.result === 'ok'
                ? 'bg-emerald-400'
                : activeScan.result === 'duplikat'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
            "
          ></div>
        </div>

        <!-- Modal Body Content -->
        <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- Order & Recipient Info -->
          <div
            v-if="activeScan.order"
            class="bg-slate-50 border border-slate-200/80 rounded-2xl p-4"
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  No. Resi J&amp;T
                </div>
                <div class="text-xl font-black font-mono text-slate-900 mt-0.5">
                  {{ activeScan.order.resi }}
                </div>
                <div class="text-xs text-slate-500 font-mono mt-0.5">
                  Order ID: {{ activeScan.order.order_id }}
                </div>
              </div>

              <div>
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Layanan &amp; Kurir
                </div>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span class="px-2 py-0.5 bg-slate-900 text-white font-bold text-xs rounded-md">
                    J&amp;T {{ activeScan.order.service }}
                  </span>
                  <span
                    v-if="activeScan.order.is_cod"
                    class="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold text-xs rounded-md"
                  >
                    COD
                  </span>
                  <span
                    v-if="activeScan.order.sorting_code"
                    class="text-xs font-mono font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-md"
                  >
                    {{ activeScan.order.sorting_code }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Penerima & Alamat -->
            <div class="mt-3 pt-3 border-t border-slate-200/70">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Penerima &amp; Alamat
              </div>
              <div class="text-sm font-bold text-slate-900 mt-0.5">
                {{ activeScan.order.recipient_name }}
                <span
                  v-if="activeScan.order.recipient_phone"
                  class="text-xs font-normal text-slate-500 font-mono ml-1"
                >
                  ({{ activeScan.order.recipient_phone }})
                </span>
              </div>
              <div class="text-xs text-slate-600 mt-1 leading-relaxed">
                {{ activeScan.order.recipient_address }}
              </div>
            </div>
          </div>

          <!-- Items Checklist Table -->
          <div v-if="activeScan.items && activeScan.items.length > 0">
            <div
              class="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between"
            >
              <span>Rincian Barang yang Harus Dikemas ({{ activeScan.items.length }} Item)</span>
              <span class="text-slate-500 font-semibold text-xs">
                Total Qty: {{ activeScan.items.reduce((sum, it) => sum + it.qty, 0) }} pcs
              </span>
            </div>
            <div class="border border-slate-200 rounded-xl overflow-hidden">
              <table class="min-w-full divide-y divide-slate-200 text-xs">
                <thead class="bg-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <th class="px-3.5 py-2 text-left">Nama Produk</th>
                    <th class="px-3.5 py-2 text-left">Variasi / SKU</th>
                    <th class="px-3.5 py-2 text-left">SKU Penjual</th>
                    <th class="px-3.5 py-2 text-center w-16">Qty</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  <tr v-for="item in activeScan.items" :key="item.id" class="hover:bg-slate-50">
                    <td class="px-3.5 py-2 font-medium text-slate-900">{{ item.product_name }}</td>
                    <td class="px-3.5 py-2 text-slate-700 font-mono font-medium">{{ item.sku }}</td>
                    <td class="px-3.5 py-2 text-slate-500 font-mono">
                      {{ item.seller_sku ?? '-' }}
                    </td>
                    <td
                      class="px-3.5 py-2 text-center font-bold text-slate-900 bg-slate-50/60 font-mono"
                    >
                      {{ item.qty }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Empty fallback if not found -->
          <div v-if="!activeScan.order" class="py-6 text-center text-slate-500">
            <p class="text-xs">
              Silakan periksa kembali barcode fisik atau unggah file label PDF terlebih dahulu pada
              menu <strong>Daftar Pesanan &gt; Unggah PDF</strong>.
            </p>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div
          class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between"
        >
          <div>
            <!-- Undo Button if Ok -->
            <button
              v-if="activeScan.result === 'ok' && activeScan.order"
              type="button"
              @click="handleUndo(activeScan.order.id, currentMode, activeScan.logId)"
              class="px-3.5 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
              Batalkan (Undo)
            </button>
          </div>

          <div class="flex items-center gap-2">
            <!-- Close / Continue button -->
            <button
              type="button"
              @click="closeModal"
              class="px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              :class="
                activeScan.result === 'ok'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : activeScan.result === 'duplikat'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
              "
            >
              <span>{{ activeScan.result === 'ok' ? 'Lanjutkan Scan' : 'Tutup' }}</span>
              <span class="text-white/80 font-mono text-[10px]">({{ timerRemaining }}s)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Konfirmasi Bersihkan Riwayat Scan (dengan Password) -->
  <div
    v-if="showClearLogsModal"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
    @click.self="closeClearLogsModal"
  >
    <div
      class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200/80 space-y-4 animate-scale-up"
    >
      <div class="flex items-center space-x-3">
        <div
          class="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200/70 flex items-center justify-center shrink-0"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>
        <div>
          <h3 class="text-base font-black text-slate-900">Bersihkan Riwayat Scan</h3>
          <p class="text-xs text-slate-500 font-medium">Konfirmasi password akun login</p>
        </div>
      </div>

      <p class="text-xs text-slate-600 leading-relaxed">
        Tindakan ini akan menghapus seluruh data baris riwayat scan barcode dari database agar tampilan tabel kembali kosong dan bersih. Status paket yang sudah dikemas/dikirim tetap tersimpan aman pada data pesanan.
      </p>

      <form @submit.prevent="submitClearLogs" class="space-y-4">
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Masukkan Password Akun Anda *
          </label>
          <input
            ref="clearPasswordInput"
            v-model="clearPassword"
            type="password"
            required
            placeholder="Ketik password untuk konfirmasi..."
            class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition"
          />
          <p v-if="clearError" class="text-xs font-semibold text-rose-600 mt-1.5">
            {{ clearError }}
          </p>
        </div>

        <div class="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            @click="closeClearLogsModal"
            :disabled="isClearingLogs"
            class="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            :disabled="isClearingLogs || !clearPassword.trim()"
            class="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl transition shadow-md shadow-rose-600/20 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            <span v-if="isClearingLogs">Menghapus...</span>
            <span v-else>Konfirmasi &amp; Bersihkan</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleUp {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fade-in {
  animation: fadeIn 0.15s ease-out forwards;
}

.animate-scale-up {
  animation: scaleUp 0.15s ease-out forwards;
}
</style>
