<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api, ApiError } from '../api/client';
import Pagination from '../components/Pagination.vue';

interface ProductCategory {
  id: number;
  name: string;
  created_at?: string;
}

interface Product {
  id: number;
  seller_sku: string;
  name: string;
  category_id: number;
  image_url: string | null;
  min_stock: number;
  max_stock: number;
  created_at: string;
  updated_at: string;
}

const activeTab = ref<'products' | 'categories'>('products');

// Products State
const products = ref<Product[]>([]);
const categories = ref<ProductCategory[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');
const selectedCategoryId = ref<number | ''>('');

// Product Modal State
const showProductModal = ref(false);
const isEditingProduct = ref(false);
const editingProductId = ref<number | null>(null);
const productForm = ref({
  seller_sku: '',
  name: '',
  category_id: 0,
  image_url: '',
  min_stock: 5,
  max_stock: 100,
});
const productFormError = ref('');
const isSavingProduct = ref(false);

// Image Upload State
const isUploadingImage = ref(false);
const imageFileInput = ref<HTMLInputElement | null>(null);

// Category Modal State
const showCategoryModal = ref(false);
const isEditingCategory = ref(false);
const editingCategoryId = ref<number | null>(null);
const categoryNameInput = ref('');
const categoryError = ref('');
const isSavingCategory = ref(false);

async function loadData() {
  isLoading.value = true;
  try {
    const [pRes, cRes] = await Promise.all([
      api.get<{ products: Product[]; total: number }>('/api/products?limit=1000'),
      api.get<{ categories: ProductCategory[] }>('/api/products/categories'),
    ]);
    products.value = pRes.products || [];
    categories.value = cRes.categories || [];
    if (categories.value.length > 0 && !productForm.value.category_id) {
      productForm.value.category_id = categories.value[0].id;
    }
  } catch (err) {
    console.error('Gagal memuat master data:', err);
  } finally {
    isLoading.value = false;
  }
}

const categoryMap = computed(() => {
  const map: Record<number, string> = {};
  for (const c of categories.value) {
    map[c.id] = c.name;
  }
  return map;
});

const filteredProducts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return products.value.filter((p) => {
    if (selectedCategoryId.value && p.category_id !== selectedCategoryId.value) {
      return false;
    }
    if (!q) return true;
    return (
      p.seller_sku.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)
    );
  });
});

interface CategoryProductGroup {
  id: number;
  name: string;
  items: Product[];
}

const groupedProducts = computed<CategoryProductGroup[]>(() => {
  const map: Record<number, CategoryProductGroup> = {};

  for (const c of categories.value) {
    if (selectedCategoryId.value && c.id !== selectedCategoryId.value) continue;
    map[c.id] = { id: c.id, name: c.name, items: [] };
  }
  map[0] = { id: 0, name: 'Tanpa Kategori', items: [] };

  for (const p of filteredProducts.value) {
    const cId = p.category_id || 0;
    if (!map[cId]) {
      const cName = categoryMap.value[cId] || 'Kategori Lainnya';
      map[cId] = { id: cId, name: cName, items: [] };
    }
    map[cId].items.push(p);
  }

  return Object.values(map)
    .filter((g) => g.items.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
});

// Expand / Collapse state per Kategori
const collapsedCategories = ref<Record<number, boolean>>({});

function isCategoryExpanded(catId: number): boolean {
  if (searchQuery.value.trim()) return true; // Otomatis buka jika sedang mencari
  return !collapsedCategories.value[catId];
}

function toggleCategory(catId: number) {
  collapsedCategories.value[catId] = !collapsedCategories.value[catId];
}

function expandAllCategories() {
  collapsedCategories.value = {};
}

function collapseAllCategories() {
  const map: Record<number, boolean> = {};
  for (const g of groupedProducts.value) {
    map[g.id] = true;
  }
  collapsedCategories.value = map;
}

// Pagination State (Jika dibutuhkan untuk kategori banyak)
const currentPage = ref(1);
const pageSize = ref(25);

const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredProducts.value.slice(start, start + pageSize.value);
});

watch([searchQuery, selectedCategoryId], () => {
  currentPage.value = 1;
});

// Image Upload Handler
async function handleImageFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  const file = target.files[0];

  isUploadingImage.value = true;
  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await api.post<{ message: string; imageUrl: string }>('/api/products/upload-image', formData);
    productForm.value.image_url = res.imageUrl;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal mengunggah foto: ${err.message}`);
    } else {
      alert('Gagal mengunggah foto');
    }
  } finally {
    isUploadingImage.value = false;
  }
}

function openCreateProduct() {
  isEditingProduct.value = false;
  editingProductId.value = null;
  productForm.value = {
    seller_sku: '',
    name: '',
    category_id: categories.value[0]?.id || 0,
    image_url: '',
    min_stock: 5,
    max_stock: 100,
  };
  productFormError.value = '';
  showProductModal.value = true;
}

function openEditProduct(p: Product) {
  isEditingProduct.value = true;
  editingProductId.value = p.id;
  productForm.value = {
    seller_sku: p.seller_sku,
    name: p.name,
    category_id: p.category_id,
    image_url: p.image_url || '',
    min_stock: p.min_stock,
    max_stock: p.max_stock,
  };
  productFormError.value = '';
  showProductModal.value = true;
}

async function saveProduct() {
  if (!productForm.value.seller_sku.trim() || !productForm.value.name.trim()) {
    productFormError.value = 'Seller SKU dan Nama Produk wajib diisi.';
    return;
  }
  if (!productForm.value.category_id) {
    productFormError.value = 'Pilih kategori produk terlebih dahulu.';
    return;
  }

  isSavingProduct.value = true;
  productFormError.value = '';

  const payload = {
    seller_sku: productForm.value.seller_sku.trim(),
    name: productForm.value.name.trim(),
    category_id: Number(productForm.value.category_id),
    image_url: productForm.value.image_url.trim() || null,
    min_stock: Number(productForm.value.min_stock) || 0,
    max_stock: Number(productForm.value.max_stock) || 0,
  };

  try {
    if (isEditingProduct.value && editingProductId.value) {
      const res = await api.put<{ message: string; product: Product }>(
        `/api/products/${editingProductId.value}`,
        payload
      );
      const idx = products.value.findIndex((p) => p.id === editingProductId.value);
      if (idx !== -1) products.value[idx] = res.product;
    } else {
      const res = await api.post<{ message: string; product: Product }>('/api/products', payload);
      products.value.unshift(res.product);
    }
    showProductModal.value = false;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      productFormError.value = err.message;
    } else {
      productFormError.value = 'Gagal menyimpan produk';
    }
  } finally {
    isSavingProduct.value = false;
  }
}

async function deleteProduct(p: Product) {
  if (!confirm(`Hapus produk "${p.name}" (${p.seller_sku})?`)) return;
  try {
    await api.delete(`/api/products/${p.id}`);
    products.value = products.value.filter((it) => it.id !== p.id);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal menghapus produk: ${err.message}`);
    } else {
      alert('Gagal menghapus produk');
    }
  }
}

// Categories Management
function openCreateCategory() {
  isEditingCategory.value = false;
  editingCategoryId.value = null;
  categoryNameInput.value = '';
  categoryError.value = '';
  showCategoryModal.value = true;
}

function openEditCategory(c: ProductCategory) {
  isEditingCategory.value = true;
  editingCategoryId.value = c.id;
  categoryNameInput.value = c.name;
  categoryError.value = '';
  showCategoryModal.value = true;
}

async function saveCategory() {
  if (!categoryNameInput.value.trim()) {
    categoryError.value = 'Nama kategori tidak boleh kosong';
    return;
  }
  isSavingCategory.value = true;
  categoryError.value = '';

  try {
    if (isEditingCategory.value && editingCategoryId.value) {
      const res = await api.put<{ message: string; category: ProductCategory }>(
        `/api/products/categories/${editingCategoryId.value}`,
        { name: categoryNameInput.value.trim() }
      );
      const idx = categories.value.findIndex((c) => c.id === editingCategoryId.value);
      if (idx !== -1) categories.value[idx] = res.category;
    } else {
      const res = await api.post<{ message: string; category: ProductCategory }>(
        '/api/products/categories',
        { name: categoryNameInput.value.trim() }
      );
      categories.value.push(res.category);
    }
    showCategoryModal.value = false;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      categoryError.value = err.message;
    } else {
      categoryError.value = 'Gagal menyimpan kategori';
    }
  } finally {
    isSavingCategory.value = false;
  }
}

async function deleteCategory(c: ProductCategory) {
  if (!confirm(`Hapus kategori "${c.name}"?`)) return;
  try {
    await api.delete(`/api/products/categories/${c.id}`);
    categories.value = categories.value.filter((it) => it.id !== c.id);
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      alert(`Gagal menghapus kategori: ${err.message}`);
    } else {
      alert('Gagal menghapus kategori');
    }
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-5">
      <div>
        <div class="flex items-center space-x-2.5">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Master Data Produk</h1>
          <span class="text-[10px] font-bold tracking-widest uppercase bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-2.5 py-0.5 rounded shadow-xs">
            ELLITH
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          Katalog referensi Seller SKU, kategori garment, foto produk, dan batas ambang stok aman gudang.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <button
          v-if="activeTab === 'products'"
          type="button"
          @click="openCreateProduct"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 transition flex items-center space-x-1.5 cursor-pointer"
        >
          <svg class="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Tambah Produk</span>
        </button>

        <button
          v-if="activeTab === 'categories'"
          type="button"
          @click="openCreateCategory"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 transition flex items-center space-x-1.5 cursor-pointer"
        >
          <svg class="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Tambah Kategori</span>
        </button>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex border-b border-slate-200 gap-6 text-xs font-bold uppercase tracking-wider">
      <button
        type="button"
        @click="activeTab = 'products'"
        class="pb-3 border-b-2 transition cursor-pointer"
        :class="[
          activeTab === 'products'
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-slate-400 hover:text-slate-700',
        ]"
      >
        Katalog Produk ({{ products.length }})
      </button>

      <button
        type="button"
        @click="activeTab = 'categories'"
        class="pb-3 border-b-2 transition cursor-pointer"
        :class="[
          activeTab === 'categories'
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-slate-400 hover:text-slate-700',
        ]"
      >
        Kategori Garment ({{ categories.length }})
      </button>
    </div>

    <!-- TAB 1: CATALOG PRODUCTS -->
    <div v-if="activeTab === 'products'" class="space-y-4">
      <!-- Filter & Search Bar -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div class="w-full sm:w-80 relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari Seller SKU atau Nama Produk..."
            class="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition"
          />
          <svg class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div class="w-full sm:w-auto flex items-center space-x-2">
          <label class="text-xs font-bold text-slate-500 whitespace-nowrap">Kategori:</label>
          <select
            v-model="selectedCategoryId"
            class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">Semua Kategori</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>

      <!-- Products List Accordion per Kategori -->
      <div v-if="isLoading" class="bg-white border border-slate-200/80 rounded-3xl p-8 text-center text-xs text-slate-400">
        Memuat data produk...
      </div>

      <div v-else-if="filteredProducts.length === 0" class="bg-white border border-slate-200/80 rounded-3xl p-10 text-center text-xs text-slate-500 font-medium">
        Tidak ada produk yang sesuai dengan kriteria pencarian.
      </div>

      <div v-else class="space-y-4">
        <!-- Kontrol Buka / Tutup Semua Kategori -->
        <div class="flex flex-wrap items-center justify-between text-xs px-1 text-slate-500 gap-2">
          <div>
            Menampilkan <strong>{{ filteredProducts.length }}</strong> SKU dalam <strong>{{ groupedProducts.length }}</strong> kategori
          </div>
          <div class="flex items-center space-x-2">
            <button
              type="button"
              @click="expandAllCategories"
              class="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
            >
              Buka Semua
            </button>
            <span>&bull;</span>
            <button
              type="button"
              @click="collapseAllCategories"
              class="text-slate-600 hover:text-slate-800 font-bold hover:underline cursor-pointer"
            >
              Tutup Semua
            </button>
          </div>
        </div>

        <!-- Daftar Accordion Dropdown per Kategori -->
        <div
          v-for="group in groupedProducts"
          :key="group.id"
          class="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden transition-all duration-200"
        >
          <!-- Accordion Header -->
          <button
            type="button"
            @click="toggleCategory(group.id)"
            class="w-full px-5 py-4 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 border-b border-slate-100 transition cursor-pointer text-left select-none"
          >
            <div class="flex items-center space-x-3">
              <span class="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200/60 text-indigo-700 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </span>
              <div>
                <h4 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                  {{ group.name }}
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100/70 text-indigo-800 border border-indigo-200">
                    {{ group.items.length }} SKU
                  </span>
                </h4>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <span class="text-xs text-slate-400 font-medium hidden sm:inline">
                {{ isCategoryExpanded(group.id) ? 'Sembunyikan' : 'Tampilkan' }}
              </span>
              <svg
                class="w-5 h-5 text-slate-400 transform transition-transform duration-200"
                :class="isCategoryExpanded(group.id) ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          <!-- Accordion Body (Tabel SKU dalam Kategori) -->
          <div v-show="isCategoryExpanded(group.id)" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100 text-left text-xs">
              <thead class="bg-slate-50/40 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th class="px-4 py-2.5">Produk</th>
                  <th class="px-4 py-2.5">Seller SKU</th>
                  <th class="px-4 py-2.5 text-center">Ambang Stok</th>
                  <th class="px-4 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr v-for="p in group.items" :key="p.id" class="hover:bg-slate-50/70 transition">
                  <!-- Foto & Nama -->
                  <td class="px-4 py-3 align-middle">
                    <div class="flex items-center space-x-3">
                      <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          v-if="p.image_url"
                          :src="p.image_url"
                          alt="Foto"
                          class="w-full h-full object-cover"
                        />
                        <svg v-else class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <div class="font-bold text-slate-900 line-clamp-1">{{ p.name }}</div>
                        <div class="text-[10px] text-slate-400 font-mono">ID: #{{ p.id }}</div>
                      </div>
                    </div>
                  </td>

                  <!-- Seller SKU -->
                  <td class="px-4 py-3 align-middle font-mono font-bold text-slate-900 whitespace-nowrap">
                    {{ p.seller_sku }}
                  </td>

                  <!-- Batas Stok -->
                  <td class="px-4 py-3 align-middle text-center whitespace-nowrap">
                    <span class="text-xs font-semibold text-slate-700">Min: {{ p.min_stock }}</span>
                    <span class="text-slate-300 mx-1">&bull;</span>
                    <span class="text-xs font-semibold text-slate-700">Max: {{ p.max_stock }}</span>
                  </td>

                  <!-- Aksi -->
                  <td class="px-4 py-3 align-middle text-right whitespace-nowrap">
                    <div class="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        @click="openEditProduct(p)"
                        class="text-xs font-bold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer"
                      >
                        Ubah
                      </button>
                      <span class="text-slate-200">|</span>
                      <button
                        type="button"
                        @click="deleteProduct(p)"
                        class="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: CATEGORIES -->
    <div v-else class="space-y-4">
      <div class="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6 max-w-2xl">
        <h3 class="text-sm font-bold uppercase tracking-wider text-slate-900 mb-3">Daftar Kategori Garment</h3>
        <p class="text-xs text-slate-500 mb-4">
          Kategori digunakan untuk pengelompokan produk dan grafik analisis distribusi stok.
        </p>

        <div class="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
          <div
            v-for="c in categories"
            :key="c.id"
            class="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition"
          >
            <div class="flex items-center space-x-3">
              <span class="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center">
                {{ c.id }}
              </span>
              <span class="text-xs font-bold text-slate-900">{{ c.name }}</span>
            </div>

            <div class="flex items-center space-x-2">
              <button
                type="button"
                @click="openEditCategory(c)"
                class="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Ubah
              </button>
              <span class="text-slate-200">|</span>
              <button
                type="button"
                @click="deleteCategory(c)"
                class="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL PRODUCT (ADD / EDIT) -->
    <div
      v-if="showProductModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div class="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-bold text-slate-900">
            {{ isEditingProduct ? 'Ubah Data Produk' : 'Tambah Produk Baru' }}
          </h3>
          <button
            type="button"
            @click="showProductModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="productFormError" class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
          {{ productFormError }}
        </div>

        <form @submit.prevent="saveProduct" class="space-y-4">
          <!-- Seller SKU -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Seller SKU <span class="text-rose-600">*</span>
            </label>
            <input
              v-model="productForm.seller_sku"
              type="text"
              required
              placeholder="cth: CLN-KULOT-BLK-L"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <!-- Product Name -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Nama Produk <span class="text-rose-600">*</span>
            </label>
            <input
              v-model="productForm.name"
              type="text"
              required
              placeholder="cth: Celana Kulot Highwaist Katun Hitam L"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <!-- Category, Min & Max Stock -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Kategori</label>
              <select
                v-model="productForm.category_id"
                class="mt-1 block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Min. Stok (Safety)</label>
              <input
                v-model.number="productForm.min_stock"
                type="number"
                min="0"
                class="mt-1 block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Max. Stok (Kapasitas)</label>
              <input
                v-model.number="productForm.max_stock"
                type="number"
                min="0"
                class="mt-1 block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <!-- Product Image Upload -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Foto Produk</label>
            <div class="mt-1 flex items-center space-x-3">
              <div class="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                <img
                  v-if="productForm.image_url"
                  :src="productForm.image_url"
                  alt="Preview"
                  class="w-full h-full object-cover"
                />
                <svg v-else class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>

              <div class="flex-1 space-y-1">
                <input
                  ref="imageFileInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  class="hidden"
                  @change="handleImageFileChange"
                />
                <div class="flex items-center space-x-2">
                  <button
                    type="button"
                    @click="imageFileInput?.click()"
                    :disabled="isUploadingImage"
                    class="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span v-if="isUploadingImage">Mengunggah...</span>
                    <span v-else>Pilih Berkas Foto</span>
                  </button>
                  <button
                    v-if="productForm.image_url"
                    type="button"
                    @click="productForm.image_url = ''"
                    class="text-xs text-rose-600 hover:underline cursor-pointer font-semibold"
                  >
                    Hapus
                  </button>
                </div>
                <p class="text-[10px] text-slate-400">Format JPG, PNG, atau WEBP maks 5MB.</p>
              </div>
            </div>
          </div>

          <!-- Buttons -->
          <div class="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              @click="showProductModal = false"
              class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSavingProduct"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
            >
              <span v-if="isSavingProduct">Menyimpan...</span>
              <span v-else>Simpan Produk</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL CATEGORY (ADD / EDIT) -->
    <div
      v-if="showCategoryModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div class="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-bold text-slate-900">
            {{ isEditingCategory ? 'Ubah Kategori' : 'Tambah Kategori Baru' }}
          </h3>
          <button
            type="button"
            @click="showCategoryModal = false"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="categoryError" class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
          {{ categoryError }}
        </div>

        <form @submit.prevent="saveCategory" class="space-y-4">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Nama Kategori</label>
            <input
              v-model="categoryNameInput"
              type="text"
              required
              placeholder="cth: Setelan Jaket"
              class="mt-1 block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div class="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              @click="showCategoryModal = false"
              class="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSavingCategory"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/20 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
            >
              <span v-if="isSavingCategory">Menyimpan...</span>
              <span v-else>Simpan Kategori</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
