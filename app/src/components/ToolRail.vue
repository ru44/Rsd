<script setup lang="ts">
import type { Component } from "vue";
import { Circle, Flag, Globe, Hand, Map, Maximize, MousePointer2, Pentagon, Square, Waypoints } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { useClearView } from "@/composables/useClearView";
import { isDrawTool, pickerOpen, tool, type Tool } from "@/composables/tool";

const { is3D, toggleMode } = useMap();
const { enter: enterClearView } = useClearView();

interface Item {
  id: Tool;
  label: string;
  key: string;
  icon: Component;
}
const MOVE: Item[] = [
  { id: "hand", label: "Move the map", key: "H", icon: Hand },
  { id: "select", label: "Select and edit", key: "V", icon: MousePointer2 },
];
const DRAW: Item[] = [
  { id: "rect", label: "Rectangle", key: "R", icon: Square },
  { id: "circle", label: "Circle", key: "C", icon: Circle },
  { id: "polygon", label: "Area with any number of corners", key: "P", icon: Pentagon },
  { id: "line", label: "Line", key: "L", icon: Waypoints },
];

// Only one tool is active at a time. Pressing a drawing tool again puts it down.
function choose(id: Tool) {
  pickerOpen.value = false;
  tool.value = isDrawTool(id) && tool.value === id ? "select" : id;
}
function toggleSymbols() {
  if (tool.value === "symbol") {
    tool.value = "select";
    return;
  }
  if (!pickerOpen.value) tool.value = "select"; // drop whatever was being drawn
  pickerOpen.value = !pickerOpen.value;
}
</script>

<template>
  <nav class="panel flex flex-col" aria-label="Map tools">
    <template v-for="(group, g) in [MOVE, DRAW]" :key="g">
      <button
        v-for="t in group"
        :key="t.id"
        type="button"
        class="tool"
        :class="{ 'border-t border-edge': g > 0 && t === group[0] }"
        :aria-pressed="tool === t.id"
        :aria-label="t.label"
        :aria-keyshortcuts="t.key"
        @click="choose(t.id)"
      >
        <component :is="t.icon" class="h-5 w-5" aria-hidden="true" />
        <span class="key" aria-hidden="true">{{ t.key }}</span>
        <span class="tip" aria-hidden="true">{{ t.label }}</span>
      </button>
    </template>
    <button
      type="button"
      class="tool"
      aria-label="Military symbol"
      aria-keyshortcuts="S"
      :aria-pressed="pickerOpen || tool === 'symbol'"
      :aria-expanded="pickerOpen"
      @click="toggleSymbols"
    >
      <Flag class="h-5 w-5" aria-hidden="true" />
      <span class="key" aria-hidden="true">S</span>
      <span class="tip" aria-hidden="true">Military symbol</span>
    </button>

    <button
      type="button"
      class="tool border-t border-edge"
      :aria-label="is3D ? 'Switch to the flat map' : 'Switch to the globe'"
      aria-keyshortcuts="G"
      @click="toggleMode"
    >
      <component :is="is3D ? Map : Globe" class="h-5 w-5" aria-hidden="true" />
      <span class="key" aria-hidden="true">G</span>
      <span class="tip" aria-hidden="true">{{ is3D ? "Flat map" : "Globe" }}</span>
    </button>
    <button type="button" class="tool" aria-label="Full screen with no controls" aria-keyshortcuts="F" @click="enterClearView">
      <Maximize class="h-5 w-5" aria-hidden="true" />
      <span class="key" aria-hidden="true">F</span>
      <span class="tip" aria-hidden="true">Full screen, no controls</span>
    </button>
  </nav>
</template>

<style scoped>
.tool {
  @apply relative flex h-10 w-11 items-center justify-center text-dim transition-colors first:rounded-t last:rounded-b;
}
.tool:hover {
  @apply bg-raised text-paper;
}
.tool[aria-pressed="true"] {
  @apply bg-signal text-ink;
}
/* The key that picks the tool, tucked in the corner. */
.key {
  @apply absolute bottom-0.5 right-1 font-mono text-[9px] leading-none opacity-60;
}
/* The tool's name, shown beside it on hover or keyboard focus. */
.tip {
  @apply pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-edge bg-ink px-2 py-1 text-xs text-paper opacity-0 shadow-lg shadow-black/40;
}
.tool:hover .tip,
.tool:focus-visible .tip {
  @apply opacity-100;
}
</style>
