<script setup lang="ts">
import { computed } from "vue";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";

// Says what the active tool expects next, with its finish and cancel actions.
const { drawing, pointCount, finishDraw, cancelDraw } = useAreas();
const { placing, cancelPlacing } = useSymbols();

const drawText = computed(() => {
  const n = pointCount.value;
  if (n === 0) return "Click the map to start the area.";
  if (n < 3) return `${n} of at least 3 points. Keep clicking.`;
  return `${n} points. Click to add more, or finish.`;
});
</script>

<template>
  <div
    v-if="drawing || placing"
    class="panel flex items-center gap-3 py-1.5 pl-3 pr-1.5 text-sm"
    role="status"
  >
    <template v-if="drawing">
      <span>{{ drawText }}</span>
      <button type="button" class="act bg-signal text-ink" :disabled="pointCount < 3" @click="finishDraw">
        Finish
      </button>
      <button type="button" class="act text-dim hover:text-paper" @click="cancelDraw">Cancel</button>
    </template>
    <template v-else-if="placing">
      <span>Click the map to place {{ placing.name.toLowerCase() }}.</span>
      <button type="button" class="act text-dim hover:text-paper" @click="cancelPlacing">Cancel</button>
    </template>
  </div>
</template>

<style scoped>
.act {
  @apply rounded-sm px-2.5 py-1 text-xs font-bold;
}
.act:disabled {
  @apply cursor-not-allowed opacity-40;
}
</style>
