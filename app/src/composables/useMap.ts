import { ref, shallowRef } from "vue";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:7000";

export interface LonLat {
  lon: number;
  lat: number;
}
type MapClick = (pos: LonLat) => void;

// The viewer must never be made deeply reactive: Vue proxies break Cesium.
const viewer = shallowRef<Cesium.Viewer | null>(null);
const is3D = ref(true);
const cursor = ref<LonLat | null>(null);
const cameraHeightKm = ref(0);
const hasSatellite = ref(false);

const leftClickListeners = new Set<MapClick>();
const rightClickListeners = new Set<() => void>();

function pick(v: Cesium.Viewer, screen: Cesium.Cartesian2): LonLat | null {
  const cart = v.camera.pickEllipsoid(screen, v.scene.globe.ellipsoid);
  if (!cart) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  return {
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
  };
}

/** Adds the backend's satellite tiles on top of the built-in map, if served. */
async function addSatelliteLayer(v: Cesium.Viewer) {
  const base = `${API_URL}/api/tiles/raster`;
  try {
    const probe = await fetch(`${base}/0/0/0`, { method: "HEAD" });
    if (!probe.ok) return;
  } catch {
    return; // backend not running: stay on the built-in map
  }
  if (v.isDestroyed()) return;
  v.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: `${base}/{z}/{x}/{y}`,
      maximumLevel: 18,
    })
  );
  hasSatellite.value = true;
}

export function useMap() {
  function init(containerId = "map") {
    if (viewer.value) return;

    // Offline base map: the Natural Earth imagery that ships inside Cesium.
    const baseLayer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
      ),
      {}
    );

    const v = new Cesium.Viewer(containerId, {
      baseLayer,
      // Everything below would either call an online service or duplicate
      // controls the app draws itself.
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    // Default double-click zooms onto an entity and locks the camera to it.
    v.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );

    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(39.2056453, 21.5891922, 6_000_000),
    });

    const updateHeight = () => {
      // In the flat 2D view the camera has no meaningful altitude, so report
      // how wide the visible map is instead (see `is3D` for the label).
      const metres =
        v.scene.mode === Cesium.SceneMode.SCENE3D
          ? v.camera.positionCartographic.height
          : v.camera.getMagnitude();
      const km = metres / 1000;
      cameraHeightKm.value = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
    };
    v.camera.percentageChanged = 0.02;
    v.camera.changed.addEventListener(updateHeight);
    v.scene.morphComplete.addEventListener(updateHeight);
    updateHeight();

    const input = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    input.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      cursor.value = pick(v, e.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    input.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pos = pick(v, e.position);
      if (pos) leftClickListeners.forEach((fn) => fn(pos));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    input.setInputAction(() => {
      rightClickListeners.forEach((fn) => fn());
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    viewer.value = v;
    addSatelliteLayer(v);
  }

  function toggleMode() {
    const v = viewer.value;
    if (!v) return;
    is3D.value = !is3D.value;
    if (is3D.value) v.scene.morphTo3D(0.8);
    else v.scene.morphTo2D(0.8);
  }

  /** Subscribe to map clicks. Returns a function that unsubscribes. */
  function onLeftClick(fn: MapClick) {
    leftClickListeners.add(fn);
    return () => leftClickListeners.delete(fn);
  }
  function onRightClick(fn: () => void) {
    rightClickListeners.add(fn);
    return () => rightClickListeners.delete(fn);
  }

  return {
    viewer,
    is3D,
    cursor,
    cameraHeightKm,
    hasSatellite,
    init,
    toggleMode,
    onLeftClick,
    onRightClick,
  };
}
