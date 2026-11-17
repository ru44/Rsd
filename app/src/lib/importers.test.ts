// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fromGeoJson, fromKml, readMapFile } from "./importers";
import { toGeoJson, toKml } from "./exporters";
import { circleRing, rectRing, toGeo, type Pt } from "./shapes";

const tri: Pt[] = [[39, 21], [40, 21], [40, 22]];
const shapes = [
  { id: 1, name: "Box", color: "#FF8080", shape: "rect", geojson: toGeo("rect", rectRing([39, 21], [40, 22])) },
  { id: 2, name: "Ring", color: "#AAFFAA", shape: "circle", geojson: toGeo("circle", circleRing([39, 21], 5000)) },
  { id: 3, name: "Zone", color: "#7FD4F5", shape: "polygon", floor_m: 500, ceiling_m: 3000, geojson: toGeo("polygon", tri) },
  { id: 4, name: "Route", color: "#FFFF80", shape: "line", geojson: toGeo("line", tri) },
  { id: 5, name: "Push", color: "#F2B441", shape: "arrow", geojson: toGeo("arrow", tri.slice(0, 2)) },
  { id: 6, name: "HQ here", color: "#FAFAFA", shape: "text", geojson: toGeo("text", [[39.5, 21.5]]) },
];
const symbols = [{ id: 1, name: "Tank", sidc: "SFGPUCA----", geojson: { type: "Point" as const, coordinates: [39.2, 21.6] as Pt } }];

describe("GeoJSON", () => {
  it("reads back what the app writes", () => {
    const got = fromGeoJson(JSON.stringify(toGeoJson(shapes, symbols)));
    expect(got.shapes.map((s) => [s.kind, s.name, s.color, s.pts.length])).toEqual([
      ["rect", "Box", "#FF8080", 4],
      ["circle", "Ring", "#AAFFAA", 72],
      ["polygon", "Zone", "#7FD4F5", 3],
      ["line", "Route", "#FFFF80", 3],
      ["arrow", "Push", "#F2B441", 2],
      ["text", "HQ here", "#FAFAFA", 1],
    ]);
    expect(got.symbols).toEqual([{ sidc: "SFGPUCA----", name: "Tank", coords: [39.2, 21.6] }]);
    expect(got.skipped).toBe(0);
    expect(got.shapes[2]).toMatchObject({ floor_m: 500, ceiling_m: 3000 });
    expect(got.shapes[0].ceiling_m).toBeUndefined();
  });
  it("reads files from other tools", () => {
    const got = fromGeoJson(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { title: "Two parts" }, geometry: { type: "MultiPolygon", coordinates: [[[...tri, tri[0]]], [[...tri, tri[0]]]] } },
          { type: "Feature", properties: null, geometry: { type: "Point", coordinates: [10, 20, 300] } },
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[1, 1]] } },
          { type: "Feature", properties: {}, geometry: null },
        ],
      })
    );
    expect(got.shapes.map((s) => [s.kind, s.name])).toEqual([["polygon", "Two parts"], ["polygon", "Two parts"], ["text", "Point"]]);
    expect(got.skipped).toBe(2);
    expect(fromGeoJson(JSON.stringify({ type: "Polygon", coordinates: [[...tri, tri[0]]] })).shapes).toHaveLength(1);
  });
  it("refuses text that is not JSON", () => {
    expect(() => fromGeoJson("hello")).toThrow();
  });
});

describe("KML", () => {
  it("reads back what the app writes", () => {
    const got = fromKml(toKml(shapes, symbols));
    expect(got.shapes.map((s) => [s.kind, s.name, s.color, s.pts.length])).toEqual([
      ["polygon", "Box", "#FF8080", 4],
      ["polygon", "Ring", "#AAFFAA", 72],
      ["polygon", "Zone", "#7FD4F5", 3],
      ["line", "Route", "#FFFF80", 3],
      ["line", "Push", "#F2B441", 2],
      ["text", "HQ here", "#FAFAFA", 1],
    ]);
    expect(got.symbols).toEqual([{ sidc: "SFGPUCA----", name: "Tank", coords: [39.2, 21.6] }]);
  });
  it("refuses text that is not KML", () => {
    expect(() => fromKml("<kml><Placemark>")).toThrow();
  });
  it("picks the reader by name or by content", () => {
    expect(readMapFile("a.kml", toKml(shapes, symbols)).shapes).toHaveLength(6);
    expect(readMapFile("a.json", JSON.stringify(toGeoJson(shapes, symbols))).shapes).toHaveLength(6);
    expect(readMapFile("export", toKml(shapes, symbols)).symbols).toHaveLength(1);
  });
});
