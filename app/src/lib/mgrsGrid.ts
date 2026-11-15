// Builds the MGRS grid for a view as plain lon/lat lines and labels.
// No map library in here: it takes a rectangle and returns geometry, so it
// can be unit tested and drawn by any renderer.
import proj4 from "proj4";
import { forward as mgrsForward } from "mgrs";

/** Degrees, with west <= east. Callers split views that cross the date line. */
export interface Rect {
  west: number;
  south: number;
  east: number;
  north: number;
}
export type LonLat = [number, number];
/** 0 = grid zones, 1 = 100 km squares, 2 = 10 km, 3 = 1 km. */
export type Level = 0 | 1 | 2 | 3;
export interface GridLine {
  level: Level;
  points: LonLat[];
}
export interface GridLabel {
  level: Level;
  lon: number;
  lat: number;
  text: string;
}
export interface Grid {
  level: Level;
  lines: GridLine[];
  labels: GridLabel[];
}
export interface Cell extends Rect {
  zone: number;
  band: string;
}

const BANDS = "CDEFGHJKLMNPQRSTUVWX"; // 8° each from 80°S; X is 12° tall
const INTERVAL_M: Record<Level, number> = { 0: 0, 1: 100_000, 2: 10_000, 3: 1_000 };
/** Zone names are dropped when more zones than this are in view: too dense to read. */
const MAX_LABELLED_ZONES = 400;

/** Grid zones are 6° x 8° except around Norway (V) and Svalbard (X). */
function cellFor(zone: number, bandIndex: number): Cell | null {
  const band = BANDS[bandIndex];
  let west = -180 + 6 * (zone - 1);
  let east = west + 6;
  const south = -80 + 8 * bandIndex;
  const north = band === "X" ? 84 : south + 8;

  if (band === "V") {
    if (zone === 31) east = 3;
    if (zone === 32) west = 3;
  } else if (band === "X") {
    if (zone === 32 || zone === 34 || zone === 36) return null;
    if (zone === 31) east = 9;
    if (zone === 33) [west, east] = [9, 21];
    if (zone === 35) [west, east] = [21, 33];
    if (zone === 37) west = 33;
  }
  return { zone, band, west, south, east, north };
}

function intersect(a: Rect, b: Rect): Rect | null {
  const r = {
    west: Math.max(a.west, b.west),
    south: Math.max(a.south, b.south),
    east: Math.min(a.east, b.east),
    north: Math.min(a.north, b.north),
  };
  return r.west < r.east && r.south < r.north ? r : null;
}

/** Every grid zone that overlaps the view. */
export function gzdCells(view: Rect): Cell[] {
  const cells: Cell[] = [];
  for (let zone = 1; zone <= 60; zone++) {
    for (let b = 0; b < BANDS.length; b++) {
      const cell = cellFor(zone, b);
      if (cell && intersect(cell, view)) cells.push(cell);
    }
  }
  return cells;
}

/** How much detail to draw, from how much ground the view covers. */
export function pickLevel(view: Rect): Level {
  const midLat = ((view.south + view.north) / 2) * (Math.PI / 180);
  const widthKm = (view.east - view.west) * 111.32 * Math.cos(midLat);
  const heightKm = (view.north - view.south) * 110.57;
  const spanKm = Math.max(widthKm, heightKm);
  if (spanKm > 3000) return 0;
  if (spanKm > 300) return 1;
  if (spanKm > 30) return 2;
  return 3;
}

/** Cuts a line to a rectangle. One line can come back as several pieces. */
export function clipLine(points: LonLat[], box: Rect): LonLat[][] {
  const pieces: LonLat[][] = [];
  let current: LonLat[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    // Liang-Barsky: find the part [t0, t1] of this segment inside the box.
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    const edges: [number, number][] = [
      [-dx, x0 - box.west],
      [dx, box.east - x0],
      [-dy, y0 - box.south],
      [dy, box.north - y0],
    ];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) inside = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (!inside || t0 > t1) {
      if (current.length > 1) pieces.push(current);
      current = [];
      continue;
    }
    const a: LonLat = [x0 + t0 * dx, y0 + t0 * dy];
    const b: LonLat = [x0 + t1 * dx, y0 + t1 * dy];
    if (current.length === 0) current.push(a);
    current.push(b);
    if (t1 < 1) {
      // The line left the box: this piece ends here.
      pieces.push(current);
      current = [];
    }
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

function utmProjection(cell: Cell) {
  const south = cell.band < "N";
  return proj4(
    "WGS84",
    `+proj=utm +zone=${cell.zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`
  );
}

/** A straight edge sampled about once per degree so it follows the globe. */
function edge(from: LonLat, to: LonLat): LonLat[] {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]))));
  const pts: LonLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
  }
  return pts;
}

function zoneOutline(cell: Cell, view: Rect, grid: Grid) {
  const edges = [
    edge([cell.west, cell.south], [cell.west, cell.north]),
    edge([cell.west, cell.south], [cell.east, cell.south]),
  ];
  // Neighbours draw the other two sides; the top band has no neighbour above.
  if (cell.band === "X") edges.push(edge([cell.west, cell.north], [cell.east, cell.north]));
  for (const e of edges) {
    for (const points of clipLine(e, view)) grid.lines.push({ level: 0, points });
  }
}

/**
 * Easting and northing lines every `level` interval inside one grid zone.
 * `finest` is the most detailed level being drawn in this view: it decides
 * how many digits the line labels carry and where square names go.
 */
function squareLines(
  cell: Cell,
  view: Rect,
  level: Exclude<Level, 0>,
  finest: Level,
  grid: Grid
) {
  const box = intersect(cell, view);
  if (!box) return;
  const utm = utmProjection(cell);
  const interval = INTERVAL_M[level];
  const coarser = interval * 10;

  // UTM extent of the visible part of the zone, from its corners and edge
  // midpoints (the edges bulge, so corners alone would miss a little).
  const midLon = (box.west + box.east) / 2;
  const midLat = (box.south + box.north) / 2;
  const probes: LonLat[] = [
    [box.west, box.south], [box.east, box.south], [box.west, box.north], [box.east, box.north],
    [midLon, box.south], [midLon, box.north], [box.west, midLat], [box.east, midLat],
  ];
  const xy = probes.map((p) => utm.forward(p));
  const eLo = Math.min(...xy.map((p) => p[0]));
  const eHi = Math.max(...xy.map((p) => p[0]));
  const nLo = Math.min(...xy.map((p) => p[1]));
  const nHi = Math.max(...xy.map((p) => p[1]));
  const eMin = Math.floor(eLo / interval) * interval;
  const eMax = Math.ceil(eHi / interval) * interval;
  const nMin = Math.floor(nLo / interval) * interval;
  const nMax = Math.ceil(nHi / interval) * interval;

  // 100 km lines are sampled every 25 km so they follow the globe's curve.
  const step = level === 1 ? interval / 4 : interval;
  // Lines are numbered within their 100 km square, in units of the finest
  // level on screen: "2" on a 10 km grid, "20" once 1 km lines appear.
  const unit = INTERVAL_M[finest];
  const digits = finest === 3 ? 2 : 1;
  const lineLabel = (metres: number) =>
    String(Math.floor((metres % 100_000) / unit)).padStart(digits, "0");
  const inBox = (lon: number, lat: number) =>
    lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north;

  const add = (utmPoints: LonLat[], labelText: string | null) => {
    const lonLat = utmPoints.map((p) => utm.inverse(p) as LonLat);
    for (const points of clipLine(lonLat, box)) {
      grid.lines.push({ level, points });
      if (labelText !== null) {
        // Sample points sit on line crossings, so put the number halfway
        // between two of them: there it cannot collide with a crossing line's.
        const k = Math.floor((points.length - 1) / 2);
        const [a, b] = [points[k], points[k + 1]];
        grid.labels.push({ level, lon: (a[0] + b[0]) / 2, lat: (a[1] + b[1]) / 2, text: labelText });
      }
    }
  };

  for (let e = eMin; e <= eMax; e += interval) {
    // Finer levels skip lines the coarser level already drew.
    if (level > 1 && e % coarser === 0) continue;
    const pts: LonLat[] = [];
    for (let n = nMin; n <= nMax; n += step) pts.push([e, n]);
    add(pts, level > 1 ? lineLabel(e) : null);
  }
  for (let n = nMin; n <= nMax; n += interval) {
    if (level > 1 && n % coarser === 0) continue;
    const pts: LonLat[] = [];
    for (let e = eMin; e <= eMax; e += step) pts.push([e, n]);
    add(pts, level > 1 ? lineLabel(n) : null);
  }

  if (level !== 1) return;
  // Name the 100 km squares. Zoomed out, each gets its two letters at its
  // centre. Zoomed in, only a few are on screen, so each gets its full name
  // ("37Q EV") in the middle of the part that is visible.
  for (let e = eMin; e < eMax; e += interval) {
    for (let n = nMin; n < nMax; n += interval) {
      const [cLon, cLat] = utm.inverse([e + interval / 2, n + interval / 2]);
      const id = mgrsForward([cLon, cLat], 0); // e.g. "37QEV"
      if (finest === 1) {
        if (inBox(cLon, cLat)) grid.labels.push({ level: 1, lon: cLon, lat: cLat, text: id.slice(-2) });
        continue;
      }
      const ve = (Math.max(e, eLo) + Math.min(e + interval, eHi)) / 2;
      const vn = (Math.max(n, nLo) + Math.min(n + interval, nHi)) / 2;
      const [lon, lat] = utm.inverse([ve, vn]);
      if (inBox(lon, lat)) {
        grid.labels.push({ level: 1, lon, lat, text: `${id.slice(0, -2)} ${id.slice(-2)}` });
      }
    }
  }
}

/**
 * The whole grid for one view rectangle.
 * `zoneNames` forces zone names ("37Q") on or off; left out, they appear when
 * few enough zones are in view to be readable.
 */
export function buildGrid(view: Rect, level: Level = pickLevel(view), zoneNames?: boolean): Grid {
  const grid: Grid = { level, lines: [], labels: [] };
  const cells = gzdCells(view);
  // Zone names are shown only while zones are the finest thing drawn.
  const labelZones = level === 0 && (zoneNames ?? cells.length <= MAX_LABELLED_ZONES);

  for (const cell of cells) {
    zoneOutline(cell, view, grid);
    if (labelZones) {
      const lon = (cell.west + cell.east) / 2;
      const lat = (cell.south + cell.north) / 2;
      if (lon >= view.west && lon <= view.east && lat >= view.south && lat <= view.north) {
        grid.labels.push({ level: 0, lon, lat, text: `${cell.zone}${cell.band}` });
      }
    }
    for (let l = 1; l <= level; l++) {
      squareLines(cell, view, l as Exclude<Level, 0>, level, grid);
    }
  }
  return grid;
}
