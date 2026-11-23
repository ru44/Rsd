//! Terrain for the 3D globe, made from the DTED files in `storage/dted`.

use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use rsgis_terrain::Terrain;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::{IntoParams, ToSchema};

/// None when the server has no DTED files.
pub type TerrainState = Option<Arc<Terrain>>;

fn no_terrain() -> Response {
    (StatusCode::NOT_FOUND, "No terrain: put DTED files (.dt0, .dt1, .dt2) in storage/dted").into_response()
}

/// Describes the terrain in the `heightmap-1.0` layout, for CesiumJS's
/// `CesiumTerrainProvider.fromUrl("/api/terrain")`.
#[utoipa::path(
    get,
    path = "/api/terrain/layer.json",
    tag = "Terrain",
    summary = "What terrain there is",
    responses(
        (status = 200, description = "Tile set description (TileJSON with Cesium's fields)", content_type = "application/json"),
        (status = 404, description = "The server has no DTED files")
    )
)]
pub async fn layer(State(terrain): State<TerrainState>) -> Response {
    let Some(t) = terrain else { return no_terrain() };
    ([(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-cache")], t.layer_json()).into_response()
}

/// 65 by 65 heights for one square of the geographic grid (two squares
/// cover the world at level 0; rows counted from the south). Made from the
/// DTED files when asked for.
#[utoipa::path(
    get,
    path = "/api/terrain/{z}/{x}/{y}.terrain",
    tag = "Terrain",
    summary = "A terrain tile (heightmap-1.0)",
    params(
        ("z" = u32, Path, description = "Level"),
        ("x" = u32, Path, description = "Column, from the date line eastward"),
        ("y" = u32, Path, description = "Row, from the south pole northward (TMS)")
    ),
    responses(
        (status = 200, description = "Heights as (metres + 1000) x 5, 16-bit little-endian, from the north-west corner; then a byte saying which of the four children exist, and a water mask byte", content_type = "application/octet-stream"),
        (status = 404, description = "Outside the grid, more detailed than the data, or no DTED files")
    )
)]
pub async fn tile(State(terrain): State<TerrainState>, Path((z, x, file)): Path<(u32, u32, String)>) -> Response {
    let Some(t) = terrain else { return no_terrain() };
    let Some(y) = file.strip_suffix(".terrain").and_then(|y| y.parse().ok()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    // Reading DTED files is disk work: keep it off the threads that answer requests.
    match tokio::task::spawn_blocking(move || t.tile(z, x, y)).await {
        Ok(Some(bytes)) => (
            [(header::CONTENT_TYPE, "application/octet-stream"), (header::CACHE_CONTROL, "public, max-age=3600")],
            bytes,
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct Place {
    /// Longitude in degrees, east positive.
    #[param(example = 40.42)]
    lon: f64,
    /// Latitude in degrees, north positive.
    #[param(example = 21.27)]
    lat: f64,
}

#[derive(Serialize, ToSchema)]
pub struct Height {
    /// Metres above mean sea level, from the DTED files; null where they have no data.
    #[schema(example = 1879.5)]
    height_m: Option<f64>,
}

#[utoipa::path(
    get,
    path = "/api/terrain/height",
    tag = "Terrain",
    summary = "Height of the ground at a place",
    params(Place),
    responses(
        (status = 200, description = "The height", body = Height),
        (status = 404, description = "The server has no DTED files")
    )
)]
pub async fn height(State(terrain): State<TerrainState>, Query(at): Query<Place>) -> Response {
    let Some(t) = terrain else { return no_terrain() };
    if !(-180.0..=180.0).contains(&at.lon) || !(-90.0..=90.0).contains(&at.lat) {
        return (StatusCode::BAD_REQUEST, "lon must be -180 to 180 and lat -90 to 90").into_response();
    }
    match tokio::task::spawn_blocking(move || t.height(at.lon, at.lat)).await {
        Ok(h) => Json(Height { height_m: h.map(|m| (m * 10.0).round() / 10.0) }).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
