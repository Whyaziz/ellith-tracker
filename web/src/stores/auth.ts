import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, ApiError } from '../api/client';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'operator';
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const loading = ref<boolean>(false);
  const initialized = ref<boolean>(false);

  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.role === 'admin');

  async function checkAuth(): Promise<AuthUser | null> {
    loading.value = true;
    try {
      const data = await api.get<{ user: AuthUser }>('/api/auth/me');
      user.value = data.user;
      return data.user;
    } catch {
      user.value = null;
      return null;
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  async function login(username: string, password: string):Promise<AuthUser> {
    loading.value = true;
    try {
      const data = await api.post<{ user: AuthUser; message: string }>('/api/auth/login', {
        username,
        password,
      });
      user.value = data.user;
      return data.user;
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      throw new Error('Gagal terhubung ke server');
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    loading.value = true;
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Ignored
    } finally {
      user.value = null;
      loading.value = false;
    }
  }

  return {
    user,
    loading,
    initialized,
    isAuthenticated,
    isAdmin,
    checkAuth,
    login,
    logout,
  };
});
