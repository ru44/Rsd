import { ref, watch } from "vue";
import axios from "axios";
import * as Cesium from "cesium";
import { API_URL, useMap, type LonLat } from "./useMap";
import { EDIT_PREFIX, selection } from "./selection";

type Ring = [number, number][];
interface PolygonGeo {
  type: "Polygon";
  coordinates: Ring[];
}
export interface Area {
  id: number;
  name: string;
  color?: string | null;
  geojson: PolygonGeo;
}
interface Unsaved {
  entityId: string;
  geojson: PolygonGeo;
}

const API = `${API_URL}/api/areas`;
export const AREA_COLORS = ["#7FD4F5", "#FF8080", "#AAFFAA", "#FFFF80", "#F2B441", "#E8E4D8"];
const DEFAULT_COLOR = AREA_COLORS[0];
const DRAFT_ID = "area-draft";
const INK = Cesium.Color.fromCssColorString("#14202B");
const PAPER = Cesium.Color.fromCssColorString("#E8E4D8");

const areas = ref<Area[]>([]);
/** Drawn but not yet stored, because the backend could not be reached. */
const unsaved = ref<Unsaved[]>([]);
const drawing = ref(false);
const pointCount = ref(0);
const offline = ref(false);
const visible = ref(true);

let draft: LonLat[] = [];
let source: Cesium.CustomDataSource | null = null;
let hooked = false;
let flushing = false;
let seq = 0;

/** The area being reshaped: its corners, without the repeated closing point. */
let editing: { id: number; ring: Ring } | null = null;
let drag: { kind: "corner"; index: number } | { kind: "move"; last: LonLat } | null = null;
let dragMoved = false;

/** All areas live in one Cesium layer so they can be shown or hidden together. */
function layer() {
  const v = useMap().viewer.value;
  if (!v) return null;
  if (!source) {
    source = new Cesium.CustomDataSource("areas");
    source.show = visible.value;
    v.dataSources.add(source);
  }
  return source;
}

const find = (id: number) => areas.value.find((a) => a.id === id);
const closed = (ring: Ring): Ring => [...ring, ring[0]];
const toCartesian = (ring: Ring) => Cesium.Cartesian3.fromDegreesArray(ring.flat());
const toPolygon = (ring: Ring): PolygonGeo => ({ type: "Polygon", coordinates: [closed(ring)] });

function drawArea(id: string, geo: PolygonGeo, color = DEFAULT_COLOR) {
  const entities = layer()?.entities;
  if (!entities) return;
  entities.removeById(id);
  const ring = geo.coordinates[0];
  const css = Cesium.Color.fromCssColorString(color);
  entities.add({
    id,
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(toCartesian(ring)),
      material: css.withAlpha(0.35),
    },
    polyline: {
      positions: toCartesian(ring),
      width: 2.5,
      material: css,
      clampToGround: true,
    },
  });
}

const redraw = (a: Area) => drawArea(`area-${a.id}`, a.geojson, a.color ?? undefined);

// ---- drawing a new area -------------------------------------------------

function cornerDot(id: string, position: Cesium.Cartesian3 | Cesium.CallbackProperty, small = false) {
  useMap().viewer.value?.entities.add({
    id,
    position: position as unknown as Cesium.PositionProperty,
    point: {
      pixelSize: small ? 8 : 11,
      color: small ? PAPER.withAlpha(0.55) : PAPER,
      outlineColor: INK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** The outline that follows the user's clicks while drawing. */
function showDraft() {
  const v = useMap().viewer.value;
  if (!v || v.entities.getById(DRAFT_ID)) return;
  v.entities.add({
    id: DRAFT_ID,
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const pts = draft.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat));
        if (pts.length > 2) pts.push(pts[0]); // close the shape
        return pts;
      }, false),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString(DEFAULT_COLOR),
      }),
      clampToGround: true,
    },
  });
}

function endDraft() {
  drawing.value = false;
  const entities = useMap().viewer.value?.entities;
  entities?.removeById(DRAFT_ID);
  draft.forEach((_, i) => entities?.removeById(`${DRAFT_ID}-${i}`));
  draft = [];
  pointCount.value = 0;
}

function addPoint(pos: LonLat) {
  if (!drawing.value) return false;
  // Mark each corner so the first clicks are visible before there is a line.
  cornerDot(`${DRAFT_ID}-${draft.length}`, Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat));
  draft.push(pos);
  pointCount.value = draft.length;
  return true;
}

/** Stores everything still unsaved, oldest first. Stops at the first failure. */
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (unsaved.value.length) {
      const item = unsaved.value[0];
      const { data: saved } = await axios.post<Area>(API, {
        name: `Area ${areas.value.length + 1}`,
        geojson: item.geojson,
        color: DEFAULT_COLOR,
      });
      layer()?.entities.removeById(item.entityId);
      areas.value.push(saved);
      redraw(saved);
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

/** Closes the shape and saves it. Fewer than three points is not an area. */
function finishDraw() {
  if (!drawing.value || draft.length < 3) return;
  const geojson = toPolygon(draft.map((p) => [p.lon, p.lat]));
  const entityId = `area-new-${++seq}`;
  endDraft();
  drawArea(entityId, geojson);
  unsaved.value.push({ entityId, geojson });
  flush();
}

// ---- reshaping a saved area ---------------------------------------------

/** Sends a change to the backend. The screen already shows it. */
async function push(id: number, patch: Partial<Pick<Area, "name" | "color" | "geojson">>) {
  try {
    await axios.put(`${API}/${id}`, patch);
    offline.value = false;
  } catch (e) {
    offline.value = true;
    console.error(e);
  }
}

function removeHandles() {
  const entities = useMap().viewer.value?.entities;
  if (!entities) return;
  for (const e of [...entities.values]) if (e.id.startsWith(EDIT_PREFIX + "area-")) entities.remove(e);
}

/** A dot on every corner, and a smaller one mid-way along every side. */
function showHandles() {
  removeHandles();
  if (!editing) return;
  const at = (i: number) => editing!.ring[i % editing!.ring.length];
  editing.ring.forEach((_, i) => {
    cornerDot(
      `${EDIT_PREFIX}area-corner-${i}`,
      new Cesium.CallbackProperty(() => editing && Cesium.Cartesian3.fromDegrees(...at(i)), false)
    );
    cornerDot(
      `${EDIT_PREFIX}area-side-${i}`,
      new Cesium.CallbackProperty(() => {
        if (!editing) return undefined;
        const [a, b] = [at(i), at(i + 1)];
        return Cesium.Cartesian3.fromDegrees((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }, false),
      true
    );
  });
}

function beginEdit(id: number) {
  const area = find(id);
  const entity = layer()?.entities.getById(`area-${id}`);
  if (!area || !entity?.polygon || !entity.polyline) return;
  editing = { id, ring: area.geojson.coordinates[0].slice(0, -1).map((p) => [p[0], p[1]]) };
  // While editing, the shape is read from `editing.ring` every frame, so it
  // follows the pointer during a drag.
  entity.polygon.hierarchy = new Cesium.CallbackProperty(
    () => new Cesium.PolygonHierarchy(toCartesian(closed(editing?.ring ?? area.geojson.coordinates[0]))),
    false
  );
  entity.polyline.positions = new Cesium.CallbackProperty(
    () => toCartesian(closed(editing?.ring ?? area.geojson.coordinates[0])),
    false
  );
  showHandles();
}

function endEdit() {
  if (!editing) return;
  const area = find(editing.id);
  editing = null;
  drag = null;
  removeHandles();
  if (area) redraw(area); // back to a fixed shape
}

/** Keeps the edited shape and stores it. */
function commitShape() {
  if (!editing) return;
  const area = find(editing.id);
  if (!area) return;
  area.geojson = toPolygon(editing.ring);
  push(area.id, { geojson: area.geojson });
}

export function useAreas() {
  if (!hooked) {
    hooked = true;
    const map = useMap();
    map.onLeftClick(addPoint);
    map.onRightClick((_pos, entityId) => {
      if (drawing.value) {
        finishDraw(); // right-click also closes the shape
        return true;
      }
      // Right-click a corner of the selected area to remove it.
      const corner = entityId?.match(/^edit-area-corner-(\d+)$/);
      if (editing && corner && editing.ring.length > 3) {
        editing.ring.splice(+corner[1], 1);
        showHandles();
        commitShape();
        return true;
      }
    });
    map.onDrag({
      start(pos, entityId) {
        if (!editing || !entityId) return false;
        dragMoved = false;
        const corner = entityId.match(/^edit-area-corner-(\d+)$/);
        const side = entityId.match(/^edit-area-side-(\d+)$/);
        if (corner) {
          drag = { kind: "corner", index: +corner[1] };
        } else if (side) {
          // Pulling a side dot makes a new corner there.
          const index = +side[1] + 1;
          editing.ring.splice(index, 0, [pos.lon, pos.lat]);
          showHandles();
          drag = { kind: "corner", index };
          dragMoved = true;
        } else if (entityId === `area-${editing.id}`) {
          drag = { kind: "move", last: pos };
        } else {
          return false;
        }
        return true;
      },
      move(pos) {
        if (!editing || !drag) return;
        dragMoved = true;
        if (drag.kind === "corner") {
          editing.ring[drag.index] = [pos.lon, pos.lat];
        } else {
          const [dLon, dLat] = [pos.lon - drag.last.lon, pos.lat - drag.last.lat];
          editing.ring = editing.ring.map(([lon, lat]) => [lon + dLon, lat + dLat]);
          drag.last = pos;
        }
      },
      end() {
        drag = null;
        if (dragMoved) commitShape();
      },
    });
    watch(visible, (show) => {
      if (source) source.show = show;
    });
    watch(selection, (sel) => {
      endEdit();
      if (sel?.kind === "area") beginEdit(sel.id);
    });
  }

  function startDraw() {
    selection.value = null;
    draft = [];
    pointCount.value = 0;
    drawing.value = true;
    showDraft();
  }

  async function load() {
    try {
      const { data } = await axios.get(API);
      areas.value = data.data ?? [];
      areas.value.forEach(redraw);
      offline.value = false;
    } catch (e) {
      offline.value = true;
      console.error(e);
    }
  }

  /** Change an area's name or colour. */
  function update(id: number, patch: { name?: string; color?: string }) {
    const area = find(id);
    if (!area) return;
    Object.assign(area, patch);
    if (patch.color) {
      redraw(area);
      if (editing?.id === id) beginEdit(id); // re-attach the live shape and handles
    }
    push(id, patch);
  }

  async function remove(id: number) {
    try {
      await axios.delete(`${API}/${id}`);
    } catch (e) {
      offline.value = true;
      console.error(e);
      return;
    }
    if (selection.value?.kind === "area" && selection.value.id === id) selection.value = null;
    layer()?.entities.removeById(`area-${id}`);
    areas.value = areas.value.filter((a) => a.id !== id);
  }

  async function removeAll() {
    try {
      await axios.delete(API);
    } catch (e) {
      offline.value = true;
      console.error(e);
      return;
    }
    if (selection.value?.kind === "area") selection.value = null;
    layer()?.entities.removeAll();
    areas.value = [];
    unsaved.value = [];
  }

  /** Select an area and bring it into view. */
  function goTo(a: Area) {
    selection.value = { kind: "area", id: a.id };
    const v = useMap().viewer.value;
    const entity = layer()?.entities.getById(`area-${a.id}`);
    if (v && entity) v.flyTo(entity, { duration: 1.2 });
  }

  return {
    areas,
    unsaved,
    drawing,
    pointCount,
    offline,
    visible,
    startDraw,
    finishDraw,
    cancelDraw: endDraft,
    load,
    flush,
    update,
    remove,
    removeAll,
    goTo,
  };
}
