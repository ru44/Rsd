<script setup lang="ts">
import { computed } from "vue";
import { useMap } from "@/composables/useMap";
import { scaleBar } from "@/lib/scale";

// How far a short line on the screen is on the ground, at the middle of the view.
const { metresPerPx } = useMap();
const bar = computed(() => scaleBar(metresPerPx.value));
</script>

<template>
  <div v-if="bar" class="panel flex h-10 items-center px-3" :aria-label="`Scale: this line is ${bar.label}`" role="img">
    <div class="flex flex-col items-center gap-0.5">
      <span class="font-mono text-[11px] leading-none text-paper">{{ bar.label }}</span>
      <span class="h-1.5 border-x border-b border-paper" :style="{ width: `${bar.px}px` }" />
    </div>
  </div>
</template>
