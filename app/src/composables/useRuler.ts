import { ref, watch } from "vue";
import * as Cesium from "cesium";
import { useMap, type LonLat } from "./useMap";
import { tool } from "./tool";
import { bearingDeg, distanceM, formatBearing, formatDistance, pathLengthM, type Pt } from "@/lib/shapes";

// The ruler: click points on the map to read the distance between them.
// Nothing is saved; the measurement goes when the tool is put down.

const ID = "ruler";
const SIGNAL = Cesium.Color.fromCssColorString("#F2B441");
const INK = Cesium.Color.fromCssColorString("#09090B");

/** Points clicked so far. */
const count = ref(0);
/** The reading: "Total 12.4 km, last leg 3.1 km at 045°". */
const info = ref("");
/** True once the measurement is ended; the next click starts a new one. */
const done = ref(false);

let pts: Pt[] = [];
let lastClick = 0;
let hooked = false;

const entities = () => useMap().viewer.value?.entities;
const cart = (p: Pt) => Cesium.Cartesian3.fromDegrees(p[0], p[1]);

/** The clicked points, plus the pointer while still measuring. */
function path(): Pt[] {
  const c = useMap().cursor.value;
  return !done.value && pts.length && c ? [...pts, [c.lon, c.lat]] : pts;
}

function read(p: Pt[]) {
  if (p.length < 2) return "";
  const [a, b] = [p[p.length - 2], p[p.length - 1]];
  const leg = `${formatDistance(distanceM(a, b))} at ${formatBearing(bearingDeg(a, b))}`;
  return p.length === 2 ? leg : `Total ${formatDistance(pathLengthM(p))}, last leg ${leg}`;
}

function label(id: string, position: Cesium.Cartesian3 | Cesium.CallbackProperty, text: string | Cesium.CallbackProperty, strong = false) {
  entities()?.add({
    id,
    position: position as unknown as Cesium.PositionProperty,
    label: {
      text: text as unknown as string,
      font: `${strong ? "600 " : ""}12px 'Geist Mono Variable', monospace`,
      fillColor: strong ? INK : SIGNAL,
      showBackground: true,
      backgroundColor: strong ? SIGNAL : INK.withAlpha(0.85),
      backgroundPadding: new Cesium.Cartesian2(6, 4),
      // Clear of the point it belongs to, so the point can still be clicked.
      pixelOffset: new Cesium.Cartesian2(0, strong ? -26 : 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });
}

const SAMPLES = 48;
/**
 * Where to put a leg's length: the middle of the part of the leg that is on
 * screen. Zoomed in on a long leg, its true middle is usually out of view,
 * and the number would be lost.
 */
function visibleMiddle(a: Pt, b: Pt): Cesium.Cartesian3 | undefined {
  const v = useMap().viewer.value;
  if (!v) return undefined;
  const ellipsoid = v.scene.globe.ellipsoid;
  const along = new Cesium.EllipsoidGeodesic(Cesium.Cartographic.fromDegrees(a[0], a[1]), Cesium.Cartographic.fromDegrees(b[0], b[1]), ellipsoid);
  const facing = v.scene.mode === Cesium.SceneMode.SCENE3D ? new Cesium.EllipsoidalOccluder(ellipsoid, v.camera.positionWC) : null;
  const { clientWidth: w, clientHeight: h } = v.scene.canvas;
  const seen: Cesium.Cartesian3[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const at = Cesium.Cartographic.toCartesian(along.interpolateUsingFraction(i / SAMPLES), ellipsoid);
    if (facing && !facing.isPointVisible(at)) continue; // round the back of the globe
    const px = Cesium.SceneTransforms.worldToWindowCoordinates(v.scene, at);
    // Kept clear of the edges, where the panels are.
    if (px && px.x > 60 && px.x < w - 60 && px.y > 60 && px.y < h - 60) seen.push(at);
  }
  return seen.length ? seen[Math.floor(seen.length / 2)] : undefined;
}

/** The length of leg `k` (from point k-1 to point k), shown part-way along it. */
function legLabel(k: number) {
  label(
    `${ID}-leg-${k}`,
    new Cesium.CallbackProperty(() => {
      const p = path();
      return k < p.length ? visibleMiddle(p[k - 1], p[k]) : undefined;
    }, false),
    new Cesium.CallbackProperty(() => {
      const p = path();
      return k < p.length ? formatDistance(distanceM(p[k - 1], p[k])) : "";
    }, false)
  );
}

function clear() {
  const all = entities();
  if (all) for (const e of [...all.values]) if (e.id.startsWith(ID)) all.remove(e);
  pts = [];
  count.value = 0;
  info.value = "";
  done.value = false;
}

/** The line and the running total, both following the pointer. */
function start() {
  entities()?.add({
    id: ID,
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const p = path();
        return p.length > 1 ? Cesium.Cartesian3.fromDegreesArray(p.flat()) : [];
      }, false),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({ color: SIGNAL, dashLength: 12 }),
      clampToGround: true,
    },
  });
  label(
    `${ID}-total`,
    new Cesium.CallbackProperty(() => {
      const p = path();
      return p.length ? cart(p[p.length - 1]) : undefined;
    }, false),
    new Cesium.CallbackProperty(() => {
      const p = path();
      return p.length > 1 ? formatDistance(pathLengthM(p)) : "";
    }, false),
    true
  );
}

function add(pos: LonLat) {
  if (done.value) clear();
  if (!pts.length) start();
  const here: Pt = [pos.lon, pos.lat];
  const i = pts.length;
  pts.push(here);
  count.value = pts.length;
  entities()?.add({
    id: `${ID}-pt-${i}`,
    position: cart(here),
    point: { pixelSize: 9, color: SIGNAL, outlineColor: INK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
  });
  // The leg that starts here gets its own length, which follows the pointer
  // until the next click fixes it.
  legLabel(i + 1);
}

function finish() {
  if (tool.value !== "ruler" || done.value || pts.length < 2) return;
  done.value = true;
  info.value = read(pts);
}

export function useRuler() {
  if (!hooked) {
    hooked = true;
    const map = useMap();
    map.onLeftClick((pos, entityId) => {
      if (tool.value !== "ruler") return false;
      // A double-click (a second click on the point just made) ends it.
      const again = entityId === `${ID}-pt-${pts.length - 1}` || performance.now() - lastClick < 300;
      lastClick = performance.now();
      if (again && !done.value && pts.length) finish();
      else add(pos);
      return true;
    });
    map.onRightClick(() => {
      if (tool.value !== "ruler") return;
      finish();
      return true;
    });
    // While measuring, the reading follows the pointer.
    watch(map.cursor, () => {
      if (tool.value === "ruler" && !done.value && pts.length) info.value = read(path());
    });
    watch(tool, clear);
  }
  return { count, info, done, finish, clear };
}
