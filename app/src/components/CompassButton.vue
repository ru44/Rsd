<script setup lang="ts">
import { computed } from "vue";
import { useMap } from "@/composables/useMap";
import { formatBearing } from "@/lib/shapes";

// A compass: the red end of the needle points north on the screen.
// Drag it round to turn the map; click it to put north back at the top.
const { heading, is3D, resetNorth, rotateBy } = useMap();
const facing = computed(() => formatBearing(heading.value));

let last: number | null = null;
let turned = false;
const angle = (e: PointerEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
};
function down(e: PointerEvent) {
  if (!is3D.value) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  last = angle(e);
  turned = false;
}
function move(e: PointerEvent) {
  if (last === null) return;
  const now = angle(e);
  const by = ((now - last + 540) % 360) - 180;
  if (Math.abs(by) < 0.5) return;
  // The dial follows the finger, so the map turns the other way under it.
  rotateBy(-by);
  last = now;
  turned = true;
}
function up() {
  if (last !== null && !turned) resetNorth();
  last = null;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowLeft") rotateBy(-15);
  else if (e.key === "ArrowRight") rotateBy(15);
  else if (e.key === "Enter" || e.key === " ") resetNorth();
  else return;
  e.preventDefault();
}
</script>

<template>
  <button
    type="button"
    class="dial panel"
    :class="{ 'cursor-not-allowed opacity-60': !is3D }"
    :aria-label="`Compass. Facing ${facing}. Drag to turn the map, press to put north at the top`"
    :title="is3D ? `Facing ${facing}. Drag to turn the map, click for north-up ( N )` : 'The flat map always has north at the top'"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="last = null"
    @keydown="onKey"
  >
    <svg viewBox="-24 -24 48 48" class="h-full w-full" :style="{ transform: `rotate(${-heading}deg)` }" aria-hidden="true">
      <!-- a mark every 30 degrees, longer at the four main points -->
      <line v-for="i in 12" :key="i" x1="0" :y1="i % 3 === 0 ? -21 : -20" x2="0" :y2="i % 3 === 0 ? -17 : -18" :transform="`rotate(${i * 30})`" class="tick" />
      <path d="M0 -15 L4.5 0 L-4.5 0 Z" fill="#EF4444" />
      <path d="M0 15 L4.5 0 L-4.5 0 Z" fill="#A1A1AA" />
      <circle r="1.6" fill="#09090B" />
      <text y="-8.5" class="north">N</text>
    </svg>
  </button>
</template>

<style scoped>
.dial {
  @apply h-12 w-12 shrink-0 touch-none rounded-full p-0.5 transition-colors;
}
.dial:hover {
  @apply border-dim;
}
.tick {
  stroke: #a1a1aa;
  stroke-width: 1;
}
.north {
  fill: #fafafa;
  font-size: 5.5px;
  font-weight: 700;
  text-anchor: middle;
}
</style>
