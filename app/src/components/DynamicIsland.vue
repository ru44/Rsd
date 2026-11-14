<script setup lang="ts">
import { computed } from "vue";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import ToolDrawIsland from "./tools/ToolDrawIsland.vue";
import ToolAddSymbolIsland from "./tools/ToolAddSymbolIsland.vue";

// The island shows whichever map tool is active right now.
const { drawing, pointCount, finishDraw } = useAreas();
const { placing, cancelPlacing } = useSymbols();

const active = computed(() => {
  if (drawing.value) return "draw";
  if (placing.value) return "add-symbol";
  return null;
});
</script>

<template>
  <transition name="slide-up">
    <div
      v-if="active"
      class="fixed bottom-16 left-1/2 -translate-x-1/2 bg-cyan-900/95 text-white rounded-2xl shadow-xl px-6 py-3 flex items-center gap-6 z-[1000] min-w-[260px]"
      style="backdrop-filter: blur(8px)"
    >
      <ToolDrawIsland
        v-if="active === 'draw'"
        :info="{ points: pointCount }"
        @end="finishDraw"
      />
      <ToolAddSymbolIsland v-else :info="{}" @close="cancelPlacing" />
    </div>
  </transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(40px);
}
</style>
