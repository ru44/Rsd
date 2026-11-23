import { ref, watch } from "vue";
import axios from "axios";
import * as Cesium from "cesium";
import { API_URL, shiftHeld, useMap, type LonLat } from "./useMap";
import { EDIT_PREFIX, selection } from "./selection";
import { isDrawTool, tool } from "./tool";
import { clearHistory, idTracker, record } from "./history";
import { savedLevel } from "./prefs";
import {
  SHAPE_LABEL,
  circleOf,
  circleRing,
  distanceM,
  isPath,
  kindOf,
  measure,
  measurements,
  pathLengthM,
  formatDistance,
  pointsOf,
  rectRing,
  squareCorner,
  toGeo,
  type Pt,
  type ShapeGeo,
  type ShapeKind,
  type Stat,
} from "@/lib/shapes";

// Everything drawn on the map that is not a symbol: areas, rectangles,
// circles and lines. The backend calls them all "areas".
export interface Area {
  id: number;
  name: string;
  color?: string | null;
  /** What it was drawn as. Missing on areas saved by older versions. */
  shape?: ShapeKind | null;
  /** A volume: metres above sea level of its bottom and its top. */
  floor_m?: number | null;
  ceiling_m?: number | null;
  geojson: ShapeGeo;
}
/** The bottom and top of a shape that has height, or null for a flat one. */
export function volumeOf(a: { floor_m?: number | null; ceiling_m?: number | null }) {
  const [floor, top] = [a.floor_m ?? 0, a.ceiling_m ?? 0];
  return top > floor ? { floor, top } : null;
}
type Heights = { floor_m?: number; ceiling_m?: number };
interface Unsaved {
  entityId: string;
  shape: ShapeKind;
  geojson: ShapeGeo;
  /** Set for shapes read from a file; drawn shapes are named when saved. */
  name?: string;
  color?: string;
  floor_m?: number;
  ceiling_m?: number;
}
/** A shape to add without drawing it, as when reading a file. */
export interface NewShape {
  kind: ShapeKind;
  pts: Pt[];
  name?: string;
  color?: string;
  floor_m?: number;
  ceiling_m?: number;
}

const API = `${API_URL}/api/areas`;
export const AREA_COLORS = ["#7FD4F5", "#FF8080", "#AAFFAA", "#FFFF80", "#F2B441", "#FAFAFA"];
const DEFAULT_COLOR = AREA_COLORS[0];
const DRAFT_ID = "area-draft";
const INK = Cesium.Color.fromCssColorString("#09090B");
const PAPER = Cesium.Color.fromCssColorString("#FAFAFA");

const areas = ref<Area[]>([]);
/** Drawn but not yet stored, because the backend could not be reached. */
const unsaved = ref<Unsaved[]>([]);
/** Points clicked so far with the area or line tool. */
const pointCount = ref(0);
/** Size of the shape being drawn, for the prompt: "Radius 3.2 km". */
const draftInfo = ref("");
/** Size of the selected shape, kept up to date while it is dragged. */
const liveMeasure = ref<Stat[]>([]);
const offline = ref(false);
const visible = ref(true);
/** How solid shapes look, from 0 (gone) to 1 (as drawn). */
const opacity = savedLevel("rsgis.shapesOpacity", 1);

let source: Cesium.CustomDataSource | null = null;
let hooked = false;
let flushing = false;
let seq = 0;
/** Entity of the shape to select as soon as the backend has stored it. */
let selectWhenSaved: string | null = null;
const ids = idTracker();

// A new shape: clicked points for an area or line, or the two ends of the
// drag that makes a rectangle or circle.
let draft: Pt[] = [];
let dragFrom: Pt | null = null;
let dragTo: Pt | null = null;

/** The shape being reshaped, as its own points (see `pointsOf`). */
let editing: { id: number; kind: ShapeKind; pts: Pt[]; center?: Pt; radiusM?: number } | null = null;
let drag:
  | { kind: "corner"; index: number }
  | { kind: "box"; anchor: Pt }
  | { kind: "radius" }
  | { kind: "move"; last: LonLat }
  | null = null;

/** All shapes live in one Cesium layer so they can be shown or hidden together. */
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
// Cesium refuses an empty list, which a shape just being started has.
const toCartesian = (pts: Pt[]) => (pts.length ? Cesium.Cartesian3.fromDegreesArray(pts.flat()) : []);
/** Points along the outline: a closed shape ends where it began. */
const outline = (kind: ShapeKind, pts: Pt[]) => (isPath(kind) || pts.length < 3 ? pts : [...pts, pts[0]]);
// A rectangle's sides follow the grid lines instead of the shortest path.
const arcOf = (kind: ShapeKind) => (kind === "rect" ? Cesium.ArcType.RHUMB : Cesium.ArcType.GEODESIC);

function drawShape(id: string, kind: ShapeKind, geo: ShapeGeo, color = DEFAULT_COLOR, name = "", vol: { floor: number; top: number } | null = null) {
  const entities = layer()?.entities;
  if (!entities) return;
  entities.removeById(id);
  const pts = pointsOf(geo);
  const op = opacity.value;
  const css = Cesium.Color.fromCssColorString(color).withAlpha(op);
  if (kind === "text") {
    entities.add({
      id,
      position: Cesium.Cartesian3.fromDegrees(pts[0][0], pts[0][1]),
      label: {
        text: name || SHAPE_LABEL.text,
        font: "600 15px 'Geist Variable', sans-serif",
        fillColor: css,
        showBackground: true,
        backgroundColor: INK.withAlpha(0.8 * op),
        backgroundPadding: new Cesium.Cartesian2(7, 5),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    return;
  }
  entities.add({
    id,
    polygon:
      isPath(kind)
        ? undefined
        : {
            hierarchy: new Cesium.PolygonHierarchy(toCartesian(pts)),
            material: css.withAlpha(0.35 * op),
            arcType: arcOf(kind),
            // A volume stands up from its bottom height to its top height.
            ...(vol && { height: vol.floor, extrudedHeight: vol.top, outline: true, outlineColor: css }),
          },
    polyline: {
      positions: toCartesian(outline(kind, pts)),
      width: kind === "arrow" ? 14 : kind === "line" ? 3.5 : 2.5,
      material: kind === "arrow" ? new Cesium.PolylineArrowMaterialProperty(css) : css,
      clampToGround: true,
      arcType: arcOf(kind),
    },
  });
}

const redraw = (a: Area) => drawShape(`area-${a.id}`, kindOf(a), a.geojson, a.color ?? undefined, a.name, volumeOf(a));

// ---- drawing a new shape ------------------------------------------------

function dot(id: string, position: Cesium.Cartesian3 | Cesium.CallbackProperty, small = false) {
  useMap().viewer.value?.entities.add({
    id,
    position: position as unknown as Cesium.PositionProperty,
    point: {
      pixelSize: small ? 8 : 11,
      color: small ? PAPER.withAlpha(0.55) : PAPER,
      outlineColor: INK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });
}

/** The shape as it would be if the person stopped now. */
function previewPts(): Pt[] {
  const t = tool.value;
  if (t === "rect" || t === "circle") {
    if (!dragFrom || !dragTo) return [];
    return t === "rect"
      ? rectRing(dragFrom, shiftHeld() ? squareCorner(dragFrom, dragTo) : dragTo)
      : circleRing(dragFrom, distanceM(dragFrom, dragTo));
  }
  // The pointer counts as the next point, so the shape follows the mouse.
  const c = useMap().cursor.value;
  return draft.length && c ? [...draft, [c.lon, c.lat]] : [...draft];
}

/** The dashed shape that follows the pointer while drawing. */
function showDraft() {
  const v = useMap().viewer.value;
  if (!v) return;
  v.entities.removeById(DRAFT_ID);
  const t = tool.value;
  if (!isDrawTool(t)) return;
  const css = Cesium.Color.fromCssColorString(DEFAULT_COLOR);
  v.entities.add({
    id: DRAFT_ID,
    polygon:
      isPath(t)
        ? undefined
        : {
            hierarchy: new Cesium.CallbackProperty(() => {
              const pts = previewPts();
              return new Cesium.PolygonHierarchy(pts.length > 2 ? toCartesian(pts) : []);
            }, false),
            material: css.withAlpha(0.2),
            arcType: arcOf(t),
          },
    polyline: {
      positions: new Cesium.CallbackProperty(() => toCartesian(outline(t, previewPts())), false),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({ color: css }),
      clampToGround: true,
      arcType: arcOf(t),
    },
  });
}

function clearDraft() {
  const entities = useMap().viewer.value?.entities;
  entities?.removeById(DRAFT_ID);
  draft.forEach((_, i) => entities?.removeById(`${DRAFT_ID}-${i}`));
  draft = [];
  dragFrom = dragTo = null;
  pointCount.value = 0;
  draftInfo.value = "";
}

/** Stores everything still unsaved, oldest first. Stops at the first failure. */
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (unsaved.value.length) {
      const item = unsaved.value[0];
      const sameKind = areas.value.filter((a) => kindOf(a) === item.shape).length;
      const { data: saved } = await axios.post<Area>(API, {
        name: item.name ?? `${SHAPE_LABEL[item.shape]} ${sameKind + 1}`,
        geojson: item.geojson,
        color: item.color ?? DEFAULT_COLOR,
        shape: item.shape,
        floor_m: item.floor_m,
        ceiling_m: item.ceiling_m,
      });
      layer()?.entities.removeById(item.entityId);
      areas.value.push(saved);
      redraw(saved);
      unsaved.value.shift();
      const life = lifeOf(saved);
      record({ undo: life.end, redo: life.restore });
      // Straight after drawing, the new shape is selected, ready to adjust.
      if (selectWhenSaved === item.entityId && tool.value === "select" && !selection.value) {
        selection.value = { kind: "area", id: saved.id };
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

/** Stores a shape again after it was deleted. It comes back under a new number. */
async function recreate(snap: Area) {
  const { data: saved } = await axios.post<Area>(API, {
    name: snap.name,
    geojson: snap.geojson,
    color: snap.color ?? DEFAULT_COLOR,
    shape: snap.shape ?? kindOf(snap),
    floor_m: snap.floor_m,
    ceiling_m: snap.ceiling_m,
  });
  areas.value.push(saved);
  redraw(saved);
  return saved;
}

/** Deletes a shape for good. Returns false if the backend could not be reached. */
async function removeNow(id: number) {
  try {
    await axios.delete(`${API}/${id}`);
  } catch (e) {
    offline.value = true;
    console.error(e);
    return false;
  }
  if (selection.value?.kind === "area" && selection.value.id === id) selection.value = null;
  layer()?.entities.removeById(`area-${id}`);
  areas.value = areas.value.filter((a) => a.id !== id);
  return true;
}

/** The two halves of undoing a shape's creation or deletion. */
function lifeOf(shape: Area) {
  const id = shape.id;
  let snap: Area = { ...shape };
  return {
    async end() {
      const now = find(ids.current(id));
      if (!now) return;
      snap = { ...now }; // as it is now, so it comes back with later changes
      await removeNow(now.id);
    },
    async restore() {
      const saved = await recreate(snap);
      ids.renumber(id, saved.id);
    },
  };
}

/** Changes a shape's name or colour, on screen and in the backend. */
function applyUpdate(id: number, patch: { name?: string; color?: string } & Heights) {
  const area = find(id);
  if (!area) return;
  Object.assign(area, patch);
  if (patch.color || patch.ceiling_m !== undefined || patch.floor_m !== undefined || kindOf(area) === "text") {
    redraw(area);
    if (editing?.id === id) beginEdit(id); // re-attach the live shape and handles
  }
  push(id, patch);
}

/** Puts a shape's points back to an earlier or later state. */
function applyGeo(id: number, geojson: ShapeGeo) {
  const area = find(id);
  if (!area) return;
  const selected = editing?.id === id;
  if (selected) endEdit();
  area.geojson = geojson;
  redraw(area);
  if (selected) beginEdit(id);
  push(id, { geojson });
}

/** Keeps a finished drawing, saves it, and goes back to the select tool. */
function keep(kind: ShapeKind, pts: Pt[]) {
  const geojson = toGeo(kind, pts);
  const entityId = `area-new-${++seq}`;
  clearDraft();
  drawShape(entityId, kind, geojson);
  unsaved.value.push({ entityId, shape: kind, geojson });
  selectWhenSaved = entityId;
  tool.value = "select";
  flush();
}

/** Ends an area (three points or more) or a line (two or more). */
function finishDraw() {
  const t = tool.value;
  if (t === "polygon" && draft.length >= 3) keep("polygon", draft);
  else if ((t === "line" || t === "arrow") && draft.length >= 2) keep(t, draft);
}

function addPoint(pos: LonLat, entityId: string | null) {
  const t = tool.value;
  if (t === "text") {
    keep("text", [[pos.lon, pos.lat]]); // one click puts a label down
    return true;
  }
  if (t !== "polygon" && t !== "line" && t !== "arrow") return false;
  const last = `${DRAFT_ID}-${draft.length - 1}`;
  // Clicking the last point again (a double-click), or an area's first
  // point, ends the shape.
  if (entityId === last || (t === "polygon" && draft.length >= 3 && entityId === `${DRAFT_ID}-0`)) {
    finishDraw();
    return true;
  }
  dot(`${DRAFT_ID}-${draft.length}`, Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat));
  draft.push([pos.lon, pos.lat]);
  pointCount.value = draft.length;
  draftInfo.value = draft.length > 1 ? formatDistance(pathLengthM(draft)) : "";
  return true;
}

// ---- reshaping a saved shape --------------------------------------------

/** Sends a change to the backend. The screen already shows it. */
async function push(id: number, patch: Partial<Pick<Area, "name" | "color" | "geojson">> & Heights) {
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

/**
 * Dots to drag. Areas and lines get one on every point and a smaller one
 * mid-way along every side; a rectangle gets its corners; a circle gets
 * four around its edge.
 */
function showHandles() {
  removeHandles();
  if (!editing) return;
  const { kind, pts } = editing;
  if (kind === "text") return; // a label is moved by dragging it
  const at = (i: number) => editing!.pts[i % editing!.pts.length];
  const corner = (i: number) =>
    dot(
      `${EDIT_PREFIX}area-corner-${i}`,
      new Cesium.CallbackProperty(() => editing && Cesium.Cartesian3.fromDegrees(...at(i)), false)
    );
  if (kind === "circle") {
    const quarter = pts.length / 4;
    [0, 1, 2, 3].forEach((q) => corner(Math.round(q * quarter)));
    return;
  }
  pts.forEach((_, i) => corner(i));
  if (kind === "rect") return;
  const sides = isPath(kind) ? pts.length - 1 : pts.length;
  for (let i = 0; i < sides; i++) {
    dot(
      `${EDIT_PREFIX}area-side-${i}`,
      new Cesium.CallbackProperty(() => {
        if (!editing) return undefined;
        const [a, b] = [at(i), at(i + 1)];
        return Cesium.Cartesian3.fromDegrees((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }, false),
      true
    );
  }
}

function beginEdit(id: number) {
  const area = find(id);
  const entity = layer()?.entities.getById(`area-${id}`);
  if (!area || !entity) return;
  const kind = kindOf(area);
  const pts = pointsOf(area.geojson);
  editing = { id, kind, pts, ...(kind === "circle" ? circleOf(pts) : {}) };
  liveMeasure.value = measurements(kind, pts);
  if (kind === "text") {
    entity.position = new Cesium.CallbackProperty(
      () => Cesium.Cartesian3.fromDegrees(...(editing?.pts[0] ?? pts[0])),
      false
    ) as unknown as Cesium.PositionProperty;
    if (entity.label) entity.label.backgroundColor = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString("#3F3F46"));
    return;
  }
  if (!entity.polyline) return;
  // While editing, the shape is read from `editing.pts` every frame, so it
  // follows the pointer during a drag.
  const live = () => editing?.pts ?? pts;
  if (entity.polygon) {
    entity.polygon.hierarchy = new Cesium.CallbackProperty(
      () => new Cesium.PolygonHierarchy(toCartesian(live())),
      false
    );
  }
  entity.polyline.positions = new Cesium.CallbackProperty(() => toCartesian(outline(kind, live())), false);
  showHandles();
}

function endEdit() {
  if (!editing) return;
  const area = find(editing.id);
  editing = null;
  drag = null;
  liveMeasure.value = [];
  removeHandles();
  if (area) redraw(area); // back to a fixed shape
}

/** Keeps the edited shape and stores it. */
function commitShape() {
  if (!editing) return;
  const area = find(editing.id);
  if (!area) return;
  const [id, before] = [area.id, area.geojson];
  const after = toGeo(editing.kind, editing.pts);
  area.geojson = after;
  push(id, { geojson: after });
  record({ undo: () => applyGeo(ids.current(id), before), redo: () => applyGeo(ids.current(id), after) });
}

export function useAreas() {
  if (!hooked) {
    hooked = true;
    const map = useMap();
    map.onLeftClick(addPoint);
    map.onRightClick((_pos, entityId) => {
      if (tool.value === "polygon" || tool.value === "line" || tool.value === "arrow") {
        finishDraw(); // right-click also ends the shape
        return true;
      }
      // Right-click a point of the selected area or line to remove it.
      const corner = entityId?.match(/^edit-area-corner-(\d+)$/);
      if (!editing || !corner) return;
      const least = editing.kind === "polygon" ? 3 : isPath(editing.kind) ? 2 : Infinity;
      if (editing.pts.length > least) {
        editing.pts.splice(+corner[1], 1);
        liveMeasure.value = measurements(editing.kind, editing.pts);
        showHandles();
        commitShape();
        return true;
      }
    });
    map.onDrag({
      start(pos, entityId) {
        const t = tool.value;
        if (t === "rect" || t === "circle") {
          dragFrom = [pos.lon, pos.lat];
          dragTo = null;
          return true;
        }
        if (t !== "select" || !editing || !entityId) return false;
        const corner = entityId.match(/^edit-area-corner-(\d+)$/);
        const side = entityId.match(/^edit-area-side-(\d+)$/);
        if (corner && editing.kind === "rect") {
          // The opposite corner stays where it is.
          drag = { kind: "box", anchor: editing.pts[(+corner[1] + 2) % 4] };
        } else if (corner && editing.kind === "circle") {
          drag = { kind: "radius" };
        } else if (corner) {
          drag = { kind: "corner", index: +corner[1] };
        } else if (side) {
          // Pulling a side dot makes a new point there.
          const index = +side[1] + 1;
          editing.pts.splice(index, 0, [pos.lon, pos.lat]);
          showHandles();
          drag = { kind: "corner", index };
        } else if (entityId === `area-${editing.id}`) {
          drag = { kind: "move", last: pos };
        } else {
          return false;
        }
        return true;
      },
      move(pos) {
        const here: Pt = [pos.lon, pos.lat];
        if (dragFrom) {
          dragTo = here;
          draftInfo.value = measure(tool.value === "circle" ? "circle" : "rect", previewPts());
          return;
        }
        if (!editing || !drag) return;
        if (drag.kind === "corner") {
          editing.pts[drag.index] = here;
        } else if (drag.kind === "box") {
          editing.pts = rectRing(drag.anchor, shiftHeld() ? squareCorner(drag.anchor, here) : here);
        } else if (drag.kind === "radius") {
          editing.radiusM = Math.max(1, distanceM(editing.center!, here));
          editing.pts = circleRing(editing.center!, editing.radiusM);
        } else {
          const [dLon, dLat] = [pos.lon - drag.last.lon, pos.lat - drag.last.lat];
          if (editing.kind === "circle") {
            // Rebuilt around the new centre, so it stays round at any latitude.
            editing.center = [editing.center![0] + dLon, editing.center![1] + dLat];
            editing.pts = circleRing(editing.center, editing.radiusM!);
          } else {
            editing.pts = editing.pts.map(([lon, lat]) => [lon + dLon, lat + dLat]);
          }
          drag.last = pos;
        }
        liveMeasure.value = measurements(editing.kind, editing.pts);
      },
      end(moved) {
        if (dragFrom) {
          // A click without a drag draws nothing; the tool stays ready.
          const kind = tool.value === "circle" ? "circle" : "rect";
          const pts = previewPts();
          dragFrom = dragTo = null;
          draftInfo.value = "";
          if (moved && pts.length) keep(kind, pts);
          return;
        }
        // A point pulled out of a side is kept even if it was not moved further.
        const stored = editing && find(editing.id);
        const added = !!stored && editing!.pts.length !== pointsOf(stored.geojson).length;
        drag = null;
        if (moved || added) commitShape();
      },
    });
    watch(visible, (show) => {
      if (source) source.show = show;
    });
    // The shape being reshaped is drawn again when the reshaping ends.
    watch(opacity, () => {
      areas.value.forEach((a) => a.id !== editing?.id && redraw(a));
      unsaved.value.forEach((u) => drawShape(u.entityId, u.shape, u.geojson, u.color, u.name, volumeOf(u)));
    });
    watch(selection, (sel) => {
      endEdit();
      if (sel?.kind === "area") beginEdit(sel.id);
    });
    // Picking a drawing tool starts a fresh shape; leaving it drops the draft.
    watch(tool, () => {
      clearDraft();
      showDraft();
    });
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

  /** Change a shape's name or colour. */
  function update(id: number, patch: { name?: string; color?: string } & Heights) {
    const area = find(id);
    if (!area) return;
    const before = {
      ...(patch.name !== undefined && { name: area.name }),
      ...(patch.color && { color: area.color ?? DEFAULT_COLOR }),
      ...(patch.floor_m !== undefined && { floor_m: area.floor_m ?? 0 }),
      ...(patch.ceiling_m !== undefined && { ceiling_m: area.ceiling_m ?? 0 }),
    };
    applyUpdate(id, patch);
    record({ undo: () => applyUpdate(ids.current(id), before), redo: () => applyUpdate(ids.current(id), patch) });
  }

  async function remove(id: number) {
    const area = find(id);
    if (!area) return;
    const life = lifeOf(area);
    if (await removeNow(id)) record({ undo: life.restore, redo: life.end });
  }

  /** Adds shapes that were not drawn by hand, as when a file is read. */
  function addMany(shapes: NewShape[]) {
    for (const s of shapes) {
      const geojson = toGeo(s.kind, s.pts);
      const entityId = `area-new-${++seq}`;
      drawShape(entityId, s.kind, geojson, s.color, s.name, volumeOf(s));
      unsaved.value.push({ entityId, shape: s.kind, geojson, name: s.name, color: s.color, floor_m: s.floor_m, ceiling_m: s.ceiling_m });
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
    if (selection.value?.kind === "area") selection.value = null;
    layer()?.entities.removeAll();
    areas.value = [];
    unsaved.value = [];
    clearHistory(); // nothing left for the earlier steps to act on
  }

  /** Select a shape and bring it into view. */
  function goTo(a: Area) {
    tool.value = "select";
    selection.value = { kind: "area", id: a.id };
    const v = useMap().viewer.value;
    const entity = layer()?.entities.getById(`area-${a.id}`);
    if (v && entity) v.flyTo(entity, { duration: 1.2 });
  }

  return {
    areas,
    unsaved,
    pointCount,
    draftInfo,
    liveMeasure,
    offline,
    visible,
    opacity,
    finishDraw,
    load,
    flush,
    update,
    remove,
    removeAll,
    addMany,
    goTo,
  };
}
