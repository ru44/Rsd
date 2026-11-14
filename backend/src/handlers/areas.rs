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
}

#[derive(Serialize)]
pub struct AreaOutput {
    id: i32,
    name: String,
    geojson: serde_json::Value,
    color: Option<String>,
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
        client.prepare("SELECT id, name, color, ST_AsGeoJSON(geom) as geojson FROM areas").await
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
            "INSERT INTO areas (name, geom, color) VALUES ($1, ST_GeomFromGeoJSON($2), $3) RETURNING id, name, color, ST_AsGeoJSON(geom) as geojson"
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
