<script setup lang="ts">
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { onMounted, nextTick } from "vue";
import { registerDrawListener } from "@/composables/useAreas";

// إذا toolState قادم من الأعلى مرره كـ prop!
const props = defineProps<{ toolState?: any }>();

const { init, map, draw } = useMap();
const { drawn } = useAreas();

onMounted(async () => {
  await init();
  await nextTick();
  map.value?.resize();

  // اربط الأحداث على الخريطة مع متغير drawn الصحيح!

  registerDrawListener(
    () => map.value, // الخريطة
    () => draw.value // كائن MapboxDraw (للاستخدام فى deleteAll فقط)
  );
});

window.addEventListener("resize", () => map.value?.resize());
</script>

<template>
  <div
    id="map"
    class="h-full w-full"
    :class="{ 'cursor-crosshair': props.toolState?.mode === 'draw' }"
  />
</template>

<style scoped>
#map {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}
</style>
