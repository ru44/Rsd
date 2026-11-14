mod handlers;
mod db;

use axum::{ routing::get, response::Html, Router };
use tower_http::cors::CorsLayer;
use dotenvy::dotenv;

use handlers::{
    tiles::{get_raster_tile, get_vector_tile},
    areas::{ get_areas, create_area, delete_areas },
    symbols::{ get_symbols, create_symbol, delete_symbols },
    markers::{ get_markers, create_marker, delete_markers },
};

#[tokio::main]
async fn main() {
    dotenv().ok();

    let db_pool = db::init_pg_pool().await.expect("Failed to connect to DB");

    let app = Router::new()
        .route("/", get(root))
        // Separate routes for different tile types - support both GET and HEAD
        .route("/api/tiles/raster/{z}/{x}/{y}", get(get_raster_tile).head(get_raster_tile))
        .route("/api/tiles/vector/{z}/{x}/{y}", get(get_vector_tile).head(get_vector_tile))
        // Keep existing API routes
        .route("/api/areas", get(get_areas).post(create_area).delete(delete_areas))
        .route("/api/symbols", get(get_symbols).post(create_symbol).delete(delete_symbols))
        .route("/api/markers", get(get_markers).post(create_marker).delete(delete_markers))
        .with_state(db_pool)
        .layer(CorsLayer::very_permissive());

    let listener = tokio::net::TcpListener
        ::bind("0.0.0.0:7000").await
        .expect("Failed to bind server");

    println!("Server running at http://0.0.0.0:7000");
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> Html<&'static str> {
    Html("Welcome to the Dual MBTiles + PostGIS API")
}