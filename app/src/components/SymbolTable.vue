<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="s in symbols"
      :key="s.id"
      class="flex items-center justify-between"
    >
      <span class="text-gray-700">{{ s.label }}</span>
      <button @click="onAdd(s.id)" class="btn-cyan">Add</button>
    </div>
    <div class="flex items-center justify-between mt-3">
      <span class="text-gray-600 font-medium">Save</span>
      <button @click="onSave" class="btn-cyan">Save</button>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-gray-600 font-medium">Load</span>
      <button @click="onLoad" class="btn-cyan">Load</button>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-gray-600 font-medium">Remove</span>
      <button @click="onRemove" class="btn-danger">Remove All</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  onAdd: (id: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onRemove: () => void;
}>();
const symbols = [
  { id: "SFGPUCI----K", label: "Infantry" },
  { id: "SFGPEWRH---L", label: "Electronic Warfare" },
  { id: "SHGPUCFRMS--G", label: "Mechanized Infantry" },
  { id: "SHGPUAAA---G", label: "Anti-Aircraft" },
  { id: "SFGPUCVG---K", label: "Reconnaissance" },
];
const { onAdd, onSave, onLoad, onRemove } = props;
</script>

<style scoped>
.btn-cyan {
  @apply bg-cyan-600 hover:bg-cyan-700 text-white rounded px-3 py-1 shadow-sm transition-colors text-sm font-medium;
}
.btn-danger {
  @apply bg-red-500 hover:bg-red-600 text-white rounded px-3 py-1 shadow-sm transition-colors text-sm font-medium;
}
</style>
