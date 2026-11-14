<script setup lang="ts">
import { computed, onMounted } from "vue";
import MapCanvas from "@/components/MapCanvas.vue";
import MapControls from "@/components/MapControls.vue";
import AreaTable from "@/components/AreaTable.vue";
import SymbolTable from "@/components/SymbolTable.vue";
import SidebarSection from "@/components/SidebarSection.vue";
import DynamicIsland from "@/components/DynamicIsland.vue";
import CoordinateBar from "@/components/CoordinateBar.vue";
import { useMap } from "@/composables/useMap";
import { useAreas } from "@/composables/useAreas";
import { useSymbols } from "@/composables/useSymbols";
import { useMgrsGrid } from "@/composables/useMgrsGrid";
import { Globe, Heart, Layers, Map, Shield } from "lucide-vue-next";

const { is3D, cameraHeightKm, hasSatellite, toggleMode } = useMap();
const {
  areas,
  unsaved: unsavedAreas,
  drawing,
  error: areaError,
  startDraw,
  load: loadAreas,
  save: saveAreas,
  removeAll: removeAreas,
  zoomTo,
} = useAreas();
const {
  unsaved: unsavedSymbols,
  placing,
  error: symbolError,
  addToMap,
  load: loadSymbols,
  save: saveSymbols,
  removeAll: removeSymbols,
} = useSymbols();

const { visible: gridVisible, attach: attachGrid } = useMgrsGrid();

const error = computed(() => areaError.value ?? symbolError.value);

// Show what is already saved as soon as the map exists. The map is created by
// MapCanvas, a child, so it is ready by the time this parent mounts.
onMounted(() => {
  attachGrid();
  loadAreas();
  loadSymbols();
});

function confirmRemoveAll(type: "areas" | "symbols") {
  const what = type === "areas" ? "Areas" : "Symbols";
  if (!confirm(`Are you sure you want to remove all ${what}?`)) return;
  if (type === "areas") removeAreas();
  else removeSymbols();
}
</script>

<template>
  <div class="relative w-full h-full">
    <MapCanvas :crosshair="drawing || !!placing" />

    <aside
      class="absolute top-6 left-6 w-[22rem] max-w-[96vw] max-h-[92vh] overflow-y-auto rounded-2xl bg-white/80 backdrop-blur-md shadow-2xl border border-blue-100 p-6 flex flex-col gap-7 z-50"
    >
      <header class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-full bg-cyan-600 flex items-center justify-center shadow text-white"
        >
          <Globe class="w-6 h-6" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-gray-700 tracking-tight flex items-center gap-2">
            rsGIS <Map class="w-5 h-5 text-cyan-500" />
          </h2>
          <div class="text-xs text-cyan-800 opacity-80 mt-1 flex items-center gap-1">
            <Layers class="w-4 h-4" />
            <span>{{ is3D ? 'Eye altitude' : 'View width' }}: {{ cameraHeightKm.toLocaleString() }} km</span>
          </div>
        </div>
        <button
          class="ml-auto rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-bold text-white shadow hover:bg-cyan-700 transition-colors"
          :title="is3D ? 'Switch to flat 2D map' : 'Switch to 3D globe'"
          @click="toggleMode"
        >
          {{ is3D ? "2D" : "3D" }}
        </button>
      </header>

      <p v-if="!hasSatellite" class="-mt-3 text-xs text-gray-500">
        Showing the built-in offline world map. Satellite tiles appear when the
        backend serves <code>storage/satellite.mbtiles</code>.
      </p>
      <p v-if="error" class="-mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
        {{ error }}
      </p>

      <SidebarSection :icon="Layers" title="Layers">
        <label class="flex items-center justify-between text-gray-700 font-medium cursor-pointer">
          <span>MGRS grid</span>
          <input v-model="gridVisible" type="checkbox" class="h-4 w-4 accent-cyan-600" />
        </label>
      </SidebarSection>

      <SidebarSection :icon="Shield" title="Map Controls">
        <MapControls
          :on-draw="startDraw"
          :on-save="saveAreas"
          :on-load="loadAreas"
          :on-remove="() => confirmRemoveAll('areas')"
        />
        <p v-if="unsavedAreas.length" class="mt-2 text-xs text-amber-700">
          {{ unsavedAreas.length }} unsaved area(s)
        </p>
      </SidebarSection>

      <SidebarSection :icon="Layers" title="Saved Areas">
        <AreaTable :areas="areas" :on-zoom="zoomTo" />
      </SidebarSection>

      <SidebarSection :icon="Shield" title="Pre-defined Military Symbols">
        <SymbolTable
          :on-add="addToMap"
          :on-save="saveSymbols"
          :on-load="loadSymbols"
          :on-remove="() => confirmRemoveAll('symbols')"
        />
        <p v-if="unsavedSymbols.length" class="mt-2 text-xs text-amber-700">
          {{ unsavedSymbols.length }} unsaved symbol(s)
        </p>
      </SidebarSection>

      <footer class="pt-4 border-t text-xs text-gray-400 text-center flex items-center justify-center gap-1">
        Made with
        <Heart class="w-4 h-4 inline-block text-pink-500 mx-1 animate-pulse" />
        by Your Team — 2025
      </footer>
    </aside>

    <CoordinateBar />
    <DynamicIsland />
  </div>
</template>
