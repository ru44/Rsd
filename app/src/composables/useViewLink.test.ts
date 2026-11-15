import { describe, expect, it, vi } from "vitest";

vi.mock("cesium", () => ({}));
vi.mock("./useMap", () => ({ useMap: () => ({}) }));
const { formatViewLink, parseViewLink } = await import("./useViewLink");

describe("view link", () => {
  it("round-trips a view", () => {
    const view = { lat: 21.58919, lon: 39.20565, heightM: 6_000_000, flat: false };
    expect(formatViewLink(view)).toBe("#@21.58919,39.20565,6000000m");
    expect(parseViewLink(formatViewLink(view))).toEqual(view);
  });
  it("remembers the flat map and southern, western places", () => {
    const view = { lat: -33.8688, lon: -70.6693, heightM: 25_000, flat: true };
    expect(parseViewLink(formatViewLink(view))).toEqual(view);
  });
  it("ignores anything else in the address", () => {
    for (const hash of ["", "#", "#about", "#@91,0,100m", "#@0,181,100m", "#@1,2,0m", "#@1,2", "#@a,b,cm"]) {
      expect(parseViewLink(hash), hash).toBeNull();
    }
  });
});
