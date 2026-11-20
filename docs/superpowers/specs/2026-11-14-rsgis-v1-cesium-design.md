# rsGIS v1 — design

Date: 2026-11-14 · Status: approved

## Intent

rsGIS is an open-source, self-hosted, military-style web GIS: the free and open subset of what
commercial products such as LuciadRIA and ArcGIS offer. v1 is the smallest version that is useful
on its own: a 3D globe that works offline, shows terrain, reads military coordinates, and lets a
user place symbols and draw on the map.

## Goals (v1)

1. 3D globe with a 2D toggle, from one codebase.
2. Fully offline: every tile, script and font comes from the project's own server.
3. Terrain from DTED.
4. Layers panel: show/hide and transparency per layer.
5. Cursor coordinate readout in decimal degrees, DMS, DDM, UTM and MGRS (user picks).
6. MGRS grid overlay with zone and square labels.
7. Military symbols: place, edit (move, rename, change code), delete.
8. Draw and edit points, lines and areas; measure distance and area.
9. Drag-and-drop GeoJSON and KML/KMZ files onto the map.
10. One `docker compose up` starts everything; the HTTP API is documented.

## Non-goals (later versions)

3D models, point clouds, live tracks, line-of-sight/viewshed, multi-point tactical graphics,
WMS/WMTS/WFS, time replay, user accounts and permissions.

## Anti-goals

- Any runtime call to an online service (Cesium ion, Bing, Google, CDNs).
- Any closed-source dependency or format SDK.

## Approaches considered

| Approach | Trade-off |
|---|---|
| **CesiumJS** (picked) | True 3D globe, terrain, 2D mode from the same API, later 3D Tiles/point clouds/time for free. Costs a rewrite of the map layer. |
| Keep MapLibre + deck.gl | Least rewrite, strong 2D. 3D stays limited; terrain analysis and 3D objects get awkward. |
| MapLibre for 2D + Cesium for 3D | Best of each, but every feature is built twice. |

The owner picked CesiumJS because most of the long-term feature list is 3D.

## What exists today

- `app/`: Vue 3 + Vite + Tailwind + Pinia, MapLibre map, `milsymbol`, draw tools for areas and
  markers (about 700 lines of map-related code in `components/` and `composables/`).
- `backend/`: Rust (Axum), PostGIS tables `areas`, `symbols`, `markers` with get/create/delete
  routes, raster and vector tiles served from MBTiles, Docker compose for backend + PostGIS.

## Design

**Frontend.** Keep Vue 3, Pinia, Tailwind and `milsymbol`. Replace MapLibre, Leaflet and
mapbox-gl-draw with the `cesium` npm package, bundled locally. One Cesium `Viewer`, with a
toggle between `SCENE3D` and `SCENE2D`. Cesium ion is disabled.

**Base map.** Imagery comes from the existing raster MBTiles route
(`/api/tiles/raster/{z}/{x}/{y}`) through a URL-template imagery provider. The vector-tile route
stays in the backend but v1 does not draw it (Cesium has no native vector-tile renderer).

**Terrain.** DTED files are converted once, offline, into Cesium terrain tiles by a documented
Docker command; the backend serves the resulting folder as static files. Candidate tool:
Cesium Terrain Builder (reads DTED through GDAL). The builder verifies the tool and may swap it.

*As built (2026-11-20):* no conversion step. A small crate, `terrain/`, reads the DTED files in
`backend/storage/dted` and the backend makes Cesium `heightmap-1.0` tiles from them on request
(`/api/terrain/layer.json`, `/api/terrain/{z}/{x}/{y}.terrain`), plus a height query
(`/api/terrain/height`). No GDAL or extra tool to install, and new files only need a restart.

**Layers.** A layer store lists base imagery, terrain, symbols, markers, lines, areas, the MGRS
grid and each imported file. Each entry has visibility and opacity.

**Coordinates.** A status bar shows the cursor position in the chosen format. Conversions use
`proj4` and `mgrs`. Formatting lives in one pure module with unit tests.

**MGRS grid.** Generated on the client from the current view: grid zones when zoomed out, then
100 km, 10 km and 1 km squares as the user zooms in, with labels. Pure generator module
(view rectangle + zoom level in, lines + labels out), unit tested, drawn as Cesium primitives.

**Symbols.** `milsymbol` renders a symbol code to a canvas, shown as a Cesium billboard.
Symbols are stored in PostGIS as today.

**Drawing and measuring.** Custom mouse handlers for point, line and polygon with vertex
editing (Cesium ships no draw tool). Distance uses geodesic length; area uses `@turf/turf`,
already a dependency. Lines get a new `lines` table and route.

**File import.** Dropped GeoJSON and KML/KMZ load in the browser through Cesium's data
sources and appear as a layer. They are not saved to the server in v1.

**Backend.** Add update-by-id and delete-by-id routes where missing, the `lines` resource,
static serving of terrain tiles, and OpenAPI docs (`utoipa`) with Swagger UI at `/api/docs`.

**Deployment.** Compose file moves to the repo root and gains a frontend service (nginx
serving the built app). Database credentials move from the compose file into an `.env`
with an `.env.example`.

**Licence.** Apache-2.0, the same as CesiumJS.

## Calls made by the designer (not yet confirmed by the owner)

- Apache-2.0 licence (confirmed by the owner, 2026-11-20).
- Raster base map only in v1.
- Imported files are not saved to the server.
- OpenAPI + Swagger UI as the API documentation.
- MGRS grid goes down to 1 km squares.

## Left to the builder

- Exact terrain conversion tool and tile format.
- How vector-layer opacity is applied.
- Test tooling (suggested: `vitest` for the frontend, Axum handler tests for the backend).
- Order of work, as long as each step leaves the app running.
