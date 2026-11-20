<script setup lang="ts">
import { computed } from "vue";

// How solid a layer looks, from 0 % (gone) to 100 % (as drawn).
const props = defineProps<{ modelValue: number; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
const percent = computed({
  get: () => Math.round(props.modelValue * 100),
  set: (p: number) => emit("update:modelValue", p / 100),
});
</script>

<template>
  <div class="flex items-center gap-2" :title="`${label}: how solid it looks`">
    <input
      v-model.number="percent"
      type="range"
      min="0"
      max="100"
      step="5"
      class="slider min-w-0 flex-1"
      :aria-label="label"
      :aria-valuetext="`${percent} percent`"
    />
    <span class="w-9 text-right font-mono text-[11px] tabular-nums text-dim">{{ percent }}%</span>
  </div>
</template>

<style scoped>
/* A thin track that fills in white up to the handle. */
.slider {
  @apply h-4 cursor-pointer appearance-none bg-transparent;
  --fill: calc(v-bind(percent) * 1%);
}
.slider::-webkit-slider-runnable-track {
  @apply h-1 rounded-full;
  background: linear-gradient(to right, #fafafa var(--fill), #3f3f46 var(--fill));
}
.slider::-moz-range-track {
  @apply h-1 rounded-full bg-zinc-700;
}
.slider::-moz-range-progress {
  @apply h-1 rounded-full bg-paper;
}
.slider::-webkit-slider-thumb {
  @apply -mt-1 h-3 w-3 appearance-none rounded-full border-2 border-ink bg-paper;
}
.slider::-moz-range-thumb {
  @apply h-3 w-3 rounded-full border-2 border-ink bg-paper;
}
.slider:focus-visible {
  @apply outline-none;
}
.slider:focus-visible::-webkit-slider-thumb {
  @apply ring-2 ring-paper/50;
}
.slider:focus-visible::-moz-range-thumb {
  @apply ring-2 ring-paper/50;
}
</style>
