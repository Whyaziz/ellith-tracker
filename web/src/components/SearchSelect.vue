<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

export interface SearchOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string | number;
  badgeClass?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: SearchOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    required?: boolean;
  }>(),
  {
    placeholder: '-- Pilih Produk / SKU --',
    searchPlaceholder: 'Ketik nama produk atau SKU...',
    disabled: false,
    required: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const highlightedIndex = ref(0);

const selectedOption = computed(() => {
  return props.options.find((opt) => opt.value === props.modelValue) || null;
});

const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter((opt) => {
    const valMatch = opt.value.toLowerCase().includes(q);
    const labelMatch = opt.label.toLowerCase().includes(q);
    const subMatch = opt.sublabel ? opt.sublabel.toLowerCase().includes(q) : false;
    return valMatch || labelMatch || subMatch;
  });
});

watch(filteredOptions, () => {
  highlightedIndex.value = 0;
});

function toggleDropdown() {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    searchQuery.value = '';
    highlightedIndex.value = 0;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
}

function selectOption(opt: SearchOption) {
  emit('update:modelValue', opt.value);
  emit('change', opt.value);
  isOpen.value = false;
  searchQuery.value = '';
}

function clearSelection(event?: MouseEvent) {
  if (event) event.stopPropagation();
  emit('update:modelValue', '');
  emit('change', '');
}

function onKeyDown(event: KeyboardEvent) {
  if (!isOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      toggleDropdown();
      event.preventDefault();
    }
    return;
  }

  if (event.key === 'Escape') {
    isOpen.value = false;
    event.preventDefault();
  } else if (event.key === 'ArrowDown') {
    if (filteredOptions.value.length > 0) {
      highlightedIndex.value = (highlightedIndex.value + 1) % filteredOptions.value.length;
    }
    event.preventDefault();
  } else if (event.key === 'ArrowUp') {
    if (filteredOptions.value.length > 0) {
      highlightedIndex.value =
        (highlightedIndex.value - 1 + filteredOptions.value.length) % filteredOptions.value.length;
    }
    event.preventDefault();
  } else if (event.key === 'Enter') {
    if (filteredOptions.value[highlightedIndex.value]) {
      selectOption(filteredOptions.value[highlightedIndex.value]);
    }
    event.preventDefault();
  }
}

function handleClickOutside(event: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div ref="containerRef" class="relative w-full text-left" @keydown="onKeyDown">
    <!-- Trigger Button -->
    <button
      type="button"
      :disabled="disabled"
      @click="toggleDropdown"
      class="w-full flex items-center justify-between px-3 py-2 bg-white border rounded-lg text-xs font-medium transition cursor-pointer"
      :class="[
        isOpen
          ? 'border-indigo-600 ring-2 ring-indigo-500/20'
          : 'border-slate-300 hover:border-slate-400',
        disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-slate-900',
      ]"
    >
      <div class="flex items-center space-x-2 truncate pr-2">
        <template v-if="selectedOption">
          <span class="font-mono font-bold text-slate-900 truncate">{{ selectedOption.value }}</span>
          <span class="text-slate-400 font-normal truncate">• {{ selectedOption.label }}</span>
        </template>
        <template v-else>
          <span class="text-slate-400 font-normal">{{ placeholder }}</span>
        </template>
      </div>

      <div class="flex items-center space-x-1 shrink-0">
        <!-- Clear button if selected -->
        <span
          v-if="selectedOption && !disabled"
          @click="clearSelection"
          class="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition cursor-pointer"
          title="Hapus pilihan"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
        <!-- Chevron -->
        <svg
          class="w-4 h-4 text-slate-400 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <!-- Hidden native input to satisfy HTML form validations -->
    <input
      type="text"
      tabindex="-1"
      aria-hidden="true"
      :value="modelValue"
      :required="required"
      class="sr-only"
    />

    <!-- Dropdown Menu Popup -->
    <div
      v-if="isOpen"
      class="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      <!-- Search Input Container -->
      <div class="p-2 border-b border-slate-100 bg-slate-50/70">
        <div class="relative">
          <svg
            class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            :placeholder="searchPlaceholder"
            class="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            @click.stop
          />
        </div>
      </div>

      <!-- Options List -->
      <div class="max-h-56 overflow-y-auto py-1 divide-y divide-slate-50">
        <div
          v-for="(opt, idx) in filteredOptions"
          :key="opt.value"
          @click="selectOption(opt)"
          @mouseenter="highlightedIndex = idx"
          class="px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition"
          :class="[
            highlightedIndex === idx ? 'bg-indigo-50/80 text-indigo-900' : 'text-slate-700 hover:bg-slate-50',
            opt.value === modelValue ? 'font-bold bg-indigo-50 text-indigo-700' : '',
          ]"
        >
          <div class="flex flex-col truncate pr-2">
            <span class="font-mono font-bold text-slate-900 truncate">
              {{ opt.value }}
            </span>
            <span class="text-[11px] text-slate-500 truncate mt-0.5">
              {{ opt.label }}
            </span>
          </div>

          <div v-if="opt.badge !== undefined" class="shrink-0">
            <span
              class="px-2 py-0.5 text-[10px] font-bold rounded-full font-mono"
              :class="opt.badgeClass || 'bg-slate-100 text-slate-600'"
            >
              {{ opt.badge }}
            </span>
          </div>
        </div>

        <div v-if="filteredOptions.length === 0" class="p-4 text-center text-xs text-slate-400">
          Tidak ada produk yang cocok dengan pencarian
        </div>
      </div>
    </div>
  </div>
</template>
