<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useMap } from "@/composables/useMap";
import { EDIT_PREFIX, selection } from "@/composables/selection";
import { tool } from "@/composables/tool";

const { init, hover, pressed, dragging } = useMap();
onMounted(() => init("map"));

// The pointer shows what a click would do: move the map, pick something up,
// or put something down.
const cursor = computed(() => {
  if (tool.value === "hand") return pressed.value ? "grabbing" : "grab";
  if (tool.value !== "select") return "crosshair";
  if (dragging.value) return "move";
  const under = hover.value;
  const sel = selection.value;
  const selectedId = sel && `${sel.kind === "area" ? "area" : "sym"}-${sel.id}`;
  if (under && (under.startsWith(EDIT_PREFIX) || under === selectedId)) return "move";
  if (under && /^(area|sym)-\d+$/.test(under)) return "pointer";
  return pressed.value ? "grabbing" : "default";
});
</script>

<template>
  <div id="map" :style="{ cursor }" />
</template>

<style scoped>
#map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
