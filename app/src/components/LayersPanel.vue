<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, Layers, Trash2 } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import { useMgrsGrid } from "@/composables/useMgrsGrid";

const { hasSatellite } = useMap();
const { visible: gridVisible } = useMgrsGrid();
const {
  areas,
  unsaved: unsavedAreas,
  visible: areasVisible,
  removeAll: removeAreas,
  zoomTo,
} = useAreas();
const {
  symbols,
  unsaved: unsavedSymbols,
  visible: symbolsVisible,
  removeAll: removeSymbols,
} = useSymbols();

// Starts closed on small screens so the map is not covered.
const open = ref(window.innerWidth >= 640);
/** Which layer is asking "delete all?", if any. */
const confirming = ref<"areas" | "symbols" | null>(null);

const areaCount = computed(() => areas.value.length + unsavedAreas.value.length);
const symbolCount = computed(() => symbols.value.length + unsavedSymbols.value.length);

async function removeConfirmed() {
  if (confirming.value === "areas") await removeAreas();
  if (confirming.value === "symbols") await removeSymbols();
  confirming.value = null;
}
</script>

<template>
  <section class="panel w-60 max-w-[calc(100vw-6rem)] text-sm" aria-label="Layers">
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2 font-bold"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Layers class="h-4 w-4 text-dim" aria-hidden="true" />
      Layers
      <ChevronDown
        class="ml-auto h-4 w-4 text-dim transition-transform"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      />
    </button>

    <div v-if="open" class="border-t border-edge py-1">
      <label class="row">
        <input v-model="gridVisible" type="checkbox" class="box" />
        MGRS grid
      </label>

      <div class="row">
        <label class="flex flex-1 cursor-pointer items-center gap-2.5">
          <input v-model="areasVisible" type="checkbox" class="box" />
          Areas
          <span class="text-dim">{{ areaCount }}</span>
        </label>
        <button
          v-if="areaCount"
          type="button"
          class="icon"
          aria-label="Delete all areas"
          title="Delete all areas"
          @click="confirming = 'areas'"
        >
          <Trash2 class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul v-if="areas.length" class="max-h-40 overflow-y-auto pb-1">
        <li v-for="a in areas" :key="a.id">
          <button
            type="button"
            class="w-full truncate py-1 pl-10 pr-3 text-left text-dim hover:bg-raised hover:text-paper"
            :title="`Go to ${a.name}`"
            @click="zoomTo(a)"
          >
            {{ a.name }}
          </button>
        </li>
      </ul>

      <div class="row">
        <label class="flex flex-1 cursor-pointer items-center gap-2.5">
          <input v-model="symbolsVisible" type="checkbox" class="box" />
          Symbols
          <span class="text-dim">{{ symbolCount }}</span>
        </label>
        <button
          v-if="symbolCount"
          type="button"
          class="icon"
          aria-label="Delete all symbols"
          title="Delete all symbols"
          @click="confirming = 'symbols'"
        >
          <Trash2 class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div v-if="confirming" class="mx-2 my-1 rounded-sm bg-raised p-2" role="alertdialog">
        <p>Delete all {{ confirming }}? This cannot be undone.</p>
        <div class="mt-2 flex gap-2">
          <button type="button" class="rounded-sm bg-hostile px-2.5 py-1 text-xs font-bold text-ink" @click="removeConfirmed">
            Delete all
          </button>
          <button type="button" class="rounded-sm px-2.5 py-1 text-xs font-bold text-dim hover:text-paper" @click="confirming = null">
            Keep
          </button>
        </div>
      </div>

      <p class="mt-1 border-t border-edge px-3 pb-1 pt-2 text-xs text-dim">
        <template v-if="hasSatellite">Base map: satellite tiles from the backend.</template>
        <template v-else>
          Base map: built-in world map. Add <code class="font-mono">satellite.mbtiles</code> to the
          backend's storage folder for imagery.
        </template>
      </p>
    </div>
  </section>
</template>

<style scoped>
.row {
  @apply flex cursor-pointer items-center gap-2.5 px-3 py-1.5;
}
.box {
  @apply h-4 w-4 cursor-pointer accent-signal;
}
.icon {
  @apply rounded-sm p-1 text-dim;
}
.icon:hover {
  @apply bg-raised text-hostile;
}
</style>
