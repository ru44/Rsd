import { SPRITE_SCALE, textSprite } from "@/lib/textSprite";
import { ref, watch } from "vue";
import * as Cesium from "cesium";
import { useMap, type LonLat } from "./useMap";
import { tool } from "./tool";
import { bearingDeg, distanceM, formatBearing, formatDistance, pathLengthM, type Pt } from "@/lib/shapes";

// The ruler: click points on the map to read the distance between them.
// Nothing is saved; the measurement goes when the tool is put down.

const ID = "ruler";
const EMPTY = document.createElement("canvas");
EMPTY.width = EMPTY.height = 1;
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
  // An empty reading (one point so far) shows nothing at all.
  const picture = (words: string) =>
    words
      ? textSprite(words, {
          font: `${strong ? "600 " : ""}12px 'Geist Mono Variable', monospace`,
          color: strong ? "#09090B" : "#F2B441",
          background: strong ? "#F2B441" : "rgba(9, 9, 11, 0.85)",
          padX: 6,
          padY: 4,
        })
      : EMPTY;
  entities()?.add({
    id,
    position: position as unknown as Cesium.PositionProperty,
    billboard: {
      image: (typeof text === "string" ? picture(text) : new Cesium.CallbackProperty(() => picture(text.getValue(Cesium.JulianDate.now())), false)) as unknown as HTMLCanvasElement,
      scale: 1 / SPRITE_SCALE,
      // Clear of the point it belongs to, so the point can still be clicked.
      pixelOffset: new Cesium.Cartesian2(0, strong ? -26 : 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
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
    point: { pixelSize: 9, color: SIGNAL, outlineColor: INK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
  // Each finished leg carries its own length, once there is more than one.
  if (i >= 2) {
    for (let k = i === 2 ? 1 : i; k <= i; k++) {
      const [a, b] = [pts[k - 1], pts[k]];
      label(`${ID}-leg-${k}`, cart([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), formatDistance(distanceM(a, b)));
    }
  }
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
