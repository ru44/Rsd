import * as Cesium from "cesium";
import { useMap } from "./useMap";

// The page address always describes the current view, as
//   #@21.58919,39.20565,6000000m      (latitude, longitude, eye altitude)
// with ",flat" added for the flat map. Reloading keeps the view, and the
// address can be sent to someone else to show them the same place.

interface View {
  lat: number;
  lon: number;
  heightM: number;
  flat: boolean;
}

export function parseViewLink(hash: string): View | null {
  const m = hash.match(/^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)m(,flat)?$/);
  if (!m) return null;
  const [lat, lon, heightM] = [+m[1], +m[2], +m[3]];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || heightM < 1) return null;
  return { lat, lon, heightM, flat: !!m[4] };
}

export function formatViewLink(v: View): string {
  return `#@${v.lat.toFixed(5)},${v.lon.toFixed(5)},${Math.round(v.heightM)}m${v.flat ? ",flat" : ""}`;
}

let hooked = false;

export function useViewLink() {
  const { viewer, is3D } = useMap();

  function current(): View | null {
    const v = viewer.value;
    if (!v || v.scene.mode === Cesium.SceneMode.MORPHING) return null;
    const flat = v.scene.mode !== Cesium.SceneMode.SCENE3D;
    const c = v.camera.positionCartographic;
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
      // The flat map has no altitude; its width plays the same part.
      heightM: flat ? v.camera.getMagnitude() : c.height,
      flat,
    };
  }

  function write() {
    const view = current();
    // Keep the router's own state: replacing it with null confuses vue-router.
    if (view) history.replaceState(history.state, "", formatViewLink(view));
  }

  /** Goes to the view in the address, if there is one, then keeps the address up to date. */
  function attach() {
    const v = viewer.value;
    if (!v || hooked) return;
    hooked = true;
    const view = parseViewLink(location.hash);
    if (view) {
      if (view.flat) {
        is3D.value = false;
        v.scene.morphTo2D(0);
      }
      v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(view.lon, view.lat, view.heightM) });
    }
    v.camera.moveEnd.addEventListener(write);
    v.scene.morphComplete.addEventListener(write);
  }

  /** Puts a link to the current view on the clipboard. False if the browser refused. */
  async function copy(): Promise<boolean> {
    write();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // No clipboard access (plain http on a network address): fall back to
      // the older way, which works from a click.
      const box = document.createElement("textarea");
      box.value = url;
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      return ok;
    }
  }

  return { attach, copy };
}
