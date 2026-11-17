<script setup lang="ts">
import { computed } from "vue";
import { Undo2 } from "lucide-vue-next";
import { ROAD_ROUTES, ROUTING_HOST, SPEEDS, useRoute } from "@/composables/useRoute";
import { tool } from "@/composables/tool";
import { formatCoord } from "@/lib/coords";
import { formatDuration } from "@/lib/route";
import { formatDistance } from "@/lib/shapes";

// The route tool's panel: how to go, the stops, and the answer.
const { stops, mode, speedKmh, route, loading, problem, clear, back, saveAsLine } = useRoute();

const prompt = computed(() =>
  stops.value.length === 0 ? "Click the map where the route starts." : stops.value.length === 1 ? "Now click the destination." : "Click again to add another stop."
);
const letter = (i: number) => String.fromCharCode(65 + (i % 26));
</script>

<template>
  <section class="panel w-72 max-w-[calc(100vw-4.5rem)] text-sm" aria-label="Route">
    <div class="space-y-3 p-3">
      <div v-if="ROAD_ROUTES" class="grid grid-cols-2 gap-1 rounded-md bg-raised p-1 text-xs" role="radiogroup" aria-label="Kind of route">
        <button type="button" role="radio" class="seg" :aria-checked="mode === 'straight'" @click="mode = 'straight'">Straight line</button>
        <button type="button" role="radio" class="seg" :aria-checked="mode === 'road'" @click="mode = 'road'">By road</button>
      </div>

      <ol v-if="stops.length" class="space-y-1">
        <li v-for="(p, i) in stops" :key="i" class="flex items-center gap-2">
          <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#60A5FA] text-[11px] font-semibold text-ink">{{ letter(i) }}</span>
          <span class="truncate font-mono text-xs text-dim">{{ formatCoord(p[0], p[1], "MGRS") }}</span>
        </li>
      </ol>
      <p class="text-xs text-dim" role="status">{{ prompt }}</p>

      <p v-if="loading" class="text-xs text-dim" role="status">Asking for the route.</p>
      <p v-else-if="problem" class="text-xs leading-relaxed text-hostile" role="alert">{{ problem }}</p>
      <dl v-else-if="route" class="grid select-text grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 border-y border-edge py-2">
        <dt class="text-xs text-dim">Distance</dt>
        <dd class="text-right font-mono">{{ formatDistance(route.distanceM) }}</dd>
        <dt class="text-xs text-dim">Time</dt>
        <dd class="text-right font-mono">{{ formatDuration(route.durationS) }}</dd>
        <template v-if="mode === 'straight'">
          <dt class="text-xs text-dim"><label for="route-speed">Going</label></dt>
          <dd class="text-right">
            <select id="route-speed" v-model.number="speedKmh" class="h-7 rounded-md border border-edge bg-transparent px-1.5 text-xs">
              <option v-for="s in SPEEDS" :key="s.kmh" :value="s.kmh" class="bg-ink">{{ s.label }}, {{ s.kmh }} km/h</option>
            </select>
          </dd>
        </template>
      </dl>

      <p v-if="mode === 'road'" class="text-[11px] leading-relaxed text-dim">
        Road routes come from {{ ROUTING_HOST }}, over the internet. The stops are sent to it. Road data © OpenStreetMap contributors.
      </p>

      <div class="flex items-center gap-1.5 text-xs">
        <button type="button" class="act bg-signal text-ink" :disabled="!route" @click="saveAsLine">Keep as a line</button>
        <button type="button" class="act border border-edge" :disabled="!stops.length" aria-label="Remove the last stop" title="Remove the last stop" @click="back">
          <Undo2 class="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" class="act text-dim hover:text-paper" :disabled="!stops.length" @click="clear">Clear</button>
        <button type="button" class="act ml-auto text-dim hover:text-paper" @click="tool = 'select'">Done</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.seg {
  @apply h-7 rounded text-dim transition-colors;
}
.seg[aria-checked="true"] {
  @apply bg-ink text-paper shadow-sm;
}
.act {
  @apply flex h-7 items-center rounded-md px-2.5 font-medium;
}
.act:disabled {
  @apply cursor-not-allowed opacity-40;
}
</style>
