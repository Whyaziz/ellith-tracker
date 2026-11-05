<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const user = computed(() => authStore.user);
const isMobileOpen = ref(false);

// Desktop Collapsed State (disimpan di localStorage)
const isCollapsed = ref<boolean>(
  typeof window !== 'undefined' ? localStorage.getItem('sidebar_collapsed') === 'true' : false
);

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
  try {
    localStorage.setItem('sidebar_collapsed', String(isCollapsed.value));
  } catch {
    // Abaikan jika localStorage tidak dapat diakses
  }
}

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}

function closeMobile() {
  isMobileOpen.value = false;
}
</script>

<template>
  <!-- 1. Mobile Top Header Bar (< 768px) -->
  <header
    class="md:hidden bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 py-3 flex items-center justify-between sticky top-0 z-30 w-full shrink-0 shadow-sm"
  >
    <div class="flex items-center space-x-3">
      <!-- ELLITH Logo Image -->
      <div
        class="h-9 w-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-1 overflow-hidden shrink-0"
      >
        <img src="/logo.jpg" alt="Logo ELLITH" class="h-full w-full object-contain" />
      </div>
      <div>
        <div class="flex items-center space-x-1.5">
          <span class="text-base font-black tracking-wider text-slate-900">ELLITH</span>
          <span
            class="text-[9px] font-black tracking-wider uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-xs"
            >ERP</span
          >
        </div>
        <div class="text-[10px] text-slate-500 font-medium">Garment &bull; TikTok &bull; J&amp;T</div>
      </div>
    </div>

    <button
      type="button"
      @click="isMobileOpen = !isMobileOpen"
      class="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      aria-label="Toggle menu navigasi"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          v-if="!isMobileOpen"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
        <path
          v-else
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </header>

  <!-- 2. Mobile Drawer Modal -->
  <div v-if="isMobileOpen" class="md:hidden fixed inset-0 z-50 flex">
    <!-- Backdrop Overlay with Smooth Blur -->
    <div
      @click="closeMobile"
      class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
      aria-hidden="true"
    ></div>

    <!-- Slide Drawer Container -->
    <div
      class="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col justify-between z-10 border-r border-slate-200"
    >
      <div class="flex flex-col flex-1 overflow-y-auto">
        <!-- Drawer Header with ELLITH Logo -->
        <div class="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div class="flex items-center space-x-3">
            <div
              class="h-10 w-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-1.5 overflow-hidden shrink-0"
            >
              <img src="/logo.jpg" alt="Logo ELLITH" class="h-full w-full object-contain" />
            </div>
            <div>
              <div class="flex items-center space-x-1.5">
                <span class="text-base font-black tracking-wider text-slate-900">ELLITH</span>
                <span
                  class="text-[9px] font-black tracking-wider uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-xs"
                  >ERP</span
                >
              </div>
              <div class="text-[10px] text-slate-400 font-medium">Garment &bull; TikTok Shop</div>
            </div>
          </div>
          <button
            type="button"
            @click="closeMobile"
            class="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Tutup menu"
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

        <!-- Navigation Links (6 MENU UTAMA) -->
        <nav class="p-3 space-y-1.5 flex-1" aria-label="Navigasi Menu Mobile">
          <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Navigasi Utama
          </div>

          <!-- 1. Dashboard -->
          <RouterLink
            to="/dashboard"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/dashboard' || route.path === '/'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
            ]"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span class="flex-1">Dashboard</span>
          </RouterLink>

          <!-- 2. Daftar Pesanan (Gabungan Online + Offline) -->
          <RouterLink
            to="/orders"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/orders'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
            ]"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <span class="flex-1">Daftar Pesanan</span>
          </RouterLink>

          <!-- 3. Resi Tercetak -->
          <RouterLink
            to="/printed-orders"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/printed-orders' || route.path === '/upload' || route.path === '/export'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
            ]"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="flex-1">Resi Tercetak</span>
          </RouterLink>

          <!-- 4. Scan Barcode -->
          <RouterLink
            to="/scan"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/scan'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
            ]"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
              />
            </svg>
            <span class="flex-1">Scan Barcode</span>
          </RouterLink>

          <!-- 5. Master Data Produk -->
          <RouterLink
            to="/products"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/products'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
            ]"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span class="flex-1">Master Produk</span>
          </RouterLink>

          <!-- 6. Manajemen Stok -->
          <RouterLink
            to="/stock"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/stock'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
            ]"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span class="flex-1">Manajemen Stok</span>
          </RouterLink>

          <!-- 7. CRM Pelanggan -->
          <RouterLink
            to="/customers"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/customers'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
            ]"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span class="flex-1">CRM Pelanggan</span>
          </RouterLink>
        </nav>
      </div>

      <!-- Drawer Bottom Profile -->
      <div class="p-4 border-t border-slate-200/80 bg-slate-50 flex items-center justify-between">
        <div class="flex items-center space-x-2.5 min-w-0">
          <div
            class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-700 to-indigo-500 text-white font-bold flex items-center justify-center text-xs shrink-0 uppercase shadow-xs"
          >
            {{ user?.username ? user.username.slice(0, 2) : 'EL' }}
          </div>
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-800 truncate">
              {{ user?.username ?? 'Admin' }}
            </div>
            <div class="text-[10px] text-slate-500 capitalize truncate font-medium">
              {{ user?.role === 'admin' ? 'Administrator' : 'Operator Gudang' }}
            </div>
          </div>
        </div>
        <button
          type="button"
          @click="handleLogout"
          class="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
          title="Keluar dari sistem"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- 3. Desktop Permanent Sidebar (>= 768px, 'hidden md:flex', Collapsible) -->
  <aside
    class="hidden md:flex flex-col h-screen sticky top-0 shrink-0 bg-white border-r border-slate-200/80 z-30 justify-between select-none shadow-[1px_0_3px_0_rgba(0,0,0,0.02)] transition-all duration-300 ease-in-out"
    :class="[isCollapsed ? 'w-20' : 'w-64']"
  >
    <div class="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
      <!-- ELLITH Brand Header & Collapse Toggle Button -->
      <div
        v-if="!isCollapsed"
        class="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/40 min-h-[73px]"
      >
        <div class="flex items-center space-x-3 min-w-0">
          <div
            class="h-10 w-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-1.5 overflow-hidden shrink-0"
          >
            <img src="/logo.jpg" alt="Logo ELLITH" class="h-full w-full object-contain" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-1.5">
              <span class="text-lg font-black tracking-wider text-slate-900 leading-none">
                ELLITH
              </span>
              <span
                class="text-[9px] font-black tracking-widest uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-xs"
              >
                ERP
              </span>
            </div>
            <div class="text-[10px] text-slate-400 font-medium truncate mt-0.5">
              Garment &bull; TikTok &bull; J&amp;T
            </div>
          </div>
        </div>

        <button
          type="button"
          @click="toggleCollapse"
          class="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer shrink-0"
          title="Ciutkan Sidebar"
          aria-label="Ciutkan Sidebar"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      <!-- Collapsed Header -->
      <div
        v-else
        class="p-3 border-b border-slate-100 flex flex-col items-center justify-center gap-2 bg-slate-50/40 min-h-[73px]"
      >
        <div
          class="h-10 w-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-1.5 overflow-hidden shrink-0"
          title="ELLITH ERP"
        >
          <img src="/logo.jpg" alt="Logo ELLITH" class="h-full w-full object-contain" />
        </div>
        <button
          type="button"
          @click="toggleCollapse"
          class="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 transition cursor-pointer"
          title="Perluas Sidebar"
          aria-label="Perluas Sidebar"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      <!-- Main Navigation Menu (Expanded) -->
      <div v-if="!isCollapsed" class="px-3 py-4 space-y-1.5 flex-1">
        <div class="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Menu Utama
        </div>

        <!-- 1. Dashboard -->
        <RouterLink
          to="/dashboard"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/dashboard' || route.path === '/'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span class="flex-1">Dashboard</span>
        </RouterLink>

        <!-- 2. Daftar Pesanan -->
        <RouterLink
          to="/orders"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/orders'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span class="flex-1">Daftar Pesanan</span>
        </RouterLink>

        <!-- 3. Resi Tercetak -->
        <RouterLink
          to="/printed-orders"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/printed-orders' || route.path === '/upload' || route.path === '/export'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span class="flex-1">Resi Tercetak</span>
        </RouterLink>

        <!-- 4. Scan Barcode -->
        <RouterLink
          to="/scan"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/scan'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          <span class="flex-1">Scan Barcode</span>
          <span
            class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
            :class="[
              route.path === '/scan'
                ? 'bg-indigo-700/80 text-emerald-300'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50',
            ]"
          >
            USB
          </span>
        </RouterLink>

        <!-- 5. Master Data Produk -->
        <RouterLink
          to="/products"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/products'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span class="flex-1">Master Produk</span>
        </RouterLink>

        <!-- 6. Manajemen Stok -->
        <RouterLink
          to="/stock"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/stock'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span class="flex-1">Manajemen Stok</span>
        </RouterLink>

        <!-- 7. CRM Pelanggan -->
        <RouterLink
          to="/customers"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/customers'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span class="flex-1">CRM Pelanggan</span>
        </RouterLink>
      </div>

      <!-- Main Navigation Menu (Collapsed - Icon Centered) -->
      <div v-else class="px-2 py-4 space-y-2 flex-1 flex flex-col items-center">
        <!-- 1. Dashboard Icon -->
        <RouterLink
          to="/dashboard"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group"
          :class="[
            route.path === '/dashboard' || route.path === '/'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
          title="Dashboard"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </RouterLink>

        <!-- 2. Pesanan Icon -->
        <RouterLink
          to="/orders"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group"
          :class="[
            route.path === '/orders'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
          title="Daftar Pesanan"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </RouterLink>

        <!-- 3. Resi Tercetak Icon -->
        <RouterLink
          to="/printed-orders"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group"
          :class="[
            route.path === '/printed-orders' || route.path === '/upload' || route.path === '/export'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
          title="Resi Tercetak"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </RouterLink>

        <!-- 4. Scan Barcode Icon -->
        <RouterLink
          to="/scan"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group"
          :class="[
            route.path === '/scan'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
          title="Scan Barcode USB"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          <span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500"></span>
        </RouterLink>

        <!-- 5. Master Produk Icon -->
        <RouterLink
          to="/products"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group"
          :class="[
            route.path === '/products'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
          title="Master Produk"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </RouterLink>

        <!-- 6. Stok Icon -->
        <RouterLink
          to="/stock"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group"
          :class="[
            route.path === '/stock'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
          title="Manajemen Stok"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </RouterLink>

        <!-- 7. CRM Pelanggan Icon -->
        <RouterLink
          to="/customers"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative group"
          :class="[
            route.path === '/customers'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
              : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60',
          ]"
          title="CRM Pelanggan"
        >
          <svg class="w-5 h-5 shrink-0 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </RouterLink>
      </div>

      <!-- System Status (Expanded vs Collapsed) -->
      <div
        v-if="!isCollapsed"
        class="p-3 mx-3 mb-3 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-500"
      >
        <div class="flex items-center space-x-2 font-bold text-slate-700">
          <span class="relative flex h-2 w-2">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
            ></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>ERP Aktif &amp; Terhubung</span>
        </div>
      </div>
      <div
        v-else
        class="mb-3 flex items-center justify-center"
        title="ERP Aktif &amp; Terhubung"
      >
        <span class="relative flex h-2.5 w-2.5">
          <span
            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
          ></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
      </div>
    </div>

    <!-- Bottom User Profile & Logout (Expanded) -->
    <div v-if="!isCollapsed" class="p-4 border-t border-slate-200/80 bg-slate-50/60">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3 min-w-0">
          <div
            class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-700 to-indigo-500 text-white font-bold flex items-center justify-center text-xs shrink-0 uppercase shadow-xs"
          >
            {{ user?.username ? user.username.slice(0, 2) : 'EL' }}
          </div>
          <div class="min-w-0">
            <div class="text-xs font-bold text-slate-900 truncate">
              {{ user?.username ?? 'Admin' }}
            </div>
            <div class="text-[10px] text-slate-500 capitalize truncate font-medium">
              {{ user?.role === 'admin' ? 'Administrator' : 'Operator Gudang' }}
            </div>
          </div>
        </div>

        <button
          type="button"
          @click="handleLogout"
          class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          title="Keluar dari sistem"
          aria-label="Keluar dari sistem"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Bottom User Profile & Logout (Collapsed) -->
    <div
      v-else
      class="p-3 border-t border-slate-200/80 bg-slate-50/60 flex flex-col items-center gap-2.5"
    >
      <div
        class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-700 to-indigo-500 text-white font-bold flex items-center justify-center text-xs shrink-0 uppercase shadow-sm"
        :title="`${user?.username ?? 'Admin'} (${user?.role === 'admin' ? 'Administrator' : 'Operator'})`"
      >
        {{ user?.username ? user.username.slice(0, 2) : 'EL' }}
      </div>
      <button
        type="button"
        @click="handleLogout"
        class="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
        title="Keluar dari sistem"
        aria-label="Keluar dari sistem"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
      </button>
    </div>
  </aside>
</template>
