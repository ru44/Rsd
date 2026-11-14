use axum::{ extract::{ State, Json }, response::IntoResponse, http::StatusCode };
use deadpool_postgres::Pool;
use serde::{ Deserialize, Serialize };
use serde_json::json;

#[derive(Deserialize)]
pub struct MarkerInput {
    name: String,
    geojson: serde_json::Value,
    // Optional color for the marker (e.g. "#ff0000")
    color: Option<String>,
}

#[derive(Serialize)]
pub struct MarkerOutput {
    id: i32,
    name: String,
    geojson: serde_json::Value,
    color: Option<String>,
}

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