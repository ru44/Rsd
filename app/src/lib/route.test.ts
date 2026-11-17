import { describe, expect, it } from "vitest";
import { formatDuration, osrmUrl, parseOsrm, straightRoute, thin, type Route } from "./route";
import type { Pt } from "./shapes";

describe("route", () => {
  it("writes times the way people say them", () => {
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(2 * 3600)).toBe("2 h");
    expect(formatDuration(2.25 * 3600)).toBe("2 h 15 min");
    expect(formatDuration(76 * 3600)).toBe("3 d 4 h");
  });
  it("works out a straight route at a steady speed", () => {
    const r = straightRoute([[0, 0], [0, 1], [0, 2]], 60);
    expect(r.distanceM / 1000).toBeCloseTo(222.4, 0);
    expect(r.durationS / 3600).toBeCloseTo(3.7, 1);
  });
  it("asks the server in its own format", () => {
    expect(osrmUrl("https://example.org/", [[39.19, 21.49], [46.67, 24.71]])).toBe(
      "https://example.org/route/v1/driving/39.190000,21.490000;46.670000,24.710000?overview=full&geometries=geojson"
    );
  });
  it("reads the server's answer", () => {
    const ok = { code: "Ok", routes: [{ distance: 950_000, duration: 34_000, geometry: { coordinates: [[39, 21], [40, 22, 5], [46, 24]] } }] };
    expect(parseOsrm(ok)).toEqual<Route>({ line: [[39, 21], [40, 22], [46, 24]], distanceM: 950_000, durationS: 34_000 });
    expect(parseOsrm({ code: "NoRoute", routes: [] })).toBeNull();
    expect(parseOsrm(null)).toBeNull();
    expect(parseOsrm({ code: "Ok", routes: [{ distance: 1, duration: 1 }] })).toBeNull();
  });
  it("thins a long line but keeps its ends", () => {
    const line: Pt[] = Array.from({ length: 1001 }, (_, i) => [i, 0]);
    const short = thin(line, 11);
    expect(short).toHaveLength(11);
    expect([short[0][0], short[5][0], short[10][0]]).toEqual([0, 500, 1000]);
    expect(thin(line.slice(0, 5), 11)).toHaveLength(5);
  });
});
