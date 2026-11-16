import { formatDistance } from "./shapes";

/**
 * A scale bar: the longest round distance (1, 2 or 5 times a power of ten)
 * that fits in `maxPx` pixels, given how many metres one pixel covers.
 */
export function scaleBar(metresPerPx: number, maxPx = 110): { px: number; label: string } | null {
  if (!(metresPerPx > 0) || !Number.isFinite(metresPerPx)) return null;
  const most = metresPerPx * maxPx;
  const power = 10 ** Math.floor(Math.log10(most));
  const metres = [5, 2, 1].map((n) => n * power).find((m) => m <= most)!;
  return { px: Math.round(metres / metresPerPx), label: formatDistance(metres) };
}
