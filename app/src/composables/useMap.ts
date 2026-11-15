import { ref, shallowRef } from "vue";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:7000";

export interface LonLat {
  lon: number;
  lat: number;
}
/** `entityId` is the map object under the pointer, if any. Return true to claim the click. */
type MapClick = (pos: LonLat, entityId: string | null) => boolean | void;
/** A press-move-release gesture on the map. `start` returns true to take it. */
export interface DragHandler {
  start(pos: LonLat, entityId: string | null): boolean;
  move(pos: LonLat): void;
  end(): void;
}

// The viewer must never be made deeply reactive: Vue proxies break Cesium.
const viewer = shallowRef<Cesium.Viewer | null>(null);
const is3D = ref(true);
const cursor = ref<LonLat | null>(null);
const cameraHeightKm = ref(0);
const hasSatellite = ref(false);

const leftClickListeners: MapClick[] = [];
const rightClickListeners: MapClick[] = [];
/** Runs only when no other listener claimed the click (used for selecting). */
let unclaimedClick: MapClick | null = null;
const dragHandlers: DragHandler[] = [];
let activeDrag: DragHandler | null = null;

function pick(v: Cesium.Viewer, screen: Cesium.Cartesian2): LonLat | null {
  const cart = v.camera.pickEllipsoid(screen, v.scene.globe.ellipsoid);
  if (!cart) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  return {
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
  };
}

function pickEntityId(v: Cesium.Viewer, screen: Cesium.Cartesian2): string | null {
  const picked = v.scene.pick(screen);
  return picked?.id instanceof Cesium.Entity ? picked.id.id : null;
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
      // Cesium's logo strip is parked off-screen; the margin bar credits the
      // map engine and the base map in text instead.
      creditContainer: document.createElement("div"),
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
    const Type = Cesium.ScreenSpaceEventType;

    input.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const pos = pick(v, e.endPosition);
      cursor.value = pos;
      if (activeDrag && pos) activeDrag.move(pos);
    }, Type.MOUSE_MOVE);

    input.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pos = pick(v, e.position);
      if (!pos) return;
      const id = pickEntityId(v, e.position);
      for (const fn of leftClickListeners) if (fn(pos, id) === true) return;
      unclaimedClick?.(pos, id);
    }, Type.LEFT_CLICK);

    input.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pos = pick(v, e.position);
      if (!pos) return;
      const id = pickEntityId(v, e.position);
      for (const fn of rightClickListeners) if (fn(pos, id) === true) return;
    }, Type.RIGHT_CLICK);

    // Dragging a map object: the camera is frozen while a handler owns the drag.
    input.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pos = pick(v, e.position);
      if (!pos || dragHandlers.length === 0) return;
      const id = pickEntityId(v, e.position);
      activeDrag = dragHandlers.find((h) => h.start(pos, id)) ?? null;
      if (activeDrag) v.scene.screenSpaceCameraController.enableInputs = false;
    }, Type.LEFT_DOWN);

    input.setInputAction(() => {
      if (!activeDrag) return;
      activeDrag.end();
      activeDrag = null;
      v.scene.screenSpaceCameraController.enableInputs = true;
    }, Type.LEFT_UP);

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

  return {
    viewer,
    is3D,
    cursor,
    cameraHeightKm,
    hasSatellite,
    init,
    toggleMode,
    onLeftClick: (fn: MapClick) => void leftClickListeners.push(fn),
    onRightClick: (fn: MapClick) => void rightClickListeners.push(fn),
    onUnclaimedClick: (fn: MapClick) => void (unclaimedClick = fn),
    onDrag: (handler: DragHandler) => void dragHandlers.push(handler),
  };
}
