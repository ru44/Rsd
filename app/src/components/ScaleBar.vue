<script setup lang="ts">
import { computed } from "vue";
import { useMap } from "@/composables/useMap";
import { scaleBar } from "@/lib/scale";

// How far a short line on the screen is on the ground, at the middle of the view.
const { metresPerPx } = useMap();
const bar = computed(() => scaleBar(metresPerPx.value));
</script>

<template>
  <span v-if="bar" class="flex items-center gap-1.5" :aria-label="`Scale: this line is ${bar.label}`" role="img">
    <span class="h-1.5 border-x border-b border-paper" :style="{ width: `${bar.px}px` }" />
    <span class="font-mono text-paper">{{ bar.label }}</span>
  </span>
</template>
