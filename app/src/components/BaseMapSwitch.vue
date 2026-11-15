<script setup lang="ts">
import { computed, ref } from "vue";
import { Satellite } from "lucide-vue-next";
import { API_URL, ONLINE_MAPS, useMap, type BaseMapId } from "@/composables/useMap";

// Chooses the picture under everything else. Three choices work without
// the internet; "Streets" is the one that does not, and says so.
const { baseMap, hasSatellite, setBaseMap } = useMap();
const open = ref(false);

// A piece of the built-in map showing the Red Sea, used as a preview.
const WORLD_TILE = `${import.meta.env.BASE_URL}cesium/Assets/Textures/NaturalEarthII/2/4/2.jpg`;

interface Choice {
  id: BaseMapId;
  name: string;
  note?: string;
  disabled?: boolean;
  style: Record<string, string>;
}
const choices = computed<Choice[]>(() => {
  const world = { backgroundImage: `url(${WORLD_TILE})`, backgroundSize: "cover" };
  const list: Choice[] = [
    { id: "world", name: "World", style: world },
    { id: "dark", name: "Dark", style: { ...world, filter: "brightness(0.5) saturate(0.3)" } },
    {
      id: "satellite",
      name: "Satellite",
      disabled: !hasSatellite.value,
      style: hasSatellite.value
        ? { backgroundImage: `url(${API_URL}/api/tiles/raster/0/0/0)`, backgroundSize: "cover" }
        : { background: "#1D2C3A" },
    },
  ];
  if (ONLINE_MAPS) {
    list.push({
      id: "streets",
      name: "Streets",
      note: "online",
      // A few roads on pale ground, drawn here so no request is made just for the preview.
      style: {
        background:
          "linear-gradient(118deg, transparent 44%, #F7C96B 44%, #F7C96B 53%, transparent 53%)," +
          "linear-gradient(24deg, transparent 47%, #FFFFFF 47%, #FFFFFF 54%, transparent 54%)," +
          "linear-gradient(75deg, transparent 70%, #FFFFFF 70%, #FFFFFF 75%, transparent 75%), #DDE6D5",
      },
    });
  }
  return list;
});
const current = computed(() => choices.value.find((c) => c.id === baseMap.value) ?? choices.value[0]);

function pick(c: Choice) {
  if (c.disabled) return;
  setBaseMap(c.id);
  open.value = false;
}
function onFocusOut(e: FocusEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) open.value = false;
}
</script>

<template>
  <div class="flex items-end gap-2" @focusout="onFocusOut" @keydown.esc.stop="open = false">
    <button
      type="button"
      class="thumb-button"
      aria-label="Change the base map"
      title="Change the base map"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="thumb" :style="current.style" />
      <span class="caption">Base map</span>
    </button>

    <div v-if="open" class="panel p-2 text-xs" role="radiogroup" aria-label="Base map">
      <div class="flex gap-2">
        <button
          v-for="c in choices"
          :key="c.id"
          type="button"
          role="radio"
          class="choice"
          :aria-checked="c.id === baseMap"
          :aria-label="c.note ? `${c.name}, ${c.note}` : c.name"
          :disabled="c.disabled"
          @click="pick(c)"
        >
          <span class="swatch" :style="c.style">
            <Satellite v-if="c.id === 'satellite' && c.disabled" class="h-5 w-5 text-dim" aria-hidden="true" />
          </span>
          <span>{{ c.name }}</span>
          <span v-if="c.note" class="text-[10px] leading-none text-dim">{{ c.note }}</span>
        </button>
      </div>
      <p v-if="!hasSatellite" class="mt-2 max-w-[17rem] leading-relaxed text-dim">
        For satellite pictures, put <code class="font-mono text-paper">satellite.mbtiles</code> in the backend's storage folder.
      </p>
    </div>

    <!-- OpenStreetMap asks for this credit wherever its map is shown. -->
    <p v-else-if="baseMap === 'streets'" class="panel px-2 py-1 text-[11px] text-dim">© OpenStreetMap contributors</p>
  </div>
</template>

<style scoped>
.thumb-button {
  @apply relative h-16 w-16 shrink-0 overflow-hidden rounded border-2 border-paper/80 shadow-lg shadow-black/40;
}
.thumb-button:hover {
  @apply border-signal;
}
.thumb {
  @apply absolute inset-0;
}
.caption {
  @apply absolute inset-x-0 bottom-0 bg-ink/90 py-0.5 text-center text-[11px] leading-tight text-paper;
}
.choice {
  @apply flex w-16 flex-col items-center gap-1 text-dim;
}
.choice:hover:not(:disabled),
.choice[aria-checked="true"] {
  @apply text-paper;
}
.choice:disabled {
  @apply cursor-not-allowed opacity-60;
}
.swatch {
  @apply flex h-14 w-16 items-center justify-center rounded-sm border-2 border-edge;
}
.choice[aria-checked="true"] .swatch {
  @apply border-signal;
}
</style>
