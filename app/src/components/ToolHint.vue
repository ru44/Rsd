<script setup lang="ts">
import { computed } from "vue";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import { tool } from "@/composables/tool";

// Says what the active tool expects next, with its finish and cancel actions.
const { pointCount, draftInfo, finishDraw } = useAreas();
const { placing } = useSymbols();

const text = computed(() => {
  const n = pointCount.value;
  switch (tool.value) {
    case "rect":
      return draftInfo.value || "Drag on the map to draw a rectangle. Hold Shift for a square.";
    case "circle":
      return draftInfo.value || "Drag outwards from the centre of the circle.";
    case "polygon":
      if (n === 0) return "Click the map to start the area.";
      if (n < 3) return `${n} of at least 3 points. Keep clicking.`;
      return `${n} points. Click to add more, or finish.`;
    case "line":
      if (n === 0) return "Click the map to start the line.";
      if (n === 1) return "Click the next point.";
      return `${n} points, ${draftInfo.value}. Click to add more, or finish.`;
    case "symbol":
      return placing.value ? `Click the map to place ${placing.value.name.toLowerCase()}.` : "";
    default:
      return "";
  }
});
const finishable = computed(() => tool.value === "polygon" || tool.value === "line");
const canFinish = computed(() => pointCount.value >= (tool.value === "line" ? 2 : 3));
</script>

<template>
  <div v-if="text" class="panel flex max-w-md items-center gap-3 py-1.5 pl-3 pr-1.5 text-sm" role="status">
    <span>{{ text }}</span>
    <button v-if="finishable" type="button" class="act bg-signal text-ink" :disabled="!canFinish" @click="finishDraw">
      Finish
    </button>
    <button type="button" class="act text-dim hover:text-paper" @click="tool = 'select'">Cancel</button>
  </div>
</template>

<style scoped>
.act {
  @apply shrink-0 rounded-sm px-2.5 py-1 text-xs font-bold;
}
.act:disabled {
  @apply cursor-not-allowed opacity-40;
}
</style>
