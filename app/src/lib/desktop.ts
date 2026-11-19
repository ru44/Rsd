// Extras that exist only when rsGIS runs as the desktop app (Tauri, see
// src-tauri/). In a browser `isDesktop` is false and none of this is used.
import { invoke, isTauri } from "@tauri-apps/api/core";

declare global {
  interface Window {
    /** Address of the app's own local API, set by the desktop window. */
    __RSGIS_API__?: string;
  }
}

export const isDesktop: boolean = isTauri();

export const desktopApiUrl: string | undefined =
  typeof window === "undefined" ? undefined : window.__RSGIS_API__;

/** An MBTiles file the person added, as the desktop app describes it. */
export interface MapInfo {
  name: string;
  path: string;
  minzoom: number;
  maxzoom: number;
  /** West, south, east, north in degrees. */
  bounds: [number, number, number, number] | null;
}

/**
 * The tile at the middle of a map file, at its widest zoom, as [z, x, y],
 * for a preview. Many downloaded maps cover one region and have nothing at 0/0/0.
 */
export function previewTile(info: Pick<MapInfo, "minzoom" | "maxzoom" | "bounds"> | null): number[] {
  if (!info) return [0, 0, 0];
  const [w, s, e, n] = info.bounds ?? [-180, -85, 180, 85];
  const z = Math.max(0, Math.min(info.minzoom, info.maxzoom));
  const tiles = 2 ** z;
  const lat = (((s + n) / 2) * Math.PI) / 180;
  const clamp = (t: number) => Math.min(tiles - 1, Math.max(0, Math.floor(t)));
  const x = clamp((((w + e) / 2 + 180) / 360) * tiles);
  const y = clamp(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * tiles);
  return [z, x, y];
}

/** Opens the file chooser; null when the person cancels. Throws with a readable reason. */
export const addMapFile = () => invoke<MapInfo | null>("add_map_file");

export const removeMapFile = () => invoke<void>("remove_map_file");
