<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, Satellite } from "lucide-vue-next";
import { ONLINE_MAPS, useMap, type BaseMapId } from "@/composables/useMap";
import { addMapFile, isDesktop, removeMapFile } from "@/lib/desktop";

// Chooses the picture under everything else. Three choices work without
// the internet; "Streets" is the one that does not, and says so.
// In the desktop app the third choice is a map file the person adds.
const { baseMap, hasSatellite, satellitePreview, mapFile, reloadSatelliteLayer, setBaseMap, pressed } = useMap();
const open = ref(false);
watch(pressed, (down) => down && (open.value = false));

/** True while the file chooser is open, so the panel stays put. */
const choosing = ref(false);
const mapError = ref("");

async function chooseMapFile() {
  if (choosing.value) return;
  choosing.value = true;
  mapError.value = "";
  try {
    if (await addMapFile()) await reloadSatelliteLayer();
  } catch (e) {
    mapError.value = String(e);
  } finally {
    choosing.value = false;
  }
}

async function dropMapFile() {
  mapError.value = "";
  try {
    await removeMapFile();
    await reloadSatelliteLayer();
  } catch (e) {
    mapError.value = String(e);
  }
}

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
      name: isDesktop ? (hasSatellite.value ? "My map" : "Add map") : "Satellite",
      // In the desktop app an empty slot opens the file chooser instead.
      disabled: !hasSatellite.value && !isDesktop,
      style: hasSatellite.value
        ? { backgroundImage: `url(${satellitePreview.value})`, backgroundSize: "cover" }
        : { background: "#18181B" },
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
  if (c.id === "satellite" && !hasSatellite.value) return void chooseMapFile();
  setBaseMap(c.id);
  open.value = false;
}
function onFocusOut(e: FocusEvent) {
  if (choosing.value) return;
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
    </button>

    <Transition name="pop">
    <div v-if="open" class="panel origin-bottom-left p-2 text-xs" role="radiogroup" aria-label="Base map">
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
            <template v-if="c.id === 'satellite' && !hasSatellite">
              <Plus v-if="isDesktop" class="h-5 w-5 text-dim" aria-hidden="true" />
              <Satellite v-else class="h-5 w-5 text-dim" aria-hidden="true" />
            </template>
          </span>
          <span>{{ c.name }}</span>
          <span v-if="c.note" class="text-[10px] leading-none text-dim">{{ c.note }}</span>
        </button>
      </div>
      <template v-if="isDesktop">
        <div v-if="mapFile" class="mt-2 flex max-w-[17rem] items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-paper" :title="mapFile.path">{{ mapFile.name }}</span>
          <button type="button" class="link" @click="chooseMapFile">Change</button>
          <button type="button" class="link" @click="dropMapFile">Remove</button>
        </div>
        <p v-else class="mt-2 max-w-[17rem] leading-relaxed text-dim">
          Add a map file you have downloaded: an <code class="font-mono text-paper">.mbtiles</code> file of pictures,
          such as one made with QGIS.
        </p>
        <p v-if="mapError" class="mt-2 max-w-[17rem] leading-relaxed text-hostile" role="alert">{{ mapError }}</p>
      </template>
      <p v-else-if="!hasSatellite" class="mt-2 max-w-[17rem] leading-relaxed text-dim">
        For satellite pictures, put <code class="font-mono text-paper">satellite.mbtiles</code> in the backend's storage folder.
      </p>
    </div>
    </Transition>

  </div>
</template>

<style scoped>
.thumb-button {
  @apply relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-edge shadow-md shadow-black/30 ring-1 ring-white/20 transition;
}
.thumb-button:hover {
  @apply ring-2 ring-white/70;
}
.thumb {
  @apply absolute inset-0;
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
.link {
  @apply shrink-0 text-dim underline-offset-2 hover:text-paper hover:underline;
}
.swatch {
  @apply flex h-12 w-16 items-center justify-center rounded-md border border-edge;
}
.choice[aria-checked="true"] .swatch {
  @apply ring-2 ring-paper;
}
</style>
