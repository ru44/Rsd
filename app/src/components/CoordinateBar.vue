<script setup lang="ts">
import { computed, ref } from "vue";
import { useMap } from "@/composables/useMap";
import { COORD_FORMATS, formatCoord, type CoordFormat } from "@/lib/coords";

const { cursor } = useMap();
const format = ref<CoordFormat>("MGRS");

const text = computed(() =>
  cursor.value
    ? formatCoord(cursor.value.lon, cursor.value.lat, format.value)
    : "move the pointer over the map"
);
</script>

<template>
  <div
    class="absolute bottom-8 right-4 z-50 flex items-center gap-3 rounded-xl bg-slate-900/85 px-3 py-2 text-sm text-white shadow-lg backdrop-blur"
  >
    <select
      v-model="format"
      aria-label="Coordinate format"
      class="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white outline-none"
    >
      <option v-for="f in COORD_FORMATS" :key="f" :value="f">{{ f }}</option>
    </select>
    <span class="min-w-[17rem] font-mono tabular-nums">{{ text }}</span>
  </div>
</template>
