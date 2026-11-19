import { describe, expect, it } from "vitest";
import { isDesktop, previewTile } from "./desktop";

describe("previewTile", () => {
  it("uses the world tile when nothing is known", () => {
    expect(previewTile(null)).toEqual([0, 0, 0]);
  });

  it("picks the tile over the middle of a regional map at its widest zoom", () => {
    // Riyadh area, zoom 8 to 14: the middle is about 46.7 E, 24.7 N.
    const [z, x, y] = previewTile({ minzoom: 8, maxzoom: 14, bounds: [46.2, 24.2, 47.2, 25.2] });
    expect(z).toBe(8);
    expect(x).toBe(161); // floor((46.7 + 180) / 360 * 256)
    expect(y).toBe(109);
  });

  it("stays on the grid at the edges of the world", () => {
    expect(previewTile({ minzoom: 2, maxzoom: 2, bounds: [179, 84, 180, 85] })).toEqual([2, 3, 0]);
  });
});

describe("isDesktop", () => {
  it("is false in a browser", () => {
    expect(isDesktop).toBe(false);
  });
});
