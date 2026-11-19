//! The same HTTP API as the server in `backend/`, answered from the local
//! SQLite file and the person's map file. It listens on 127.0.0.1 only and
//! answers only the app's own window.

use crate::maps::{content_type, MapFile, EMPTY_PNG};
use crate::store::{
    AreaInput, AreaPatch, MarkerInput, Store, StoreError, SymbolInput, SymbolPatch,
};
use axum::{
    extract::{Path, Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, put},
    Json, Router,
};
use serde_json::json;
use std::sync::{Arc, Mutex};
use tower_http::cors::{AllowOrigin, CorsLayer};

pub struct AppState {
    pub store: Mutex<Store>,
    pub map: Mutex<Option<MapFile>>,
}

pub type Shared = Arc<AppState>;

/// Where the app's own pages come from: the bundled app on each system,
/// and Vite while developing.
const ORIGINS: [&str; 4] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:5173",
];

pub fn router(state: Shared, port: u16) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(ORIGINS.map(HeaderValue::from_static)))
        .allow_methods([Method::GET, Method::HEAD, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE]);
    let host = format!("127.0.0.1:{port}");

    Router::new()
        .route("/api/tiles/raster/info", get(map_info))
        .route("/api/tiles/raster/{z}/{x}/{y}", get(raster_tile).head(raster_tile))
        .route("/api/areas", get(areas).post(create_area).delete(delete_areas))
        .route("/api/areas/{id}", put(update_area).delete(delete_area))
        .route("/api/symbols", get(symbols).post(create_symbol).delete(delete_symbols))
        .route("/api/symbols/{id}", put(update_symbol).delete(delete_symbol))
        .route("/api/markers", get(markers).post(create_marker).delete(delete_markers))
        .with_state(state)
        .layer(cors)
        // A web page pointing its own domain name at this machine still sends
        // that name as the Host; refuse anything not addressed to us.
        .layer(middleware::from_fn(move |req: Request, next: Next| {
            let ok = req.headers().get(header::HOST).is_some_and(|h| h == host.as_str());
            async move {
                if ok {
                    next.run(req).await
                } else {
                    StatusCode::FORBIDDEN.into_response()
                }
            }
        }))
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({ "status": "error", "message": message.into() }))).into_response()
}

fn store_error(e: StoreError) -> Response {
    match e {
        StoreError::Invalid(msg) => error(StatusCode::BAD_REQUEST, msg),
        StoreError::Db(e) => error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

fn not_found(what: &str, id: i64) -> Response {
    error(StatusCode::NOT_FOUND, format!("No {what} with id {id}"))
}

// ---- map tiles ----

async fn map_info(State(s): State<Shared>) -> Response {
    match &*s.map.lock().unwrap() {
        Some(m) => Json(&m.info).into_response(),
        None => error(StatusCode::NOT_FOUND, "No map file added"),
    }
}

async fn raster_tile(State(s): State<Shared>, Path((z, x, y)): Path<(u8, u32, u32)>) -> Response {
    let map = s.map.lock().unwrap();
    let Some(m) = map.as_ref() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let tile = m.tile(z, x, y);
    let data = tile.as_deref().unwrap_or(EMPTY_PNG);
    (
        [(header::CONTENT_TYPE, content_type(data)), (header::CACHE_CONTROL, "no-cache")],
        data.to_vec(),
    )
        .into_response()
}

// ---- areas ----

async fn areas(State(s): State<Shared>) -> Response {
    match s.store.lock().unwrap().areas() {
        Ok(data) => Json(json!({ "status": "success", "data": data })).into_response(),
        Err(e) => store_error(e),
    }
}

async fn create_area(State(s): State<Shared>, Json(input): Json<AreaInput>) -> Response {
    match s.store.lock().unwrap().create_area(input) {
        Ok(a) => (StatusCode::CREATED, Json(a)).into_response(),
        Err(e) => store_error(e),
    }
}

async fn update_area(
    State(s): State<Shared>,
    Path(id): Path<i64>,
    Json(patch): Json<AreaPatch>,
) -> Response {
    match s.store.lock().unwrap().update_area(id, patch) {
        Ok(Some(a)) => Json(a).into_response(),
        Ok(None) => not_found("area", id),
        Err(e) => store_error(e),
    }
}

async fn delete_area(State(s): State<Shared>, Path(id): Path<i64>) -> Response {
    match s.store.lock().unwrap().delete_area(id) {
        Ok(true) => Json(json!({ "status": "success" })).into_response(),
        Ok(false) => not_found("area", id),
        Err(e) => store_error(e),
    }
}

async fn delete_areas(State(s): State<Shared>) -> Response {
    match s.store.lock().unwrap().delete_areas() {
        Ok(()) => Json(json!({ "status": "success", "message": "All AOIs removed successfully" }))
            .into_response(),
        Err(e) => store_error(e),
    }
}

// ---- symbols ----

async fn symbols(State(s): State<Shared>) -> Response {
    match s.store.lock().unwrap().symbols() {
        Ok(data) => Json(json!({ "status": "success", "data": data })).into_response(),
        Err(e) => store_error(e),
    }
}

async fn create_symbol(State(s): State<Shared>, Json(input): Json<SymbolInput>) -> Response {
    match s.store.lock().unwrap().create_symbol(input) {
        Ok(data) => {
            (StatusCode::CREATED, Json(json!({ "status": "success", "data": data }))).into_response()
        }
        Err(e) => store_error(e),
    }
}

async fn update_symbol(
    State(s): State<Shared>,
    Path(id): Path<i64>,
    Json(patch): Json<SymbolPatch>,
) -> Response {
    match s.store.lock().unwrap().update_symbol(id, patch) {
        Ok(Some(data)) => Json(json!({ "status": "success", "data": data })).into_response(),
        Ok(None) => not_found("symbol", id),
        Err(e) => store_error(e),
    }
}

async fn delete_symbol(State(s): State<Shared>, Path(id): Path<i64>) -> Response {
    match s.store.lock().unwrap().delete_symbol(id) {
        Ok(true) => Json(json!({ "status": "success" })).into_response(),
        Ok(false) => not_found("symbol", id),
        Err(e) => store_error(e),
    }
}

async fn delete_symbols(State(s): State<Shared>) -> Response {
    match s.store.lock().unwrap().delete_symbols() {
        Ok(()) => Json(json!({ "status": "success", "message": "All symbols removed successfully" }))
            .into_response(),
        Err(e) => store_error(e),
    }
}

// ---- markers ----

async fn markers(State(s): State<Shared>) -> Response {
    match s.store.lock().unwrap().markers() {
        Ok(data) => Json(json!({ "status": "success", "data": data })).into_response(),
        Err(e) => store_error(e),
    }
}

async fn create_marker(State(s): State<Shared>, Json(input): Json<MarkerInput>) -> Response {
    match s.store.lock().unwrap().create_marker(input) {
        Ok(m) => (StatusCode::CREATED, Json(m)).into_response(),
        Err(e) => store_error(e),
    }
}

async fn delete_markers(State(s): State<Shared>) -> Response {
    match s.store.lock().unwrap().delete_markers() {
        Ok(()) => Json(json!({ "status": "success", "message": "All markers removed successfully" }))
            .into_response(),
        Err(e) => store_error(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::maps::tests::{sample, temp};
    use axum::body::Body;
    use http_body_util::BodyExt;
    use serde_json::Value;
    use tower::ServiceExt;

    const PORT: u16 = 4321;

    fn app() -> (Router, Shared) {
        let state = Arc::new(AppState {
            store: Mutex::new(Store::in_memory().unwrap()),
            map: Mutex::new(None),
        });
        (router(state.clone(), PORT), state)
    }

    async fn call(app: &Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
        let mut req = axum::http::Request::builder()
            .method(method)
            .uri(uri)
            .header(header::HOST, format!("127.0.0.1:{PORT}"));
        let body = match body {
            Some(b) => {
                req = req.header(header::CONTENT_TYPE, "application/json");
                Body::from(b.to_string())
            }
            None => Body::empty(),
        };
        let res = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    #[tokio::test]
    async fn symbols_answer_like_the_server() {
        let (app, _) = app();
        let point = json!({ "type": "Point", "coordinates": [46.7, 24.7] });
        let (status, body) = call(
            &app,
            "POST",
            "/api/symbols",
            Some(json!({ "name": "HQ", "sidc": "SFGPUCI----K", "geojson": point })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        let id = body["data"]["id"].as_i64().unwrap();
        assert_eq!(body["data"]["geojson"], point);

        let (status, body) =
            call(&app, "PUT", &format!("/api/symbols/{id}"), Some(json!({ "name": "Main HQ" }))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"]["name"], "Main HQ");
        assert_eq!(body["data"]["sidc"], "SFGPUCI----K");

        let (_, body) = call(&app, "GET", "/api/symbols", None).await;
        assert_eq!(body["status"], "success");
        assert_eq!(body["data"].as_array().unwrap().len(), 1);

        assert_eq!(call(&app, "DELETE", &format!("/api/symbols/{id}"), None).await.0, StatusCode::OK);
        assert_eq!(
            call(&app, "DELETE", &format!("/api/symbols/{id}"), None).await.0,
            StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn areas_come_back_bare_and_bad_shapes_are_400() {
        let (app, _) = app();
        let line = json!({ "type": "LineString", "coordinates": [[0, 0], [1, 1]] });
        let (status, body) = call(
            &app,
            "POST",
            "/api/areas",
            Some(json!({ "name": "Route", "geojson": line, "shape": "line" })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(body["shape"], "line");
        let id = body["id"].as_i64().unwrap();

        let (_, body) =
            call(&app, "PUT", &format!("/api/areas/{id}"), Some(json!({ "color": "#00ff00" }))).await;
        assert_eq!(body["color"], "#00ff00");
        assert_eq!(body["name"], "Route");

        let (status, _) = call(
            &app,
            "POST",
            "/api/areas",
            Some(json!({ "name": "x", "geojson": { "type": "Nope" } })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn tiles_come_from_the_added_map_only() {
        let (app, state) = app();
        assert_eq!(call(&app, "HEAD", "/api/tiles/raster/0/0/0", None).await.0, StatusCode::NOT_FOUND);
        assert_eq!(call(&app, "GET", "/api/tiles/raster/info", None).await.0, StatusCode::NOT_FOUND);

        let p = temp("api.mbtiles");
        sample(&p, "jpg");
        *state.map.lock().unwrap() = Some(MapFile::open(&p).unwrap());
        assert_eq!(call(&app, "HEAD", "/api/tiles/raster/0/0/0", None).await.0, StatusCode::OK);
        let (_, info) = call(&app, "GET", "/api/tiles/raster/info", None).await;
        assert_eq!(info["name"], "Test map");
        assert_eq!(info["maxzoom"], 1);
    }

    #[tokio::test]
    async fn other_hosts_are_refused() {
        let (app, _) = app();
        let req = axum::http::Request::builder()
            .uri("/api/areas")
            .header(header::HOST, "evil.example:4321")
            .body(Body::empty())
            .unwrap();
        assert_eq!(app.oneshot(req).await.unwrap().status(), StatusCode::FORBIDDEN);
    }
}
