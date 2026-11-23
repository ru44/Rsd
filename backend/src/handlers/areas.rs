use axum::{ extract::{ State, Json }, response::IntoResponse, http::StatusCode };
use deadpool_postgres::Pool;
use serde::{ Deserialize, Serialize };
use serde_json::json;
use utoipa::ToSchema;

/// A shape drawn on the map: an area, a line or a text label.
#[derive(Deserialize, ToSchema)]
pub struct AreaInput {
    #[schema(example = "Objective North")]
    name: String,
    /// A GeoJSON Polygon, LineString or Point (for a text label), in longitude and latitude.
    #[schema(value_type = Object, example = json!({"type": "Polygon", "coordinates": [[[39.1, 21.5], [39.2, 21.5], [39.2, 21.6], [39.1, 21.5]]]}))]
    geojson: serde_json::Value,
    /// Colour as #rrggbb.
    #[schema(example = "#7FD4F5")]
    color: Option<String>,
    /// How it was drawn: polygon, rect, circle, line, arrow or text.
    #[schema(example = "polygon")]
    shape: Option<String>,
    /// For a volume: metres above sea level of its bottom.
    floor_m: Option<f64>,
    /// For a volume: metres above sea level of its top.
    ceiling_m: Option<f64>,
}

#[derive(Serialize, ToSchema)]
pub struct AreaOutput {
    id: i32,
    name: String,
    #[schema(value_type = Object, example = json!({"type": "Polygon", "coordinates": [[[39.1, 21.5], [39.2, 21.5], [39.2, 21.6], [39.1, 21.5]]]}))]
    geojson: serde_json::Value,
    color: Option<String>,
    shape: Option<String>,
    floor_m: Option<f64>,
    ceiling_m: Option<f64>,
}

#[utoipa::path(
    get,
    path = "/api/areas",
    tag = "Shapes",
    summary = "Every shape, oldest first",
    responses(
        (status = 200, description = "The shapes", body = crate::docs::AreaList),
        (status = 500, description = "The database could not be reached", body = crate::docs::Status)
    )
)]
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
        client.prepare("SELECT id, name, color, shape, floor_m, ceiling_m, ST_AsGeoJSON(geom) as geojson FROM areas ORDER BY id").await
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
        floor_m: row.get::<_, Option<f64>>("floor_m"),
        ceiling_m: row.get::<_, Option<f64>>("ceiling_m"),
                // The geojson is already a JSON object from the previous step, no need to parse again
                geojson: serde_json
                    ::from_str(row.get::<_, String>("geojson").as_str())
                    .unwrap_or_default(),
            }
        })
        .collect();

    (StatusCode::OK, Json(json!({ "status": "success", "data": areas })))
}

#[utoipa::path(
    post,
    path = "/api/areas",
    tag = "Shapes",
    summary = "Add a shape",
    request_body = AreaInput,
    responses(
        (status = 201, description = "The shape as stored, with its id", body = AreaOutput),
        (status = 400, description = "The GeoJSON is not a geometry this kind of item can have", body = crate::docs::Status),
        (status = 500, description = "The database could not be reached", body = crate::docs::Status)
    )
)]
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
            "INSERT INTO areas (name, geom, color, shape, floor_m, ceiling_m) VALUES ($1, ST_GeomFromGeoJSON($2), $3, $4, $5, $6) RETURNING id, name, color, shape, floor_m, ceiling_m, ST_AsGeoJSON(geom) as geojson"
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

    let row = match client.query_one(&stmt, &[&input.name, &geojson_str, &input.color, &input.shape, &input.floor_m, &input.ceiling_m]).await {
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
        floor_m: row.get::<_, Option<f64>>("floor_m"),
        ceiling_m: row.get::<_, Option<f64>>("ceiling_m"),
        geojson: serde_json::from_str(row.get::<_, String>("geojson").as_str()).unwrap_or_default(),
    };

    (StatusCode::CREATED, Json(area)).into_response()
}

#[utoipa::path(
    delete,
    path = "/api/areas",
    tag = "Shapes",
    summary = "Delete every shape",
    responses(
        (status = 200, description = "All gone", body = crate::docs::Status)
    )
)]
pub async fn delete_areas(State(pool): State<Pool>) -> impl IntoResponse {
    let client = pool.get().await.unwrap();
    client.execute("DELETE FROM areas", &[]).await.unwrap();
    (
        StatusCode::OK,
        Json(json!({ "status": "success", "message": "All AOIs removed successfully" })),
    )
}

/// Fields a client may change on an area. Anything left out stays as it is.
#[derive(Deserialize, ToSchema)]
pub struct AreaPatch {
    name: Option<String>,
    #[schema(value_type = Object, example = json!({"type": "Polygon", "coordinates": [[[39.1, 21.5], [39.2, 21.5], [39.2, 21.6], [39.1, 21.5]]]}))]
    geojson: Option<serde_json::Value>,
    color: Option<String>,
    floor_m: Option<f64>,
    ceiling_m: Option<f64>,
}

fn error(status: StatusCode, message: String) -> axum::response::Response {
    (status, Json(json!({ "status": "error", "message": message }))).into_response()
}

#[utoipa::path(
    put,
    path = "/api/areas/{id}",
    tag = "Shapes",
    summary = "Change a shape's name, outline, colour or heights",
    params(("id" = i32, Path, description = "The id the server gave it")),
    request_body = AreaPatch,
    responses(
        (status = 200, description = "The shape as it is now", body = AreaOutput),
        (status = 400, description = "The GeoJSON is not a geometry this kind of item can have", body = crate::docs::Status),
        (status = 404, description = "There is nothing with that id", body = crate::docs::Status)
    )
)]
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
             color = COALESCE($4::text, color), \
             floor_m = COALESCE($5::float8, floor_m), \
             ceiling_m = COALESCE($6::float8, ceiling_m) \
             WHERE id = $1 RETURNING id, name, color, shape, floor_m, ceiling_m, ST_AsGeoJSON(geom) as geojson",
            &[&id, &patch.name, &geojson, &patch.color, &patch.floor_m, &patch.ceiling_m]
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
        floor_m: row.get::<_, Option<f64>>("floor_m"),
        ceiling_m: row.get::<_, Option<f64>>("ceiling_m"),
        geojson: serde_json::from_str(row.get::<_, String>("geojson").as_str()).unwrap_or_default(),
    };
    (StatusCode::OK, Json(area)).into_response()
}

#[utoipa::path(
    delete,
    path = "/api/areas/{id}",
    tag = "Shapes",
    summary = "Delete one shape",
    params(("id" = i32, Path, description = "The id the server gave it")),
    responses(
        (status = 200, description = "Deleted", body = crate::docs::Status),
        (status = 404, description = "There is nothing with that id", body = crate::docs::Status)
    )
)]
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
