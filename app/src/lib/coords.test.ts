import { describe, expect, it } from "vitest";
import { toPoint } from "mgrs";
import { formatCoord, toMgrs, toUtm, utmZone } from "./coords";

// Jeddah, the app's default view.
const LON = 39.2056453;
const LAT = 21.5891922;

describe("formatCoord", () => {
  it("formats decimal degrees", () => {
    expect(formatCoord(LON, LAT, "DD")).toBe("21.589192°, 39.205645°");
  });

  it("formats degrees, minutes, seconds with hemispheres", () => {
    expect(formatCoord(LON, LAT, "DMS")).toBe(`21°35'21.09"N 39°12'20.32"E`);
    expect(formatCoord(-LON, -LAT, "DMS")).toBe(`21°35'21.09"S 39°12'20.32"W`);
  });

  it("formats degrees and decimal minutes", () => {
    expect(formatCoord(LON, LAT, "DDM")).toBe("21°35.3515'N 39°12.3387'E");
  });

  it("never rounds seconds or minutes up to 60", () => {
    expect(formatCoord(0, 9.9999999, "DMS")).toMatch(/^10°00'00\.00"N/);
    expect(formatCoord(0, 9.9999999, "DDM")).toMatch(/^10°00\.0000'N/);
  });

  it("reports UTM/MGRS as unavailable near the poles", () => {
    expect(formatCoord(0, 85, "UTM")).toBe("outside UTM/MGRS range");
    expect(formatCoord(0, -81, "MGRS")).toBe("outside UTM/MGRS range");
  });
});

describe("UTM", () => {
  it("picks the zone from longitude", () => {
    expect(utmZone(LON)).toBe(37);
    expect(utmZone(-180)).toBe(1);
    expect(utmZone(180)).toBe(60);
  });

  it("matches hand-computed easting and northing", () => {
    const u = toUtm(LON, LAT);
    expect(u.zone).toBe(37);
    expect(u.south).toBe(false);
    expect(u.easting).toBeGreaterThan(521_000);
    expect(u.easting).toBeLessThan(521_600);
    expect(u.northing).toBeGreaterThan(2_387_000);
    expect(u.northing).toBeLessThan(2_387_800);
  });

  it("uses a 10,000 km false northing in the south", () => {
    const u = toUtm(LON, -LAT);
    expect(u.south).toBe(true);
    expect(u.northing).toBeGreaterThan(7_600_000);
  });
});

describe("MGRS", () => {
  it("has the right zone, band and layout", () => {
    expect(toMgrs(LON, LAT)).toMatch(/^37Q [A-Z]{2} \d{5} \d{5}$/);
  });

  it("round-trips to within a couple of metres", () => {
    const [lon, lat] = toPoint(toMgrs(LON, LAT).replace(/ /g, ""));
    expect(Math.abs(lon - LON)).toBeLessThan(0.00003);
    expect(Math.abs(lat - LAT)).toBeLessThan(0.00003);
  });

  it("agrees with UTM on easting and northing digits", () => {
    const u = toUtm(LON, LAT);
    const [, , e, n] = toMgrs(LON, LAT).split(" ");
    expect(Number(e)).toBe(Math.floor(u.easting) % 100000);
    expect(Number(n)).toBe(Math.floor(u.northing) % 100000);
  });
});
