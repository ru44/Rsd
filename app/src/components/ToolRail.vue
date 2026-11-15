<script setup lang="ts">
import { ref, watch } from "vue";
import { Flag, Globe, Map, Maximize, Pentagon } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import SymbolPicker from "./SymbolPicker.vue";
import { useClearView } from "@/composables/useClearView";

const { is3D, toggleMode } = useMap();
const { drawing, startDraw, cancelDraw } = useAreas();
const { placing, arm, cancelPlacing } = useSymbols();
const { enter: enterClearView } = useClearView();

const paletteOpen = ref(false);

// Only one tool is active at a time.
function toggleArea() {
  paletteOpen.value = false;
  cancelPlacing();
  if (drawing.value) cancelDraw();
  else startDraw();
}
function toggleSymbols() {
  cancelDraw();
  if (placing.value) cancelPlacing();
  else paletteOpen.value = !paletteOpen.value;
}
function pick(sidc: string, name: string) {
  paletteOpen.value = false;
  arm(sidc, name);
}

defineExpose({ closePalette: () => (paletteOpen.value = false) });
watch(drawing, (on) => on && (paletteOpen.value = false));
</script>

<template>
  <div class="flex items-start gap-2">
    <nav class="panel flex flex-col overflow-hidden" aria-label="Map tools">
      <button type="button" class="tool" :aria-pressed="drawing" @click="toggleArea">
        <Pentagon class="h-5 w-5" aria-hidden="true" />
        Area
      </button>
      <button
        type="button"
        class="tool"
        :aria-pressed="paletteOpen || !!placing"
        :aria-expanded="paletteOpen"
        @click="toggleSymbols"
      >
        <Flag class="h-5 w-5" aria-hidden="true" />
        Symbol
      </button>
      <button
        type="button"
        class="tool border-t border-edge"
        :title="is3D ? 'Switch to the flat map' : 'Switch to the globe'"
        @click="toggleMode"
      >
        <component :is="is3D ? Map : Globe" class="h-5 w-5" aria-hidden="true" />
        {{ is3D ? "Flat" : "Globe" }}
      </button>
      <button
        type="button"
        class="tool"
        title="Full screen with no controls (F)"
        @click="enterClearView"
      >
        <Maximize class="h-5 w-5" aria-hidden="true" />
        Full
      </button>
    </nav>

    <SymbolPicker v-if="paletteOpen" @pick="pick" />
  </div>
</template>

<style scoped>
.tool {
  @apply flex w-14 flex-col items-center gap-1 px-1 py-2 text-[11px] leading-none text-dim transition-colors;
}
.tool:hover {
  @apply bg-raised text-paper;
}
.tool[aria-pressed="true"] {
  @apply bg-signal text-ink;
}
</style>
