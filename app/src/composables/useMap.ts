import { computed, ref, shallowRef } from "vue";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { tool } from "./tool";

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
/** Which way the top of the screen faces, in degrees clockwise from north. */
const heading = ref(0);
/** How far the view leans: -90 looks straight down, 0 looks at the horizon. */
const pitch = ref(-90);
/** Re-reads height, heading and the rest from the camera. */
let refresh = () => {};
/** Ground distance covered by one pixel at the middle of the view; 0 if unknown. */
const metresPerPx = ref(0);
/** The same, in metres and unrounded, for the zoom control. */
const cameraHeightM = ref(0);
/** Where a zoom still in flight is heading, so repeated presses add up. */
let zoomTarget: number | null = null;
export const MIN_HEIGHT_M = 30;
// Furthest out: the globe just fills the window, and the flat map shows the
// whole world. Any further and there is only space to look at.
const MAX_GLOBE_M = 20_000_000;
const MAX_FLAT_M = 40_000_000;
const maxHeightM = computed(() => (is3D.value ? MAX_GLOBE_M : MAX_FLAT_M));
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
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
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

/** Whether anything that can be pointed at is on the map. */
function hasThings(v: Cesium.Viewer) {
  if (v.entities.values.length) return true;
  for (let i = 0; i < v.dataSources.length; i++) if (v.dataSources.get(i).entities.values.length) return true;
  return false;
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
  v.scene.requestRender();
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
      // Draw a frame only when something has changed, instead of 60 times a
      // second for ever. This is what keeps the app light when the map is still.
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      // Half the usual edge smoothing: far cheaper on large screens, still clean lines.
      msaaSamples: 2,
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

    // Open the app with ?fps in the address to see how fast the map is drawing.
    // The app normally draws a frame only when something changes, which makes
    // a frame counter read low while the map is still. So with ?fps it draws
    // all the time, and the number shows what the machine can really do (60 at most).
    if (new URLSearchParams(location.search).has("fps")) {
      v.scene.debugShowFramesPerSecond = true;
      v.scene.requestRenderMode = false;
    }

    // Default double-click zooms onto an entity and locks the camera to it.
    v.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );

    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(39.2056453, 21.5891922, 6_000_000),
    });
    // The mouse wheel stops where the zoom buttons do.
    v.scene.screenSpaceCameraController.maximumZoomDistance = MAX_GLOBE_M;
    v.scene.screenSpaceCameraController.minimumZoomDistance = MIN_HEIGHT_M;

    const updateHeight = () => {
      // In the flat 2D view the camera has no meaningful altitude, so report
      // how wide the visible map is instead (see `is3D` for the label).
      const metres =
        v.scene.mode === Cesium.SceneMode.SCENE3D
          ? v.camera.positionCartographic.height
          : v.camera.getMagnitude();
      cameraHeightM.value = metres;
      heading.value = v.scene.mode === Cesium.SceneMode.SCENE3D ? Cesium.Math.toDegrees(v.camera.heading) % 360 : 0;
      pitch.value = v.scene.mode === Cesium.SceneMode.SCENE3D ? Cesium.Math.toDegrees(v.camera.pitch) : -90;
      // Measure the ground between two points 100 pixels apart at mid-screen.
      const { clientWidth: w, clientHeight: h } = v.scene.canvas;
      const a = v.camera.pickEllipsoid(new Cesium.Cartesian2(w / 2 - 50, h / 2), v.scene.globe.ellipsoid);
      const b = v.camera.pickEllipsoid(new Cesium.Cartesian2(w / 2 + 50, h / 2), v.scene.globe.ellipsoid);
      metresPerPx.value =
        a && b ? new Cesium.EllipsoidGeodesic(Cesium.Cartographic.fromCartesian(a), Cesium.Cartographic.fromCartesian(b)).surfaceDistance / 100 : 0;
      const km = metres / 1000;
      cameraHeightKm.value = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
    };
    refresh = updateHeight;
    v.camera.percentageChanged = 0.02;
    v.camera.changed.addEventListener(updateHeight);
    v.scene.morphComplete.addEventListener(updateHeight);
    v.camera.moveEnd.addEventListener(() => {
      zoomTarget = null;
      updateHeight();
    });
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

    // Things the map engine cannot see changing for itself: a shape that
    // follows the pointer, a picture that has just finished loading. A frame
    // is asked for on every press, key and scroll, and twice a second regardless.
    const wake = () => v.scene.requestRender();
    for (const type of ["pointerdown", "pointerup", "keydown", "keyup", "wheel"]) window.addEventListener(type, wake, { passive: true });
    setInterval(wake, 500);

    on<Cesium.ScreenSpaceEventHandler.MotionEvent>(Type.MOUSE_MOVE, (e) => {
      const pos = pick(v, e.endPosition);
      cursor.value = pos;
      // A drawing or a dragged shape follows the pointer, so it needs a new frame.
      if (activeDrag || (tool.value !== "select" && tool.value !== "hand")) wake();
      if (activeDrag) {
        if (downAt && Cesium.Cartesian2.distance(downAt, e.endPosition) > 4) dragMoved = true;
        if (pos) activeDrag.move(pos);
        return;
      }
      // Looking up what is under the pointer is the most expensive thing the
      // app does: the graphics card has to stop and answer. So it is done only
      // once the pointer has come to rest, only with the select tool (the one
      // whose cursor depends on it), and only if there is anything to find.
      clearTimeout(hoverTimer);
      if (pressed.value || tool.value !== "select") {
        hover.value = null;
        return;
      }
      const at = Cesium.Cartesian2.clone(e.endPosition);
      hoverTimer = setTimeout(() => {
        if (pressed.value || v.isDestroyed()) return;
        hover.value = hasThings(v) ? pickEntityId(v, at) : null;
      }, 90);
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
      // Only the select tool drags things; the other tools do not need to know what was pressed.
      const id = tool.value === "select" && hasThings(v) ? pickEntityId(v, e.position) : null;
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
    // Cesium goes back to the whole world when it changes shape, so put the
    // view back over the same place, from the same distance, afterwards.
    const at = v.camera.positionCartographic.clone();
    const height = cameraHeightM.value || at.height;
    const restore = v.scene.morphComplete.addEventListener(() => {
      restore();
      v.camera.setView({ destination: Cesium.Cartesian3.fromRadians(at.longitude, at.latitude, height) });
    });
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

  /** Keeps looking at the same place, from `heightM` up. */
  function zoomTo(heightM: number) {
    const v = viewer.value;
    if (!v || !Number.isFinite(heightM)) return;
    const h = Math.min(maxHeightM.value, Math.max(MIN_HEIGHT_M, heightM));
    zoomTarget = h;
    const at = v.camera.positionCartographic;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(at.longitude, at.latitude, h),
      orientation: { heading: v.camera.heading, pitch: v.camera.pitch, roll: v.camera.roll },
      duration: 0.35,
    });
  }
  /** The place on the ground at the middle of the screen. */
  function centre(v: Cesium.Viewer) {
    const { clientWidth: w, clientHeight: h } = v.scene.canvas;
    return v.camera.pickEllipsoid(new Cesium.Cartesian2(w / 2, h / 2), v.scene.globe.ellipsoid);
  }

  /** Swings the view round the middle of the screen to face and lean a new way. */
  function orbit(headingDeg: number, pitchDeg: number, duration = 0.5) {
    const v = viewer.value;
    if (!v || v.scene.mode !== Cesium.SceneMode.SCENE3D) return;
    const mid = centre(v);
    if (!mid) return;
    const range = Cesium.Cartesian3.distance(v.camera.positionWC, mid);
    v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(mid, 0), {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(headingDeg), Cesium.Math.toRadians(pitchDeg), range),
      duration,
    });
  }

  /** Turns the map so north is up, keeping how far it leans. */
  const resetNorth = () => orbit(0, pitch.value);
  /** Leans the view over to see height, or stands it back up to look straight down. */
  const toggleTilt = () => orbit(heading.value, pitch.value < -80 ? -40 : -90);
  /** Spins the map about the middle of the screen, clockwise for positive degrees. */
  function rotateBy(deg: number) {
    const v = viewer.value;
    if (!v || v.scene.mode !== Cesium.SceneMode.SCENE3D) return;
    const mid = centre(v);
    if (!mid) return;
    v.camera.rotate(Cesium.Cartesian3.normalize(mid, new Cesium.Cartesian3()), Cesium.Math.toRadians(deg));
    refresh();
  }

  /** `factor` below 1 goes closer, above 1 further away. */
  const zoomBy = (factor: number) => zoomTo((zoomTarget ?? cameraHeightM.value) * factor);

  /** Moves the view to look straight down at a place from `heightM` up. */
  /** Asks for one new frame. Call after changing something the map engine does not watch. */
  const redraw = () => viewer.value?.scene.requestRender();

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
    cameraHeightM,
    heading,
    pitch,
    metresPerPx,
    resetNorth,
    toggleTilt,
    rotateBy,
    maxHeightM,
    zoomTo,
    zoomBy,
    hasSatellite,
    baseMap,
    hover,
    pressed,
    dragging,
    init,
    toggleMode,
    setBaseMap,
    redraw,
    flyTo,
    onLeftClick: (fn: MapClick) => void leftClickListeners.push(fn),
    onRightClick: (fn: MapClick) => void rightClickListeners.push(fn),
    onUnclaimedClick: (fn: MapClick) => void (unclaimedClick = fn),
    onDrag: (handler: DragHandler) => void dragHandlers.push(handler),
  };
}
