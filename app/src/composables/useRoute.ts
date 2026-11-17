import { SPRITE_SCALE, textSpriteUrl } from "@/lib/textSprite";
import { ref, shallowRef, watch } from "vue";
import * as Cesium from "cesium";
import { ONLINE_MAPS, useMap } from "./useMap";
import { useAreas } from "./useAreas";
import { tool } from "./tool";
import { osrmUrl, parseOsrm, straightRoute, thin, type Route } from "@/lib/route";
import type { Pt } from "@/lib/shapes";

// The route tool: click a start, a destination and any stops in between.
// A straight route is worked out here. A route along roads is asked from a
// routing server, and only when the person chooses "By road".

/** Any server that speaks the OSRM protocol. Point this at your own to stay offline. */
export const ROUTING_URL: string = import.meta.env.VITE_ROUTING_URL ?? "https://router.project-osrm.org";
/** The default server is on the internet, so it goes when online maps are turned off. */
export const ROAD_ROUTES = ONLINE_MAPS || !!import.meta.env.VITE_ROUTING_URL;
export const ROUTING_HOST = new URL(ROUTING_URL, location.href).host;

export const SPEEDS = [
  { label: "On foot", kmh: 5 },
  { label: "Vehicle", kmh: 60 },
  { label: "Aircraft", kmh: 250 },
];

const ID = "route";
const LINE = Cesium.Color.fromCssColorString("#60A5FA");
const INK = Cesium.Color.fromCssColorString("#09090B");
const PAPER = Cesium.Color.fromCssColorString("#FAFAFA");

const stops = ref<Pt[]>([]);
const mode = ref<"straight" | "road">("straight");
const speedKmh = ref(60);
const route = shallowRef<Route | null>(null);
const loading = ref(false);
/** Why there is no road route, in words for the person. */
const problem = ref("");

let hooked = false;
let asked = 0;

const entities = () => useMap().viewer.value?.entities;
const letter = (i: number) => String.fromCharCode(65 + (i % 26));

function draw() {
  const all = entities();
  if (!all) return;
  for (const e of [...all.values]) if (e.id.startsWith(ID)) all.remove(e);
  stops.value.forEach((p, i) =>
    all.add({
      id: `${ID}-stop-${i}`,
      position: Cesium.Cartesian3.fromDegrees(p[0], p[1]),
      point: { pixelSize: 20, color: LINE, outlineColor: INK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      billboard: {
        image: textSpriteUrl(letter(i), { font: "600 12px 'Geist Variable', sans-serif", color: "#09090B" }),
        scale: 1 / SPRITE_SCALE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  );
  const line = route.value?.line;
  if (line && line.length > 1) {
    all.add({
      id: ID,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(line.flat()),
        width: 5,
        material: new Cesium.PolylineOutlineMaterialProperty({ color: LINE, outlineColor: PAPER, outlineWidth: 1.5 }),
        clampToGround: true,
      },
    });
  }
}

async function work() {
  const mine = ++asked; // a later request makes this one's answer stale
  problem.value = "";
  loading.value = false;
  if (stops.value.length < 2) {
    route.value = null;
  } else if (mode.value === "straight") {
    route.value = straightRoute(stops.value, speedKmh.value);
  } else {
    route.value = null;
    loading.value = true;
    let found: Route | null = null;
    let failed = false;
    try {
      const res = await fetch(osrmUrl(ROUTING_URL, stops.value));
      found = parseOsrm(await res.json());
    } catch {
      failed = true;
    }
    if (mine !== asked) return;
    loading.value = false;
    route.value = found;
    if (failed) problem.value = `The routing server (${ROUTING_HOST}) could not be reached.`;
    else if (!found) problem.value = "No road route was found between these points. Try points nearer to a road.";
  }
  draw();
}

function clear() {
  stops.value = [];
  work();
}

export function useRoute() {
  if (!hooked) {
    hooked = true;
    useMap().onLeftClick((pos) => {
      if (tool.value !== "route") return false;
      stops.value = [...stops.value, [pos.lon, pos.lat]];
      work();
      return true;
    });
    watch([mode, speedKmh], work);
    watch(tool, clear);
  }

  /** Takes the last stop away again. */
  function back() {
    stops.value = stops.value.slice(0, -1);
    work();
  }

  /** Keeps the route on the map as an ordinary line. */
  function saveAsLine() {
    const r = route.value;
    if (!r) return;
    const n = stops.value.length;
    const name = `Route ${letter(0)} to ${letter(n - 1)}${mode.value === "road" ? ", by road" : ""}`;
    const pts = thin(r.line);
    tool.value = "select"; // also clears the route
    useAreas().addMany([{ kind: "line", pts, name, color: "#7FD4F5" }]);
  }

  return { stops, mode, speedKmh, route, loading, problem, clear, back, saveAsLine };
}
