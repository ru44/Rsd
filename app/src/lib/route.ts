// Getting from A to B: a straight line worked out here, or a route along
// roads asked from a routing server that speaks the OSRM protocol.
import { pathLengthM, type Pt } from "./shapes";

export interface Route {
  line: Pt[];
  distanceM: number;
  durationS: number;
}

/** "45 min", "2 h 15 min", "3 d 4 h". */
export function formatDuration(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** Straight from stop to stop, at a steady speed. */
export function straightRoute(stops: Pt[], speedKmh: number): Route {
  const distanceM = pathLengthM(stops);
  return { line: stops, distanceM, durationS: distanceM / (speedKmh / 3.6) };
}

/** The address to ask an OSRM server for a driving route through the stops. */
export function osrmUrl(base: string, stops: Pt[]): string {
  const where = stops.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
  return `${base.replace(/\/+$/, "")}/route/v1/driving/${where}?overview=full&geometries=geojson`;
}

/** Reads an OSRM answer. Returns null when the server found no way through. */
export function parseOsrm(answer: unknown): Route | null {
  const r = (answer as { code?: string; routes?: { distance: number; duration: number; geometry?: { coordinates?: Pt[] } }[] }) ?? {};
  const first = r.code === "Ok" ? r.routes?.[0] : undefined;
  const line = first?.geometry?.coordinates;
  if (!first || !Array.isArray(line) || line.length < 2) return null;
  return { line: line.map((p) => [p[0], p[1]]), distanceM: first.distance, durationS: first.duration };
}

/** Keeps at most `most` points, evenly spread, always with both ends. */
export function thin(line: Pt[], most = 200): Pt[] {
  if (line.length <= most) return line;
  const step = (line.length - 1) / (most - 1);
  return Array.from({ length: most }, (_, i) => line[Math.round(i * step)]);
}
