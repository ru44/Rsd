<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type Component } from "vue";
import { Circle, Flag, Globe, Hand, Map, Maximize, MousePointer2, MoveUpRight, Pentagon, Redo2, Route, Ruler, Square, Type, Undo2, Waypoints } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { useClearView } from "@/composables/useClearView";
import { isDrawTool, pickerOpen, tool, type Tool } from "@/composables/tool";
import { canRedo, canUndo, redo, undo } from "@/composables/history";

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
  { id: "arrow", label: "Arrow", key: "A", icon: MoveUpRight },
  { id: "text", label: "Text label", key: "T", icon: Type },
];

// The rail is a single button showing the tool in hand until the pointer or
// the keyboard reaches it; then it opens to show every tool.
const open = ref(false);
/** The single button is held back until the closing animation has finished. */
const single = ref(true);
const rail = ref<HTMLElement | null>(null);
/** How far the pointer may stray from the rail before it closes, in pixels. */
const REACH = 110;
let near = false;

function show() {
  near = true;
  single.value = false;
  open.value = true;
  window.removeEventListener("pointermove", watchPointer);
}
// Leaving the rail does not close it. It closes once the pointer is well away.
function watchPointer(e: PointerEvent) {
  const r = rail.value?.getBoundingClientRect();
  if (!r) return;
  const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
  const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
  if (Math.hypot(dx, dy) <= REACH) return;
  near = false;
  window.removeEventListener("pointermove", watchPointer);
  if (!rail.value?.contains(document.activeElement) || !rail.value.matches(":focus-within:has(:focus-visible)")) open.value = false;
}
const leave = () => window.addEventListener("pointermove", watchPointer);
// Reached with the keyboard: it closes when focus moves on, unless the pointer is close by.
function focusLeft(e: FocusEvent) {
  if (!near && !rail.value?.contains(e.relatedTarget as Node | null)) open.value = false;
}
onBeforeUnmount(() => window.removeEventListener("pointermove", watchPointer));
const inHand = computed(() => {
  const t = tool.value;
  if (t === "symbol" || pickerOpen.value) return { label: "Military symbol", icon: Flag };
  if (t === "ruler") return { label: "Measure distance", icon: Ruler };
  if (t === "route") return { label: "Route from A to B", icon: Route };
  return [...MOVE, ...DRAW].find((i) => i.id === t) ?? MOVE[1];
});

// Only one tool is active at a time. Pressing a drawing tool again puts it down.
function choose(id: Tool) {
  pickerOpen.value = false;
  tool.value = (isDrawTool(id) || id === "ruler" || id === "route" || id === "text") && tool.value === id ? "select" : id;
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
  <nav ref="rail" class="panel min-h-[42px] p-1" aria-label="Map tools" @mouseenter="show" @mouseleave="leave" @focusin="show" @focusout="focusLeft">
    <button
      v-if="single"
      type="button"
      class="icon-btn tool"
      aria-pressed="true"
      aria-expanded="false"
      :aria-label="`${inHand.label}. Show all tools`"
      @click="show"
    >
      <component :is="inHand.icon" class="h-4 w-4" aria-hidden="true" />
    </button>
    <Transition name="rail" @after-leave="single = true">
    <div v-if="open" class="all">
    <div class="flex min-h-0 flex-col gap-0.5">
    <template v-for="(group, g) in [MOVE, DRAW]" :key="g">
      <hr v-if="g > 0" class="rule" />
      <button
        v-for="t in group"
        :key="t.id"
        type="button"
        class="icon-btn tool"
        :aria-pressed="tool === t.id"
        :aria-label="t.label"
        :aria-keyshortcuts="t.key"
        @click="choose(t.id)"
      >
        <component :is="t.icon" class="h-4 w-4" aria-hidden="true" />
        <span class="tip" aria-hidden="true">{{ t.label }} <kbd class="kbd">{{ t.key }}</kbd></span>
      </button>
    </template>
    <button
      type="button"
      class="icon-btn tool"
      aria-label="Military symbol"
      aria-keyshortcuts="S"
      :aria-pressed="pickerOpen || tool === 'symbol'"
      :aria-expanded="pickerOpen"
      @click="toggleSymbols"
    >
      <Flag class="h-4 w-4" aria-hidden="true" />
      <span class="tip" aria-hidden="true">Military symbol <kbd class="kbd">S</kbd></span>
    </button>
    <button
      type="button"
      class="icon-btn tool"
      aria-label="Measure distance"
      aria-keyshortcuts="M"
      :aria-pressed="tool === 'ruler'"
      @click="choose('ruler')"
    >
      <Ruler class="h-4 w-4" aria-hidden="true" />
      <span class="tip" aria-hidden="true">Measure distance <kbd class="kbd">M</kbd></span>
    </button>
    <button
      type="button"
      class="icon-btn tool"
      aria-label="Route from A to B"
      aria-keyshortcuts="D"
      :aria-pressed="tool === 'route'"
      @click="choose('route')"
    >
      <Route class="h-4 w-4" aria-hidden="true" />
      <span class="tip" aria-hidden="true">Route from A to B <kbd class="kbd">D</kbd></span>
    </button>

    <hr class="rule" />
    <button type="button" class="icon-btn tool" aria-label="Undo" aria-keyshortcuts="Control+Z" :disabled="!canUndo" @click="undo">
      <Undo2 class="h-4 w-4" aria-hidden="true" />
      <span class="tip" aria-hidden="true">Undo <kbd class="kbd">Ctrl Z</kbd></span>
    </button>
    <button type="button" class="icon-btn tool" aria-label="Redo" aria-keyshortcuts="Control+Shift+Z" :disabled="!canRedo" @click="redo">
      <Redo2 class="h-4 w-4" aria-hidden="true" />
      <span class="tip" aria-hidden="true">Redo <kbd class="kbd">Ctrl Shift Z</kbd></span>
    </button>

    <hr class="rule" />
    <button
      type="button"
      class="icon-btn tool"
      :aria-label="is3D ? 'Switch to the flat map' : 'Switch to the globe'"
      aria-keyshortcuts="G"
      @click="toggleMode"
    >
      <component :is="is3D ? Map : Globe" class="h-4 w-4" aria-hidden="true" />
      <span class="tip" aria-hidden="true">{{ is3D ? "Flat map" : "Globe" }} <kbd class="kbd">G</kbd></span>
    </button>
    <button type="button" class="icon-btn tool" aria-label="Full screen with no controls" aria-keyshortcuts="F" @click="enterClearView">
      <Maximize class="h-4 w-4" aria-hidden="true" />
      <span class="tip" aria-hidden="true">Full screen, no controls <kbd class="kbd">F</kbd></span>
    </button>
    </div>
    </div>
    </Transition>
  </nav>
</template>

<style scoped>
/* Opening and closing: the rail grows from, and shrinks back to, one button. */
.all {
  display: grid;
  grid-template-rows: 1fr;
}
.rail-enter-active,
.rail-leave-active {
  transition: grid-template-rows 0.22s ease-out, opacity 0.22s ease-out;
}
.rail-enter-active > div,
.rail-leave-active > div {
  overflow: hidden; /* only while moving, so the hover labels are not cut off afterwards */
}
.rail-enter-from,
.rail-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}
.tool {
  @apply relative;
}
.tool:disabled {
  @apply cursor-not-allowed opacity-30 hover:bg-transparent hover:text-dim;
}
.rule {
  @apply mx-1 my-0.5 border-edge;
}
/* The tool's name and key, shown beside it on hover or keyboard focus. */
.tip {
  @apply pointer-events-none absolute left-full top-1/2 z-30 ml-2.5 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-md border border-edge bg-ink px-2 py-1 text-xs text-paper opacity-0 shadow-md shadow-black/30;
}
.tool:hover .tip,
.tool:focus-visible .tip {
  @apply opacity-100;
}
</style>
