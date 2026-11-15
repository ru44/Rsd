<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import MapCanvas from "@/components/MapCanvas.vue";
import ToolRail from "@/components/ToolRail.vue";
import ToolHint from "@/components/ToolHint.vue";
import LayersPanel from "@/components/LayersPanel.vue";
import SelectionPanel from "@/components/SelectionPanel.vue";
import MarginBar from "@/components/MarginBar.vue";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import { useMgrsGrid } from "@/composables/useMgrsGrid";
import { useClearView } from "@/composables/useClearView";
import { useSelection } from "@/composables/useSelection";

const { drawing, load: loadAreas, finishDraw, cancelDraw } = useAreas();
const { placing, load: loadSymbols, cancelPlacing } = useSymbols();
const { attach: attachGrid } = useMgrsGrid();
const { clear, hint, exit: exitClearView, toggle: toggleClearView } = useClearView();
const { selection, deselect } = useSelection();
const rail = ref<InstanceType<typeof ToolRail> | null>(null);

function onKey(e: KeyboardEvent) {
  // Leave typing alone: the format picker uses letter keys to jump to options.
  const typing = e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if ((e.key === "f" || e.key === "F") && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    toggleClearView();
  } else if (e.key === "Escape" && clear.value) {
    exitClearView();
  } else if (e.key === "Escape") {
    // Esc backs out of one thing at a time: the tool first, then the selection.
    if (drawing.value || placing.value) {
      cancelDraw();
      cancelPlacing();
    } else if (typing) {
      (e.target as HTMLElement).blur();
    } else {
      deselect();
    }
    rail.value?.closePalette();
  } else if (e.key === "Enter" && drawing.value) {
    finishDraw();
  }
}

// The map is created by MapCanvas, a child, so it exists by the time this
// parent mounts: safe to attach layers and show what is already saved.
onMounted(() => {
  attachGrid();
  loadAreas();
  loadSymbols();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <!-- select-none: dragging on the map must not highlight the panels' text. -->
  <div class="relative h-full w-full select-none">
    <MapCanvas :crosshair="drawing || !!placing" />

    <!-- Everything below hides in the clear view, leaving only the map. -->
    <template v-if="!clear">
      <!-- Tools on the left, with the active tool's prompt beside them. -->
      <div class="pointer-events-none absolute left-3 top-3 z-20 flex flex-wrap items-start gap-2">
        <ToolRail ref="rail" class="pointer-events-auto" />
        <ToolHint class="pointer-events-auto" />
      </div>

      <div class="absolute right-3 top-3 z-20 flex max-h-[calc(100%-4.5rem)] flex-col items-end gap-2 overflow-y-auto">
        <LayersPanel />
        <SelectionPanel />
      </div>
      <MarginBar class="absolute inset-x-0 bottom-0 z-20" />
    </template>

    <!-- Shown for a moment on entering the clear view, then gone. -->
    <transition name="fade">
      <p
        v-if="hint"
        class="panel pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-sm"
        role="status"
      >
        Press F or Esc to bring the controls back
      </p>
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
