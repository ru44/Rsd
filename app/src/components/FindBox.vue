<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from "vue";
import * as Cesium from "cesium";
import { Check, Crosshair, Flag, LocateFixed, MapPin, Search, Share2, Shapes, X } from "lucide-vue-next";
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
import { SPRITE_SCALE, textSpriteUrl } from "@/lib/textSprite";

// Find a place three ways: type a position in any format, the name of
// something already on the map, or the name of a city. Nothing here needs
// the internet: the list of cities ships with the app.
const { viewer, flyTo, cameraHeightKm, pressed } = useMap();
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
/** Shrunk to a search icon until it is wanted, and again once the map is in use. */
const wide = ref(false);
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
      color: Cesium.Color.fromCssColorString("#FAFAFA"),
      outlineColor: Cesium.Color.fromCssColorString("#09090B"),
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    billboard: {
      image: textSpriteUrl(label, { font: "500 13px 'Geist Variable', 'Segoe UI', sans-serif", color: "#FAFAFA", background: "rgba(9, 9, 11, 0.9)" }),
      scale: 1 / SPRITE_SCALE,
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
  located.value = false; // the one marker now shows this result
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
  located.value = false;
  viewer.value?.entities.removeById(PIN_ID);
  field.value?.focus();
}
function onFocusOut(e: FocusEvent) {
  // Close the list once focus has left the whole box, not when it moves inside it.
  if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) return;
  open.value = false;
  if (!query.value) wide.value = false;
}
function focus() {
  wide.value = true;
  nextTick(() => field.value?.focus());
}
// Working on the map puts the box away, unless it is holding a search.
watch(pressed, (down) => {
  if (down && !query.value) wide.value = false;
});

// "Where am I": asks the browser, which asks the person the first time.
const locating = ref(false);
const located = ref(false);
const locateNote = ref("");
function note(text: string) {
  locateNote.value = text;
  setTimeout(() => locateNote.value === text && (locateNote.value = ""), 5000);
}
function locate() {
  if (located.value) {
    // Pressed again: take the marker away.
    viewer.value?.entities.removeById(PIN_ID);
    located.value = false;
    return;
  }
  if (!navigator.geolocation) return note("This browser cannot give a location.");
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locating.value = false;
      located.value = true;
      flyTo(coords.longitude, coords.latitude, closeUp(Math.max(20_000, coords.accuracy * 20)));
      showPin(coords.longitude, coords.latitude, "You are here");
      note(coords.accuracy > 1000 ? `Located to within about ${Math.round(coords.accuracy / 1000)} km.` : "");
    },
    (err) => {
      locating.value = false;
      note(err.code === err.PERMISSION_DENIED ? "Location is blocked for this page. Allow it in the browser to use this." : "Your location could not be found.");
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
  );
}

async function share() {
  copied.value = await copy();
  if (copied.value) setTimeout(() => (copied.value = false), 2000);
}

defineExpose({ focus });
</script>

<template>
  <div class="panel max-w-[calc(100vw-4.5rem)] text-sm" :class="wide ? 'w-80' : ''" role="search" @focusout="onFocusOut">
    <div class="flex items-center gap-0.5 p-1">
      <!-- Always present: taking the button away mid-click would count as leaving the box and shut it again. -->
      <button type="button" class="icon-btn" :class="{ '!w-7': wide }" :tabindex="wide ? -1 : 0" aria-label="Find a place or coordinates" title="Find a place ( / )" @click="focus">
        <Search class="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        v-if="wide"
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
        class="h-8 min-w-0 flex-1 select-text bg-transparent pl-0.5 pr-2 text-paper placeholder:text-dim focus:outline-none"
        @focus="(open = true), ensurePlaces()"
        @input="open = true"
        @keydown.down.prevent="step(1)"
        @keydown.up.prevent="step(-1)"
        @keydown.enter.prevent="choose(results[active])"
      />
      <button v-if="wide && query" type="button" class="icon-btn" aria-label="Clear the search" title="Clear" @click="clear">
        <X class="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="icon-btn"
        :class="{ 'animate-pulse': locating }"
        :aria-pressed="located"
        :aria-label="located ? 'Remove the marker at my location' : 'Go to my location'"
        :title="located ? 'Remove the marker at my location' : 'Go to my location'"
        :disabled="locating"
        @click="locate"
      >
        <LocateFixed class="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="icon-btn"
        :class="{ 'text-paper': copied }"
        aria-label="Copy a link to this view"
        :title="copied ? 'Link copied' : 'Copy a link to this view'"
        @click="share"
      >
        <component :is="copied ? Check : Share2" class="h-4 w-4" aria-hidden="true" />
      </button>
      <span class="sr-only" role="status">{{ copied ? "Link copied" : "" }}</span>
    </div>
    <p v-if="locateNote" class="max-w-[16rem] border-t border-edge px-3 py-2 text-xs leading-relaxed text-dim" role="status">{{ locateNote }}</p>

    <template v-if="open">
      <ul v-if="results.length" id="find-results" role="listbox" class="max-h-80 overflow-y-auto border-t border-edge p-1">
        <li v-for="(r, i) in results" :key="r.key" role="option" :aria-selected="i === active">
          <!-- mousedown.prevent keeps focus in the box, so the list does not close before the click lands -->
          <button
            type="button"
            tabindex="-1"
            class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left"
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

