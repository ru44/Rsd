mod handlers;
mod db;
mod docs;

use axum::{ routing::{ get, put }, response::Html, Router };
use rsgis_terrain::Terrain;
use std::{ path::PathBuf, sync::Arc };
use tower_http::cors::CorsLayer;
use dotenvy::dotenv;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use handlers::{
    tiles::{get_raster_tile, get_vector_tile},
    areas::{ get_areas, create_area, delete_areas, update_area, delete_area },
    symbols::{ get_symbols, create_symbol, delete_symbols, update_symbol, delete_symbol },
    markers::{ get_markers, create_marker, delete_markers },
    terrain,
};

#[tokio::main]
async fn main() {
    dotenv().ok();

    let db_pool = db::init_pg_pool().await.expect("Failed to connect to DB");

    // Terrain comes from whatever DTED files are in this folder.
    let dted_dir = PathBuf::from(std::env::var("DTED_DIR").unwrap_or_else(|_| "storage/dted".into()));
    let found = {
        let dir = dted_dir.clone();
        tokio::task::spawn_blocking(move || Terrain::open_dir(&dir)).await.expect("Failed to look for DTED files")
    };
    match &found {
        Some(t) => println!("Terrain from {} DTED cells in {}, down to level {}", t.cell_count(), dted_dir.display(), t.max_level()),
        None => println!("No terrain: no DTED files in {}", dted_dir.display()),
    }
    let terrain_routes = Router::new()
        .route("/api/terrain/layer.json", get(terrain::layer))
        .route("/api/terrain/height", get(terrain::height))
        .route("/api/terrain/{z}/{x}/{file}", get(terrain::tile))
        .with_state(found.map(Arc::new));

    let app = Router::new()
        .route("/", get(root))
        // Separate routes for different tile types - support both GET and HEAD
        .route("/api/tiles/raster/{z}/{x}/{y}", get(get_raster_tile).head(get_raster_tile))
        .route("/api/tiles/vector/{z}/{x}/{y}", get(get_vector_tile).head(get_vector_tile))
        // Keep existing API routes
        .route("/api/areas", get(get_areas).post(create_area).delete(delete_areas))
        .route("/api/symbols", get(get_symbols).post(create_symbol).delete(delete_symbols))
        // One item: change it or remove it
        .route("/api/areas/{id}", put(update_area).delete(delete_area))
        .route("/api/symbols/{id}", put(update_symbol).delete(delete_symbol))
        .route("/api/markers", get(get_markers).post(create_marker).delete(delete_markers))
        .with_state(db_pool)
        .merge(terrain_routes)
        .merge(SwaggerUi::new("/api/docs").url("/api/openapi.json", docs::ApiDoc::openapi()))
        .layer(CorsLayer::very_permissive());

    let listener = tokio::net::TcpListener
        ::bind("0.0.0.0:7000").await
        .expect("Failed to bind server");

    println!("Server running at http://0.0.0.0:7000 (API documentation at /api/docs)");
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> Html<&'static str> {
    Html("rsGIS API. See the <a href=\"/api/docs\">documentation</a>.")
}