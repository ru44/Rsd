// The zoom number shown to the person, on the scale web maps use:
// 1 is the whole globe filling the window, each step up is twice as close,
// 20 is one building. 0 only exists on the flat map: the whole world at once.

const WORLD_M = 20_000_000; // height from which the globe fills the window

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 20;

export const zoomOfHeight = (heightM: number) => Math.log2(WORLD_M / heightM) + 1;
export const heightOfZoom = (zoom: number) => WORLD_M / 2 ** (zoom - 1);

/**
 * Reads what was typed into the zoom box and returns a height in metres.
 * A bare number is a zoom level; with "km" or "m" it is a height.
 */
export function parseZoom(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*(km|m)?$/);
  if (!m) return null;
  const n = +m[1];
  if (m[2]) return n > 0 ? n * (m[2] === "km" ? 1000 : 1) : null;
  return n >= MIN_ZOOM && n <= MAX_ZOOM ? heightOfZoom(n) : null;
}
