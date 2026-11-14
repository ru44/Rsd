import proj4 from "proj4";
import { forward as mgrsForward } from "mgrs";

export type CoordFormat = "DD" | "DMS" | "DDM" | "UTM" | "MGRS";
export const COORD_FORMATS: CoordFormat[] = ["DD", "DMS", "DDM", "UTM", "MGRS"];

const OUT_OF_RANGE = "outside UTM/MGRS range";

function hemi(value: number, pos: string, neg: string) {
  return value >= 0 ? pos : neg;
}

function dms(value: number, pos: string, neg: string) {
  const abs = Math.abs(value);
  // Work in hundredths of a second so rounding can never produce 60.00".
  const total = Math.round(abs * 3600 * 100);
  const d = Math.floor(total / 360000);
  const m = Math.floor((total - d * 360000) / 6000);
  const s = (total - d * 360000 - m * 6000) / 100;
  return `${d}°${String(m).padStart(2, "0")}'${s.toFixed(2).padStart(5, "0")}"${hemi(value, pos, neg)}`;
}

function ddm(value: number, pos: string, neg: string) {
  const abs = Math.abs(value);
  const total = Math.round(abs * 60 * 10000);
  const d = Math.floor(total / 600000);
  const m = (total - d * 600000) / 10000;
  return `${d}°${m.toFixed(4).padStart(7, "0")}'${hemi(value, pos, neg)}`;
}

/** UTM and MGRS only cover 80°S to 84°N. */
function inUtmRange(lat: number) {
  return lat >= -80 && lat <= 84;
}

export function utmZone(lon: number) {
  return Math.min(60, Math.floor((lon + 180) / 6) + 1);
}

export function toUtm(lon: number, lat: number) {
  const zone = utmZone(lon);
  const south = lat < 0;
  const [easting, northing] = proj4(
    "WGS84",
    `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`,
    [lon, lat]
  );
  return { zone, south, easting, northing };
}

/** MGRS at 1 m precision, spaced for reading: "37Q EV 21273 87371". */
export function toMgrs(lon: number, lat: number) {
  const raw = mgrsForward([lon, lat], 5);
  const m = raw.match(/^(\d{1,2}[C-X])([A-Z]{2})(\d{5})(\d{5})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : raw;
}

export function formatCoord(lon: number, lat: number, format: CoordFormat): string {
  switch (format) {
    case "DD":
      return `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
    case "DMS":
      return `${dms(lat, "N", "S")} ${dms(lon, "E", "W")}`;
    case "DDM":
      return `${ddm(lat, "N", "S")} ${ddm(lon, "E", "W")}`;
    case "UTM": {
      if (!inUtmRange(lat)) return OUT_OF_RANGE;
      const u = toUtm(lon, lat);
      return `${u.zone}${u.south ? "S" : "N"} ${Math.round(u.easting)}E ${Math.round(u.northing)}N`;
    }
    case "MGRS":
      return inUtmRange(lat) ? toMgrs(lon, lat) : OUT_OF_RANGE;
  }
}
