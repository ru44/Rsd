import { ref } from "vue";
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

const API = `${API_URL}/api/symbols`;

const symbols = ref<SymbolRec[]>([]);
const unsaved = ref<Unsaved[]>([]);
/** The symbol code waiting for a map click, or null when not placing. */
const placing = ref<string | null>(null);
const error = ref<string | null>(null);
let hooked = false;
let seq = 0;

function draw(id: string, sidc: string, [lon, lat]: [number, number]) {
  const { viewer } = useMap();
  const v = viewer.value;
  if (!v || v.entities.getById(id)) return;
  v.entities.add({
    id,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    billboard: {
      image: new ms.Symbol(sidc, { size: 30 }).asCanvas(),
      // Keep symbols visible instead of letting the globe clip them.
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function erase(id: string) {
  useMap().viewer.value?.entities.removeById(id);
}

function place(pos: LonLat) {
  if (!placing.value) return;
  const entityId = `sym-new-${++seq}`;
  const coords: [number, number] = [pos.lon, pos.lat];
  draw(entityId, placing.value, coords);
  unsaved.value.push({ entityId, sidc: placing.value, coords });
  placing.value = null;
}

export function useSymbols() {
  if (!hooked) {
    hooked = true;
    useMap().onLeftClick(place);
  }

  /** Arm the tool: the next click on the map places this symbol. */
  function addToMap(sidc: string) {
    placing.value = sidc;
  }
  function cancelPlacing() {
    placing.value = null;
  }

  async function load() {
    error.value = null;
    try {
      const { data } = await axios.get(API);
      symbols.value = data.data ?? [];
      symbols.value.forEach((s) => draw(`sym-${s.id}`, s.sidc, s.geojson.coordinates));
    } catch (e) {
      error.value = "Could not load symbols (is the backend running?)";
      console.error(e);
    }
  }

  async function save() {
    error.value = null;
    // Save one at a time so a failure leaves the rest still marked unsaved.
    while (unsaved.value.length) {
      const item = unsaved.value[0];
      try {
        const { data } = await axios.post(API, {
          name: item.sidc,
          sidc: item.sidc,
          geojson: { type: "Point", coordinates: item.coords },
        });
        const saved: SymbolRec = data.data;
        erase(item.entityId);
        draw(`sym-${saved.id}`, saved.sidc, saved.geojson.coordinates);
        symbols.value.push(saved);
        unsaved.value.shift();
      } catch (e) {
        error.value = "Could not save symbols (is the backend running?)";
        console.error(e);
        return;
      }
    }
  }

  async function removeAll() {
    error.value = null;
    try {
      await axios.delete(API);
    } catch (e) {
      error.value = "Could not remove symbols (is the backend running?)";
      console.error(e);
      return;
    }
    symbols.value.forEach((s) => erase(`sym-${s.id}`));
    unsaved.value.forEach((u) => erase(u.entityId));
    symbols.value = [];
    unsaved.value = [];
  }

  return { symbols, unsaved, placing, error, addToMap, cancelPlacing, load, save, removeAll };
}
