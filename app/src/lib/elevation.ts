// Land height and sea depth anywhere in the world, from a picture that ships
// with the app (see scripts/build-elevation.py). It is coarse: one value for
// about every 14 km, each the average of the ground around it. Good for
// "roughly how high is this plateau", wrong for a single peak or a street.

const OFFSET = 11000;
let grid: { data: Uint8ClampedArray; w: number; h: number } | null = null;
let loading: Promise<void> | null = null;

/** Height in metres from the red and green values of one point of the picture. */
export const decodeHeight = (red: number, green: number) => red * 256 + green - OFFSET;

/** Which point of a `w` by `h` grid covers a position. */
export function cellOf(lon: number, lat: number, w: number, h: number): [number, number] {
  const x = Math.floor((((lon + 180) % 360) + 360) % 360 / 360 * w);
  const y = Math.floor(((90 - lat) / 180) * h);
  return [Math.min(w - 1, Math.max(0, x)), Math.min(h - 1, Math.max(0, y))];
}

export function loadElevation(): Promise<void> {
  loading ??= (async () => {
    const blob = await (await fetch(`${import.meta.env.BASE_URL}elevation.png`)).blob();
    // The numbers are stored in the colours, so the browser must not adjust them.
    const image = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    grid = { data: ctx.getImageData(0, 0, image.width, image.height).data, w: image.width, h: image.height };
  })().catch((e) => {
    loading = null; // let a later call try again
    throw e;
  });
  return loading;
}

/** Metres above (or, negative, below) sea level; null until the data has loaded. */
export function heightAt(lon: number, lat: number): number | null {
  if (!grid) return null;
  const [x, y] = cellOf(lon, lat, grid.w, grid.h);
  const i = (y * grid.w + x) * 4;
  return decodeHeight(grid.data[i], grid.data[i + 1]);
}
