// Geometry for the drawing tools: building rectangles and circles, and
// measuring what was drawn. Points are [longitude, latitude] in degrees.
// The Earth is treated as a sphere, which is within 0.5% of the true figure:
// fine for a readout, not for survey work.

export type Pt = [number, number];
export type ShapeKind = "polygon" | "rect" | "circle" | "line";

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

/** One line of measurements for a shape, e.g. "Radius 3.2 km". */
export function measure(kind: ShapeKind, pts: Pt[]): string {
  if (kind === "line") return pts.length > 1 ? `Length ${formatDistance(pathLengthM(pts))}` : "";
  if (pts.length < 3) return "";
  if (kind === "circle") return `Radius ${formatDistance(circleOf(pts).radiusM)}`;
  if (kind === "rect") {
    const { widthM, heightM } = rectSize(pts);
    return `${formatDistance(widthM)} × ${formatDistance(heightM)}`;
  }
  return `Area ${formatArea(ringAreaM2(pts))}`;
}

// ---- how shapes are stored -------------------------------------------------

export type ShapeGeo =
  | { type: "Polygon"; coordinates: Pt[][] }
  | { type: "LineString"; coordinates: Pt[] };

/** What to call each kind of shape. */
export const SHAPE_LABEL: Record<ShapeKind, string> = {
  polygon: "Area",
  rect: "Rectangle",
  circle: "Circle",
  line: "Line",
};

/** A shape's own points: a line's points, or a ring without its repeated last point. */
export function pointsOf(geo: ShapeGeo): Pt[] {
  return geo.type === "LineString"
    ? geo.coordinates.map((p) => [p[0], p[1]])
    : geo.coordinates[0].slice(0, -1).map((p) => [p[0], p[1]]);
}

export function toGeo(kind: ShapeKind, pts: Pt[]): ShapeGeo {
  return kind === "line"
    ? { type: "LineString", coordinates: pts }
    : { type: "Polygon", coordinates: [[...pts, pts[0]]] };
}

/**
 * How a stored shape should be edited. Rectangles and circles are stored as
 * plain polygons with a note saying what they were drawn as; if the points
 * no longer fit that note, the shape is treated as a free polygon.
 */
export function kindOf(shape: { shape?: string | null; geojson: ShapeGeo }): ShapeKind {
  if (shape.geojson.type === "LineString") return "line";
  const corners = shape.geojson.coordinates[0].length - 1;
  if (shape.shape === "rect" && corners === 4) return "rect";
  if (shape.shape === "circle" && corners >= 8) return "circle";
  return "polygon";
}
