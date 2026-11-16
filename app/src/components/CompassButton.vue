<script setup lang="ts">
import { computed } from "vue";
import { Navigation2 } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { formatBearing } from "@/lib/shapes";

// The arrow points to north on the screen. Pressing it turns the map north-up.
const { heading, resetNorth } = useMap();
const turned = computed(() => Math.round(heading.value) % 360 !== 0);
</script>

<template>
  <div class="panel flex h-10 items-center px-1">
    <button
      type="button"
      class="icon-btn"
      :class="{ 'text-paper': turned }"
      :aria-label="`Facing ${formatBearing(heading)}. Turn the map north-up`"
      :title="turned ? `Facing ${formatBearing(heading)}. Click for north-up ( N )` : 'North is up'"
      @click="resetNorth"
    >
      <Navigation2 class="h-4 w-4 transition-transform" :style="{ transform: `rotate(${-heading}deg)` }" aria-hidden="true" />
    </button>
  </div>
</template>
