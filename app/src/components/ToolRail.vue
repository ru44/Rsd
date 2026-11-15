<script setup lang="ts">
import { ref, watch } from "vue";
import { Flag, Globe, Map, Pentagon } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { SYMBOL_PALETTE, symbolImage, useSymbols } from "@/composables/useSymbols";

const { is3D, toggleMode } = useMap();
const { drawing, startDraw, cancelDraw } = useAreas();
const { placing, arm, cancelPlacing } = useSymbols();

const paletteOpen = ref(false);
const palette = SYMBOL_PALETTE.map((s) => ({ ...s, image: symbolImage(s.sidc) }));

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
function pick(sidc: string) {
  paletteOpen.value = false;
  arm(sidc);
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
    </nav>

    <div v-if="paletteOpen" class="panel w-56 p-1" role="menu" aria-label="Symbols">
      <button
        v-for="s in palette"
        :key="s.sidc"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-raised"
        @click="pick(s.sidc)"
      >
        <span class="flex h-8 w-9 shrink-0 items-center justify-center">
          <img :src="s.image" alt="" class="max-h-8 max-w-9" />
        </span>
        {{ s.label }}
      </button>
    </div>
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
