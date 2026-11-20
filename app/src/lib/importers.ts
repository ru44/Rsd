// Reads GeoJSON, KML and KMZ files into shapes and symbols for the map.
// Files written by this app come back exactly as they were; files from other
// tools are read as far as they fit: polygons, lines and named points.
import { strFromU8, unzipSync } from "fflate";
import type { Pt, ShapeKind } from "./shapes";

export interface ImportedShape {
  kind: ShapeKind;
  pts: Pt[];
  name?: string;
  color?: string;
  floor_m?: number;
  ceiling_m?: number;
}
export interface ImportedSymbol {
  sidc: string;
  name: string;
  coords: Pt;
}
export interface Imported {
  shapes: ImportedShape[];
  symbols: ImportedSymbol[];
  /** Things in the file that could not be shown, e.g. shapes with no points. */
  skipped: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
const isPt = (p: unknown): p is Pt =>
  Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number" && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const toPts = (list: unknown): Pt[] => (Array.isArray(list) ? list.filter(isPt).map((p) => [p[0], p[1]] as Pt) : []);

/** A ring without its repeated last point. */
function openRing(ring: Pt[]): Pt[] {
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return ring.length > 1 && a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
}

interface Props {
  name?: string;
  color?: string;
  kind?: string;
  sidc?: string;
  floor_m?: number;
  ceiling_m?: number;
}

/** Sorts one geometry into the result. `type` and `coordinates` are as in GeoJSON. */
function take(out: Imported, type: string, coordinates: unknown, props: Props) {
  const name = props.name?.trim() || undefined;
  const color = props.color && HEX.test(props.color) ? props.color : undefined;
  const list = Array.isArray(coordinates) ? coordinates : [];
  if (type === "Point") {
    if (!isPt(coordinates)) return void out.skipped++;
    const coords: Pt = [coordinates[0], coordinates[1]];
    // A point with a symbol code is a symbol; any other named point becomes a label.
    if (props.sidc) out.symbols.push({ sidc: props.sidc, name: name ?? "Symbol", coords });
    else out.shapes.push({ kind: "text", pts: [coords], name: name ?? "Point", color });
  } else if (type === "LineString") {
    const pts = toPts(coordinates);
    if (pts.length < 2) return void out.skipped++;
    out.shapes.push({ kind: props.kind === "arrow" ? "arrow" : "line", pts, name, color });
  } else if (type === "Polygon") {
    const pts = openRing(toPts(list[0]));
    if (pts.length < 3) return void out.skipped++;
    const drawnAs = props.kind === "rect" && pts.length === 4 ? "rect" : props.kind === "circle" && pts.length >= 8 ? "circle" : "polygon";
    const tall = (props.ceiling_m ?? 0) > (props.floor_m ?? 0) ? { floor_m: props.floor_m ?? 0, ceiling_m: props.ceiling_m } : {};
    out.shapes.push({ kind: drawnAs, pts, name, color, ...tall });
  } else if (type === "MultiPoint" || type === "MultiLineString" || type === "MultiPolygon") {
    for (const part of list) take(out, type.slice(5), part, props);
  } else if (type === "GeometryCollection") {
    out.skipped++;
  } else {
    out.skipped++;
  }
}

export function fromGeoJson(text: string): Imported {
  const out: Imported = { shapes: [], symbols: [], skipped: 0 };
  const root = JSON.parse(text);
  const features: unknown[] =
    root?.type === "FeatureCollection" ? root.features ?? [] : root?.type === "Feature" ? [root] : root?.type ? [{ geometry: root }] : [];
  for (const f of features as { geometry?: { type?: string; coordinates?: unknown; geometries?: unknown[] }; properties?: Record<string, unknown> }[]) {
    const p = f?.properties ?? {};
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const props: Props = {
      name: str(p.name) ?? str(p.title),
      color: str(p.color) ?? str(p.stroke),
      kind: str(p.kind),
      sidc: str(p.sidc),
      floor_m: typeof p.floor_m === "number" ? p.floor_m : undefined,
      ceiling_m: typeof p.ceiling_m === "number" ? p.ceiling_m : undefined,
    };
    const g = f?.geometry;
    if (!g?.type) out.skipped++;
    else if (g.type === "GeometryCollection") {
      for (const part of (g.geometries ?? []) as { type: string; coordinates: unknown }[]) take(out, part.type, part.coordinates, props);
    } else take(out, g.type, g.coordinates, props);
  }
  return out;
}

/** KML writes points as "lon,lat,height" separated by spaces. */
function kmlPts(el: Element | null | undefined): Pt[] {
  const text = el?.textContent ?? "";
  return toPts(text.trim().split(/\s+/).map((t) => t.split(",").slice(0, 2).map(Number)));
}
/** KML colours are opacity, blue, green, red. */
function kmlHex(text: string | null | undefined) {
  const m = text?.trim().match(/^[0-9a-f]{2}([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? `#${m[3]}${m[2]}${m[1]}`.toUpperCase() : undefined;
}

export function fromKml(text: string): Imported {
  const out: Imported = { shapes: [], symbols: [], skipped: 0 };
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("not a KML file");
  const first = (el: Element, tag: string) => el.getElementsByTagName(tag)[0];
  for (const pm of Array.from(doc.getElementsByTagName("Placemark"))) {
    const sidc = Array.from(pm.getElementsByTagName("Data")).find((d) => d.getAttribute("name") === "sidc");
    const props: Props = {
      name: first(pm, "name")?.textContent ?? undefined,
      color: kmlHex(first(pm, "LineStyle") && first(first(pm, "LineStyle"), "color")?.textContent),
      sidc: sidc ? first(sidc, "value")?.textContent?.trim() || undefined : undefined,
    };
    const before = out.shapes.length + out.symbols.length + out.skipped;
    for (const el of Array.from(pm.getElementsByTagName("Point"))) take(out, "Point", kmlPts(first(el, "coordinates"))[0], props);
    for (const el of Array.from(pm.getElementsByTagName("LineString"))) take(out, "LineString", kmlPts(first(el, "coordinates")), props);
    for (const el of Array.from(pm.getElementsByTagName("Polygon"))) {
      const outer = first(el, "outerBoundaryIs") ?? el;
      take(out, "Polygon", [kmlPts(first(outer, "coordinates"))], props);
    }
    if (out.shapes.length + out.symbols.length + out.skipped === before) out.skipped++; // a kind of placemark not read here
  }
  return out;
}

/** Picks the reader from the file's name, or from how its text begins. */
export function readMapFile(name: string, text: string): Imported {
  const looksXml = /\.kml$/i.test(name) || text.trimStart().startsWith("<");
  return looksXml ? fromKml(text) : fromGeoJson(text);
}

/** A zip file (and so a KMZ) begins with these four bytes. */
const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * A KMZ is a zip with the KML inside, usually doc.kml at the top, next to the
 * pictures it uses. The pictures are left out.
 */
function kmlInKmz(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => /\.kml$/i.test(f.name) });
  const names = Object.keys(files).sort((a, b) => a.split("/").length - b.split("/").length);
  const name = names.find((n) => n.toLowerCase() === "doc.kml") ?? names[0];
  if (!name) throw new Error("No KML file inside the KMZ");
  return strFromU8(files[name]);
}

/** Like readMapFile, for a file read as bytes, so KMZ can be read too. */
export function readMapBytes(name: string, bytes: Uint8Array): Imported {
  if (isZip(bytes)) return fromKml(kmlInKmz(bytes));
  return readMapFile(name, strFromU8(bytes));
}
