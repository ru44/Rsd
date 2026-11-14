<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="area in props.areas"
      :key="area.id"
      class="flex items-center justify-between"
    >
      <span class="text-gray-700">{{ area.name }}</span>
      <button @click="props.onZoom(area)" class="btn-cyan">Go To</button>
    </div>
    <div v-if="!props.areas.length" class="text-xs text-gray-400 py-2 text-center">
      No saved areas.
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  areas: { id: string | number; name: string; geojson: any }[];

  onZoom: (area: any) => void;
}>();
</script>

<style scoped>
.btn-cyan {
  @apply bg-cyan-600 hover:bg-cyan-700 text-white rounded px-3 py-1 shadow-sm transition-colors text-sm font-medium;
}
</style>
