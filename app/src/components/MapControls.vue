<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <span class="text-gray-700 font-medium">Draw AOI</span>
      <button @click="handleDraw" class="btn-cyan">Draw</button>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-gray-700 font-medium">Save AOI</span>
      <button @click="handleSave" class="btn-cyan">Save</button>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-gray-700 font-medium">Load AOIs</span>
      <button @click="handleLoad" class="btn-cyan">Load</button>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-gray-700 font-medium">Remove all AOIs</span>
      <button @click="handleRemove" class="btn-danger">Remove</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  onDraw: () => void;
  onSave: () => void;
  onLoad: () => void;
  onRemove: () => void;
}>();
const { onDraw, onSave, onLoad, onRemove } = props;

function handleDraw() {
  console.log("Draw AOI clicked!");
  onDraw();
}
function handleSave() {
  console.log("Save AOI clicked!");
  onSave();
}
function handleLoad() {
  console.log("Load AOIs clicked!");
  onLoad();
}
function handleRemove() {
  console.log("Remove all AOIs clicked!");
  onRemove();
}
</script>

<style scoped>
.btn-cyan {
  @apply bg-cyan-600 hover:bg-cyan-700 text-white rounded px-3 py-1 shadow-sm transition-colors text-sm font-medium;
}
.btn-danger {
  @apply bg-red-500 hover:bg-red-600 text-white rounded px-3 py-1 shadow-sm transition-colors text-sm font-medium;
}
</style>
