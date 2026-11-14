import { describe, expect, it } from "vitest";
import proj4 from "proj4";
import { forward as mgrsForward } from "mgrs";
import { buildGrid, clipLine, gzdCells, pickLevel, type Rect } from "./mgrsGrid";

const around = (lon: number, lat: number, halfDeg: number): Rect => ({
  west: lon - halfDeg,
  south: lat - halfDeg,
  east: lon + halfDeg,
  north: lat + halfDeg,
});
const names = (r: Rect) => gzdCells(r).map((c) => `${c.zone}${c.band}`);
const utm37 = proj4("WGS84", "+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs");

// Jeddah sits in zone 37Q, a little east of the zone's centre line.
const JEDDAH: [number, number] = [39.2056453, 21.5891922];

describe("gzdCells", () => {
  it("finds the grid zone for a small view", () => {
    expect(names(around(...JEDDAH, 0.1))).toEqual(["37Q"]);
  });

  it("covers the whole world with 1,197 zones", () => {
    // 60 zones x 20 bands, minus 32X, 34X and 36X which do not exist.
    expect(gzdCells({ west: -180, south: -90, east: 180, north: 90 })).toHaveLength(1197);
  });

  it("widens 32V over south-west Norway", () => {
    expect(names(around(4, 60, 0.1))).toEqual(["32V"]);
    expect(names(around(2, 60, 0.1))).toEqual(["31V"]);
  });

  it("uses the wide Svalbard zones in band X", () => {
    expect(names(around(15, 78, 0.1))).toEqual(["33X"]);
    expect(names(around(8, 78, 0.1))).toEqual(["31X"]);
    expect(names(around(34, 78, 0.1))).toEqual(["37X"]);
  });

  it("has nothing at the poles", () => {
    expect(gzdCells({ west: 0, south: 85, east: 10, north: 89 })).toEqual([]);
  });
});

describe("pickLevel", () => {
  it("adds detail as the view shrinks", () => {
    expect(pickLevel(around(...JEDDAH, 30))).toBe(0);
    expect(pickLevel(around(...JEDDAH, 5))).toBe(1);
    expect(pickLevel(around(...JEDDAH, 0.5))).toBe(2);
    expect(pickLevel(around(...JEDDAH, 0.05))).toBe(3);
  });
});

describe("clipLine", () => {
  const box: Rect = { west: 0, south: 0, east: 10, north: 10 };

  it("keeps a line that is fully inside", () => {
    expect(clipLine([[1, 1], [5, 5], [9, 2]], box)).toEqual([[[1, 1], [5, 5], [9, 2]]]);
  });

  it("cuts a line at the box edges", () => {
    expect(clipLine([[-5, 5], [15, 5]], box)).toEqual([[[0, 5], [10, 5]]]);
  });

  it("returns separate pieces when the line leaves and comes back", () => {
    const pieces = clipLine([[2, 5], [2, 15], [8, 15], [8, 5]], box);
    expect(pieces).toEqual([[[2, 5], [2, 10]], [[8, 10], [8, 5]]]);
  });

  it("drops a line that misses the box", () => {
    expect(clipLine([[-5, -5], [-1, 20]], box)).toEqual([]);
  });
});

describe("buildGrid", () => {
  it("draws only zone outlines and names when zoomed far out", () => {
    const grid = buildGrid(around(...JEDDAH, 30));
    expect(grid.level).toBe(0);
    expect(grid.lines.every((l) => l.level === 0)).toBe(true);
    expect(grid.labels.map((l) => l.text)).toContain("37Q");
  });

  it("keeps every point inside the view", () => {
    const view = around(...JEDDAH, 5);
    const eps = 1e-9;
    for (const line of buildGrid(view).lines) {
      for (const [lon, lat] of line.points) {
        expect(lon).toBeGreaterThanOrEqual(view.west - eps);
        expect(lon).toBeLessThanOrEqual(view.east + eps);
        expect(lat).toBeGreaterThanOrEqual(view.south - eps);
        expect(lat).toBeLessThanOrEqual(view.north + eps);
      }
    }
  });

  it("puts 100 km lines on round UTM eastings or northings", () => {
    const view = around(...JEDDAH, 1.4); // stays inside zone 37
    const lines = buildGrid(view, 1).lines.filter((l) => l.level === 1);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) {
      // Ends are cut at the view edge, so test the points in between.
      const inner = line.points.slice(1, -1).map((p) => utm37.forward(p));
      if (inner.length === 0) continue;
      const off = (v: number) => Math.abs(v - Math.round(v / 100_000) * 100_000);
      const onEasting = inner.every(([e]) => off(e) < 1);
      const onNorthing = inner.every(([, n]) => off(n) < 1);
      expect(onEasting || onNorthing).toBe(true);
    }
  });

  it("names 100 km squares the way the MGRS library does", () => {
    const grid = buildGrid(around(...JEDDAH, 1.4), 1);
    const labels = grid.labels.filter((l) => l.level === 1);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(l.text).toBe(mgrsForward([l.lon, l.lat], 0).slice(-2));
    }
  });

  it("numbers 10 km lines with one digit and adds full square names", () => {
    const grid = buildGrid(around(...JEDDAH, 0.5));
    expect(grid.level).toBe(2);
    const digits = grid.labels.filter((l) => l.level === 2);
    expect(digits.length).toBeGreaterThan(4);
    expect(digits.every((l) => /^\d$/.test(l.text))).toBe(true);
    const squares = grid.labels.filter((l) => l.level === 1).map((l) => l.text);
    expect(squares).toContain(mgrsForward(JEDDAH, 0).replace(/^(\d+[C-X])/, "$1 "));
  });

  it("numbers lines with two digits once 1 km lines appear", () => {
    const grid = buildGrid(around(...JEDDAH, 0.05));
    expect(grid.level).toBe(3);
    const digits = grid.labels.filter((l) => l.level >= 2);
    expect(digits.length).toBeGreaterThan(4);
    expect(digits.every((l) => /^\d\d$/.test(l.text))).toBe(true);
    // A 1 km line's label matches the easting/northing digits MGRS gives there.
    const mgrs1km = mgrsForward(JEDDAH, 2); // e.g. 37QEV2187
    const [e, n] = [mgrs1km.slice(-4, -2), mgrs1km.slice(-2)];
    const texts = digits.map((l) => l.text);
    expect(texts).toContain(e);
    expect(texts).toContain(n);
  });

  it("never stacks two line numbers on the same spot", () => {
    for (const half of [0.5, 0.05]) {
      const spots = buildGrid(around(...JEDDAH, half))
        .labels.filter((l) => l.level >= 2)
        .map((l) => `${l.lon.toFixed(5)},${l.lat.toFixed(5)}`);
      expect(new Set(spots).size).toBe(spots.length);
    }
  });

  it("names zones for a continent but not for the whole world", () => {
    const zoneNames = (r: Rect) => buildGrid(r).labels.filter((l) => l.level === 0).length;
    expect(zoneNames(around(...JEDDAH, 40))).toBeGreaterThan(50);
    expect(zoneNames({ west: -180, south: -90, east: 180, north: 90 })).toBe(0);
  });

  it("stays small enough to redraw while panning", () => {
    for (const half of [60, 10, 1, 0.1, 0.01]) {
      const grid = buildGrid(around(...JEDDAH, half));
      expect(grid.lines.length).toBeLessThan(2500);
      expect(grid.labels.length).toBeLessThan(700);
    }
  });
});
