import { describe, expect, it } from "vitest";
import { toGeoJson, toKml, type ExportShape, type ExportSymbol } from "./exporters";
import { circleRing, toGeo } from "./shapes";

const shapes: ExportShape[] = [
  { id: 1, name: "Objective <A> & B", color: "#FF8080", shape: "polygon", geojson: toGeo("polygon", [[0, 0], [1, 0], [1, 1]]) },
  { id: 2, name: "Route", color: null, shape: "line", geojson: toGeo("line", [[0, 0], [2, 2]]) },
  { id: 3, name: "Ring", shape: "circle", geojson: toGeo("circle", circleRing([39, 21], 1000)) },
];
const symbols: ExportSymbol[] = [
  { id: 7, name: "Tank platoon", sidc: "SFGPUCA----D---", geojson: { type: "Point", coordinates: [39.2, 21.5] } },
];

describe("GeoJSON export", () => {
  const out = toGeoJson(shapes, symbols);
  it("has one feature per shape and symbol", () => {
    expect(out.type).toBe("FeatureCollection");
    expect(out.features.map((f) => f.geometry.type)).toEqual(["Polygon", "LineString", "Polygon", "Point"]);
  });
  it("says what each feature is", () => {
    expect(out.features.map((f) => f.properties.kind)).toEqual(["polygon", "line", "circle", "symbol"]);
    expect(out.features[3].properties).toMatchObject({ name: "Tank platoon", sidc: "SFGPUCA----D---" });
    expect(out.features[1].properties).toMatchObject({ color: "#7FD4F5" });
  });
  it("survives being written and read back", () => {
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("KML export", () => {
  const kml = toKml(shapes, symbols);
  it("is one document with a placemark for everything", () => {
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml.match(/<Placemark>/g)).toHaveLength(4);
    expect(kml.match(/<Polygon>/g)).toHaveLength(2);
    expect(kml).toContain("<LineString>");
    expect(kml).toContain("<Point><coordinates>39.2,21.5,0</coordinates></Point>");
  });
  it("escapes names", () => {
    expect(kml).toContain("<name>Objective &lt;A&gt; &amp; B</name>");
  });
  it("closes polygon rings and writes colours blue-first", () => {
    expect(kml).toContain("<coordinates>0,0,0 1,0,0 1,1,0 0,0,0</coordinates>");
    expect(kml).toContain("<LineStyle><color>ff8080ff</color>");
  });
  it("keeps the symbol code", () => {
    expect(kml).toContain('<Data name="sidc"><value>SFGPUCA----D---</value></Data>');
  });
});
