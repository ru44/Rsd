use axum::{ extract::{ State, Json }, response::IntoResponse, http::StatusCode };
use deadpool_postgres::Pool;
use serde::{ Deserialize, Serialize };
use serde_json::json;
use utoipa::ToSchema;

/// A plain named point.
#[derive(Deserialize, ToSchema)]
pub struct MarkerInput {
    name: String,
    /// A GeoJSON Point in longitude and latitude.
    #[schema(value_type = Object, example = json!({"type": "Point", "coordinates": [39.17, 21.54]}))]
    geojson: serde_json::Value,
    /// Colour as #rrggbb.
    color: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct MarkerOutput {
    id: i32,
    name: String,
    #[schema(value_type = Object, example = json!({"type": "Point", "coordinates": [39.17, 21.54]}))]
    geojson: serde_json::Value,
    color: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/markers",
    tag = "Markers",
    summary = "Every marker",
    responses(
        (status = 200, description = "The markers", body = crate::docs::MarkerList),
        (status = 500, description = "The database could not be reached", body = crate::docs::Status)
    )
)]
pub async fn get_markers(State(pool): State<Pool>) -> impl IntoResponse {
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
        client.prepare("SELECT id, name, color, ST_AsGeoJSON(geom) as geojson FROM markers").await
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
                Json(json!({ "status": "error", "message": "Failed to fetch markers" })),
            );
        }
    };

    let markers: Vec<MarkerOutput> = rows
        .into_iter()
        .map(|row| {
            MarkerOutput {
                id: row.get("id"),
                name: row.get("name"),
                color: row.get::<_, Option<String>>("color"),
                geojson: serde_json
                    ::from_str(row.get::<_, String>("geojson").as_str())
                    .unwrap_or_default(),
            }
        })
        .collect();

    (StatusCode::OK, Json(json!({ "status": "success", "data": markers })))
}

#[utoipa::path(
    post,
    path = "/api/markers",
    tag = "Markers",
    summary = "Add a marker",
    request_body = MarkerInput,
    responses(
        (status = 201, description = "The marker as stored, with its id", body = MarkerOutput),
        (status = 400, description = "The GeoJSON is not a geometry this kind of item can have", body = crate::docs::Status),
        (status = 500, description = "The database could not be reached", body = crate::docs::Status)
    )
)]
pub async fn create_marker(
    State(pool): State<Pool>,
    Json(input): Json<MarkerInput>
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
            "INSERT INTO markers (name, geom, color) VALUES ($1, ST_GeomFromGeoJSON($2), $3) RETURNING id, name, color, ST_AsGeoJSON(geom) as geojson"
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

    let row = match client.query_one(&stmt, &[&input.name, &geojson_str, &input.color]).await {
        Ok(row) => row,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(
                    json!({ "status": "error", "message": format!("Failed to insert marker: {}", e) })
                ),
            ).into_response();
        }
    };

    let marker = MarkerOutput {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get::<_, Option<String>>("color"),
        geojson: serde_json::from_str(row.get::<_, String>("geojson").as_str()).unwrap_or_default(),
    };

    // Return just the marker data, not wrapped in status/data
    (StatusCode::CREATED, Json(marker)).into_response()
}

#[utoipa::path(
    delete,
    path = "/api/markers",
    tag = "Markers",
    summary = "Delete every marker",
    responses(
        (status = 200, description = "All gone", body = crate::docs::Status),
        (status = 500, description = "The database could not be reached", body = crate::docs::Status)
    )
)]
pub async fn delete_markers(State(pool): State<Pool>) -> impl IntoResponse {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": "Failed to get DB connection" })),
            );
        }
    };

    if let Err(_) = client.execute("DELETE FROM markers", &[]).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "status": "error", "message": "Failed to delete markers" })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({ "status": "success", "message": "All markers removed successfully" })),
    )
}