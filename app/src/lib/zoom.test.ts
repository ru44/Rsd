import { describe, expect, it } from "vitest";
import { heightOfZoom, parseZoom, zoomOfHeight } from "./zoom";

describe("zoom", () => {
  it("halves the height for each level", () => {
    expect(heightOfZoom(1)).toBe(20_000_000);
    expect(heightOfZoom(5) / heightOfZoom(6)).toBeCloseTo(2);
    expect(zoomOfHeight(heightOfZoom(12.5))).toBeCloseTo(12.5);
  });
  it("reads a bare number as a level", () => {
    expect(parseZoom("10")).toBeCloseTo(heightOfZoom(10));
    expect(parseZoom(" 7.5 ")).toBeCloseTo(heightOfZoom(7.5));
  });
  it("reads a number with a unit as a height", () => {
    expect(parseZoom("500 km")).toBe(500_000);
    expect(parseZoom("1,200km")).toBe(1_200_000);
    expect(parseZoom("800m")).toBe(800);
  });
  it("turns down anything else", () => {
    for (const t of ["", "abc", "25", "-3", "0 km", "5 miles"]) expect(parseZoom(t), t).toBeNull();
  });
});
