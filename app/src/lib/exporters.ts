// Writes what is on the map as files other mapping tools can open.
import { kindOf, type Pt, type ShapeGeo } from "./shapes";

export interface ExportShape {
  id: number;
  name: string;
  color?: string | null;
  shape?: string | null;
  geojson: ShapeGeo;
}
export interface ExportSymbol {
  id: number;
  name: string;
  sidc: string;
  geojson: { type: "Point"; coordinates: Pt };
}

const DEFAULT_COLOR = "#7FD4F5";

/** GeoJSON: one feature per shape and symbol. Symbols carry their code as `sidc`. */
export function toGeoJson(shapes: ExportShape[], symbols: ExportSymbol[]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      ...shapes.map((s) => ({
        type: "Feature" as const,
        properties: { kind: kindOf(s), name: s.name, color: s.color ?? DEFAULT_COLOR },
        geometry: s.geojson,
      })),
      ...symbols.map((s) => ({
        type: "Feature" as const,
        properties: { kind: "symbol", name: s.name, sidc: s.sidc },
        geometry: s.geojson,
      })),
    ],
  };
}

const escapeXml = (text: string) =>
  text.replace(/[<>&'"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch]!);

/** KML writes colours backwards: opacity, blue, green, red. */
function kmlColor(hex: string, opacity: string) {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? `${opacity}${m[3]}${m[2]}${m[1]}`.toLowerCase() : `${opacity}f5d47f`;
}

const kmlCoords = (pts: Pt[]) => pts.map(([lon, lat]) => `${lon},${lat},0`).join(" ");

/** KML, for Google Earth, ATAK and the like. */
export function toKml(shapes: ExportShape[], symbols: ExportSymbol[]) {
  const placemarks = [
    ...shapes.map((s) => {
      const color = s.color ?? DEFAULT_COLOR;
      const geometry =
        s.geojson.type === "LineString"
          ? `<LineString><tessellate>1</tessellate><coordinates>${kmlCoords(s.geojson.coordinates)}</coordinates></LineString>`
          : `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${kmlCoords(s.geojson.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      return (
        `<Placemark><name>${escapeXml(s.name)}</name>` +
        `<Style><LineStyle><color>${kmlColor(color, "ff")}</color><width>3</width></LineStyle>` +
        `<PolyStyle><color>${kmlColor(color, "59")}</color></PolyStyle></Style>${geometry}</Placemark>`
      );
    }),
    ...symbols.map(
      (s) =>
        `<Placemark><name>${escapeXml(s.name)}</name>` +
        `<ExtendedData><Data name="sidc"><value>${escapeXml(s.sidc)}</value></Data></ExtendedData>` +
        `<Point><coordinates>${kmlCoords([s.geojson.coordinates])}</coordinates></Point></Placemark>`
    ),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>rsGIS export</name>\n` +
    placemarks.join("\n") +
    `\n</Document></kml>\n`
  );
}
