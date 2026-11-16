<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import MapCanvas from "@/components/MapCanvas.vue";
import ToolRail from "@/components/ToolRail.vue";
import ToolHint from "@/components/ToolHint.vue";
import FindBox from "@/components/FindBox.vue";
import SymbolPicker from "@/components/SymbolPicker.vue";
import LayersPanel from "@/components/LayersPanel.vue";
import SelectionPanel from "@/components/SelectionPanel.vue";
import BaseMapSwitch from "@/components/BaseMapSwitch.vue";
import MarginBar from "@/components/MarginBar.vue";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import { useMgrsGrid } from "@/composables/useMgrsGrid";
import { useClearView } from "@/composables/useClearView";
import { useSelection } from "@/composables/useSelection";
import { useViewLink } from "@/composables/useViewLink";
import { useRuler } from "@/composables/useRuler";
import { pickerOpen, tool, type Tool } from "@/composables/tool";

const { toggleMode } = useMap();
const areas = useAreas();
const symbols = useSymbols();
const { attach: attachGrid } = useMgrsGrid();
const { clear, hint, exit: exitClearView, toggle: toggleClearView } = useClearView();
const { selection, deselect } = useSelection();
const { attach: attachViewLink } = useViewLink();
const ruler = useRuler();
const find = ref<InstanceType<typeof FindBox> | null>(null);

const TOOL_KEYS: Record<string, Tool> = { h: "hand", v: "select", r: "rect", c: "circle", p: "polygon", l: "line", m: "ruler" };

function pickSymbol(sidc: string, name: string) {
  pickerOpen.value = false;
  symbols.arm(sidc, name);
}

function onKey(e: KeyboardEvent) {
  const typing = e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (e.key === "Escape") {
    // Esc backs out of one thing at a time: the full-screen view, the tool
    // in hand, the text box, then the selection.
    if (clear.value) exitClearView();
    else if (pickerOpen.value) pickerOpen.value = false;
    else if (tool.value !== "select" && tool.value !== "hand") tool.value = "select";
    else if (typing) (e.target as HTMLElement).blur();
    else deselect();
    return;
  }
  // Letter keys belong to whatever is being typed in.
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "f") {
    toggleClearView();
  } else if (clear.value) {
    return; // nothing else works while the controls are hidden
  } else if (TOOL_KEYS[key]) {
    pickerOpen.value = false;
    tool.value = TOOL_KEYS[key];
  } else if (key === "s") {
    tool.value = "select";
    pickerOpen.value = true;
    e.preventDefault(); // keep the letter out of the picker's search box
  } else if (key === "g") {
    toggleMode();
  } else if (key === "/") {
    e.preventDefault();
    find.value?.focus();
  } else if (e.key === "Enter") {
    areas.finishDraw();
    ruler.finish();
  } else if ((e.key === "Delete" || e.key === "Backspace") && selection.value) {
    if (selection.value.kind === "area") areas.remove(selection.value.id);
    else symbols.remove(selection.value.id);
  }
}

// The map is created by MapCanvas, a child, so it exists by the time this
// parent mounts: safe to attach layers and show what is already saved.
onMounted(() => {
  attachViewLink();
  attachGrid();
  areas.load();
  symbols.load();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <!-- select-none: dragging on the map must not highlight the panels' text. -->
  <div class="relative h-full w-full select-none">
    <MapCanvas />

    <!-- Everything below hides in the clear view, leaving only the map. -->
    <template v-if="!clear">
      <!-- Tools down the left edge; beside them the search box, then whatever the active tool needs. -->
      <div class="pointer-events-none absolute left-3 top-3 z-20 flex items-start gap-2">
        <!-- Above its neighbours, so the tools' hover labels are not covered. -->
        <ToolRail class="pointer-events-auto relative z-10" />
        <div class="flex flex-col items-start gap-2">
          <FindBox ref="find" class="pointer-events-auto" />
          <ToolHint class="pointer-events-auto" />
          <SymbolPicker v-if="pickerOpen" class="pointer-events-auto" @pick="pickSymbol" />
        </div>
      </div>

      <div class="absolute right-3 top-3 z-20 flex max-h-[calc(100%-5rem)] flex-col items-end gap-2 overflow-y-auto">
        <LayersPanel />
        <SelectionPanel />
      </div>

      <div class="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end gap-2">
        <BaseMapSwitch class="pointer-events-auto" />
        <MarginBar class="pointer-events-auto flex-1" />
      </div>
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
