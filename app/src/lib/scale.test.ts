import { describe, expect, it } from "vitest";
import { scaleBar } from "./scale";

describe("scaleBar", () => {
  it("picks a round distance that fits", () => {
    expect(scaleBar(10)).toEqual({ px: 100, label: "1 km" });
    expect(scaleBar(3)).toEqual({ px: 67, label: "200 m" });
    expect(scaleBar(6000)).toEqual({ px: 83, label: "500 km" });
    expect(scaleBar(0.4)).toEqual({ px: 50, label: "20 m" });
  });
  it("gives nothing when the scale is unknown", () => {
    expect(scaleBar(0)).toBeNull();
    expect(scaleBar(NaN)).toBeNull();
  });
});
