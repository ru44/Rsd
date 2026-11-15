<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import * as Cesium from "cesium";
import { Check, Crosshair, Flag, MapPin, Search, Share2, Shapes, X } from "lucide-vue-next";
import { useMap } from "@/composables/useMap";
import { useAreas, type Area } from "@/composables/useAreas";
import { useSymbols, type SymbolRec } from "@/composables/useSymbols";
import { useViewLink } from "@/composables/useViewLink";
import { selection } from "@/composables/selection";
import { tool } from "@/composables/tool";
import { formatCoord } from "@/lib/coords";
import { parseCoord } from "@/lib/parseCoord";
import { countryName, fold, loadPlaces, searchPlaces, viewHeightM } from "@/lib/places";
import { SHAPE_LABEL, kindOf } from "@/lib/shapes";

// Find a place three ways: type a position in any format, the name of
// something already on the map, or the name of a city. Nothing here needs
// the internet: the list of cities ships with the app.
const { viewer, flyTo, cameraHeightKm } = useMap();
const { areas, goTo } = useAreas();
const { symbols } = useSymbols();
const { copy } = useViewLink();

interface Result {
  key: string;
  icon: Component;
  title: string;
  detail: string;
  go: () => void;
}

const PIN_ID = "find-pin";
const query = ref("");
const open = ref(false);
const active = ref(0);
/** Flips to true when the list of cities has arrived, so results refresh. */
const placesReady = ref(false);
const placesFailed = ref(false);
const copied = ref(false);
const field = ref<HTMLInputElement | null>(null);

function ensurePlaces() {
  if (placesReady.value) return;
  loadPlaces()
    .then(() => ((placesReady.value = true), (placesFailed.value = false)))
    .catch(() => (placesFailed.value = true));
}

/** A marker on the place that was found. It goes when the box is cleared. */
function showPin(lon: number, lat: number, label: string) {
  const entities = viewer.value?.entities;
  if (!entities) return;
  entities.removeById(PIN_ID);
  entities.add({
    id: PIN_ID,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString("#F2B441"),
      outlineColor: Cesium.Color.fromCssColorString("#14202B"),
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: label,
      font: "bold 13px B612, sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#E8E4D8"),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#14202B").withAlpha(0.9),
      backgroundPadding: new Cesium.Cartesian2(7, 5),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -14),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** Never zooms out to reach a place: only in, or across. */
const closeUp = (limitM: number) => Math.min(cameraHeightKm.value * 1000, limitM);

function goToSymbol(s: SymbolRec) {
  tool.value = "select";
  selection.value = { kind: "symbol", id: s.id };
  flyTo(s.geojson.coordinates[0], s.geojson.coordinates[1], closeUp(300_000));
}

const results = computed<Result[]>(() => {
  const text = query.value.trim();
  if (!text) return [];

  const pos = parseCoord(text);
  if (pos) {
    const title = formatCoord(pos.lon, pos.lat, "DD");
    return [
      {
        key: "position",
        icon: Crosshair,
        title,
        detail: formatCoord(pos.lon, pos.lat, "MGRS"),
        go: () => (flyTo(pos.lon, pos.lat, closeUp(30_000)), showPin(pos.lon, pos.lat, title)),
      },
    ];
  }

  const q = fold(text);
  if (q.length < 2) return [];
  const mine = (name: string) => fold(name).includes(q);
  const out: Result[] = [
    ...areas.value.filter((a) => mine(a.name)).slice(0, 3).map((a: Area) => ({
      key: `area-${a.id}`,
      icon: Shapes,
      title: a.name,
      detail: `${SHAPE_LABEL[kindOf(a)]} on this map`,
      go: () => goTo(a),
    })),
    ...symbols.value.filter((s) => mine(s.name)).slice(0, 3).map((s) => ({
      key: `symbol-${s.id}`,
      icon: Flag,
      title: s.name,
      detail: "Symbol on this map",
      go: () => goToSymbol(s),
    })),
  ];
  if (placesReady.value) {
    for (const p of searchPlaces(text, 8)) {
      out.push({
        key: `place-${p.name}-${p.lat}-${p.lon}`,
        icon: MapPin,
        title: p.name,
        detail: countryName(p.country),
        go: () => (flyTo(p.lon, p.lat, viewHeightM(p.population)), showPin(p.lon, p.lat, p.name)),
      });
    }
  }
  return out;
});
const hasPlaces = computed(() => results.value.some((r) => r.key.startsWith("place-")));
watch(results, () => (active.value = 0));

function choose(r: Result | undefined) {
  if (!r) return;
  r.go();
  query.value = r.title;
  open.value = false;
  field.value?.blur();
}
function step(by: number) {
  const n = results.value.length;
  if (!n) return;
  open.value = true;
  active.value = (active.value + by + n) % n;
}
function clear() {
  query.value = "";
  viewer.value?.entities.removeById(PIN_ID);
  field.value?.focus();
}
function onFocusOut(e: FocusEvent) {
  // Close the list once focus has left the whole box, not when it moves inside it.
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) open.value = false;
}

async function share() {
  copied.value = await copy();
  if (copied.value) setTimeout(() => (copied.value = false), 2000);
}

defineExpose({ focus: () => field.value?.focus() });
</script>

<template>
  <div class="panel w-72 max-w-[calc(100vw-5rem)] text-sm" role="search" @focusout="onFocusOut">
    <div class="flex items-center">
      <Search class="ml-2.5 h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
      <input
        ref="field"
        v-model="query"
        type="text"
        spellcheck="false"
        autocomplete="off"
        role="combobox"
        aria-label="Find a place or coordinates"
        aria-controls="find-results"
        aria-autocomplete="list"
        :aria-expanded="open && results.length > 0"
        placeholder="Find a place or coordinates"
        class="min-w-0 flex-1 select-text bg-transparent px-2 py-2 text-paper placeholder:text-dim focus:outline-none"
        @focus="(open = true), ensurePlaces()"
        @input="open = true"
        @keydown.down.prevent="step(1)"
        @keydown.up.prevent="step(-1)"
        @keydown.enter.prevent="choose(results[active])"
      />
      <button v-if="query" type="button" class="side" aria-label="Clear the search" title="Clear" @click="clear">
        <X class="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="side border-l border-edge"
        :class="{ done: copied }"
        aria-label="Copy a link to this view"
        :title="copied ? 'Link copied' : 'Copy a link to this view'"
        @click="share"
      >
        <component :is="copied ? Check : Share2" class="h-4 w-4" aria-hidden="true" />
      </button>
      <span class="sr-only" role="status">{{ copied ? "Link copied" : "" }}</span>
    </div>

    <template v-if="open">
      <ul v-if="results.length" id="find-results" role="listbox" class="max-h-80 overflow-y-auto border-t border-edge py-1">
        <li v-for="(r, i) in results" :key="r.key" role="option" :aria-selected="i === active">
          <!-- mousedown.prevent keeps focus in the box, so the list does not close before the click lands -->
          <button
            type="button"
            tabindex="-1"
            class="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left"
            :class="i === active ? 'bg-raised' : ''"
            @mousedown.prevent
            @mousemove="active = i"
            @click="choose(r)"
          >
            <component :is="r.icon" class="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
            <span class="min-w-0">
              <span class="block truncate">{{ r.title }}</span>
              <span class="block truncate text-xs text-dim">{{ r.detail }}</span>
            </span>
          </button>
        </li>
        <li v-if="hasPlaces" class="px-2.5 pb-0.5 pt-1.5 text-[11px] text-dim" role="presentation">City names: GeoNames</li>
      </ul>
      <p v-else-if="query.trim().length >= 2" class="border-t border-edge px-3 py-2 text-xs leading-relaxed text-dim">
        <template v-if="placesFailed">The list of cities could not be loaded. Positions still work.</template>
        <template v-else-if="!placesReady">Loading the list of cities.</template>
        <template v-else>
          Nothing found. Try a city, or a position such as
          <span class="font-mono text-paper">21.54, 39.17</span> or
          <span class="font-mono text-paper">37Q ED 21 87</span>.
        </template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.side {
  @apply flex h-9 w-9 shrink-0 items-center justify-center text-dim;
}
.side:hover {
  @apply text-paper;
}
.side.done {
  @apply text-signal;
}
</style>
