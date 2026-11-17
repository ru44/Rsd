// Geometry for the drawing tools: building rectangles and circles, and
// measuring what was drawn. Points are [longitude, latitude] in degrees.
// The Earth is treated as a sphere, which is within 0.5% of the true figure:
// fine for a readout, not for survey work.

export type Pt = [number, number];
export type ShapeKind = "polygon" | "rect" | "circle" | "line" | "arrow" | "text";
/** Lines and arrows: a path with two ends, not a closed outline. */
export const isPath = (kind: ShapeKind) => kind === "line" || kind === "arrow";

const R = 6371008.8; // mean Earth radius in metres
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceM(a: Pt, b: Pt): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point reached by going `metres` from `from` on a compass bearing. */
export function destination(from: Pt, bearingDeg: number, metres: number): Pt {
  const d = metres / R;
  const b = rad(bearingDeg);
  const lat1 = rad(from[1]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 =
    rad(from[0]) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [((deg(lon2) + 540) % 360) - 180, deg(lat2)];
}

/** Corners of a circle drawn as a many-sided shape. The first corner is due east. */
export function circleRing(center: Pt, radiusM: number, sides = 72): Pt[] {
  return Array.from({ length: sides }, (_, i) => destination(center, 90 + (i * 360) / sides, radiusM));
}

/** Recovers the centre and radius of a circle from its corners. */
export function circleOf(ring: Pt[]): { center: Pt; radiusM: number } {
  // Average the corners as directions from the Earth's centre, so the result
  // is right even for large circles and near the poles.
  let [x, y, z] = [0, 0, 0];
  for (const [lon, lat] of ring) {
    x += Math.cos(rad(lat)) * Math.cos(rad(lon));
    y += Math.cos(rad(lat)) * Math.sin(rad(lon));
    z += Math.sin(rad(lat));
  }
  const center: Pt = [deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.hypot(x, y)))];
  const radiusM = ring.reduce((sum, p) => sum + distanceM(center, p), 0) / ring.length;
  return { center, radiusM };
}

/** The four corners of a box with sides along the meridians and parallels. */
export function rectRing(a: Pt, b: Pt): Pt[] {
  return [a, [b[0], a[1]], b, [a[0], b[1]]];
}

/** Moves `b` so the box from `a` to `b` is square on the ground. */
export function squareCorner(a: Pt, b: Pt): Pt {
  const shrink = Math.max(0.01, Math.cos(rad(a[1]))); // a degree of longitude is shorter than one of latitude
  const side = Math.max(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0]) * shrink);
  return [a[0] + (Math.sign(b[0] - a[0]) || 1) * (side / shrink), a[1] + (Math.sign(b[1] - a[1]) || 1) * side];
}

/** Width and height of a box in metres, measured through its middle. */
export function rectSize(ring: Pt[]): { widthM: number; heightM: number } {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const mid = (s + n) / 2;
  return { widthM: distanceM([w, mid], [e, mid]), heightM: distanceM([w, s], [w, n]) };
}

/** Length of a path; with `closed`, the side back to the start is included. */
export function pathLengthM(pts: Pt[], closed = false): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distanceM(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) total += distanceM(pts[pts.length - 1], pts[0]);
  return total;
}

/** Area enclosed by a ring, in square metres. */
export function ringAreaM2(ring: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
    sum += rad(b[0] - a[0]) * (2 + Math.sin(rad(a[1])) + Math.sin(rad(b[1])));
  }
  return Math.abs((sum * R * R) / 2);
}

const round = (n: number, digits: number) => n.toLocaleString("en", { maximumFractionDigits: digits });

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${round(km, km < 100 ? 1 : 0)} km`;
}

export function formatArea(m2: number): string {
  if (m2 < 100_000) return `${round(m2, 0)} m²`;
  const km2 = m2 / 1e6;
  return `${round(km2, km2 < 100 ? 1 : 0)} km²`;
}

/** Compass bearing from `a` to `b`, in degrees clockwise from north. */
export function bearingDeg(a: Pt, b: Pt): number {
  const dLon = rad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** A bearing the way it is read out: three digits, "045°". */
export function formatBearing(d: number): string {
  return `${String(Math.round(d) % 360).padStart(3, "0")}°`;
}

/** Ground covered by a closed shape, in square metres. */
export function surfaceM2(kind: ShapeKind, pts: Pt[]): number {
  if (isPath(kind) || kind === "text" || pts.length < 3) return 0;
  if (kind === "circle") return 2 * Math.PI * R * R * (1 - Math.cos(circleOf(pts).radiusM / R));
  if (kind === "rect") {
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    return rad(Math.max(...lons) - Math.min(...lons)) * R * R * (Math.sin(rad(Math.max(...lats))) - Math.sin(rad(Math.min(...lats))));
  }
  return ringAreaM2(pts);
}

export function formatVolume(m3: number): string {
  if (m3 < 1e6) return `${round(m3, 0)} m³`;
  const km3 = m3 / 1e9;
  return `${round(km3, km3 < 100 ? 3 : 0)} km³`;
}

/** A volume's own rows: how tall it is and how much space it holds. */
export function volumeStats(kind: ShapeKind, pts: Pt[], floorM: number, topM: number): Stat[] {
  const tall = topM - floorM;
  if (!(tall > 0)) return [];
  return [
    ["Bottom to top", `${round(floorM, 0)} to ${round(topM, 0)} m`],
    ["Volume", formatVolume(surfaceM2(kind, pts) * tall)],
  ];
}

/** A named measurement: ["Radius", "3.2 km"]. */
export type Stat = [label: string, value: string];

/** Everything worth knowing about a shape's size, one measurement per row. */
export function measurements(kind: ShapeKind, pts: Pt[]): Stat[] {
  if (kind === "text") return [];
  if (isPath(kind)) {
    if (pts.length < 2) return [];
    const [first, last] = [pts[0], pts[pts.length - 1]];
    const rows: Stat[] = [["Length", formatDistance(pathLengthM(pts))]];
    if (pts.length > 2) rows.push(["Start to end", formatDistance(distanceM(first, last))]);
    rows.push(["Bearing", formatBearing(bearingDeg(first, last))]);
    return rows;
  }
  if (pts.length < 3) return [];
  if (kind === "circle") {
    const r = circleOf(pts).radiusM;
    return [
      ["Radius", formatDistance(r)],
      ["Diameter", formatDistance(2 * r)],
      // On a sphere, not a flat sheet: it matters for circles hundreds of km wide.
      ["Circumference", formatDistance(2 * Math.PI * R * Math.sin(r / R))],
      ["Area", formatArea(surfaceM2(kind, pts))],
    ];
  }
  if (kind === "rect") {
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
    const { widthM, heightM } = rectSize(pts);
    // The sides run along parallels, so the top and bottom differ in length.
    const along = (lat: number) => rad(e - w) * R * Math.cos(rad(lat));
    return [
      ["Width", formatDistance(widthM)],
      ["Height", formatDistance(heightM)],
      ["Perimeter", formatDistance(along(s) + along(n) + 2 * heightM)],
      ["Area", formatArea(surfaceM2(kind, pts))],
    ];
  }
  return [
    ["Area", formatArea(ringAreaM2(pts))],
    ["Perimeter", formatDistance(pathLengthM(pts, true))],
  ];
}

/** One line of measurements for a shape, e.g. "Radius 3.2 km". */
export function measure(kind: ShapeKind, pts: Pt[]): string {
  if (kind === "text") return "";
  if (isPath(kind)) return pts.length > 1 ? `Length ${formatDistance(pathLengthM(pts))}` : "";
  if (pts.length < 3) return "";
  if (kind === "circle") {
    const r = circleOf(pts).radiusM;
    return `Radius ${formatDistance(r)}, diameter ${formatDistance(2 * r)}`;
  }
  if (kind === "rect") {
    const { widthM, heightM } = rectSize(pts);
    return `${formatDistance(widthM)} × ${formatDistance(heightM)}`;
  }
  return `Area ${formatArea(ringAreaM2(pts))}`;
}

// ---- how shapes are stored -------------------------------------------------

export type ShapeGeo =
  | { type: "Polygon"; coordinates: Pt[][] }
  | { type: "LineString"; coordinates: Pt[] }
  | { type: "Point"; coordinates: Pt };

/** What to call each kind of shape. */
export const SHAPE_LABEL: Record<ShapeKind, string> = {
  polygon: "Area",
  rect: "Rectangle",
  circle: "Circle",
  line: "Line",
  arrow: "Arrow",
  text: "Text",
};

/** A shape's own points: a line's points, or a ring without its repeated last point. */
export function pointsOf(geo: ShapeGeo): Pt[] {
  if (geo.type === "Point") return [[geo.coordinates[0], geo.coordinates[1]]];
  return geo.type === "LineString"
    ? geo.coordinates.map((p) => [p[0], p[1]])
    : geo.coordinates[0].slice(0, -1).map((p) => [p[0], p[1]]);
}

export function toGeo(kind: ShapeKind, pts: Pt[]): ShapeGeo {
  if (kind === "text") return { type: "Point", coordinates: pts[0] };
  return isPath(kind)
    ? { type: "LineString", coordinates: pts }
    : { type: "Polygon", coordinates: [[...pts, pts[0]]] };
}

/**
 * How a stored shape should be edited. Rectangles and circles are stored as
 * plain polygons with a note saying what they were drawn as; if the points
 * no longer fit that note, the shape is treated as a free polygon.
 */
export function kindOf(shape: { shape?: string | null; geojson: ShapeGeo }): ShapeKind {
  if (shape.geojson.type === "Point") return "text";
  if (shape.geojson.type === "LineString") return shape.shape === "arrow" ? "arrow" : "line";
  const corners = shape.geojson.coordinates[0].length - 1;
  if (shape.shape === "rect" && corners === 4) return "rect";
  if (shape.shape === "circle" && corners >= 8) return "circle";
  return "polygon";
}
