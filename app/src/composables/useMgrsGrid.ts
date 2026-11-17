import { SPRITE_SCALE, textSprite } from "@/lib/textSprite";
import { ref, watch } from "vue";
import * as Cesium from "cesium";
import { useMap } from "./useMap";
import { buildGrid, pickLevel, type Level, type Rect } from "@/lib/mgrsGrid";

const PAPER = Cesium.Color.fromCssColorString("#FAFAFA");
const SIGNAL = Cesium.Color.fromCssColorString("#F2B441");

// Look of each grid level: zones, 100 km, 10 km, 1 km. Like a printed map,
// the grid is one colour and finer lines are simply lighter.
const STYLE: Record<Level, { line: Cesium.Color; text: Cesium.Color; width: number; font: string }> = {
  0: { line: SIGNAL.withAlpha(0.7), text: SIGNAL, width: 1.2, font: "600 13px 'Geist Variable', sans-serif" },
  1: { line: PAPER.withAlpha(0.8), text: PAPER, width: 1.1, font: "600 12px 'Geist Variable', sans-serif" },
  2: { line: PAPER.withAlpha(0.55), text: PAPER, width: 1, font: "12px 'Geist Variable', sans-serif" },
  3: { line: PAPER.withAlpha(0.35), text: PAPER, width: 1, font: "11px 'Geist Variable', sans-serif" },
};
const REDRAW_EVERY_MS = 150;
/** Eye altitude (globe) or view width (flat map) under which zone names fit. */
const ZONE_NAMES_BELOW_M = 13_000_000;

const visible = ref(true);
let lines: Cesium.PolylineCollection | null = null;
let labels: Cesium.BillboardCollection | null = null;
let fontsReady = false;
let lastDraw = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

const WORLD: Rect = { west: -180, south: -90, east: 180, north: 90 };

/** Splits a west..east span that runs past the date line into valid pieces. */
function wrap(west: number, south: number, east: number, north: number): Rect[] {
  if (east - west >= 360) return [{ ...WORLD, south, north }];
  if (west < -180) return [
    { west: west + 360, south, east: 180, north },
    { west: -180, south, east, north },
  ];
  if (east > 180) return [
    { west, south, east: 180, north },
    { west: -180, south, east: east - 360, north },
  ];
  return [{ west, south, east, north }];
}

/** The visible part of the map in degrees, split in two at the date line. */
function viewRects(v: Cesium.Viewer): Rect[] {
  const deg = Cesium.Math.toDegrees;

  if (v.scene.mode === Cesium.SceneMode.SCENE2D) {
    // Worked out from the flat camera directly. Cesium's own
    // computeViewRectangle picks the wrong side of the world in 2D once the
    // view is wider than 180 degrees.
    const f = v.camera.frustum as Cesium.OrthographicOffCenterFrustum;
    const radius = v.scene.globe.ellipsoid.maximumRadius;
    const centre = v.camera.positionCartographic;
    const halfW = deg((f.right - f.left) / 2 / radius);
    const halfH = deg((f.top - f.bottom) / 2 / radius);
    const lon = deg(centre.longitude);
    const lat = deg(centre.latitude);
    const south = Math.max(-90, lat - halfH);
    const north = Math.min(90, lat + halfH);
    if (south >= north) return [];
    return wrap(lon - halfW, south, lon + halfW, north);
  }

  const r = v.camera.computeViewRectangle(v.scene.globe.ellipsoid);
  if (!r) return []; // looking away from the globe
  const [west, east] = [deg(r.west), deg(r.east)];
  // Cesium reports a date-line view as west > east.
  return wrap(west, deg(r.south), west <= east ? east : east + 360, deg(r.north));
}

function draw() {
  const v = useMap().viewer.value;
  if (!v || !lines || !labels || !fontsReady) return;
  lastDraw = Date.now();
  lines.removeAll();
  labels.removeAll();
  if (!visible.value || v.scene.mode === Cesium.SceneMode.MORPHING) return;

  const rects = viewRects(v);
  if (rects.length === 0) return;
  // Both halves of a date-line view use the same level of detail.
  const level = Math.min(...rects.map((r) => pickLevel(r))) as Level;
  // Zone names depend on how big a zone is on screen, which the camera knows
  // better than the view rectangle does (on the globe it reaches the horizon).
  const metres = v.scene.mode === Cesium.SceneMode.SCENE2D
    ? v.camera.getMagnitude()
    : v.camera.positionCartographic.height;
  const zoneNames = metres < ZONE_NAMES_BELOW_M;
  // On the globe, names near the edge are squeezed into a pile. They are also
  // the farthest from the eye, so a distance cut-off drops exactly those.
  const nearOnly = v.scene.mode === Cesium.SceneMode.SCENE3D
    ? new Cesium.DistanceDisplayCondition(0, metres * 1.45)
    : undefined;
  for (const rect of rects) {
    const grid = buildGrid(rect, level, zoneNames);
    for (const line of grid.lines) {
      lines.add({
        positions: Cesium.Cartesian3.fromDegreesArray(line.points.flat()),
        width: STYLE[line.level].width,
        // One material per line: Cesium destroys a line's material when the
        // line is removed, so a shared one would break on the next redraw.
        material: Cesium.Material.fromType("Color", { color: STYLE[line.level].line }),
      });
    }
    for (const label of grid.labels) {
      const style = STYLE[label.level];
      labels.add({
        position: Cesium.Cartesian3.fromDegrees(label.lon, label.lat),
        image: textSprite(label.text, { font: style.font, color: style.text.toCssColorString(), halo: "rgba(9, 9, 11, 0.85)" }),
        scale: 1 / SPRITE_SCALE,
        distanceDisplayCondition: label.level === 0 ? nearOnly : undefined,
      });
    }
  }
}

/** Redraw soon, but not more often than REDRAW_EVERY_MS while the map moves. */
function schedule() {
  if (pending) return;
  const wait = Math.max(0, REDRAW_EVERY_MS - (Date.now() - lastDraw));
  pending = setTimeout(() => {
    pending = null;
    draw();
  }, wait);
}

export function useMgrsGrid() {
  /** Call once, after the map exists. */
  function attach() {
    const v = useMap().viewer.value;
    if (!v || lines) return;
    lines = v.scene.primitives.add(new Cesium.PolylineCollection());
    labels = v.scene.primitives.add(new Cesium.BillboardCollection());

    v.camera.changed.addEventListener(schedule);
    v.camera.moveEnd.addEventListener(schedule);
    v.scene.morphComplete.addEventListener(schedule);
    watch(visible, draw);
    // Cesium caches label glyphs, so wait for the font or the first labels
    // would be stuck in the fallback face.
    Promise.all([document.fonts.load("600 13px 'Geist Variable'"), document.fonts.load("12px 'Geist Variable'")])
      .catch(() => {})
      .then(() => {
        fontsReady = true;
        draw();
      });
  }

  return { visible, attach };
}
