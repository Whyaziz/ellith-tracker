<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const showPassword = ref(false);
const errorMessage = ref('');
const isSubmitting = ref(false);

async function handleSubmit() {
  if (!username.value.trim() || !password.value.trim()) {
    errorMessage.value = 'Silakan isi username dan password';
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await authStore.login(username.value, password.value);
    const redirectPath = (route.query.redirect as string) || '/orders';
    router.push(redirectPath);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = (err as Error)?.message || 'Gagal login. Pastikan server aktif.';
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-100/70 relative overflow-hidden">
    <!-- Subtle Background Ambient Accents -->
    <div class="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-slate-200/50 blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-slate-200/50 blur-3xl pointer-events-none"></div>

    <div class="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
      <!-- ELLITH Logo Badge -->
      <div class="mx-auto w-20 h-20 rounded-2xl bg-white border border-slate-200/90 shadow-lg shadow-slate-200/60 flex items-center justify-center p-2.5 transition-transform hover:scale-105 duration-300">
        <img src="/logo.jpg" alt="Logo ELLITH" class="h-full w-full object-contain" />
      </div>

      <div class="mt-5">
        <div class="flex items-center justify-center space-x-2">
          <h1 class="text-3xl font-black tracking-widest text-slate-900 uppercase">ELLITH</h1>
          <span class="text-[10px] font-black tracking-wider uppercase bg-slate-900 text-white px-2 py-0.5 rounded-md">OPS</span>
        </div>
        <p class="mt-1.5 text-xs text-slate-500 font-medium">
          Sistem Pelacakan Resi &amp; Gudang &bull; TikTok Shop (J&amp;T)
        </p>
      </div>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
      <div class="bg-white py-8 px-6 shadow-xl shadow-slate-200/70 border border-slate-200/80 rounded-2xl sm:px-10">
        <form class="space-y-5" @submit.prevent="handleSubmit">
          <!-- Error Alert with Role Alert for A11y -->
          <div
            v-if="errorMessage"
            role="alert"
            class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-start space-x-2.5 animate-shake"
          >
            <svg class="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span class="flex-1 leading-relaxed">{{ errorMessage }}</span>
          </div>

          <!-- Username Input -->
          <div>
            <label for="username" class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Username
            </label>
            <div class="mt-1.5 relative">
              <input
                id="username"
                v-model="username"
                type="text"
                autocomplete="username"
                required
                placeholder="Masukkan username Anda"
                class="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition"
              />
            </div>
          </div>

          <!-- Password Input with Toggle Visibility -->
          <div>
            <label for="password" class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Password
            </label>
            <div class="mt-1.5 relative">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                placeholder="Masukkan password Anda"
                class="block w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer focus:outline-none"
                :aria-label="showPassword ? 'Sembunyikan password' : 'Tampilkan password'"
              >
                <!-- Eye open -->
                <svg v-if="!showPassword" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <!-- Eye slash -->
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Submit Button -->
          <div class="pt-1">
            <button
              type="submit"
              :disabled="isSubmitting"
              class="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-md shadow-slate-900/10 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 active:bg-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg v-if="isSubmitting" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span v-if="isSubmitting">Memverifikasi Akun...</span>
              <span v-else>Masuk ke Sistem ELLITH</span>
            </button>
          </div>
        </form>

        <div class="mt-6 border-t border-slate-100 pt-4 text-center">
          <p class="text-[11px] text-slate-400 font-medium">
            ELLITH Warehouse &bull; Gunakan akun Administrator atau Operator terdaftar
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
