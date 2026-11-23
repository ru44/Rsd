use axum::{
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use rusqlite::{params, Connection};
use std::path::PathBuf;

/// Picture tiles from `storage/satellite.mbtiles`, in the usual XYZ layout.
/// A tile the file does not have comes back as an empty, see-through PNG.
#[utoipa::path(
    get,
    path = "/api/tiles/raster/{z}/{x}/{y}",
    tag = "Map tiles",
    summary = "A satellite picture tile",
    params(("z" = u8, Path, description = "Zoom level"), ("x" = u32, Path, description = "Column, from the west"), ("y" = u32, Path, description = "Row, from the north (XYZ)")),
    responses(
        (status = 200, description = "PNG, JPEG or WebP picture", content_type = "image/png"),
        (status = 404, description = "There is no satellite.mbtiles")
    )
)]
pub async fn get_raster_tile(Path((z, x, y)): Path<(u8, u32, u32)>) -> Response {
    // MBTiles uses TMS (flipped Y) coordinate system
    let tile_y = (1 << z) - 1 - y;
    let db_path = PathBuf::from("storage/satellite.mbtiles");

    if !db_path.exists() {
        eprintln!("Satellite database not found at {:?}", db_path);
        return (StatusCode::NOT_FOUND, "Database not found").into_response();
    }

    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to open satellite database: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "DB connection error").into_response();
        }
    };

    let mut stmt = match conn.prepare(
        "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
    ) {
        Ok(stmt) => stmt,
        Err(e) => {
            eprintln!("Failed to prepare statement: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Query preparation error").into_response();
        }
    };

    let tile_data: Result<Vec<u8>, _> = stmt.query_row(params![z, x, tile_y], |row| row.get(0));

    match tile_data {
        Ok(data) => {
            let mut headers = HeaderMap::new();

            // Detect image format from magic bytes
            let content_type = if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
                "image/png"
            } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
                "image/jpeg"
            } else if data.starts_with(&[0x52, 0x49, 0x46, 0x46])
                && data.len() > 11
                && &data[8..12] == b"WEBP"
            {
                "image/webp"
            } else {
                "image/png"
            };

            headers.insert("Content-Type", content_type.parse().unwrap());
            headers.insert("Cache-Control", "public, max-age=86400".parse().unwrap());

            println!(
                "✓ Serving raster tile {}/{}/{} ({} format) - {} bytes",
                z,
                x,
                y,
                content_type,
                data.len()
            );

            (StatusCode::OK, headers, data).into_response()
        }
        Err(_) => {
            println!("○ Raster tile not found: {}/{}/{}", z, x, y);

            let empty_tile = create_empty_png_tile();

            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", "image/png".parse().unwrap());
            headers.insert("Cache-Control", "public, max-age=86400".parse().unwrap());

            (StatusCode::OK, headers, empty_tile).into_response()
        }
    }
}

/// Vector tiles from `storage/saudi.mbtiles`. Empty where there is none.
#[utoipa::path(
    get,
    path = "/api/tiles/vector/{z}/{x}/{y}",
    tag = "Map tiles",
    summary = "A vector tile (Mapbox Vector Tile)",
    params(("z" = u8, Path, description = "Zoom level"), ("x" = u32, Path, description = "Column, from the west"), ("y" = u32, Path, description = "Row, from the north (XYZ)")),
    responses(
        (status = 200, description = "Protocol buffer, possibly gzipped", content_type = "application/x-protobuf")
    )
)]
pub async fn get_vector_tile(Path((z, x, y)): Path<(u8, u32, u32)>) -> Response {
    let tile_y = (1 << z) - 1 - y;
    let db_path = PathBuf::from("storage/saudi.mbtiles");

    if !db_path.exists() {
        eprintln!("Vector database not found at {:?}", db_path);
        return empty_vector_tile_response();
    }

    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to open vector database: {}", e);
            return empty_vector_tile_response();
        }
    };

    let mut stmt = match conn.prepare(
        "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
    ) {
        Ok(stmt) => stmt,
        Err(e) => {
            eprintln!("Failed to prepare statement: {}", e);
            return empty_vector_tile_response();
        }
    };

    let tile_data: Result<Vec<u8>, _> = stmt.query_row(params![z, x, tile_y], |row| row.get(0));

    match tile_data {
        Ok(data) => {
            let mut headers = HeaderMap::new();

            let is_gzipped = data.starts_with(&[0x1f, 0x8b]);

            headers.insert("Content-Type", "application/x-protobuf".parse().unwrap());
            if is_gzipped {
                headers.insert("Content-Encoding", "gzip".parse().unwrap());
            }
            headers.insert("Cache-Control", "public, max-age=86400".parse().unwrap());

            println!(
                "✓ Serving vector tile {}/{}/{} ({}compressed) - {} bytes",
                z,
                x,
                y,
                if is_gzipped { "" } else { "un" },
                data.len()
            );

            (StatusCode::OK, headers, data).into_response()
        }
        Err(_) => {
            println!("○ Vector tile not found: {}/{}/{}", z, x, y);
            empty_vector_tile_response()
        }
    }
}

// Transparent 256x256 PNG
fn create_empty_png_tile() -> Vec<u8> {
    vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00, 0x66,
        0xBC, 0x3A, 0x25, 0x00, 0x00, 0x00, 0x03, 0x50, 0x4C, 0x54, 0x45, 0x00, 0x00, 0x00, 0xA1,
        0x9B, 0x0F, 0x15, 0x00, 0x00, 0x00, 0x01, 0x74, 0x52, 0x4E, 0x53, 0x00, 0x40, 0xE6, 0xD8,
        0x66, 0x00, 0x00, 0x00, 0x1F, 0x49, 0x44, 0x41, 0x54, 0x68, 0xDE, 0xED, 0xC1, 0x01, 0x0D,
        0x00, 0x00, 0x00, 0xC2, 0xA0, 0xF7, 0x4F, 0x6D, 0x0E, 0x37, 0xA0, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0xBE, 0x0D, 0x21, 0x00, 0x00, 0x01, 0x9A, 0x60, 0xE1, 0xD5,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ]
}

// Empty vector tile response
fn empty_vector_tile_response() -> Response {
    let empty_mvt = vec![];
    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/x-protobuf".parse().unwrap());
    headers.insert("Cache-Control", "public, max-age=86400".parse().unwrap());

    (StatusCode::OK, headers, empty_mvt).into_response()
}
