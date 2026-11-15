<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

interface Props {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
}

const props = withDefaults(defineProps<Props>(), {
  pageSizeOptions: () => [10, 25, 50, 100],
});

const emit = defineEmits<{
  (e: 'update:currentPage', page: number): void;
  (e: 'update:pageSize', size: number): void;
}>();

const totalPages = computed(() => {
  if (props.totalItems <= 0) return 1;
  return Math.ceil(props.totalItems / props.pageSize);
});

const fromItem = computed(() => {
  if (props.totalItems <= 0) return 0;
  return (props.currentPage - 1) * props.pageSize + 1;
});

const toItem = computed(() => {
  return Math.min(props.currentPage * props.pageSize, props.totalItems);
});

function setPage(page: number) {
  if (page < 1 || page > totalPages.value || page === props.currentPage) return;
  emit('update:currentPage', page);
}

function handlePageSizeChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const newSize = Number(target.value);
  emit('update:pageSize', newSize);
  emit('update:currentPage', 1);
}

// Generate visible page numbers with ellipsis
const visiblePages = computed(() => {
  const total = totalPages.value;
  const current = props.currentPage;
  const delta = 1; // number of pages around current

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | string)[] = [];
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);

  pages.push(1);

  if (left > 2) {
    pages.push('...');
  }

  for (let i = left; i <= right; i++) {
    pages.push(i);
  }

  if (right < total - 1) {
    pages.push('...');
  }

  pages.push(total);
  return pages;
});
</script>

<template>
  <div
    v-if="totalItems > 0"
    class="px-4 py-3 bg-white border-t border-slate-200/80 rounded-b-3xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs select-none"
  >
    <!-- Left: Status Info & Page Size Selector -->
    <div class="flex flex-wrap items-center gap-3 text-slate-500 w-full sm:w-auto justify-between sm:justify-start">
      <div>
        Menampilkan
        <span class="font-bold text-slate-800 font-mono">{{ fromItem }}</span>
        -
        <span class="font-bold text-slate-800 font-mono">{{ toItem }}</span>
        dari
        <span class="font-bold text-slate-800 font-mono">{{ totalItems.toLocaleString('id-ID') }}</span>
        data
      </div>

      <div class="flex items-center space-x-1.5 pl-2 sm:border-l sm:border-slate-200">
        <label for="page-size-select" class="text-slate-400">Baris:</label>
        <select
          id="page-size-select"
          :value="pageSize"
          @change="handlePageSizeChange"
          class="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
        >
          <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </div>
    </div>

    <!-- Right: Page Navigation Pills -->
    <div class="flex items-center space-x-1.5">
      <!-- Previous Page Button -->
      <button
        type="button"
        @click="setPage(currentPage - 1)"
        :disabled="currentPage <= 1"
        class="w-8 h-8 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
        title="Halaman Sebelumnya"
        aria-label="Halaman Sebelumnya"
      >
        <ChevronLeft class="w-4 h-4 text-slate-700" />
      </button>

      <!-- Page Numbers -->
      <template v-for="(p, idx) in visiblePages" :key="idx">
        <span
          v-if="p === '...'"
          class="px-2 py-1 text-slate-400 font-bold select-none"
        >
          ...
        </span>
        <button
          v-else
          type="button"
          @click="setPage(Number(p))"
          class="min-w-8 h-8 px-2 rounded-lg text-xs font-bold font-mono transition flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          :class="[
            p === currentPage
              ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-500/30 ring-1 ring-indigo-700'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
          ]"
        >
          {{ p }}
        </button>
      </template>

      <!-- Next Page Button -->
      <button
        type="button"
        @click="setPage(currentPage + 1)"
        :disabled="currentPage >= totalPages"
        class="w-8 h-8 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
        title="Halaman Berikutnya"
        aria-label="Halaman Berikutnya"
      >
        <ChevronRight class="w-4 h-4 text-slate-700" />
      </button>
    </div>
  </div>
</template>
