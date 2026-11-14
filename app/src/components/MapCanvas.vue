<script setup lang="ts">
import { onMounted } from "vue";
import { useMap } from "@/composables/useMap";

defineProps<{ crosshair?: boolean }>();

const { init } = useMap();
onMounted(() => init("map"));
</script>

<template>
  <div id="map" :class="{ 'cursor-crosshair': crosshair }" />
</template>

<style scoped>
#map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
