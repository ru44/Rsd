import { ref, shallowRef } from "vue";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:7000";
/** Set VITE_ONLINE_MAPS=false to leave out every base map that needs the internet. */
export const ONLINE_MAPS: boolean = import.meta.env.VITE_ONLINE_MAPS !== "false";

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
  /** `moved` is false when the pointer stayed put: a click, not a drag. */
  end(moved: boolean): void;
}

/**
 * world: the Natural Earth picture that ships with the app.
 * dark: the same, dimmed so symbols and the grid stand out.
 * satellite: tiles served by the backend, when it has them.
 * streets: OpenStreetMap, the only one that needs the internet.
 */
export type BaseMapId = "world" | "dark" | "satellite" | "streets";
const BASE_MAP_KEY = "rsgis.baseMap";

// The viewer must never be made deeply reactive: Vue proxies break Cesium.
const viewer = shallowRef<Cesium.Viewer | null>(null);
const is3D = ref(true);
const cursor = ref<LonLat | null>(null);
const cameraHeightKm = ref(0);
const hasSatellite = ref(false);
const baseMap = ref<BaseMapId>("world");
/** The map object under the pointer, for choosing the mouse cursor. */
const hover = ref<string | null>(null);
/** True while the left button is held down on the map. */
const pressed = ref(false);
/** True while a map object, not the map itself, is being dragged. */
const dragging = ref(false);

const leftClickListeners: MapClick[] = [];
const rightClickListeners: MapClick[] = [];
/** Runs only when no other listener claimed the click (used for selecting). */
let unclaimedClick: MapClick | null = null;
const dragHandlers: DragHandler[] = [];
let activeDrag: DragHandler | null = null;
let downAt: Cesium.Cartesian2 | null = null;
let dragMoved = false;
let lastHoverPick = 0;
let shift = false;

let worldLayer: Cesium.ImageryLayer | null = null;
let satelliteLayer: Cesium.ImageryLayer | null = null;
let streetsLayer: Cesium.ImageryLayer | null = null;

/** Whether Shift is down, for "keep it square" while drawing. */
export const shiftHeld = () => shift;

function pick(v: Cesium.Viewer, screen: Cesium.Cartesian2): LonLat | null {
  const cart = v.camera.pickEllipsoid(screen, v.scene.globe.ellipsoid);
  if (!cart) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  return {
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
  };
}

// A few pixels of slack, so thin lines and small handles are easy to hit.
function pickEntityId(v: Cesium.Viewer, screen: Cesium.Cartesian2): string | null {
  const picked = v.scene.pick(screen, 7, 7);
  return picked?.id instanceof Cesium.Entity ? picked.id.id : null;
}

function savedBaseMap(): BaseMapId | null {
  try {
    const id = localStorage.getItem(BASE_MAP_KEY);
    return id === "world" || id === "dark" || id === "satellite" || id === "streets" ? id : null;
  } catch {
    return null; // storage blocked: start on the default
  }
}

/** Shows the chosen base map and hides the others. */
function applyBaseMap() {
  const v = viewer.value;
  if (!v || !worldLayer) return;
  const id = baseMap.value;
  const dark = id === "dark";
  worldLayer.brightness = dark ? 0.42 : 1;
  worldLayer.saturation = dark ? 0.25 : 1;
  worldLayer.contrast = dark ? 1.15 : 1;
  if (satelliteLayer) satelliteLayer.show = id === "satellite";
  if (id === "streets" && !streetsLayer) {
    streetsLayer = v.imageryLayers.addImageryProvider(
      new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/", maximumLevel: 19 })
    );
  }
  if (streetsLayer) streetsLayer.show = id === "streets";
}

/** Looks for the backend's satellite tiles and offers them if they are there. */
async function findSatelliteLayer(v: Cesium.Viewer) {
  const base = `${API_URL}/api/tiles/raster`;
  try {
    const probe = await fetch(`${base}/0/0/0`, { method: "HEAD" });
    if (!probe.ok) return;
  } catch {
    return; // backend not running: stay on the built-in map
  }
  if (v.isDestroyed()) return;
  satelliteLayer = v.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({ url: `${base}/{z}/{x}/{y}`, maximumLevel: 18 }),
    1 // just above the built-in map, below anything added later
  );
  hasSatellite.value = true;
  // Imagery wins by default, unless the person already chose something else.
  const saved = savedBaseMap();
  if (!saved || saved === "satellite") baseMap.value = "satellite";
  applyBaseMap();
}

export function useMap() {
  function init(containerId = "map") {
    if (viewer.value) return;

    // Offline base map: the Natural Earth imagery that ships inside Cesium.
    worldLayer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
      ),
      {}
    );

    const v = new Cesium.Viewer(containerId, {
      baseLayer: worldLayer,
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
    // Read once more after the first frame: a view set before then (from a
    // shared link) does not count as a change.
    const afterFirstFrame = v.scene.postRender.addEventListener(() => {
      updateHeight();
      afterFirstFrame();
    });

    const input = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    const Type = Cesium.ScreenSpaceEventType;
    // Cesium sends events made with Shift held to separate listeners, so
    // each action is registered twice to keep working while Shift is down.
    const on = <E>(type: Cesium.ScreenSpaceEventType, fn: (e: E) => void) => {
      input.setInputAction(fn as never, type);
      input.setInputAction(fn as never, type, Cesium.KeyboardEventModifier.SHIFT);
    };

    on<Cesium.ScreenSpaceEventHandler.MotionEvent>(Type.MOUSE_MOVE, (e) => {
      const pos = pick(v, e.endPosition);
      cursor.value = pos;
      if (activeDrag) {
        if (downAt && Cesium.Cartesian2.distance(downAt, e.endPosition) > 4) dragMoved = true;
        if (pos) activeDrag.move(pos);
        return;
      }
      // Looking up what is under the pointer costs a little, so do it at
      // most 20 times a second, and not while the map is being moved.
      const now = performance.now();
      if (pressed.value || now - lastHoverPick < 50) return;
      lastHoverPick = now;
      hover.value = pickEntityId(v, e.endPosition);
    });

    on<Cesium.ScreenSpaceEventHandler.PositionedEvent>(Type.LEFT_CLICK, (e) => {
      const pos = pick(v, e.position);
      if (!pos) return;
      const id = pickEntityId(v, e.position);
      for (const fn of leftClickListeners) if (fn(pos, id) === true) return;
      unclaimedClick?.(pos, id);
    });

    on<Cesium.ScreenSpaceEventHandler.PositionedEvent>(Type.RIGHT_CLICK, (e) => {
      const pos = pick(v, e.position);
      if (!pos) return;
      const id = pickEntityId(v, e.position);
      for (const fn of rightClickListeners) if (fn(pos, id) === true) return;
    });

    // Dragging a map object: the camera is frozen while a handler owns the drag.
    on<Cesium.ScreenSpaceEventHandler.PositionedEvent>(Type.LEFT_DOWN, (e) => {
      pressed.value = true;
      const pos = pick(v, e.position);
      if (!pos || dragHandlers.length === 0) return;
      const id = pickEntityId(v, e.position);
      activeDrag = dragHandlers.find((h) => h.start(pos, id)) ?? null;
      if (!activeDrag) return;
      downAt = Cesium.Cartesian2.clone(e.position);
      dragMoved = false;
      dragging.value = true;
      v.scene.screenSpaceCameraController.enableInputs = false;
    });

    const release = () => {
      pressed.value = false;
      if (!activeDrag) return;
      const handler = activeDrag;
      activeDrag = null;
      dragging.value = false;
      v.scene.screenSpaceCameraController.enableInputs = true;
      handler.end(dragMoved);
    };
    on(Type.LEFT_UP, release);
    // The button can be let go outside the map, where Cesium does not see it.
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", release);
    const trackShift = (e: KeyboardEvent) => (shift = e.shiftKey);
    window.addEventListener("keydown", trackShift);
    window.addEventListener("keyup", trackShift);

    viewer.value = v;
    const saved = savedBaseMap();
    if (saved === "dark" || (saved === "streets" && ONLINE_MAPS)) baseMap.value = saved;
    applyBaseMap();
    findSatelliteLayer(v);
  }

  function toggleMode() {
    const v = viewer.value;
    if (!v) return;
    is3D.value = !is3D.value;
    if (is3D.value) v.scene.morphTo3D(0.8);
    else v.scene.morphTo2D(0.8);
  }

  function setBaseMap(id: BaseMapId) {
    if (id === "satellite" && !hasSatellite.value) return;
    if (id === "streets" && !ONLINE_MAPS) return;
    baseMap.value = id;
    try {
      localStorage.setItem(BASE_MAP_KEY, id);
    } catch {
      // storage blocked: the choice lasts until the page is closed
    }
    applyBaseMap();
  }

  /** Moves the view to look straight down at a place from `heightM` up. */
  function flyTo(lon: number, lat: number, heightM: number) {
    viewer.value?.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
      duration: 1.4,
    });
  }

  return {
    viewer,
    is3D,
    cursor,
    cameraHeightKm,
    hasSatellite,
    baseMap,
    hover,
    pressed,
    dragging,
    init,
    toggleMode,
    setBaseMap,
    flyTo,
    onLeftClick: (fn: MapClick) => void leftClickListeners.push(fn),
    onRightClick: (fn: MapClick) => void rightClickListeners.push(fn),
    onUnclaimedClick: (fn: MapClick) => void (unclaimedClick = fn),
    onDrag: (handler: DragHandler) => void dragHandlers.push(handler),
  };
}
