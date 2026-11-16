import { describe, expect, it } from "vitest";
import { cellOf, decodeHeight } from "./elevation";

describe("elevation", () => {
  it("turns colours back into metres", () => {
    expect(decodeHeight(42, 248)).toBe(0); // 11000 = 42 * 256 + 248
    expect(decodeHeight(45, 99)).toBe(619);
    expect(decodeHeight(3, 88)).toBe(-10144);
  });
  it("finds the point of the grid for a position", () => {
    expect(cellOf(-180, 90, 2880, 1440)).toEqual([0, 0]);
    expect(cellOf(0, 0, 2880, 1440)).toEqual([1440, 720]);
    expect(cellOf(180, -90, 2880, 1440)).toEqual([0, 1439]);
    expect(cellOf(179.99, -89.99, 2880, 1440)).toEqual([2879, 1439]);
  });
});
