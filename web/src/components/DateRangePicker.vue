<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';

interface PresetDateItem {
  label: string;
  value: Date[];
}

const props = withDefaults(
  defineProps<{
    startDate?: string;
    endDate?: string;
    placeholder?: string;
    autoApply?: boolean;
    clearable?: boolean;
    showPresets?: boolean;
  }>(),
  {
    startDate: '',
    endDate: '',
    placeholder: 'Pilih rentang tanggal...',
    autoApply: true,
    clearable: true,
    showPresets: true,
  }
);

const emit = defineEmits<{
  (e: 'update:startDate', val: string): void;
  (e: 'update:endDate', val: string): void;
  (e: 'change', val: { startDate: string; endDate: string }): void;
}>();

// Helper parsing YYYY-MM-DD to local Date
function parseYmd(ymd?: string): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Helper formatting local Date to YYYY-MM-DD
function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const selectedDates = ref<[Date, Date] | null>(null);

function syncFromProps() {
  const d1 = parseYmd(props.startDate);
  const d2 = parseYmd(props.endDate);
  if (d1 && d2) {
    selectedDates.value = [d1, d2];
  } else if (d1) {
    selectedDates.value = [d1, d1];
  } else {
    selectedDates.value = null;
  }
}

syncFromProps();

watch(
  () => [props.startDate, props.endDate],
  () => {
    // Hanya sync jika berbeda dari selectedDates saat ini
    const curStart = selectedDates.value?.[0] ? toYmd(selectedDates.value[0]) : '';
    const curEnd = selectedDates.value?.[1] ? toYmd(selectedDates.value[1]) : '';
    if (curStart !== props.startDate || curEnd !== props.endDate) {
      syncFromProps();
    }
  }
);

function handleDateChange(val: any) {
  // Jika pengguna klik tombol clear (X)
  if (!val || !Array.isArray(val) || val.length === 0) {
    emit('update:startDate', '');
    emit('update:endDate', '');
    emit('change', { startDate: '', endDate: '' });
    return;
  }

  const [start, end] = val;
  // HANYA update & emit ketika klik kedua sudah dilakukan (keduanya Date valid)
  if (start instanceof Date && end instanceof Date) {
    const sStr = toYmd(start);
    const eStr = toYmd(end);
    emit('update:startDate', sStr);
    emit('update:endDate', eStr);
    emit('change', { startDate: sStr, endDate: eStr });
  }
}

function formatDate(dates: (Date | null)[]) {
  if (!dates || !dates[0]) return '';
  const d1 = dates[0];
  const d2 = dates[1];
  const pad = (n: number) => String(n).padStart(2, '0');
  const d1Str = `${pad(d1.getDate())}/${pad(d1.getMonth() + 1)}`;
  const y1 = d1.getFullYear();

  if (!d2) return `${d1Str}/${y1} - ...`;

  const d2Str = `${pad(d2.getDate())}/${pad(d2.getMonth() + 1)}`;
  const y2 = d2.getFullYear();

  // Jika hari yang sama persis
  if (d1.toDateString() === d2.toDateString()) {
    return `${d1Str}/${y1}`;
  }

  // Jika tahun sama, format lebih ringkas agar tidak terpotong (cth: 28/10 - 04/11/2026)
  if (y1 === y2) {
    return `${d1Str} - ${d2Str}/${y2}`;
  }

  return `${d1Str}/${y1} - ${d2Str}/${y2}`;
}

// Preset tanggal cepat di dalam popup kalender
const presetDates = computed<PresetDateItem[]>(() => {
  if (!props.showPresets) return [];
  const now = new Date();
  const d7 = new Date();
  d7.setDate(d7.getDate() - 6);
  const d30 = new Date();
  d30.setDate(d30.getDate() - 29);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return [
    { label: 'Hari Ini', value: [now, now] },
    { label: '7 Hari Terakhir', value: [d7, now] },
    { label: '30 Hari Terakhir', value: [d30, now] },
    { label: 'Bulan Ini', value: [mStart, now] },
  ];
});
</script>

<template>
  <div class="custom-datepicker-wrapper w-full">
    <VueDatePicker
      v-model="selectedDates"
      :range="{ partialRange: false }"
      :enable-time-picker="false"
      :auto-apply="autoApply"
      :clearable="clearable"
      :format="formatDate"
      :placeholder="placeholder"
      :preset-dates="presetDates"
      @update:model-value="handleDateChange"
    />
  </div>
</template>

<style>
.custom-datepicker-wrapper {
  --dp-font-family: inherit;
  --dp-border-radius: 0.75rem;
  --dp-cell-border-radius: 0.5rem;
  --dp-primary-color: #4f46e5;
  --dp-primary-text-color: #ffffff;
  --dp-secondary-color: #64748b;
  --dp-border-color: #e2e8f0;
  --dp-menu-border-color: #e2e8f0;
  --dp-border-color-hover: #cbd5e1;
  --dp-disabled-color: #f1f5f9;
  --dp-success-color: #10b981;
  --dp-icon-color: #6366f1;
  --dp-danger-color: #ef4444;
  --dp-highlight-color: rgba(79, 70, 229, 0.08);
  --dp-range-between-dates-background-color: #eef2ff;
  --dp-range-between-dates-text-color: #312e81;
  --dp-range-between-border-color: #c7d2fe;
  --dp-font-size: 0.75rem;
}

.custom-datepicker-wrapper .dp__input_wrap {
  border-radius: 0.75rem;
}

.custom-datepicker-wrapper .dp__input {
  background-color: #ffffff;
  border-color: #e2e8f0;
  font-size: 0.75rem;
  font-weight: 600;
  color: #1e293b;
  border-radius: 0.75rem;
  padding-top: 0.45rem;
  padding-bottom: 0.45rem;
  padding-left: 2.1rem;
  padding-right: 1.5rem;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  transition: all 0.15s ease-in-out;
}

.custom-datepicker-wrapper .dp__input:hover {
  border-color: #a5b4fc;
  background-color: #ffffff;
}

.custom-datepicker-wrapper .dp__input_focus {
  border-color: #4f46e5;
  background-color: #ffffff;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15);
}

.custom-datepicker-wrapper .dp__menu {
  border-radius: 1rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
  font-size: 0.75rem;
  padding: 0.25rem;
}

.custom-datepicker-wrapper .dp__preset_ranges {
  border-right: 1px solid #f1f5f9;
  font-size: 0.75rem;
  font-weight: 600;
}

.custom-datepicker-wrapper .dp__preset_range {
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  margin: 0.125rem 0.25rem;
  color: #475569;
}

.custom-datepicker-wrapper .dp__preset_range:hover {
  background-color: #eef2ff;
  color: #4338ca;
}
</style>