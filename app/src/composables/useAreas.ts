import { ref, watch } from "vue";
import axios from "axios";
import * as Cesium from "cesium";
import { API_URL, useMap, type LonLat } from "./useMap";

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
const AREA_COLOR = "#7FD4F5";
const DRAFT_ID = "area-draft";

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

function toCartesian(ring: Ring) {
  return Cesium.Cartesian3.fromDegreesArray(ring.flat());
}

function drawArea(id: string, geo: PolygonGeo, color = AREA_COLOR) {
  const entities = layer()?.entities;
  if (!entities || entities.getById(id)) return;
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
        color: Cesium.Color.fromCssColorString(AREA_COLOR),
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
  if (!drawing.value) return;
  // Mark each corner so the first clicks are visible before there is a line.
  useMap().viewer.value?.entities.add({
    id: `${DRAFT_ID}-${draft.length}`,
    position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
    point: {
      pixelSize: 9,
      color: Cesium.Color.fromCssColorString(AREA_COLOR),
      outlineColor: Cesium.Color.fromCssColorString("#14202B"),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  draft.push(pos);
  pointCount.value = draft.length;
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
        color: AREA_COLOR,
      });
      layer()?.entities.removeById(item.entityId);
      drawArea(`area-${saved.id}`, saved.geojson, saved.color ?? undefined);
      areas.value.push(saved);
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
  const ring: Ring = draft.map((p) => [p.lon, p.lat]);
  ring.push(ring[0]); // GeoJSON rings repeat the first point at the end
  const geojson: PolygonGeo = { type: "Polygon", coordinates: [ring] };
  const entityId = `area-new-${++seq}`;
  endDraft();
  drawArea(entityId, geojson);
  unsaved.value.push({ entityId, geojson });
  flush();
}

export function useAreas() {
  if (!hooked) {
    hooked = true;
    const map = useMap();
    map.onLeftClick(addPoint);
    map.onRightClick(finishDraw); // right-click also closes the shape
    watch(visible, (show) => {
      if (source) source.show = show;
    });
  }

  function startDraw() {
    draft = [];
    pointCount.value = 0;
    drawing.value = true;
    showDraft();
  }

  async function load() {
    try {
      const { data } = await axios.get(API);
      areas.value = data.data ?? [];
      areas.value.forEach((a) => drawArea(`area-${a.id}`, a.geojson, a.color ?? undefined));
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
    areas.value = [];
    unsaved.value = [];
  }

  function zoomTo(a: Area) {
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
    removeAll,
    zoomTo,
  };
}
