<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const user = computed(() => authStore.user);
const isMobileOpen = ref(false);

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
            class="text-[9px] font-black tracking-wider uppercase bg-slate-900 text-white px-1.5 py-0.5 rounded"
            >OPS</span
          >
        </div>
        <div class="text-[10px] text-slate-500 font-medium">TikTok Shop &bull; J&amp;T Express</div>
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
                  class="text-[9px] font-black tracking-wider uppercase bg-slate-900 text-white px-1.5 py-0.5 rounded"
                  >OPS</span
                >
              </div>
              <div class="text-[10px] text-slate-400 font-medium">TikTok Shop &bull; J&amp;T</div>
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

        <!-- Navigation Links (HANYA 2 MENU UTAMA) -->
        <nav class="p-3 space-y-1.5 flex-1" aria-label="Navigasi Menu Mobile">
          <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Navigasi Utama
          </div>

          <!-- 1. Pesanan -->
          <RouterLink
            to="/orders"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path.startsWith('/orders') ||
              route.path === '/upload' ||
              route.path === '/export'
                ? 'bg-slate-900 text-white shadow-sm shadow-slate-900/10'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
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

          <!-- 2. Scan Barcode -->
          <RouterLink
            to="/scan"
            @click="closeMobile"
            class="flex items-center space-x-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition cursor-pointer"
            :class="[
              route.path === '/scan'
                ? 'bg-slate-900 text-white shadow-sm shadow-slate-900/10'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
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
        </nav>
      </div>

      <!-- Drawer Bottom Profile -->
      <div class="p-4 border-t border-slate-200/80 bg-slate-50 flex items-center justify-between">
        <div class="flex items-center space-x-2.5 min-w-0">
          <div
            class="w-9 h-9 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-xs shrink-0 uppercase shadow-sm"
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

  <!-- 3. Desktop Permanent Sidebar (>= 768px, 'hidden md:flex') -->
  <aside
    class="hidden md:flex flex-col w-64 h-screen sticky top-0 shrink-0 bg-white border-r border-slate-200/80 z-30 justify-between select-none shadow-[1px_0_3px_0_rgba(0,0,0,0.02)]"
  >
    <div class="flex flex-col flex-1 overflow-y-auto">
      <!-- ELLITH Brand Logo Header -->
      <div class="p-5 border-b border-slate-100 flex items-center space-x-3 bg-slate-50/40">
        <div
          class="h-11 w-11 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-1.5 overflow-hidden shrink-0"
        >
          <img src="/logo.jpg" alt="Logo ELLITH" class="h-full w-full object-contain" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center space-x-1.5">
            <span class="text-lg font-black tracking-wider text-slate-900 leading-none"
              >ELLITH</span
            >
            <span
              class="text-[9px] font-black tracking-widest uppercase bg-slate-900 text-white px-1.5 py-0.5 rounded"
              >OPS</span
            >
          </div>
        </div>
      </div>

      <!-- Main Navigation Menu (HANYA 2 MENU UTAMA) -->
      <div class="px-3 py-5 space-y-1.5 flex-1">
        <div class="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Menu Utama
        </div>

        <!-- 1. Pesanan (Aktif untuk /orders, /upload, /export) -->
        <RouterLink
          to="/orders"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path.startsWith('/orders') || route.path === '/upload' || route.path === '/export'
              ? 'bg-slate-900 text-white shadow-sm shadow-slate-900/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
          ]"
        >
          <svg
            class="w-5 h-5 shrink-0 transition"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span class="flex-1">Daftar Pesanan</span>
        </RouterLink>

        <!-- 2. Scan Barcode -->
        <RouterLink
          to="/scan"
          class="flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer group"
          :class="[
            route.path === '/scan'
              ? 'bg-slate-900 text-white shadow-sm shadow-slate-900/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
          ]"
        >
          <svg
            class="w-5 h-5 shrink-0 transition"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
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
                ? 'bg-slate-800 text-emerald-400'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50',
            ]"
          >
            USB
          </span>
        </RouterLink>
      </div>

      <!-- Local Network System Status Note -->
      <div
        class="p-3.5 mx-3 mb-4 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-500"
      >
        <div class="flex items-center space-x-2 font-bold text-slate-700">
          <span class="relative flex h-2 w-2">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
            ></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Sistem Aktif</span>
        </div>
      </div>
    </div>

    <!-- Bottom User Profile & Logout -->
    <div class="p-4 border-t border-slate-200/80 bg-slate-50/60">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3 min-w-0">
          <div
            class="w-9 h-9 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-xs shrink-0 uppercase shadow-sm"
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
  </aside>
</template>
