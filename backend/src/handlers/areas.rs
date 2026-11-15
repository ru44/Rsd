use axum::{ extract::{ State, Json }, response::IntoResponse, http::StatusCode };
use deadpool_postgres::Pool;
use serde::{ Deserialize, Serialize };
use serde_json::json;

#[derive(Deserialize)]
pub struct AreaInput {
    name: String,
    geojson: serde_json::Value,
    // Optional color for the area (e.g. "#00ff00")
    color: Option<String>,
    // How it was drawn: "polygon", "rect", "circle" or "line".
    shape: Option<String>,
}

#[derive(Serialize)]
pub struct AreaOutput {
    id: i32,
    name: String,
    geojson: serde_json::Value,
    color: Option<String>,
    shape: Option<String>,
}

// This function is now robust and won't crash the server.
pub async fn get_areas(State(pool): State<Pool>) -> impl IntoResponse {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(err) => {
            eprintln!("Error getting DB client: {}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": "Failed to connect to the database" })),
            );
        }
    };

    let stmt = match
        client.prepare("SELECT id, name, color, shape, ST_AsGeoJSON(geom) as geojson FROM areas ORDER BY id").await
    {
        Ok(stmt) => stmt,
        Err(err) => {
            eprintln!("Error preparing statement: {}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": "Failed to prepare query" })),
            );
        }
    };

    let rows = match client.query(&stmt, &[]).await {
        Ok(rows) => rows,
        Err(err) => {
            eprintln!("Error executing query: {}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": "Failed to fetch areas" })),
            );
        }
    };

    let areas: Vec<AreaOutput> = rows
        .into_iter()
        .map(|row| {
            AreaOutput {
                id: row.get("id"),
                name: row.get("name"),
                color: row.get::<_, Option<String>>("color"),
        shape: row.get::<_, Option<String>>("shape"),
                // The geojson is already a JSON object from the previous step, no need to parse again
                geojson: serde_json
                    ::from_str(row.get::<_, String>("geojson").as_str())
                    .unwrap_or_default(),
            }
        })
        .collect();

    (StatusCode::OK, Json(json!({ "status": "success", "data": areas })))
}

// The other handlers can also be made more robust, but get_areas is the one failing.
pub async fn create_area(
    State(pool): State<Pool>,
    Json(input): Json<AreaInput>
) -> impl IntoResponse {
    let geojson_str = &input.geojson.to_string();

    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "status": "error", "message": format!("Database connection error: {}", e) })
                ),
            ).into_response();
        }
    };

    let stmt = match
        client.prepare(
            "INSERT INTO areas (name, geom, color, shape) VALUES ($1, ST_GeomFromGeoJSON($2), $3, $4) RETURNING id, name, color, shape, ST_AsGeoJSON(geom) as geojson"
        ).await
    {
        Ok(stmt) => stmt,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(
                    json!({ "status": "error", "message": format!("Failed to prepare statement: {}", e) })
                ),
            ).into_response();
        }
    };

    let row = match client.query_one(&stmt, &[&input.name, &geojson_str, &input.color, &input.shape]).await {
        Ok(row) => row,
        Err(e) => {
            // This now catches the "invalid GeoJSON" error and reports it cleanly
            return (
                StatusCode::BAD_REQUEST,
                Json(
                    json!({ "status": "error", "message": format!("Failed to insert area. Check GeoJSON format. Details: {}", e) })
                ),
            ).into_response();
        }
    };

    let area = AreaOutput {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get::<_, Option<String>>("color"),
        shape: row.get::<_, Option<String>>("shape"),
        geojson: serde_json::from_str(row.get::<_, String>("geojson").as_str()).unwrap_or_default(),
    };

    (StatusCode::CREATED, Json(area)).into_response()
}

pub async fn delete_areas(State(pool): State<Pool>) -> impl IntoResponse {
    let client = pool.get().await.unwrap();
    client.execute("DELETE FROM areas", &[]).await.unwrap();
    (
        StatusCode::OK,
        Json(json!({ "status": "success", "message": "All AOIs removed successfully" })),
    )
}

/// Fields a client may change on an area. Anything left out stays as it is.
#[derive(Deserialize)]
pub struct AreaPatch {
    name: Option<String>,
    geojson: Option<serde_json::Value>,
    color: Option<String>,
}

fn error(status: StatusCode, message: String) -> axum::response::Response {
    (status, Json(json!({ "status": "error", "message": message }))).into_response()
}

/// PUT /api/areas/{id}: change one area's name, shape or colour.
pub async fn update_area(
    State(pool): State<Pool>,
    axum::extract::Path(id): axum::extract::Path<i32>,
    Json(patch): Json<AreaPatch>
) -> axum::response::Response {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            return error(StatusCode::INTERNAL_SERVER_ERROR, format!("Database connection error: {}", e));
        }
    };

    // A NULL parameter leaves its column untouched.
    let geojson = patch.geojson.map(|g| g.to_string());
    let row = match
        client.query_opt(
            "UPDATE areas SET name = COALESCE($2::varchar, name), \
             geom = COALESCE(ST_GeomFromGeoJSON($3::text), geom), \
             color = COALESCE($4::text, color) \
             WHERE id = $1 RETURNING id, name, color, shape, ST_AsGeoJSON(geom) as geojson",
            &[&id, &patch.name, &geojson, &patch.color]
        ).await
    {
        Ok(Some(row)) => row,
        Ok(None) => return error(StatusCode::NOT_FOUND, format!("No area with id {}", id)),
        Err(e) => {
            return error(
                StatusCode::BAD_REQUEST,
                format!("Failed to update area. Check GeoJSON format. Details: {}", e)
            );
        }
    };

    let area = AreaOutput {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get::<_, Option<String>>("color"),
        shape: row.get::<_, Option<String>>("shape"),
        geojson: serde_json::from_str(row.get::<_, String>("geojson").as_str()).unwrap_or_default(),
    };
    (StatusCode::OK, Json(area)).into_response()
}

/// DELETE /api/areas/{id}: remove one area.
pub async fn delete_area(
    State(pool): State<Pool>,
    axum::extract::Path(id): axum::extract::Path<i32>
) -> axum::response::Response {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            return error(StatusCode::INTERNAL_SERVER_ERROR, format!("Database connection error: {}", e));
        }
    };
    match client.execute("DELETE FROM areas WHERE id = $1", &[&id]).await {
        Ok(0) => error(StatusCode::NOT_FOUND, format!("No area with id {}", id)),
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete area: {}", e)),
    }
}
