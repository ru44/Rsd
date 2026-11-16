<script setup lang="ts">
import { computed, ref } from "vue";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import ZoomControl from "./ZoomControl.vue";
import { COORD_FORMATS, formatCoord, type CoordFormat } from "@/lib/coords";

// Along the bottom edge: where the pointer is, how far out the view is, and
// whether the work is stored.
const { cursor, is3D, cameraHeightKm, cameraHeightM, baseMap } = useMap();
const areas = useAreas();
const symbols = useSymbols();

const format = ref<CoordFormat>("MGRS");
const position = computed(() =>
  cursor.value ? formatCoord(cursor.value.lon, cursor.value.lat, format.value) : null
);

const credit = computed(() =>
  baseMap.value === "streets"
    ? "© OpenStreetMap contributors"
    : baseMap.value === "satellite"
      ? "satellite tiles from the backend"
      : "Natural Earth"
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
  <footer class="flex min-w-0 items-end gap-2 text-xs">
    <div class="panel flex h-10 min-w-0 items-center gap-2 pl-1 pr-3">
      <select v-model="format" aria-label="Coordinate format" class="h-8 rounded-md bg-transparent px-1.5 text-dim hover:bg-raised hover:text-paper">
        <option v-for="f in COORD_FORMATS" :key="f" :value="f" class="bg-ink text-paper">{{ f }}</option>
      </select>
      <output v-if="position" aria-label="Position under the pointer" class="select-text truncate whitespace-nowrap font-mono text-sm text-paper">
        {{ position }}
      </output>
      <span v-else class="truncate text-dim">Point at the map</span>
    </div>

    <div v-if="offline" class="panel flex h-10 items-center gap-2 whitespace-nowrap pl-3 pr-1 text-hostile" role="alert">
      <span class="hidden lg:inline">{{ syncText }}</span>
      <span class="lg:hidden">Offline</span>
      <button type="button" class="h-8 rounded-md border border-edge px-2.5 font-medium text-paper hover:bg-raised" @click="retry">Retry</button>
    </div>

    <ZoomControl class="ml-auto shrink-0" />
    <div class="panel hidden h-10 items-center gap-3 whitespace-nowrap px-3 text-dim md:flex">
      <span>
        {{ is3D ? "Eye altitude" : "View width" }}
        <span class="font-mono tabular-nums text-paper">{{ cameraHeightKm >= 1 ? `${cameraHeightKm.toLocaleString()} km` : `${Math.round(cameraHeightM)} m` }}</span>
      </span>
      <span class="hidden border-l border-edge pl-3 xl:inline">CesiumJS · {{ credit }}</span>
    </div>
  </footer>
</template>
