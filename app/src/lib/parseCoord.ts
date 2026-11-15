// Reads a position a person typed or pasted: decimal degrees, degrees with
// minutes and seconds, UTM or MGRS. Everything `formatCoord` writes can be
// read back here, so a position copied from the app can be pasted into it.
import proj4 from "proj4";
import { toPoint } from "mgrs";

export interface Position {
  lon: number;
  lat: number;
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
// "21°32'36.5"N", "21 32.61 N", "21.5433N": degrees, then optional minutes and seconds.
const AFTER = new RegExp(String.raw`${NUM}[°\s]*(?:${NUM}['′’\s]*)?(?:${NUM}(?:"|″|”|'')?\s*)?([NSEW])`, "gi");
// The same with the letter first: "N 21° 32.61'".
const BEFORE = new RegExp(String.raw`([NSEW])\s*${NUM}[°\s]*(?:${NUM}['′’\s]*)?(?:${NUM}(?:"|″|”|'')?)?`, "gi");

function valid(lon: number, lat: number): Position | null {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lon, lat }
    : null;
}

function fromMgrs(text: string): Position | null {
  const compact = text.toUpperCase().replace(/\s+/g, "");
  if (!/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}(\d{2}|\d{4}|\d{6}|\d{8}|\d{10})?$/.test(compact)) return null;
  try {
    const [lon, lat] = toPoint(compact);
    return valid(lon, lat);
  } catch {
    return null;
  }
}

function fromUtm(text: string): Position | null {
  const m = text.match(/^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{5,7}(?:\.\d+)?)\s*m?E?[\s,]+(\d{1,8}(?:\.\d+)?)\s*m?N?$/i);
  if (!m) return null;
  const zone = +m[1];
  if (zone < 1 || zone > 60) return null;
  // N and S are read as the hemisphere, the way this app writes UTM. Any
  // other letter is a latitude band, where N and later are north.
  const letter = m[2].toUpperCase();
  const south = letter === "S" || (letter !== "N" && letter < "N");
  const [lon, lat] = proj4(
    `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`,
    "WGS84",
    [+m[3], +m[4]]
  );
  return valid(lon, lat);
}

/** Two parts tagged N/S and E/W, in either order. */
function fromHemispheres(text: string): Position | null {
  for (const [pattern, letterAt] of [[AFTER, 4], [BEFORE, 1]] as const) {
    const parts = [...text.matchAll(pattern)];
    if (parts.length !== 2) continue;
    // Nothing but separators may be left over.
    if (/[^\s,;]/.test(parts.reduce((rest, p) => rest.replace(p[0], ""), text))) continue;
    let lat: number | null = null;
    let lon: number | null = null;
    for (const p of parts) {
      const nums = letterAt === 4 ? p.slice(1, 4) : p.slice(2, 5);
      const [d, m, s] = nums.map((n) => (n === undefined ? 0 : +n));
      if (m >= 60 || s >= 60) return null;
      const letter = p[letterAt].toUpperCase();
      const value = (d + m / 60 + s / 3600) * (letter === "S" || letter === "W" ? -1 : 1);
      if (letter === "N" || letter === "S") lat = value;
      else lon = value;
    }
    if (lat !== null && lon !== null) return valid(lon, lat);
  }
  return null;
}

/** Two plain numbers: latitude then longitude. */
function fromDecimals(text: string): Position | null {
  const m = text.match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*°?$/);
  if (!m) return null;
  const [a, b] = [+m[1], +m[2]];
  // A first number too big for a latitude means the pair is longitude first.
  return Math.abs(a) > 90 && Math.abs(b) <= 90 ? valid(a, b) : valid(b, a);
}

export function parseCoord(input: string): Position | null {
  const text = input.trim();
  if (!text || !/\d/.test(text)) return null;
  return fromMgrs(text) ?? fromUtm(text) ?? fromHemispheres(text) ?? fromDecimals(text);
}
