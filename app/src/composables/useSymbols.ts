import { ref, watch } from "vue";
import axios from "axios";
import ms from "milsymbol";
import * as Cesium from "cesium";
import { API_URL, useMap, type LonLat } from "./useMap";

interface SymbolRec {
  id: number;
  name: string;
  sidc: string;
  geojson: { type: "Point"; coordinates: [number, number] };
}
interface Unsaved {
  entityId: string;
  sidc: string;
  coords: [number, number];
}

/** The symbols offered in the palette, as MIL-STD-2525C codes. */
export const SYMBOL_PALETTE = [
  { sidc: "SFGPUCI----K", label: "Infantry" },
  { sidc: "SFGPEWRH---L", label: "Electronic warfare" },
  { sidc: "SHGPUCFRMS--G", label: "Mechanized infantry" },
  { sidc: "SHGPUAAA---G", label: "Anti-aircraft" },
  { sidc: "SFGPUCVG---K", label: "Reconnaissance" },
];

export function symbolLabel(sidc: string) {
  return SYMBOL_PALETTE.find((s) => s.sidc === sidc)?.label ?? sidc;
}

/** A picture of the symbol for buttons and lists. */
export function symbolImage(sidc: string, size = 22) {
  return new ms.Symbol(sidc, { size }).toDataURL();
}

const API = `${API_URL}/api/symbols`;

const symbols = ref<SymbolRec[]>([]);
/** Placed but not yet stored, because the backend could not be reached. */
const unsaved = ref<Unsaved[]>([]);
/** The symbol code waiting for a map click, or null when not placing. */
const placing = ref<string | null>(null);
const offline = ref(false);
const visible = ref(true);

let source: Cesium.CustomDataSource | null = null;
let hooked = false;
let flushing = false;
let seq = 0;

/** All symbols live in one Cesium layer so they can be shown or hidden together. */
function layer() {
  const v = useMap().viewer.value;
  if (!v) return null;
  if (!source) {
    source = new Cesium.CustomDataSource("symbols");
    source.show = visible.value;
    v.dataSources.add(source);
  }
  return source;
}

function draw(id: string, sidc: string, [lon, lat]: [number, number]) {
  const entities = layer()?.entities;
  if (!entities || entities.getById(id)) return;
  entities.add({
    id,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    billboard: {
      image: new ms.Symbol(sidc, { size: 30 }).asCanvas(),
      // Keep symbols visible instead of letting the globe clip them.
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** Stores everything still unsaved, oldest first. Stops at the first failure. */
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (unsaved.value.length) {
      const item = unsaved.value[0];
      const { data } = await axios.post(API, {
        name: item.sidc,
        sidc: item.sidc,
        geojson: { type: "Point", coordinates: item.coords },
      });
      const saved: SymbolRec = data.data;
      layer()?.entities.removeById(item.entityId);
      draw(`sym-${saved.id}`, saved.sidc, saved.geojson.coordinates);
      symbols.value.push(saved);
      unsaved.value.shift();
    }
    offline.value = false;
  } catch (e) {
    offline.value = true;
    console.error(e);
  } finally {
    flushing = false;
  }
}

function place(pos: LonLat) {
  if (!placing.value) return;
  const entityId = `sym-new-${++seq}`;
  const coords: [number, number] = [pos.lon, pos.lat];
  draw(entityId, placing.value, coords);
  unsaved.value.push({ entityId, sidc: placing.value, coords });
  placing.value = null;
  flush();
}

export function useSymbols() {
  if (!hooked) {
    hooked = true;
    useMap().onLeftClick(place);
    watch(visible, (show) => {
      if (source) source.show = show;
    });
  }

  /** Arm the tool: the next click on the map places this symbol. */
  function arm(sidc: string) {
    placing.value = sidc;
  }
  function cancelPlacing() {
    placing.value = null;
  }

  async function load() {
    try {
      const { data } = await axios.get(API);
      symbols.value = data.data ?? [];
      symbols.value.forEach((s) => draw(`sym-${s.id}`, s.sidc, s.geojson.coordinates));
      offline.value = false;
    } catch (e) {
      offline.value = true;
      console.error(e);
    }
  }

  async function removeAll() {
    try {
      await axios.delete(API);
    } catch (e) {
      offline.value = true;
      console.error(e);
      return;
    }
    layer()?.entities.removeAll();
    symbols.value = [];
    unsaved.value = [];
  }

  return { symbols, unsaved, placing, offline, visible, arm, cancelPlacing, load, flush, removeAll };
}
