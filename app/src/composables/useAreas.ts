import { ref } from "vue";
import axios from "axios";
import * as turf from "@turf/turf";
import type maplibregl from "maplibre-gl";

interface Area {
  id: string;
  name: string;
  geojson: string | object;
}

const API = "http://localhost:7000/api/areas";

const areas = ref<Area[]>([]);
const drawn = ref<any[]>([]);
let getMap: (() => maplibregl.Map | null) | null = null;
let getDraw: (() => any | null) | null = null;

export function registerDrawListener(
  mapAcc: () => maplibregl.Map | null,
  drawAcc: () => any | null
) {
  getMap = mapAcc;
  getDraw = drawAcc;

  const map = mapAcc();
  if (map && !map.__areas_hooked) {
    map.__areas_hooked = true; 
    map.on("draw.create", (e: any) => {
      drawn.value.push(...e.features);
    });
  }
}

export function useAreas() {
  async function load() {
    try {
      const { data } = await axios.get(API + "/");

      areas.value = (data.data ?? []).map((a: any) => ({
        ...a,
        geojson:
          typeof a.geojson === "string" ? JSON.parse(a.geojson) : a.geojson,
      }));

      areas.value.forEach(addLayer);
    } catch (e) {
      console.error("Failed to load areas:", e);
    }
  }
  async function save() {
    if (!drawn.value.length) return;

    try {
      const promises = drawn.value.map((feature, idx) => {
        const name = `Area ${areas.value.length + idx + 1}`;
        return axios
          .post(API + "/create", {
            name,
            geojson: feature,
          })
          .then(({ data }) => {
            const item = {
              id: data.id,
              name: data.name,
              geojson: feature,
            };
            areas.value.push(item);
            addLayer(item);
          });
      });

      await Promise.all(promises);

      getDraw?.()?.deleteAll();
      drawn.value = [];
    } catch (e) {
      console.error("Failed to save areas:", e);
    }
  }

  async function removeAll() {
    try {
      await axios.delete(API);
      areas.value.forEach(removeLayer);
      areas.value = [];
    } catch (e) {
      console.error("Failed to delete areas:", e);
    }
  }

  function zoomTo(a: Area) {
    const geo =
      typeof a.geojson === "string" ? JSON.parse(a.geojson) : a.geojson;
    const bbox = turf.bbox(geo);
    getMap?.()!.fitBounds(bbox, { padding: 300 });
  }

  function addLayer(a: Area) {
    const m = getMap?.();
    if (!m) return;
    const id = `area-${a.id}`;
    if (m.getSource(id)) return;

    const geo =
      typeof a.geojson === "string" ? JSON.parse(a.geojson) : a.geojson;
    m.addSource(id, { type: "geojson", data: geo });
    m.addLayer({
      id,
      type: "fill",
      source: id,
      paint: { "fill-color": "#007cbf", "fill-opacity": 0.5 },
    });
  }

  function removeLayer(a: Area) {
    const m = getMap?.();
    if (!m) return;
    const id = `area-${a.id}`;
    if (m.getLayer(id)) m.removeLayer(id);
    if (m.getSource(id)) m.removeSource(id);
  }

  return { areas, drawn, load, save, removeAll, zoomTo };
}
