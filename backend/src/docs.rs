//! The API description (OpenAPI), shown at /api/docs.

use crate::handlers::{areas, markers, symbols, terrain, tiles};
use serde::Serialize;
use utoipa::{OpenApi, ToSchema};

/// The reply to a delete, or an error.
#[derive(Serialize, ToSchema)]
pub struct Status {
    /// "success" or "error".
    #[schema(example = "success")]
    status: String,
    /// What went wrong, or what was done.
    message: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct AreaList {
    #[schema(example = "success")]
    status: String,
    data: Vec<areas::AreaOutput>,
}

#[derive(Serialize, ToSchema)]
pub struct SymbolList {
    #[schema(example = "success")]
    status: String,
    data: Vec<symbols::SymbolOutput>,
}

#[derive(Serialize, ToSchema)]
pub struct SymbolReply {
    #[schema(example = "success")]
    status: String,
    data: symbols::SymbolOutput,
}

#[derive(Serialize, ToSchema)]
pub struct MarkerList {
    #[schema(example = "success")]
    status: String,
    data: Vec<markers::MarkerOutput>,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "rsGIS API",
        description = "Shapes, military symbols and markers stored in PostGIS, and the map tiles and terrain the map shows. \
            Positions are GeoJSON in longitude and latitude (WGS 84). Heights are metres above mean sea level.",
        license(name = "Apache-2.0", identifier = "Apache-2.0")
    ),
    paths(
        areas::get_areas, areas::create_area, areas::delete_areas, areas::update_area, areas::delete_area,
        symbols::get_symbols, symbols::create_symbol, symbols::delete_symbols, symbols::update_symbol, symbols::delete_symbol,
        markers::get_markers, markers::create_marker, markers::delete_markers,
        tiles::get_raster_tile, tiles::get_vector_tile,
        terrain::layer, terrain::tile, terrain::height,
    ),
    tags(
        (name = "Shapes", description = "Areas, lines, arrows, text labels and 3D volumes drawn on the map"),
        (name = "Symbols", description = "Military symbols (MIL-STD-2525 and APP-6)"),
        (name = "Markers", description = "Plain named points"),
        (name = "Map tiles", description = "Base map pictures and vector tiles from MBTiles files"),
        (name = "Terrain", description = "Ground heights from DTED files, for the 3D globe"),
    )
)]
pub struct ApiDoc;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_every_route() {
        let doc = serde_json::to_value(ApiDoc::openapi()).unwrap();
        let paths = doc["paths"].as_object().unwrap();
        for p in [
            "/api/areas",
            "/api/areas/{id}",
            "/api/symbols",
            "/api/symbols/{id}",
            "/api/markers",
            "/api/tiles/raster/{z}/{x}/{y}",
            "/api/tiles/vector/{z}/{x}/{y}",
            "/api/terrain/layer.json",
            "/api/terrain/{z}/{x}/{y}.terrain",
            "/api/terrain/height",
        ] {
            assert!(paths.contains_key(p), "{p} is not described");
        }
        assert!(doc["components"]["schemas"]["AreaInput"].is_object());
        let height = &doc["paths"]["/api/terrain/height"]["get"]["parameters"];
        assert!(height.as_array().unwrap().iter().all(|p| p["in"] == "query"));
    }
}
