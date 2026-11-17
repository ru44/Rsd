<script setup lang="ts">
import { computed, ref, watch } from "vue";
import * as Cesium from "cesium";
import { Grid3x3, Layers, Trash2, Upload, X } from "lucide-vue-next";
import { readMapFile } from "@/lib/importers";
import { toGeoJson, toKml } from "@/lib/exporters";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import { useMgrsGrid } from "@/composables/useMgrsGrid";
import { selection } from "@/composables/selection";

const { viewer, pressed } = useMap();
const { visible: gridVisible, namesVisible: gridNames } = useMgrsGrid();
const {
  areas,
  unsaved: unsavedAreas,
  visible: areasVisible,
  removeAll: removeAreas,
  addMany: addAreas,
  goTo,
} = useAreas();
const {
  symbols,
  unsaved: unsavedSymbols,
  visible: symbolsVisible,
  removeAll: removeSymbols,
  addMany: addSymbols,
} = useSymbols();

// An icon until it is wanted, and again as soon as the map is in use.
const open = ref(false);
watch(pressed, (down) => {
  if (down && !confirming.value) {
    open.value = false;
    importNote.value = "";
  }
});
/** Which layer is asking "delete all?", if any. */
const confirming = ref<"areas" | "symbols" | null>(null);

const areaCount = computed(() => areas.value.length + unsavedAreas.value.length);
const symbolCount = computed(() => symbols.value.length + unsavedSymbols.value.length);

const today = () => new Date().toISOString().slice(0, 10);
function save(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}
function saveText(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  save(name, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportGeoJson() {
  const data = toGeoJson(areas.value, symbols.value);
  saveText(`rsgis-${today()}.geojson`, "application/geo+json", JSON.stringify(data, null, 2));
}
function exportKml() {
  saveText(`rsgis-${today()}.kml`, "application/vnd.google-earth.kml+xml", toKml(areas.value, symbols.value));
}
/** A picture of the map as it looks now, without the controls. */
function exportImage() {
  const v = viewer.value;
  if (!v) return;
  // The picture must be taken straight after drawing a frame, or it is blank.
  v.render();
  save(`rsgis-${today()}.png`, v.canvas.toDataURL("image/png"));
}

const picker = ref<HTMLInputElement | null>(null);
/** What the last file brought in, or why it could not be read. */
const importNote = ref("");
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function importFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // so the same file can be chosen again
  if (!file) return;
  let found;
  try {
    found = readMapFile(file.name, await file.text());
  } catch {
    importNote.value = `${file.name} could not be read. Use a GeoJSON or KML file.`;
    return;
  }
  const { shapes, symbols: syms, skipped } = found;
  if (!shapes.length && !syms.length) {
    importNote.value = `Nothing in ${file.name} can be shown on the map.`;
    return;
  }
  await Promise.all([addAreas(shapes), addSymbols(syms.map((s) => ({ ...s, coords: [s.coords[0], s.coords[1]] })))]);
  importNote.value =
    `Added ${[shapes.length && count(shapes.length, "shape"), syms.length && count(syms.length, "symbol")].filter(Boolean).join(" and ")}` +
    (skipped ? `; ${count(skipped, "item")} left out.` : ".");
  // Bring everything that was added into view.
  const all = [...shapes.flatMap((s) => s.pts), ...syms.map((s) => s.coords)];
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const pad = Math.max(0.05, (Math.max(...lons) - Math.min(...lons)) * 0.2, (Math.max(...lats) - Math.min(...lats)) * 0.2);
  viewer.value?.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(
      Math.max(-180, Math.min(...lons) - pad),
      Math.max(-90, Math.min(...lats) - pad),
      Math.min(180, Math.max(...lons) + pad),
      Math.min(90, Math.max(...lats) + pad)
    ),
    duration: 1.2,
  });
}

async function removeConfirmed() {
  if (confirming.value === "areas") await removeAreas();
  if (confirming.value === "symbols") await removeSymbols();
  confirming.value = null;
}
</script>

<template>
  <section class="panel text-sm" :class="open ? 'w-60 max-w-[calc(100vw-6rem)]' : 'p-1'" aria-label="Layers">
    <div v-if="!open" class="flex gap-0.5">
      <button
        type="button"
        class="icon-btn"
        :aria-pressed="gridVisible"
        :aria-label="gridVisible ? 'Hide the MGRS grid' : 'Show the MGRS grid'"
        :title="gridVisible ? 'Hide the MGRS grid ( X )' : 'Show the MGRS grid ( X )'"
        @click="gridVisible = !gridVisible"
      >
        <Grid3x3 class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class="icon-btn" aria-label="Layers" title="Layers and export" aria-expanded="false" @click="open = true">
        <Layers class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <header v-else class="flex items-center gap-2 py-1 pl-3 pr-1 font-medium">
      <Layers class="h-4 w-4 text-dim" aria-hidden="true" />
      Layers
      <button type="button" class="icon-btn ml-auto" aria-label="Close layers" aria-expanded="true" @click="open = false">
        <X class="h-4 w-4" aria-hidden="true" />
      </button>
    </header>

    <div v-if="open" class="border-t border-edge py-1">
      <label class="row">
        <input v-model="gridVisible" type="checkbox" class="box" />
        MGRS grid
        <kbd class="kbd ml-auto">X</kbd>
      </label>
      <label class="row pl-9" :class="{ 'opacity-50': !gridVisible }">
        <input v-model="gridNames" type="checkbox" class="box" :disabled="!gridVisible" />
        Grid names
      </label>

      <div class="row">
        <label class="flex flex-1 cursor-pointer items-center gap-2.5">
          <input v-model="areasVisible" type="checkbox" class="box" />
          Shapes
          <span class="text-dim">{{ areaCount }}</span>
        </label>
        <button
          v-if="areaCount"
          type="button"
          class="icon"
          aria-label="Delete all shapes"
          title="Delete all shapes"
          @click="confirming = 'areas'"
        >
          <Trash2 class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul v-if="areas.length" class="max-h-40 overflow-y-auto pb-1">
        <li v-for="a in areas" :key="a.id">
          <button
            type="button"
            class="mx-1 block w-[calc(100%-0.5rem)] truncate rounded-md py-1 pl-9 pr-2 text-left text-dim hover:bg-raised hover:text-paper"
            :class="{ 'bg-raised text-signal': selection?.kind === 'area' && selection.id === a.id }"
            :title="`Select ${a.name} and go to it`"
            @click="goTo(a)"
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

      <div v-if="confirming" class="mx-2 my-1 rounded-md bg-raised p-2" role="alertdialog">
        <p>Delete all {{ confirming === "areas" ? "shapes" : "symbols" }}? This cannot be undone.</p>
        <div class="mt-2 flex gap-2">
          <button type="button" class="rounded-md bg-hostile px-2.5 py-1 text-xs font-medium text-ink" @click="removeConfirmed">
            Delete all
          </button>
          <button type="button" class="rounded-md px-2.5 py-1 text-xs font-medium text-dim hover:text-paper" @click="confirming = null">
            Keep
          </button>
        </div>
      </div>

      <div class="mt-1 flex items-center gap-1.5 border-t border-edge px-3 pb-1.5 pt-2.5 text-xs">
        <span class="mr-auto text-dim">Export</span>
        <button type="button" class="export" :disabled="!areaCount && !symbolCount" title="Shapes and symbols as GeoJSON" @click="exportGeoJson">
          GeoJSON
        </button>
        <button type="button" class="export" :disabled="!areaCount && !symbolCount" title="Shapes and symbols as KML, for Google Earth" @click="exportKml">
          KML
        </button>
        <button type="button" class="export" title="A picture of the map as it looks now" @click="exportImage">Image</button>
      </div>
      <div class="flex items-center gap-1.5 px-3 pb-1.5 pt-1 text-xs">
        <span class="mr-auto text-dim">Import</span>
        <button type="button" class="export flex items-center gap-1.5" title="Add shapes and symbols from a GeoJSON or KML file" @click="picker?.click()">
          <Upload class="h-3.5 w-3.5" aria-hidden="true" />
          GeoJSON or KML
        </button>
        <input ref="picker" type="file" accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml" class="hidden" aria-label="File to import" @change="importFile" />
      </div>
      <p v-if="importNote" class="px-3 pb-2 text-xs leading-relaxed text-dim" role="status">{{ importNote }}</p>
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
  @apply rounded-md p-1 text-dim;
}
.icon:hover {
  @apply bg-raised text-hostile;
}
.export {
  @apply rounded-md border border-edge px-2 py-1 font-medium text-paper transition-colors;
}
.export:hover:not(:disabled) {
  @apply bg-raised;
}
.export:disabled {
  @apply cursor-not-allowed opacity-40;
}
</style>
