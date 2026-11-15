<script setup lang="ts">
import { computed, ref } from "vue";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import { COORD_FORMATS, formatCoord, type CoordFormat } from "@/lib/coords";

// The strip along the bottom edge, like the margin of a printed map sheet:
// where you are, how far out you are, and whether your work is stored.
const { cursor, is3D, cameraHeightKm } = useMap();
const areas = useAreas();
const symbols = useSymbols();

const format = ref<CoordFormat>("MGRS");
const position = computed(() =>
  cursor.value ? formatCoord(cursor.value.lon, cursor.value.lat, format.value) : null
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
  <footer
    class="flex h-11 items-center gap-3 border-t border-edge bg-ink/95 px-3 text-sm backdrop-blur-sm sm:gap-4"
  >
    <span class="hidden font-bold sm:inline">rsGIS</span>

    <select
      v-model="format"
      aria-label="Coordinate format"
      class="rounded-sm border border-edge bg-raised px-1.5 py-1 text-xs text-paper"
    >
      <option v-for="f in COORD_FORMATS" :key="f" :value="f">{{ f }}</option>
    </select>

    <output
      v-if="position"
      aria-label="Position under the pointer"
      class="whitespace-nowrap font-mono text-base font-bold text-signal"
    >
      {{ position }}
    </output>
    <span v-else class="truncate text-dim">Point at the map for a position</span>

    <span class="ml-auto hidden whitespace-nowrap text-dim md:inline">
      {{ is3D ? "Eye altitude" : "View width" }}
      <span class="tabular-nums text-paper">{{ cameraHeightKm.toLocaleString() }} km</span>
    </span>

    <span v-if="offline" class="flex items-center gap-2 whitespace-nowrap text-hostile" role="alert">
      <span class="hidden lg:inline">{{ syncText }}</span>
      <span class="lg:hidden">Offline</span>
      <button
        type="button"
        class="rounded-sm border border-hostile px-2 py-0.5 text-xs font-bold hover:bg-hostile hover:text-ink"
        @click="retry"
      >
        Retry
      </button>
    </span>

    <span class="hidden whitespace-nowrap text-xs text-dim xl:inline">
      Map engine: CesiumJS. Base map: Natural Earth.
    </span>
  </footer>
</template>
