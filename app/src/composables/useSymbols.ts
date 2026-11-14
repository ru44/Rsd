// composables/useSymbols.ts
import { ref } from "vue";
import axios from "axios";
import ms from "milsymbol";
import type maplibregl from "maplibre-gl";

interface SymbolRec {
  id: string; // UUID
  name: string; // نضع فيه الـ SIDC
  geojson: string | object;
}

const API = "http://localhost:7000/GIS/symbols";

const symbols = ref<SymbolRec[]>([]);
const placedBatch = ref<
  { sidc: string; imgId: string; coords: [number, number] }[]
>([]); // ← مصفوفة
let getMap: (() => maplibregl.Map | null) | null = null;

/* -------- Helpers -------- */
function sidc2img(sidc: string) {
  const ico = new ms.Symbol(sidc, {
    size: 50,
    outlineWidth: 1,
    symColor: "#007cbf",
  });
  return ico.toDataURL();
}
function extractSidc(name: string) {
  return name.startsWith("sym-") ? name.split("-")[1] : name;
}

export function useSymbols(map?: () => maplibregl.Map | null) {
  if (map) getMap = map;

  /* ---------- أضف رمز إلى الخريطة ---------- */
  function addToMap(sidc: string) {
    const m = getMap?.();
    if (!m) return;

    const center = m.getCenter();
    const imgId = `sym-${sidc}-${Date.now()}`;
    const data64 = sidc2img(sidc);

    const img = new Image();
    img.onload = () => {
      const cvs = document.createElement("canvas");
      cvs.width = img.width;
      cvs.height = img.height;
      cvs.getContext("2d")!.drawImage(img, 0, 0);
      const imgData = cvs
        .getContext("2d")!
        .getImageData(0, 0, img.width, img.height);
      if (!m.hasImage(imgId)) m.addImage(imgId, imgData);

      m.addSource(imgId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [center.lng, center.lat] },
        },
      });
      m.addLayer({
        id: imgId,
        type: "symbol",
        source: imgId,
        layout: {
          "icon-image": imgId,
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.4,
            10,
            0.8,
            14,
            1.3,
            18,
            2,
          ],
        },
      });

      placedBatch.value.push({ sidc, imgId, coords: [center.lng, center.lat] });
    };
    img.src = data64;
  }

  /* ----------------- API ----------------- */
  async function load() {
    try {
      const { data } = await axios.get(API);
      symbols.value = data.data ?? [];

      const m = getMap?.();
      symbols.value.forEach((s) => {
        if (!m) return;
        const layerId = `sym-${s.id}`;
        if (m.getSource(layerId)) return;

        const sidc = extractSidc(s.name);
        const data64 = sidc2img(sidc);

        const img = new Image();
        img.onload = () => {
          const cvs = document.createElement("canvas");
          cvs.width = img.width;
          cvs.height = img.height;
          cvs.getContext("2d")!.drawImage(img, 0, 0);
          const imgData = cvs
            .getContext("2d")!
            .getImageData(0, 0, img.width, img.height);
          if (!m.hasImage(layerId)) m.addImage(layerId, imgData);

          const geo =
            typeof s.geojson === "string" ? JSON.parse(s.geojson) : s.geojson;
          m.addSource(layerId, { type: "geojson", data: geo });
          m.addLayer({
            id: layerId,
            type: "symbol",
            source: layerId,
            layout: {
              "icon-image": layerId,
              "icon-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                5,
                0.4,
                10,
                0.8,
                14,
                1.3,
                18,
                2,
              ],
            },
          });
        };
        img.src = data64;
      });
    } catch (e) {
      console.error("Failed to load symbols:", e);
    }
  }

  async function save() {
    if (!placedBatch.value.length) return;

    try {
      const promises = placedBatch.value.map(async ({ sidc, coords }) => {
        const payload = {
          name: sidc, // نحفظ الـ SIDC
          geojson: { type: "Point", coordinates: coords },
        };
        const { data } = await axios.post(API, payload);
        symbols.value.push({
          id: data.id,
          name: data.name,
          geojson: payload.geojson,
        });
      });

      await Promise.all(promises);
      placedBatch.value = []; // أفرغ المؤقّت
    } catch (e) {
      console.error("Failed to save symbols:", e);
    }
  }

  async function removeAll() {
    try {
      const m = getMap?.();
      await axios.delete(API);
      symbols.value.forEach((s) => {
        const id = `sym-${s.id}`;
        if (m?.getLayer(id)) m.removeLayer(id);
        if (m?.getSource(id)) m.removeSource(id);
      });
      symbols.value = [];
    } catch (e) {
      console.error("Failed to delete symbols:", e);
    }
  }

  return { symbols, placedBatch, addToMap, load, save, removeAll };
}
