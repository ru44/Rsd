import { ref, watch } from "vue";
import axios from "axios";
import ms from "milsymbol";
import * as Cesium from "cesium";
import { API_URL, useMap, type LonLat } from "./useMap";
import { EDIT_PREFIX, selection } from "./selection";
import { tool } from "./tool";
import { clearHistory, idTracker, record } from "./history";

export interface SymbolRec {
  id: number;
  name: string;
  sidc: string;
  geojson: { type: "Point"; coordinates: [number, number] };
}
interface Unsaved {
  entityId: string;
  sidc: string;
  name: string;
  coords: [number, number];
}

/** A picture of the symbol for buttons and lists. */
export function symbolImage(sidc: string, size = 22) {
  return new ms.Symbol(sidc, { size }).toDataURL();
}

const API = `${API_URL}/api/symbols`;
const RING_ID = `${EDIT_PREFIX}ring`;
// Drawn at twice the size and shown at half scale: sharp on dense screens,
// and the same size on every screen.
const MAP_SYMBOL_SIZE = 22;

const symbols = ref<SymbolRec[]>([]);
/** Placed but not yet stored, because the backend could not be reached. */
const unsaved = ref<Unsaved[]>([]);
/** The symbol waiting for a map click, or null when not placing. */
const placing = ref<{ sidc: string; name: string } | null>(null);
const offline = ref(false);
const visible = ref(true);

let source: Cesium.CustomDataSource | null = null;
let hooked = false;
let flushing = false;
let seq = 0;
/** Entity of the symbol to select as soon as the backend has stored it. */
let selectWhenSaved: string | null = null;
const ids = idTracker();
/** Where the symbol being dragged started, so the move can be undone. */
let dragStart: [number, number] | null = null;

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

// One picture per symbol code, as an address: the map engine then uploads
// each code to the graphics card once, however many symbols use it.
const mapImages = new Map<string, string>();
function mapImage(sidc: string) {
  let url = mapImages.get(sidc);
  if (!url) mapImages.set(sidc, (url = new ms.Symbol(sidc, { size: MAP_SYMBOL_SIZE }).asCanvas(2).toDataURL()));
  return url;
}

function draw(id: string, sidc: string, [lon, lat]: [number, number]) {
  const entities = layer()?.entities;
  if (!entities) return;
  entities.removeById(id);
  entities.add({
    id,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    billboard: {
      image: mapImage(sidc),
      scale: 0.5,
      // Shrink a little when far away so symbols do not swamp a wide view.
      scaleByDistance: new Cesium.NearFarScalar(4e5, 1, 1.5e7, 0.65),
      // Keep symbols visible instead of letting the globe clip them.
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

const find = (id: number) => symbols.value.find((s) => s.id === id);
const selected = () => (selection.value?.kind === "symbol" ? find(selection.value.id) : undefined);

/** A ring around the selected symbol. It follows the symbol while dragged. */
function showRing(on: boolean) {
  const entities = useMap().viewer.value?.entities;
  if (!entities) return;
  entities.removeById(RING_ID);
  if (!on) return;
  entities.add({
    id: RING_ID,
    position: new Cesium.CallbackProperty(() => {
      const s = selected();
      return s ? Cesium.Cartesian3.fromDegrees(...s.geojson.coordinates) : undefined;
    }, false) as unknown as Cesium.PositionProperty,
    point: {
      pixelSize: 46,
      color: Cesium.Color.fromCssColorString("#FAFAFA").withAlpha(0.12),
      outlineColor: Cesium.Color.fromCssColorString("#FAFAFA"),
      outlineWidth: 2,
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
        name: item.name,
        sidc: item.sidc,
        geojson: { type: "Point", coordinates: item.coords },
      });
      const saved: SymbolRec = data.data;
      layer()?.entities.removeById(item.entityId);
      draw(`sym-${saved.id}`, saved.sidc, saved.geojson.coordinates);
      symbols.value.push(saved);
      unsaved.value.shift();
      const life = lifeOf(saved);
      record({ undo: life.end, redo: life.restore });
      // Straight after placing, the new symbol is selected, ready to adjust.
      if (selectWhenSaved === item.entityId && tool.value === "select" && !selection.value) {
        selection.value = { kind: "symbol", id: saved.id };
      }
    }
    offline.value = false;
  } catch (e) {
    offline.value = true;
    console.error(e);
  } finally {
    selectWhenSaved = null;
    flushing = false;
  }
}

/** Deletes a symbol for good. Returns false if the backend could not be reached. */
async function removeNow(id: number) {
  try {
    await axios.delete(`${API}/${id}`);
  } catch (e) {
    offline.value = true;
    console.error(e);
    return false;
  }
  if (selection.value?.kind === "symbol" && selection.value.id === id) selection.value = null;
  layer()?.entities.removeById(`sym-${id}`);
  symbols.value = symbols.value.filter((s) => s.id !== id);
  return true;
}

/** The two halves of undoing a symbol's creation or deletion. */
function lifeOf(symbol: SymbolRec) {
  const id = symbol.id;
  let snap: SymbolRec = { ...symbol };
  return {
    async end() {
      const now = find(ids.current(id));
      if (!now) return;
      snap = { ...now };
      await removeNow(now.id);
    },
    async restore() {
      const { data } = await axios.post(API, { name: snap.name, sidc: snap.sidc, geojson: snap.geojson });
      const saved: SymbolRec = data.data;
      draw(`sym-${saved.id}`, saved.sidc, saved.geojson.coordinates);
      symbols.value.push(saved);
      ids.renumber(id, saved.id);
    },
  };
}

/** Changes a symbol's name, code or place, on screen and in the backend. */
function applyUpdate(id: number, patch: Partial<Pick<SymbolRec, "name" | "sidc" | "geojson">>) {
  const s = find(id);
  if (!s) return;
  Object.assign(s, patch);
  if (patch.sidc || patch.geojson) draw(`sym-${id}`, s.sidc, s.geojson.coordinates);
  push(id, patch);
}

function place(pos: LonLat) {
  if (!placing.value) return false;
  const entityId = `sym-new-${++seq}`;
  const coords: [number, number] = [pos.lon, pos.lat];
  draw(entityId, placing.value.sidc, coords);
  unsaved.value.push({ entityId, ...placing.value, coords });
  selectWhenSaved = entityId;
  tool.value = "select"; // also clears `placing`
  flush();
  return true;
}

/** Sends a change to the backend. The screen already shows it. */
async function push(id: number, patch: Partial<Pick<SymbolRec, "name" | "sidc" | "geojson">>) {
  try {
    await axios.put(`${API}/${id}`, patch);
    offline.value = false;
  } catch (e) {
    offline.value = true;
    console.error(e);
  }
}

export function useSymbols() {
  if (!hooked) {
    hooked = true;
    const map = useMap();
    map.onLeftClick(place);
    // Drag the selected symbol to move it.
    map.onDrag({
      start(_pos, entityId) {
        const s = selected();
        const mine = tool.value === "select" && !!s && (entityId === `sym-${s.id}` || entityId === RING_ID);
        if (mine) dragStart = [...s!.geojson.coordinates];
        return mine;
      },
      move(pos) {
        const s = selected();
        if (!s) return;
        s.geojson = { type: "Point", coordinates: [pos.lon, pos.lat] };
        const entity = layer()?.entities.getById(`sym-${s.id}`);
        if (entity) {
          entity.position = new Cesium.ConstantPositionProperty(
            Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat)
          );
        }
      },
      end(moved) {
        const s = selected();
        if (!s || !moved || !dragStart) return;
        push(s.id, { geojson: s.geojson });
        const id = s.id;
        const before = { geojson: { type: "Point" as const, coordinates: dragStart } };
        const after = { geojson: s.geojson };
        record({ undo: () => applyUpdate(ids.current(id), before), redo: () => applyUpdate(ids.current(id), after) });
      },
    });
    watch(visible, (show) => {
      if (source) source.show = show;
    });
    watch(selection, (sel) => showRing(sel?.kind === "symbol"));
    // Choosing any other tool puts the symbol down.
    watch(tool, (t) => {
      if (t !== "symbol") placing.value = null;
    });
  }

  /** Arm the tool: the next click on the map places this symbol. */
  function arm(sidc: string, name: string) {
    placing.value = { sidc, name };
    tool.value = "symbol";
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

  /** Change a symbol's name or code. */
  function update(id: number, patch: { name?: string; sidc?: string }) {
    const s = find(id);
    if (!s) return;
    const before = { ...(patch.name !== undefined && { name: s.name }), ...(patch.sidc && { sidc: s.sidc }) };
    applyUpdate(id, patch);
    record({ undo: () => applyUpdate(ids.current(id), before), redo: () => applyUpdate(ids.current(id), patch) });
  }

  async function remove(id: number) {
    const s = find(id);
    if (!s) return;
    const life = lifeOf(s);
    if (await removeNow(id)) record({ undo: life.restore, redo: life.end });
  }

  /** Adds symbols that were not placed by hand, as when a file is read. */
  function addMany(items: { sidc: string; name: string; coords: [number, number] }[]) {
    for (const item of items) {
      const entityId = `sym-new-${++seq}`;
      draw(entityId, item.sidc, item.coords);
      unsaved.value.push({ entityId, ...item });
    }
    return flush();
  }

  async function removeAll() {
    try {
      await axios.delete(API);
    } catch (e) {
      offline.value = true;
      console.error(e);
      return;
    }
    if (selection.value?.kind === "symbol") selection.value = null;
    layer()?.entities.removeAll();
    symbols.value = [];
    unsaved.value = [];
    clearHistory();
  }

  return {
    symbols,
    unsaved,
    placing,
    offline,
    visible,
    arm,
    load,
    flush,
    update,
    remove,
    removeAll,
    addMany,
  };
}
