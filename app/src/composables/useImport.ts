// Bringing shapes and symbols in from a file, whether it was chosen in the
// Layers panel or dropped onto the map.
import { ref } from "vue";
import * as Cesium from "cesium";
import { readMapBytes } from "@/lib/importers";
import { useMap } from "./useMap";
import { useAreas } from "./useAreas";
import { useSymbols } from "./useSymbols";

/** File types the import accepts, for a file picker. */
export const IMPORT_ACCEPT = ".geojson,.json,.kml,.kmz,application/geo+json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz";

/** What the last file brought in, or why it could not be read. */
const importNote = ref("");
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Adds what is in the file to the map, saves it, and brings it into view. */
async function importFile(file: File) {
  const { viewer } = useMap();
  let found;
  try {
    found = readMapBytes(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch {
    importNote.value = `${file.name} could not be read. Use a GeoJSON, KML or KMZ file.`;
    return;
  }
  const { shapes, symbols: syms, skipped } = found;
  if (!shapes.length && !syms.length) {
    importNote.value = `Nothing in ${file.name} can be shown on the map.`;
    return;
  }
  await Promise.all([
    useAreas().addMany(shapes),
    useSymbols().addMany(syms.map((s) => ({ ...s, coords: [s.coords[0], s.coords[1]] }))),
  ]);
  importNote.value =
    `Added ${[shapes.length && count(shapes.length, "shape"), syms.length && count(syms.length, "symbol")].filter(Boolean).join(" and ")}` +
    (skipped ? `; ${count(skipped, "item")} left out.` : ".");
  // Bring everything that was added into view.
  const all = [...shapes.flatMap((s) => s.pts), ...syms.map((s) => s.coords)];
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const pad = Math.max(0.05, (Math.max(...lons) - Math.min(...lons)) * 0.2, (Math.max(...lats) - Math.min(...lats)) * 0.2);
  viewer.value?.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(
      Math.max(-180, Math.min(...lons) - pad),
      Math.max(-90, Math.min(...lats) - pad),
      Math.min(180, Math.max(...lons) + pad),
      Math.min(90, Math.max(...lats) + pad)
    ),
    duration: 1.2,
  });
}

export function useImport() {
  return { importNote, importFile };
}
