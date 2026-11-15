import { describe, expect, it } from "vitest";
import { parseCoord } from "./parseCoord";
import { COORD_FORMATS, formatCoord } from "./coords";

const near = (text: string, lon: number, lat: number, digits = 3) => {
  const p = parseCoord(text);
  expect(p, text).not.toBeNull();
  expect(p!.lon, text).toBeCloseTo(lon, digits);
  expect(p!.lat, text).toBeCloseTo(lat, digits);
};

describe("parseCoord", () => {
  it("reads decimal degrees, latitude first", () => {
    near("21.5433, 39.1728", 39.1728, 21.5433);
    near("21.5433 39.1728", 39.1728, 21.5433);
    near("-33.8688, 151.2093", 151.2093, -33.8688);
    near("21.5433°, 39.1728°", 39.1728, 21.5433);
  });
  it("swaps a pair that can only be longitude first", () => {
    near("151.2093, -33.8688", 151.2093, -33.8688);
  });
  it("reads hemisphere letters after or before the numbers", () => {
    near("21.5433N 39.1728E", 39.1728, 21.5433);
    near("39.1728E, 21.5433N", 39.1728, 21.5433);
    near("N 21.5433 E 39.1728", 39.1728, 21.5433);
    near("33.8688 S 151.2093 E", 151.2093, -33.8688);
  });
  it("reads minutes and seconds", () => {
    near(`21°32'36"N 39°10'22"E`, 39.17278, 21.54333);
    near("21 32 36 N 39 10 22 E", 39.17278, 21.54333);
    near("21°32.6'N 39°10.3667'E", 39.17278, 21.54333);
    near("N 21° 32.6' W 039° 10.3667'", -39.17278, 21.54333);
  });
  it("reads MGRS with or without spaces, at any precision", () => {
    near("37Q ED 21282 87372", 39.2056, 21.5892);
    near("37qed2128287372", 39.2056, 21.5892);
    near("37Q ED 21 87", 39.2, 21.59, 1);
  });
  it("reads UTM", () => {
    near("37N 521273E 2387371N", 39.2056, 21.5892);
    near("37Q 521273 2387371", 39.2056, 21.5892);
    near("56S 334369E 6250948N", 151.2093, -33.8688);
  });
  it("reads back everything the app writes", () => {
    for (const [lon, lat] of [[39.2056453, 21.5891922], [-74.006, 40.7128], [151.2093, -33.8688], [-0.1276, 51.5072]]) {
      for (const f of COORD_FORMATS) near(formatCoord(lon, lat, f), lon, lat, 4);
    }
  });
  it("turns down what is not a position", () => {
    for (const text of ["", "Jeddah", "21.5", "95, 200", "21 61 00 N 39 10 22 E", "tank 12", "37Q", "12 Main Street"]) {
      expect(parseCoord(text), text).toBeNull();
    }
  });
});
