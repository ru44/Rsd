<script setup lang="ts">
/* ========== 1. Imports ========== */
import { ref } from "vue"
import MapCanvas from "@/components/MapCanvas.vue"
import MapControls from "@/components/MapControls.vue"
import AreaTable from "@/components/AreaTable.vue"
import SymbolTable from "@/components/SymbolTable.vue"
import SidebarSection from "@/components/SidebarSection.vue"
import DynamicIsland from "@/components/DynamicIsland.vue"
import { useMap } from "@/composables/useMap"
import { useAreas } from "@/composables/useAreas"
import { useSymbols } from "@/composables/useSymbols"

// Icons
import { Globe, Layers, Map, Shield, Settings, ChevronDown, Heart, X } from "lucide-vue-next"

/* ========== 2. State & composables ========== */
const { map, draw, currentZoom } = useMap()
const { areas, drawn, load: loadAreas, save: saveArea, removeAll: removeAOIs, zoomTo } = useAreas(() => map.value)
const { addToMap, load: loadSymbols, save: saveSymbol, removeAll: removeSymbols } = useSymbols(() => map.value)

/* ========== 3. Sidebar UI collapses ========== */
const showControls = ref(true)
const showAreas = ref(true)
const showSymbols = ref(true)
const dynamicIslandRef = ref()

/* ========== 4. Dynamic Island state ========== */
const toolState = ref<null | { mode: string; info?: any }>(null)
function openTool(mode: string, info: any = {}) {
  toolState.value = { mode, info }
}
function closeTool() {
  toolState.value = null
}
function endDraw() {
  draw.value?.changeMode("simple_select")
  closeTool()
}

/* ========== 6. Main control handlers ========== */
function startPolygon() {
  if (!draw.value) {
    alert("Draw is not initialized!")
    return
  }
  openTool("draw", { points: 0 })
  draw.value.changeMode("draw_polygon")
}

function confirmRemoveAll(type: "areas" | "symbols") {
  if (
    confirm(
      type === "areas" ? "Are you sure you want to remove all Areas?" : "Are you sure you want to remove all Symbols?"
    )
  ) {
    if (type === "areas") removeAOIs()
    if (type === "symbols") removeSymbols()
  }
}
</script>

<template>
  <div class="relative w-full h-full">
    <!-- الخلفية المتدرجة (طبقة تحت) -->
    <div
      class="absolute inset-0 z-0 bg-gradient-to-br from-cyan-100 via-blue-100 to-gray-200 pointer-events-none"></div>

    <!-- الخريطة (فوق الخلفية) -->
    <MapCanvas class="absolute inset-0 w-full h-full z-10" />

    <!-- الشريط الجانبي -->
    <aside
      class="absolute top-6 left-6 w-[22rem] max-w-[96vw] max-h-[92vh] overflow-y-auto rounded-2xl bg-white/80 backdrop-blur-md shadow-2xl border border-blue-100 p-6 flex flex-col gap-7 z-50 transition-all">
      <!-- الهيدر -->
      <header class="flex items-center gap-3 mb-2">
        <div
          class="w-10 h-10 rounded-full bg-cyan-600 flex items-center justify-center shadow text-white font-bold text-2xl">
          <Globe class="w-6 h-6" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-gray-700 tracking-tight flex items-center gap-2">
            GIS Map <Map class="w-5 h-5 text-cyan-500" />
          </h2>
          <div class="text-xs text-cyan-800 opacity-80 mt-1 flex items-center gap-1">
            <Layers class="w-4 h-4" />
            <span>Zoom: {{ currentZoom }}</span>
          </div>
        </div>
        <button class="ml-auto p-1 rounded hover:bg-cyan-100 transition lg:hidden" @click="$emit('closeSidebar')">
          <X class="w-5 h-5 text-gray-400 hover:text-cyan-700 cursor-pointer transition" />
        </button>
        <Settings class="w-5 h-5 text-gray-400 hover:text-cyan-700 cursor-pointer transition hidden lg:inline" />
      </header>

      <hr class="border-blue-100 mb-2" />

      <!-- Map Controls (Collapse) -->
      <SidebarSection :icon="Shield" title="Map Controls">
        <MapControls
          :on-draw="startPolygon"
          :on-save="saveArea"
          :on-load="loadAreas"
          :on-remove="() => confirmRemoveAll('areas')" />
      </SidebarSection>

      <SidebarSection :icon="Layers" title="Saved Areas">
        <AreaTable :areas="areas" :on-zoom="zoomTo" />
      </SidebarSection>

      <SidebarSection :icon="Shield" title="Pre-defined Military Symbols">
        <SymbolTable
          :on-add="addToMap"
          :on-save="saveSymbol"
          :on-load="loadSymbols"
          :on-remove="() => confirmRemoveAll('symbols')" />
      </SidebarSection>

      <!-- فوتر -->
      <footer class="mt-2 pt-4 border-t text-xs text-gray-400 text-center flex items-center justify-center gap-1">
        Made with
        <Heart class="w-4 h-4 inline-block text-pink-500 mx-1 animate-pulse" />
        by Your Team — 2025
      </footer>
    </aside>

    <DynamicIsland ref="dynamicIslandRef" />
  </div>
</template>
<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
