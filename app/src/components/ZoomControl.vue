<script setup lang="ts">
import { ref, watch } from "vue";
import { Minus, Plus } from "lucide-vue-next";
import { MIN_HEIGHT_M, useMap } from "@/composables/useMap";
import { parseZoom, zoomOfHeight } from "@/lib/zoom";

// Closer, further, or straight to a level typed into the box.
const { cameraHeightM, maxHeightM, zoomBy, zoomTo } = useMap();

const text = ref("");
const typing = ref(false);
const rejected = ref(false);
const level = () => (cameraHeightM.value ? Math.max(0, zoomOfHeight(cameraHeightM.value)).toFixed(1) : "");
// The box follows the map, except while someone is typing in it.
watch(cameraHeightM, () => !typing.value && (text.value = level()), { immediate: true });

function apply(e: Event) {
  const h = parseZoom(text.value);
  rejected.value = h === null;
  if (h === null) return;
  zoomTo(h);
  (e.target as HTMLInputElement).blur();
}
function leave() {
  typing.value = false;
  rejected.value = false;
  text.value = level();
}
</script>

<template>
  <div class="panel flex h-10 items-center gap-0.5 px-1" role="group" aria-label="Zoom">
    <button type="button" class="icon-btn" aria-label="Zoom out" title="Zoom out ( - )" :disabled="cameraHeightM >= maxHeightM * 0.99" @click="zoomBy(2)">
      <Minus class="h-4 w-4" aria-hidden="true" />
    </button>
    <input
      v-model="text"
      type="text"
      inputmode="decimal"
      spellcheck="false"
      aria-label="Zoom level, 1 to 20, or a height such as 500 km"
      title="Type a zoom level from 1 to 20, or a height such as 500 km"
      :aria-invalid="rejected"
      class="h-8 w-14 select-text rounded-md bg-transparent text-center font-mono text-sm text-paper hover:bg-raised focus:bg-raised aria-[invalid=true]:text-hostile"
      @focus="(typing = true), ($event.target as HTMLInputElement).select()"
      @input="rejected = false"
      @blur="leave"
      @keydown.enter="apply"
      @keydown.esc.stop="($event.target as HTMLInputElement).blur()"
    />
    <button type="button" class="icon-btn" aria-label="Zoom in" title="Zoom in ( + )" :disabled="cameraHeightM <= MIN_HEIGHT_M * 1.01" @click="zoomBy(0.5)">
      <Plus class="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.icon-btn:disabled {
  @apply cursor-not-allowed opacity-40;
}
</style>
