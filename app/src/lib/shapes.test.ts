import { describe, expect, it } from "vitest";
import {
  circleOf,
  circleRing,
  destination,
  distanceM,
  formatArea,
  formatDistance,
  bearingDeg,
  formatBearing,
  measure,
  measurements,
  pathLengthM,
  rectRing,
  rectSize,
  ringAreaM2,
  squareCorner,
  type Pt,
} from "./shapes";

const JEDDAH: Pt = [39.19, 21.49];

describe("distance", () => {
  it("measures one degree of latitude as about 111 km", () => {
    expect(distanceM([0, 0], [0, 1]) / 1000).toBeCloseTo(111.2, 0);
  });
  it("goes out and back to the same place", () => {
    const there = destination(JEDDAH, 37, 25_000);
    expect(distanceM(JEDDAH, there)).toBeCloseTo(25_000, 0);
  });
});

describe("circle", () => {
  it("puts every corner one radius from the centre", () => {
    const ring = circleRing(JEDDAH, 5000);
    expect(ring).toHaveLength(72);
    for (const p of ring) expect(distanceM(JEDDAH, p)).toBeCloseTo(5000, 0);
  });
  it("recovers centre and radius from the corners", () => {
    const { center, radiusM } = circleOf(circleRing(JEDDAH, 80_000));
    expect(center[0]).toBeCloseTo(JEDDAH[0], 4);
    expect(center[1]).toBeCloseTo(JEDDAH[1], 4);
    expect(radiusM).toBeCloseTo(80_000, 0);
  });
  it("works near the pole", () => {
    const { center, radiusM } = circleOf(circleRing([10, 88], 100_000));
    expect(center[1]).toBeCloseTo(88, 3);
    expect(radiusM).toBeCloseTo(100_000, 0);
  });
});

describe("rectangle", () => {
  it("has sides along the grid", () => {
    expect(rectRing([1, 2], [3, 5])).toEqual([[1, 2], [3, 2], [3, 5], [1, 5]]);
  });
  it("can be made square on the ground at any latitude", () => {
    const a: Pt = [10, 60];
    const { widthM, heightM } = rectSize(rectRing(a, squareCorner(a, [10.3, 60.9])));
    expect(widthM / heightM).toBeCloseTo(1, 1);
  });
  it("keeps the drag direction when squaring", () => {
    const b = squareCorner([0, 0], [-2, -1]);
    expect(b[0]).toBeCloseTo(-2);
    expect(b[1]).toBeCloseTo(-2);
  });
});

describe("measuring", () => {
  it("adds up a path, and its closing side when asked", () => {
    const pts: Pt[] = [[0, 0], [0, 1], [1, 1]];
    expect(pathLengthM(pts)).toBeLessThan(pathLengthM(pts, true));
  });
  it("finds the area of a one-degree box at the equator", () => {
    const km2 = ringAreaM2(rectRing([0, 0], [1, 1])) / 1e6;
    expect(km2).toBeGreaterThan(12_300);
    expect(km2).toBeLessThan(12_400);
  });
  it("agrees with pi r squared for a small circle", () => {
    expect(ringAreaM2(circleRing(JEDDAH, 1000)) / (Math.PI * 1e6)).toBeCloseTo(1, 2);
  });
  it("writes distances and areas the way people read them", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(12_340)).toBe("12.3 km");
    expect(formatDistance(1_240_000)).toBe("1,240 km");
    expect(formatArea(5400)).toBe("5,400 m²");
    expect(formatArea(12_400_000)).toBe("12.4 km²");
  });
  it("describes each kind of shape", () => {
    expect(measure("circle", circleRing(JEDDAH, 3200))).toBe("Radius 3.2 km, diameter 6.4 km");
    expect(measure("line", [[0, 0], [0, 1]])).toMatch(/^Length 111(\.\d)? km$/);
    expect(measure("rect", rectRing([0, 0], [1, 1]))).toMatch(/^111(\.\d)? km × 111(\.\d)? km$/);
    expect(measure("polygon", rectRing([0, 0], [1, 1]))).toMatch(/^Area 12,3\d\d km²$/);
    expect(measure("polygon", [[0, 0]])).toBe("");
  });
});

describe("measurements", () => {
  const row = (rows: [string, string][], label: string) => rows.find((r) => r[0] === label)?.[1];
  it("gives a circle its radius, diameter, circumference and area", () => {
    const rows = measurements("circle", circleRing(JEDDAH, 1000));
    expect(rows.map((r) => r[0])).toEqual(["Radius", "Diameter", "Circumference", "Area"]);
    expect(row(rows, "Radius")).toBe("1 km");
    expect(row(rows, "Diameter")).toBe("2 km");
    expect(row(rows, "Circumference")).toBe("6.3 km");
    expect(row(rows, "Area")).toBe("3.1 km²");
  });
  it("gives a rectangle its sides, perimeter and area", () => {
    const rows = measurements("rect", rectRing([0, 0], [1, 1]));
    expect(row(rows, "Width")).toMatch(/^111/);
    expect(row(rows, "Perimeter")).toMatch(/^44[45] km$/);
    expect(row(rows, "Area")).toMatch(/^12,3\d\d km²$/);
  });
  it("gives an area its size and the length of its edge", () => {
    const rows = measurements("polygon", rectRing([0, 0], [1, 1]));
    expect(row(rows, "Area")).toMatch(/^12,3\d\d km²$/);
    expect(row(rows, "Perimeter")).toMatch(/^44[45] km$/);
  });
  it("gives a line its length and bearing", () => {
    expect(measurements("line", [[0, 0], [1, 0]])).toEqual([["Length", "111 km"], ["Bearing", "090°"]]);
    expect(row(measurements("line", [[0, 0], [1, 0], [1, 1]]), "Start to end")).toMatch(/^157/);
    expect(measurements("line", [[0, 0]])).toEqual([]);
  });
  it("reads bearings clockwise from north", () => {
    expect(bearingDeg([0, 0], [0, 1])).toBeCloseTo(0);
    expect(bearingDeg([0, 0], [-1, 0])).toBeCloseTo(270);
    expect(formatBearing(45.4)).toBe("045°");
    expect(formatBearing(359.7)).toBe("000°");
  });
});
