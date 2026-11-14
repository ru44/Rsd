import { ref } from "vue";
import axios from "axios";
import * as Cesium from "cesium";
import { API_URL, useMap, type LonLat } from "./useMap";

type Ring = [number, number][];
interface PolygonGeo {
  type: "Polygon";
  coordinates: Ring[];
}
interface Area {
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
const DEFAULT_COLOR = "#007cbf";
const DRAFT_ID = "area-draft";

const areas = ref<Area[]>([]);
const unsaved = ref<Unsaved[]>([]);
const drawing = ref(false);
const pointCount = ref(0);
const error = ref<string | null>(null);
let draft: LonLat[] = [];
let hooked = false;
let seq = 0;

function toCartesian(ring: Ring) {
  return Cesium.Cartesian3.fromDegreesArray(ring.flat());
}

function drawArea(id: string, geo: PolygonGeo, color = DEFAULT_COLOR) {
  const v = useMap().viewer.value;
  if (!v || v.entities.getById(id)) return;
  const ring = geo.coordinates[0];
  const css = Cesium.Color.fromCssColorString(color);
  v.entities.add({
    id,
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(toCartesian(ring)),
      material: css.withAlpha(0.4),
    },
    polyline: {
      positions: toCartesian(ring),
      width: 2,
      material: css,
      clampToGround: true,
    },
  });
}

function erase(id: string) {
  useMap().viewer.value?.entities.removeById(id);
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
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.YELLOW }),
      clampToGround: true,
    },
  });
}

function addPoint(pos: LonLat) {
  if (!drawing.value) return;
  draft.push(pos);
  pointCount.value = draft.length;
}

function finishDraw() {
  if (!drawing.value) return;
  drawing.value = false;
  erase(DRAFT_ID);
  // Fewer than three points is not an area: drop it.
  if (draft.length >= 3) {
    const ring: Ring = draft.map((p) => [p.lon, p.lat]);
    ring.push(ring[0]); // GeoJSON rings repeat the first point at the end
    const geojson: PolygonGeo = { type: "Polygon", coordinates: [ring] };
    const entityId = `area-new-${++seq}`;
    drawArea(entityId, geojson);
    unsaved.value.push({ entityId, geojson });
  }
  draft = [];
  pointCount.value = 0;
}

export function useAreas() {
  if (!hooked) {
    hooked = true;
    const map = useMap();
    map.onLeftClick(addPoint);
    map.onRightClick(finishDraw); // right-click also ends the drawing
  }

  function startDraw() {
    draft = [];
    pointCount.value = 0;
    drawing.value = true;
    showDraft();
  }

  async function load() {
    error.value = null;
    try {
      const { data } = await axios.get(API);
      areas.value = data.data ?? [];
      areas.value.forEach((a) => drawArea(`area-${a.id}`, a.geojson, a.color ?? undefined));
    } catch (e) {
      error.value = "Could not load areas (is the backend running?)";
      console.error(e);
    }
  }

  async function save() {
    error.value = null;
    // Save one at a time so a failure leaves the rest still marked unsaved.
    while (unsaved.value.length) {
      const item = unsaved.value[0];
      try {
        const { data: saved } = await axios.post<Area>(API, {
          name: `Area ${areas.value.length + 1}`,
          geojson: item.geojson,
          color: DEFAULT_COLOR,
        });
        erase(item.entityId);
        drawArea(`area-${saved.id}`, saved.geojson, saved.color ?? undefined);
        areas.value.push(saved);
        unsaved.value.shift();
      } catch (e) {
        error.value = "Could not save areas (is the backend running?)";
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
      error.value = "Could not remove areas (is the backend running?)";
      console.error(e);
      return;
    }
    areas.value.forEach((a) => erase(`area-${a.id}`));
    unsaved.value.forEach((u) => erase(u.entityId));
    areas.value = [];
    unsaved.value = [];
  }

  function zoomTo(a: Area) {
    const v = useMap().viewer.value;
    const entity = v?.entities.getById(`area-${a.id}`);
    if (v && entity) v.flyTo(entity, { duration: 1.2 });
  }

  return {
    areas,
    unsaved,
    drawing,
    pointCount,
    error,
    startDraw,
    finishDraw,
    load,
    save,
    removeAll,
    zoomTo,
  };
}
