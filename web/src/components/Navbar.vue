<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();

const user = computed(() => authStore.user);

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>

<template>
  <header class="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center space-x-8">
          <div class="flex items-center space-x-3">
            <div class="h-9 w-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-1 overflow-hidden shrink-0">
              <img src="/logo.jpg" alt="Logo ELLITH" class="h-full w-full object-contain" />
            </div>
            <div>
              <span class="text-lg font-black tracking-wider text-slate-900">ELLITH</span>
              <span class="hidden sm:inline-block ml-2 text-[10px] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-1.5 py-0.5 rounded font-bold uppercase shadow-xs">
                OPS
              </span>
            </div>
          </div>

          <nav class="hidden md:flex space-x-2" aria-label="Navigasi Utama">
            <RouterLink
              to="/orders"
              class="px-3.5 py-2 rounded-xl text-xs font-bold transition-colors"
              :class="[$route.path === '/orders' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100']"
            >
              Pesanan
            </RouterLink>

            <RouterLink
              to="/scan"
              class="px-3.5 py-2 rounded-xl text-xs font-bold transition-colors"
              :class="[$route.path === '/scan' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100']"
            >
              Scan
            </RouterLink>
          </nav>
        </div>

        <div class="flex items-center space-x-4">
          <div v-if="user" class="flex items-center space-x-3 text-sm">
            <div class="text-right">
              <div class="font-bold text-slate-900 text-xs">{{ user.username }}</div>
              <div class="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                {{ user.role === 'admin' ? 'Administrator' : 'Operator' }}
              </div>
            </div>
            <button
              @click="handleLogout"
              class="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-rose-600 transition cursor-pointer"
              title="Keluar dari sistem"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
