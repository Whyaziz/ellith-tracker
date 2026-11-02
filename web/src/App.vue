<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import Sidebar from './components/Sidebar.vue';

const authStore = useAuthStore();
const route = useRoute();

const showSidebar = computed(() => {
  return authStore.isAuthenticated && route.name !== 'login';
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <div v-if="showSidebar" class="min-h-screen flex flex-col md:flex-row">
      <!-- Left Sidebar Navigation & Mobile Header -->
      <Sidebar />

      <!-- Right Main Content Area (100% lebar di mobile, sisa lebar di desktop) -->
      <main class="flex-1 min-w-0 w-full overflow-y-auto">
        <RouterView />
      </main>
    </div>

    <!-- Login Page View (Full Screen) -->
    <div v-else class="min-h-screen">
      <RouterView />
    </div>
  </div>
</template>
