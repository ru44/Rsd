<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Box } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import ZoomControl from "./ZoomControl.vue";
import MenuSelect from "./MenuSelect.vue";
import CompassButton from "./CompassButton.vue";
import ScaleBar from "./ScaleBar.vue";
import { heightAt, loadElevation } from "@/lib/elevation";
import { COORD_FORMATS, formatCoord, type CoordFormat } from "@/lib/coords";

// Along the bottom edge: where the pointer is, how far out the view is, and
// whether the work is stored.
const { cursor, is3D, cameraHeightKm, cameraHeightM, baseMap, pitch, toggleTilt } = useMap();
const leaning = computed(() => pitch.value > -80);
const areas = useAreas();
const symbols = useSymbols();

const format = ref<CoordFormat>("MGRS");
const position = computed(() =>
  cursor.value ? formatCoord(cursor.value.lon, cursor.value.lat, format.value) : null
);

// Height of the ground under the pointer, or depth of the sea. The data is
// fetched the first time the pointer is over the map.
const elevationReady = ref(false);
watch(cursor, (c) => c && !elevationReady.value && loadElevation().then(() => (elevationReady.value = true), () => {}), { once: true });
const ground = computed(() => {
  if (!cursor.value || !elevationReady.value) return null;
  const m = heightAt(cursor.value.lon, cursor.value.lat);
  if (m === null) return null;
  return { label: m < 0 ? "Depth" : "Height", text: `${Math.abs(m).toLocaleString("en")} m` };
});

const credit = computed(() =>
  baseMap.value === "streets"
    ? "© OpenStreetMap contributors"
    : baseMap.value === "satellite"
      ? "Satellite tiles from the backend"
      : "Natural Earth · CesiumJS"
);

const offline = computed(() => areas.offline.value || symbols.offline.value);
const pending = computed(() => areas.unsaved.value.length + symbols.unsaved.value.length);
const syncText = computed(() =>
  pending.value
    ? `${pending.value} not saved: backend unreachable.`
    : "Backend unreachable: saved items are not shown."
);

async function retry() {
  await Promise.all([areas.load(), symbols.load()]);
  await Promise.all([areas.flush(), symbols.flush()]);
}
</script>

<template>
  <!-- The strip itself lets clicks through to the map; only its pieces take them. -->
  <footer class="strip flex min-w-0 items-end gap-2 text-xs">
    <div class="panel flex h-10 min-w-0 items-center gap-2 pl-1 pr-3">
      <MenuSelect v-model="format" :options="COORD_FORMATS.map((f) => ({ value: f, label: f }))" label="Coordinate format" up />
      <output v-if="position" aria-label="Position under the pointer" class="select-text truncate whitespace-nowrap font-mono text-sm text-paper">
        {{ position }}
      </output>
      <span v-else class="truncate text-dim">Point at the map</span>
      <span
        v-if="ground"
        class="hidden whitespace-nowrap border-l border-edge pl-2 text-dim sm:inline"
        title="Approximate: the average over about 14 km around this point"
      >
        {{ ground.label }} <span class="font-mono text-sm text-paper">≈ {{ ground.text }}</span>
      </span>
    </div>

    <div v-if="offline" class="panel flex h-10 items-center gap-2 whitespace-nowrap pl-3 pr-1 text-hostile" role="alert">
      <span class="hidden lg:inline">{{ syncText }}</span>
      <span class="lg:hidden">Offline</span>
      <button type="button" class="h-8 rounded-md border border-edge px-2.5 font-medium text-paper hover:bg-raised" @click="retry">Retry</button>
    </div>

    <!-- One quiet line: scale, how far out the view is, and who made the map. -->
    <div class="ml-auto flex h-6 min-w-0 items-center gap-3 whitespace-nowrap rounded-md bg-ink/80 px-2 text-[11px] text-dim">
      <ScaleBar class="hidden md:flex" />
      <span class="hidden lg:inline">
        {{ is3D ? "Eye altitude" : "View width" }}
        <span class="font-mono tabular-nums text-paper">{{ cameraHeightKm >= 1 ? `${cameraHeightKm.toLocaleString()} km` : `${Math.round(cameraHeightM)} m` }}</span>
      </span>
      <span class="truncate">{{ credit }}</span>
    </div>

    <!-- Getting around: turn, lean, zoom. -->
    <div class="flex shrink-0 flex-col items-center gap-2">
      <CompassButton />
      <div class="panel p-1">
        <button
          type="button"
          class="icon-btn"
          :aria-pressed="leaning"
          :disabled="!is3D"
          :aria-label="leaning ? 'Look straight down' : 'Lean the view to see height'"
          :title="!is3D ? 'The flat map cannot lean' : leaning ? 'Look straight down ( 3 )' : 'Lean the view to see height ( 3 )'"
          @click="toggleTilt"
        >
          <Box class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ZoomControl />
    </div>
  </footer>
</template>

<style scoped>
.strip {
  pointer-events: none;
}
.strip > * {
  pointer-events: auto;
}
.icon-btn:disabled {
  @apply cursor-not-allowed opacity-40;
}
</style>
