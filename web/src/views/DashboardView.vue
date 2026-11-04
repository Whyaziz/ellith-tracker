<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Chart from 'chart.js/auto';
import { api } from '../api/client';
import DateRangePicker from '../components/DateRangePicker.vue';

interface DashboardData {
  kpis: {
    totalOrders: number;
    totalShippedOrders: number;
    totalItemsSold: number;
    totalStockAvailable: number;
    stockoutCount: number;
    understockCount: number;
    normalStockCount: number;
    overstockCount: number;
  };
  salesTrend: Array<{ date: string; count: number; qty: number; label?: string; total_qty?: number; total_orders?: number }>;
  stockByCategory: Array<{ category: string; total_stock: number }>;
  topSelling: Array<{
    seller_sku: string;
    name: string;
    image_url: string | null;
    category: string;
    total_sold: number;
    current_stock: number;
  }>;
  healthAlerts: Array<{
    seller_sku: string;
    name: string;
    category: string;
    current_stock: number;
    min_stock: number;
    max_stock: number;
    status: 'habis' | 'menipis' | 'berlebih' | 'normal';
    recommendation: string;
  }>;
  timeframe?: string;
  startDate?: string;
  endDate?: string;
}

const data = ref<DashboardData | null>(null);
const isLoading = ref(true);
const isTrendLoading = ref(false);

// Filter Date Range Khusus Line Chart
const defaultStart = new Date();
defaultStart.setDate(defaultStart.getDate() - 6);
const chartStartDate = ref(defaultStart.toISOString().slice(0, 10));
const chartEndDate = ref(new Date().toISOString().slice(0, 10));

const totalSoldInPeriod = computed(() => {
  return (data.value?.salesTrend || []).reduce((sum, item) => sum + (Number(item.qty ?? item.total_qty) || 0), 0);
});

const totalOrdersInPeriod = computed(() => {
  return (data.value?.salesTrend || []).reduce((sum, item) => sum + (Number(item.count ?? item.total_orders) || 0), 0);
});

function setRangePreset(preset: '7d' | '30d' | 'month' | 'all') {
  const now = new Date();
  if (preset === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    chartStartDate.value = d.toISOString().slice(0, 10);
    chartEndDate.value = now.toISOString().slice(0, 10);
  } else if (preset === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    chartStartDate.value = d.toISOString().slice(0, 10);
    chartEndDate.value = now.toISOString().slice(0, 10);
  } else if (preset === 'month') {
    chartStartDate.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    chartEndDate.value = now.toISOString().slice(0, 10);
  } else if (preset === 'all') {
    chartStartDate.value = '';
    chartEndDate.value = '';
  }
}

function isPresetActive(preset: '7d' | '30d' | 'month' | 'all') {
  const now = new Date().toISOString().slice(0, 10);
  if (preset === 'all') {
    return !chartStartDate.value && !chartEndDate.value;
  }
  if (chartEndDate.value !== now) return false;
  if (preset === '7d') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return chartStartDate.value === d.toISOString().slice(0, 10);
  }
  if (preset === '30d') {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return chartStartDate.value === d.toISOString().slice(0, 10);
  }
  if (preset === 'month') {
    const d = new Date();
    const firstDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return chartStartDate.value === firstDay;
  }
  return false;
}

// Filter & Helper Status Peringatan Stok
const selectedAlertStatus = ref<'all' | 'menipis' | 'berlebih' | 'habis' | 'normal'>('all');

const filteredAlerts = computed(() => {
  const alerts = data.value?.healthAlerts || [];
  if (selectedAlertStatus.value === 'all') return alerts;
  return alerts.filter((a) => a.status === selectedAlertStatus.value);
});

function getAlertLabel(status: string): string {
  switch (status) {
    case 'habis':
      return 'Habis';
    case 'menipis':
      return 'Understock';
    case 'berlebih':
      return 'Overstock';
    case 'normal':
      return 'Normal';
    default:
      return status;
  }
}

function getAlertBadgeClass(status: string): string {
  switch (status) {
    case 'habis':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'menipis':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'berlebih':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'normal':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    default:
      return 'bg-slate-50 text-slate-700 border border-slate-200';
  }
}

function getAlertDotClass(status: string): string {
  switch (status) {
    case 'habis':
      return 'bg-rose-500';
    case 'menipis':
      return 'bg-amber-500';
    case 'berlebih':
      return 'bg-blue-500';
    case 'normal':
      return 'bg-emerald-500';
    default:
      return 'bg-slate-400';
  }
}

// Canvas references & Chart instances
const salesCanvas = ref<HTMLCanvasElement | null>(null);
const categoryCanvas = ref<HTMLCanvasElement | null>(null);
let salesChartInstance: Chart | null = null;
let categoryChartInstance: Chart | null = null;

// Drill-Down Kategori ke Rincian SKU
const selectedDrillCategory = ref<string | null>(null);

const currentCategorySkus = computed(() => {
  if (!selectedDrillCategory.value || !data.value?.healthAlerts) return [];
  return data.value.healthAlerts
    .filter((it) => it.category === selectedDrillCategory.value)
    .sort((a, b) => b.current_stock - a.current_stock);
});

const currentCategoryTotalStock = computed(() => {
  return currentCategorySkus.value.reduce((sum, it) => sum + Math.max(0, it.current_stock), 0);
});

function selectCategoryDrilldown(categoryName: string) {
  selectedDrillCategory.value = categoryName;
  nextTick(() => {
    renderCategoryChart();
  });
}

function clearCategoryDrilldown() {
  selectedDrillCategory.value = null;
  nextTick(() => {
    renderCategoryChart();
  });
}

function renderSalesChart() {
  if (salesChartInstance) {
    salesChartInstance.destroy();
    salesChartInstance = null;
  }
  if (!salesCanvas.value || !data.value?.salesTrend?.length) return;

  const ctx = salesCanvas.value.getContext('2d');
  if (!ctx) return;

  // Background gradient fill - Tailored Indigo & Cyan Glow
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, 'rgba(79, 70, 229, 0.22)');
  gradient.addColorStop(0.7, 'rgba(79, 70, 229, 0.04)');
  gradient.addColorStop(1, 'rgba(79, 70, 229, 0.00)');

  const labels = data.value.salesTrend.map((t: any) => t.label || t.date?.slice(5) || '');
  const quantities = data.value.salesTrend.map((t: any) => Number(t.qty ?? t.total_qty ?? 0));
  const counts = data.value.salesTrend.map((t: any) => Number(t.count ?? t.total_orders ?? 0));

  salesChartInstance = new Chart(salesCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Kuantitas Terjual',
          data: quantities,
          borderColor: '#4f46e5',
          backgroundColor: gradient,
          fill: true,
          tension: 0.38,
          borderWidth: 2.8,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#4f46e5',
          pointBorderWidth: 2.2,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: '#4f46e5',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#1e1b4b',
          titleColor: '#ffffff',
          bodyColor: '#34d399',
          borderColor: '#3730a3',
          borderWidth: 1,
          padding: 11,
          cornerRadius: 12,
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 12, weight: 'bold' },
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              const originalDate = data.value?.salesTrend[idx]?.date || items[0].label;
              return `Tanggal: ${originalDate}`;
            },
            label: (item) => {
              const idx = item.dataIndex;
              const count = counts[idx] || 0;
              return `Terjual: ${item.formattedValue} pcs (${count} pesanan)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'monospace' },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: '#f1f5f9',
          },
          border: {
            dash: [4, 4],
          },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'monospace' },
            precision: 0,
          },
        },
      },
    },
  });
}

// Plugin Chart.js untuk menampilkan angka jumlah stok di samping setiap bar
const barValueLabelsPlugin = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx, chartArea } = chart;
    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((element: any, index: number) => {
        const val = dataset.data[index];
        if (val === undefined || val === null) return;

        const numVal = Number(val);
        const text = `${numVal.toLocaleString('id-ID')} pcs`;

        ctx.save();
        ctx.font = '600 10.5px Inter, system-ui, -apple-system, sans-serif';
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(text).width;
        const xPos = element.x + 6;
        const yPos = element.y;

        // Jika bar terlalu panjang mendekati batas kanan chartArea
        if (xPos + textWidth > chartArea.right + 2) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, Math.max(chartArea.left + textWidth + 8, element.x - 6), yPos);
        } else {
          ctx.textAlign = 'left';
          ctx.fillStyle = '#475569'; // slate-600
          ctx.fillText(text, xPos, yPos);
        }

        ctx.restore();
      });
    });
  },
};

function renderCategoryChart() {
  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }
  if (!categoryCanvas.value) return;

  // Mode 1: Drill-down SKU Bar Chart untuk Kategori yang dipilih
  if (selectedDrillCategory.value) {
    const skus = currentCategorySkus.value;
    if (!skus.length) return;

    const labels = skus.map((s) => s.seller_sku);
    const stocks = skus.map((s) => Math.max(0, s.current_stock));
    const bgColors = skus.map((s) => {
      if (s.status === 'habis' || s.current_stock <= 0) return '#f43f5e'; // Rose-500
      if (s.status === 'menipis' || s.current_stock < s.min_stock) return '#f59e0b'; // Amber-500
      if (s.status === 'berlebih' || s.current_stock > s.max_stock) return '#0ea5e9'; // Sky-500
      return '#6366f1'; // Indigo-500
    });

    categoryChartInstance = new Chart(categoryCanvas.value, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Stok SKU',
            data: stocks,
            backgroundColor: bgColors,
            borderRadius: 6,
            barThickness: 14,
          },
        ],
      },
      plugins: [barValueLabelsPlugin],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { right: 38 },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex ?? 0;
                const it = skus[idx];
                return it ? `${it.seller_sku} (${it.name})` : '';
              },
              label: (item) => {
                const it = skus[item.dataIndex];
                const statusLabel =
                  it?.status === 'habis'
                    ? '🔴 Stok Habis'
                    : it?.status === 'menipis'
                      ? `🟡 Menipis (< ${it.min_stock})`
                      : it?.status === 'berlebih'
                        ? `🔵 Overstock (> ${it.max_stock})`
                        : '🟢 Normal';
                return [
                  `Stok Tersedia: ${Number(item.raw).toLocaleString('id-ID')} pcs`,
                  `Status: ${statusLabel}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grace: '18%',
            grid: { color: '#f1f5f9' },
            ticks: { color: '#64748b', font: { size: 10 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#1e293b', font: { size: 11, weight: 'bold' } },
          },
        },
      },
    });
    return;
  }

  // Mode 2: Tampilan Ringkasan Semua Kategori
  if (!data.value?.stockByCategory?.length) return;

  const categories = data.value.stockByCategory.map((c) => c.category);
  const stocks = data.value.stockByCategory.map((c) => c.total_stock);

  categoryChartInstance = new Chart(categoryCanvas.value, {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        {
          label: 'Stok Tersedia',
          data: stocks,
          backgroundColor: '#4f46e5',
          hoverBackgroundColor: '#4338ca',
          borderRadius: 8,
          barThickness: 16,
        },
      ],
    },
    plugins: [barValueLabelsPlugin],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { right: 38 },
      },
      onClick: (_event, elements, chart) => {
        if (elements.length > 0) {
          const elementIndex = elements[0].index;
          const cat = chart.data.labels?.[elementIndex];
          if (cat && typeof cat === 'string') {
            selectCategoryDrilldown(cat);
          }
        }
      },
      onHover: (event, elements) => {
        const target = event.native?.target as HTMLElement | null;
        if (target) {
          target.style.cursor = elements.length ? 'pointer' : 'default';
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1b4b',
          titleColor: '#ffffff',
          bodyColor: '#38bdf8',
          borderColor: '#3730a3',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: (item) => `Stok: ${Number(item.raw).toLocaleString('id-ID')} pcs`,
            afterLabel: () => '👉 Klik bar untuk rincian SKU',
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grace: '18%',
          grid: { color: '#f1f5f9' },
          ticks: { color: '#64748b', font: { size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#334155', font: { size: 11, weight: 'bold' } },
        },
      },
    },
  });
}

async function fetchDashboard() {
  isLoading.value = true;
  try {
    const params = new URLSearchParams();
    if (chartStartDate.value) params.append('startDate', chartStartDate.value);
    if (chartEndDate.value) params.append('endDate', chartEndDate.value);

    const res = await api.get<DashboardData>(`/api/dashboard/summary?${params.toString()}`);
    data.value = res;
    await nextTick();
    renderSalesChart();
    renderCategoryChart();
  } catch (err) {
    console.error('Gagal mengambil data dashboard:', err);
  } finally {
    isLoading.value = false;
  }
}

async function fetchSalesTrend() {
  isTrendLoading.value = true;
  try {
    const params = new URLSearchParams();
    if (chartStartDate.value) params.append('startDate', chartStartDate.value);
    if (chartEndDate.value) params.append('endDate', chartEndDate.value);

    const res = await api.get<{ dataPoints: Array<{ date: string; label: string; count: number; qty: number }> }>(
      `/api/dashboard/sales-trend?${params.toString()}`
    );
    if (data.value) {
      data.value.salesTrend = res.dataPoints || [];
    }
    await nextTick();
    renderSalesChart();
  } catch (err) {
    console.error('Gagal memuat tren penjualan:', err);
  } finally {
    isTrendLoading.value = false;
  }
}

watch([chartStartDate, chartEndDate], () => {
  fetchSalesTrend();
});

onMounted(() => {
  fetchDashboard();
});

onBeforeUnmount(() => {
  if (salesChartInstance) {
    salesChartInstance.destroy();
    salesChartInstance = null;
  }
  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <!-- Header with Branding (Filter waktu umum di dashboard telah dihapus) -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-5">
      <div>
        <div class="flex items-center space-x-2.5">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Ringkasan Operasional &amp; ERP</h1>
          <span class="text-[10px] font-bold tracking-widest uppercase bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-2 py-0.5 rounded shadow-xs">
            ELLITH
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          Pantau perputaran stok garment, produk terlaris, dan peringatan inventaris gudang secara langsung.
        </p>
      </div>
    </div>

    <!-- 1. Metric Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Pesanan -->
      <div class="bg-gradient-to-br from-blue-50/70 via-white to-white border border-blue-100/80 rounded-3xl p-5 shadow-xs hover:shadow-sm transition-all duration-200">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-blue-700">Total Pesanan</span>
          <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/25">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-slate-800 font-mono tabular-nums mt-2">
          {{ data?.kpis.totalOrders ?? 0 }}
        </div>
        <div class="text-[11px] text-slate-500 mt-1">Gabungan Online &amp; Offline</div>
      </div>

      <!-- Total Terkirim -->
      <div class="bg-gradient-to-br from-indigo-50/70 via-white to-white border border-indigo-100/80 rounded-3xl p-5 shadow-xs hover:shadow-sm transition-all duration-200">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-indigo-700">Telah Terkirim</span>
          <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-500/25">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-slate-800 font-mono tabular-nums mt-2">
          {{ data?.kpis.totalShippedOrders ?? 0 }}
        </div>
        <div class="text-[11px] text-indigo-600 font-bold mt-1">Status Selesai Kirim</div>
      </div>

      <!-- Total Terjual (Pcs) -->
      <div class="bg-gradient-to-br from-emerald-50/70 via-white to-white border border-emerald-100/80 rounded-3xl p-5 shadow-xs hover:shadow-sm transition-all duration-200">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Terjual</span>
          <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shadow-emerald-500/25">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-slate-800 font-mono tabular-nums mt-2">
          {{ data?.kpis.totalItemsSold ?? 0 }} <span class="text-xs font-medium text-slate-400">pcs</span>
        </div>
        <div class="text-[11px] text-emerald-700 font-bold mt-1">Garment Terdistribusi</div>
      </div>

      <!-- Total Stok Tersedia -->
      <div class="bg-gradient-to-br from-amber-50/60 via-white to-white border border-amber-100/80 rounded-3xl p-5 shadow-xs hover:shadow-sm transition-all duration-200">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-amber-700">Stok Tersedia</span>
          <div class="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-sm shadow-amber-500/25">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-slate-800 font-mono tabular-nums mt-2">
          {{ data?.kpis.totalStockAvailable ?? 0 }} <span class="text-xs font-medium text-slate-400">pcs</span>
        </div>
        <div class="text-[11px] text-slate-500 mt-1">Sisa fisik di gudang</div>
      </div>
    </div>

    <!-- 2. Charts Section: Chart.js Line Chart & Chart.js Bar Chart -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Line Chart Penjualan Harian (2 Cols) -->
      <div class="lg:col-span-2 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
        <div>
          <!-- Line Chart Header: Title & Filter Date Range Khusus -->
          <div class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 class="text-sm font-bold uppercase tracking-wider text-slate-900">Grafik Penjualan Harian</h2>
              <p class="text-xs text-slate-400 mt-0.5">Tren kuantitas item terjual per hari dalam rentang tanggal terpilih</p>
            </div>

            <!-- Filter Date Range Khusus Line Chart -->
            <div class="flex flex-wrap items-center gap-2">
              <!-- Preset Quick Buttons -->
              <div class="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  @click="setRangePreset('7d')"
                  class="px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer"
                  :class="[isPresetActive('7d') ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60']"
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  @click="setRangePreset('30d')"
                  class="px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer"
                  :class="[isPresetActive('30d') ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60']"
                >
                  30 Hari
                </button>
                <button
                  type="button"
                  @click="setRangePreset('month')"
                  class="px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer"
                  :class="[isPresetActive('month') ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60']"
                >
                  Bulan Ini
                </button>
                <button
                  type="button"
                  @click="setRangePreset('all')"
                  class="px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer"
                  :class="[isPresetActive('all') ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60']"
                >
                  Semua
                </button>
              </div>

              <!-- Single Date Range Picker Component -->
              <div class="w-full sm:w-72">
                <DateRangePicker
                  v-model:startDate="chartStartDate"
                  v-model:endDate="chartEndDate"
                  placeholder="Pilih rentang tanggal..."
                />
              </div>
            </div>
          </div>

          <!-- Sub-header under filter: Legend & Summary -->
          <div class="flex items-center justify-between text-xs font-medium text-slate-500 mt-3">
            <div class="flex items-center space-x-2 text-xs font-bold text-slate-700">
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-600 shadow-xs shadow-indigo-500/50"></span>
              <span>Jumlah Item Terjual (Pcs)</span>
              <span v-if="isTrendLoading" class="text-[11px] text-slate-400 font-normal italic">
                (Memperbarui...)
              </span>
            </div>
            <div v-if="data?.salesTrend?.length" class="text-xs text-slate-500">
              Total Periode: <strong class="text-indigo-600 font-mono font-bold tabular-nums">{{ totalSoldInPeriod }}</strong> pcs
              <span class="text-slate-400">({{ totalOrdersInPeriod }} pesanan)</span>
            </div>
          </div>

          <!-- Chart.js Container -->
          <div class="mt-4 relative h-64 sm:h-72 w-full">
            <div
              v-if="!data?.salesTrend?.length && !isLoading && !isTrendLoading"
              class="h-full flex flex-col items-center justify-center text-slate-400 text-xs bg-slate-50/50 rounded-2xl border border-dashed border-slate-200"
            >
              <svg class="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span>Belum ada data penjualan tercatat pada rentang tanggal ini.</span>
            </div>

            <canvas ref="salesCanvas" class="w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- Bar Chart: Stok per Kategori (1 Col) -->
      <div class="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
        <div>
          <!-- Header with Drilldown Controls -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center space-x-2">
                <button
                  v-if="selectedDrillCategory"
                  type="button"
                  @click="clearCategoryDrilldown"
                  class="p-1 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  title="Kembali ke Semua Kategori"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 class="text-sm font-bold uppercase tracking-wider text-slate-900">
                  <span v-if="selectedDrillCategory">Distribusi SKU: {{ selectedDrillCategory }}</span>
                  <span v-else>Distribusi Stok Kategori</span>
                </h2>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">
                <span v-if="selectedDrillCategory">
                  Rincian stok per SKU • Total: {{ currentCategoryTotalStock.toLocaleString('id-ID') }} pcs
                </span>
                <span v-else>
                  Kapasitas stok fisik per kategori garmen
                </span>
              </p>
            </div>

            <!-- Action: Kembali Button or Indicator Badge -->
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                v-if="selectedDrillCategory"
                type="button"
                @click="clearCategoryDrilldown"
                class="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition cursor-pointer shadow-2xs"
              >
                ← Semua Kategori
              </button>
              <span
                v-else
                class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center space-x-1"
                title="Klik bar mana saja pada chart untuk melihat rincian SKU"
              >
                <svg class="w-3 h-3 text-indigo-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <span>Klik Bar</span>
              </span>
            </div>
          </div>

          <!-- Chart.js Bar Chart Container -->
          <div class="mt-4 relative h-64 sm:h-72 w-full">
            <div
              v-if="(!data?.stockByCategory?.length || (selectedDrillCategory && !currentCategorySkus.length)) && !isLoading"
              class="h-full flex flex-col items-center justify-center text-slate-400 text-xs bg-slate-50/50 rounded-2xl border border-dashed border-slate-200"
            >
              <span>Belum ada data stok.</span>
            </div>

            <canvas ref="categoryCanvas" class="w-full h-full"></canvas>
          </div>
        </div>

        <div class="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <template v-if="selectedDrillCategory">
            <span class="text-slate-500">Jumlah SKU Kategori:</span>
            <span class="font-bold text-slate-900">{{ currentCategorySkus.length }} SKU</span>
          </template>
          <template v-else>
            <span class="text-slate-500">Total Kategori Aktif:</span>
            <span class="font-bold text-slate-900">{{ data?.stockByCategory?.length ?? 0 }}</span>
          </template>
        </div>
      </div>
    </div>

    <!-- 3. Top Selling Products & Actionable Stock Health Alerts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Top Selling Products -->
      <div class="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 class="text-sm font-bold uppercase tracking-wider text-slate-900">Produk Terlaris (Top Selling)</h2>
            <p class="text-xs text-slate-400 mt-0.5">Seller SKU dengan kuantitas pemesanan tertinggi</p>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            Terbanyak
          </span>
        </div>

        <div class="mt-4 divide-y divide-slate-100">
          <div
            v-for="(item, idx) in data?.topSelling || []"
            :key="item.seller_sku"
            class="py-3 flex items-center justify-between"
          >
            <div class="flex items-center space-x-3 min-w-0">
              <span
                class="w-6 h-6 rounded-md flex items-center justify-center font-mono font-bold text-xs shrink-0"
                :class="idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-slate-400'"
              >
                {{ idx + 1 }}
              </span>
              <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                <img
                  v-if="item.image_url"
                  :src="item.image_url"
                  alt="Foto"
                  class="w-full h-full object-cover"
                />
                <svg v-else class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div class="min-w-0">
                <div class="font-mono font-bold text-xs text-slate-900 truncate">{{ item.seller_sku }}</div>
                <div class="text-[11px] text-slate-600 truncate">{{ item.name }}</div>
              </div>
            </div>

            <div class="text-right shrink-0 ml-3">
              <div class="font-mono font-black text-sm text-slate-900 tabular-nums">{{ item.total_sold }} pcs</div>
              <div class="text-[10px] text-slate-400">Sisa: {{ item.current_stock }} pcs</div>
            </div>
          </div>

          <div v-if="!data?.topSelling?.length" class="text-xs text-slate-400 text-center py-6">
            Belum ada data penjualan tercatat.
          </div>
        </div>
      </div>

      <!-- Pemberitahuan Status Stok SKU (1 Baris Tiap SKU) -->
      <div class="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
        <div>
          <div class="border-b border-slate-100 pb-3.5 space-y-2.5">
            <div>
              <h2 class="text-sm font-bold uppercase tracking-wider text-slate-900">Pemberitahuan Status Stok SKU</h2>
              <p class="text-xs text-slate-400 mt-0.5">Ringkasan status stok per produk: Overstock, Understock, atau Normal</p>
            </div>

            <!-- Filter Status Pills: Wraps cleanly without clipping -->
            <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                type="button"
                @click="selectedAlertStatus = 'all'"
                class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0"
                :class="selectedAlertStatus === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
              >
                Semua
              </button>
              <button
                type="button"
                @click="selectedAlertStatus = 'menipis'"
                class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0"
                :class="selectedAlertStatus === 'menipis' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'"
              >
                Understock ({{ data?.kpis.understockCount ?? 0 }})
              </button>
              <button
                type="button"
                @click="selectedAlertStatus = 'berlebih'"
                class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0"
                :class="selectedAlertStatus === 'berlebih' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'"
              >
                Overstock ({{ data?.kpis.overstockCount ?? 0 }})
              </button>
              <button
                type="button"
                @click="selectedAlertStatus = 'habis'"
                class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0"
                :class="selectedAlertStatus === 'habis' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'"
              >
                Habis ({{ data?.kpis.stockoutCount ?? 0 }})
              </button>
              <button
                type="button"
                @click="selectedAlertStatus = 'normal'"
                class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0"
                :class="selectedAlertStatus === 'normal' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'"
              >
                Normal ({{ data?.kpis.normalStockCount ?? 0 }})
              </button>
            </div>
          </div>

          <!-- List 1 Baris Tiap SKU -->
          <div class="mt-2 divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
            <div
              v-for="item in filteredAlerts"
              :key="item.seller_sku"
              class="py-2.5 px-2 flex items-center justify-between hover:bg-slate-50/80 transition rounded-xl text-xs"
            >
              <!-- Info Kiri: Dot Indikator, Seller SKU, Nama Produk -->
              <div class="flex items-center space-x-2.5 min-w-0 pr-3">
                <span class="w-2 h-2 rounded-full shrink-0" :class="getAlertDotClass(item.status)"></span>
                <span class="font-mono font-bold text-xs text-slate-900 shrink-0">{{ item.seller_sku }}</span>
                <span class="text-slate-300 shrink-0">&bull;</span>
                <span class="text-slate-600 truncate text-[11px]">{{ item.name }}</span>
              </div>

              <!-- Info Kanan: Kuantitas Stok & Label Status -->
              <div class="flex items-center space-x-2.5 shrink-0 ml-2">
                <span class="font-mono text-xs text-slate-500 font-medium whitespace-nowrap">{{ item.current_stock }} pcs</span>
                <span
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase whitespace-nowrap"
                  :class="getAlertBadgeClass(item.status)"
                >
                  {{ getAlertLabel(item.status) }}
                </span>
              </div>
            </div>

            <div v-if="!filteredAlerts.length" class="text-xs text-slate-400 text-center py-8">
              Tidak ada SKU dengan status ini.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
