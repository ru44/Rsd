import { ref } from "vue";
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";

const map = ref<maplibregl.Map | null>(null);
const draw = ref<MapboxDraw | null>(null);
const currentZoom = ref(10);

export function useMap() {
  async function init(containerId = "map") {
    if (map.value) return;

    const res = await fetch("/style.json");
    const base = await res.json();

    base.sources.openmaptiles.tiles = [
      "http://localhost:7000/api/tiles/{z}/{x}/{y}",
    ];

    map.value = new maplibregl.Map({
      container: containerId,
      style: base,
      center: [39.2056453, 21.5891922],
      zoom: currentZoom.value,
      attributionControl: false,
    });

    draw.value = new MapboxDraw({ displayControlsDefault: false });
    map.value.addControl(draw.value);

    draw.value.options.styles.forEach((s) => {
      if (s.id?.includes("gl-draw-line") && s.paint?.["line-dasharray"]) {
        s.paint["line-dasharray"] = ["literal", [2, 2]];
      }
    });

    map.value.on(
      "zoom",
      () => (currentZoom.value = +map.value!.getZoom().toFixed(2))
    );
  }

  return { map, draw, currentZoom, init };
}
