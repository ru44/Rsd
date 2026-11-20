use axum::{ extract::{ State, Json }, response::IntoResponse, http::StatusCode };
use deadpool_postgres::Pool;
use serde::{ Deserialize, Serialize };
use serde_json::json;
use utoipa::ToSchema;

/// A military symbol placed on the map.
#[derive(Deserialize, Debug, ToSchema)]
pub struct SymbolInput {
    #[schema(example = "2nd Armoured")]
    pub name: String,
    /// A GeoJSON Point in longitude and latitude.
    #[schema(value_type = Object, example = json!({"type": "Point", "coordinates": [39.17, 21.54]}))]
    pub geojson: serde_json::Value,
    /// The symbol code (SIDC), MIL-STD-2525 or APP-6: 15 letters or 20 digits.
    #[schema(example = "SFGPUCA----K---")]
    pub sidc: String,
}

#[derive(Serialize, Debug, ToSchema)]
pub struct SymbolOutput {
    pub id: i32,
    pub name: String,
    #[schema(value_type = Object, example = json!({"type": "Point", "coordinates": [39.17, 21.54]}))]
    pub geojson: serde_json::Value,
    pub sidc: String,
}

/// GET /symbols — return all symbols
#[utoipa::path(
    get,
    path = "/api/symbols",
    tag = "Symbols",
    summary = "Every symbol, oldest first",
    responses(
        (status = 200, description = "The symbols", body = crate::docs::SymbolList),
        (status = 500, description = "The database could not be reached", body = crate::docs::Status)
    )
)]
pub async fn get_symbols(State(pool): State<Pool>) -> impl IntoResponse {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            eprintln!("Failed to get DB connection: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("Database connection failed: {}", e) }))
            ).into_response();
        }
    };

    let stmt = match
        client.prepare("SELECT id, name, ST_AsGeoJSON(geom) as geojson, sidc FROM symbols").await
    {
        Ok(stmt) => stmt,
        Err(e) => {
            eprintln!("Failed to prepare query: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("Query preparation failed: {}", e) }))
            ).into_response();
        }
    };

    let rows = match client.query(&stmt, &[]).await {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("Query execution failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("Query failed: {}", e) }))
            ).into_response();
        }
    };

    let data: Vec<SymbolOutput> = rows
        .into_iter()
        .filter_map(|row| {
            let geojson_str: String = row.get("geojson");
            let geojson_value = serde_json::from_str(&geojson_str).ok()?;
            Some(SymbolOutput {
                id: row.get("id"),
                name: row.get("name"),
                geojson: geojson_value,
                sidc: row.get("sidc"),
            })
        })
        .collect();

    println!("Retrieved {} symbols from database", data.len());
    (
        StatusCode::OK,
        Json(json!({ "status": "success", "data": data }))
    ).into_response()
}

/// POST /symbols — insert new symbol
#[utoipa::path(
    post,
    path = "/api/symbols",
    tag = "Symbols",
    summary = "Place a symbol",
    request_body = SymbolInput,
    responses(
        (status = 201, description = "The symbol as stored, with its id", body = crate::docs::SymbolReply),
        (status = 400, description = "The GeoJSON is not a geometry this kind of item can have", body = crate::docs::Status),
        (status = 500, description = "The database could not be reached", body = crate::docs::Status)
    )
)]
pub async fn create_symbol(
    State(pool): State<Pool>,
    Json(input): Json<SymbolInput>
) -> impl IntoResponse {
    println!("Received symbol creation request: {:?}", input);
    
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            eprintln!("Failed to get DB connection: {}", e);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("Database connection failed: {}", e) }))
            ).into_response();
        }
    };

    // Validate the input GeoJSON
    let geojson_str = input.geojson.to_string();
    println!("GeoJSON to insert: {}", geojson_str);
    
    let stmt = match
        client.prepare(
            "INSERT INTO symbols (name, geom, sidc) VALUES ($1, ST_GeomFromGeoJSON($2), $3) RETURNING id, name, ST_AsGeoJSON(geom) as geojson, sidc"
        ).await
    {
        Ok(stmt) => stmt,
        Err(e) => {
            eprintln!("Failed to prepare insert query: {}", e);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("Query preparation failed: {}", e) }))
            ).into_response();
        }
    };

    let row = match
        client.query_one(&stmt, &[&input.name, &geojson_str, &input.sidc]).await
    {
        Ok(row) => row,
        Err(e) => {
            eprintln!("Insert query failed: {}", e);
            // Check for specific PostGIS errors
            let error_msg = if e.to_string().contains("invalid GeoJSON") {
                format!("Invalid GeoJSON format: {}", geojson_str)
            } else if e.to_string().contains("geometry") {
                format!("Geometry error: {}", e)
            } else {
                format!("Database insert failed: {}", e)
            };
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({ "status": "error", "message": error_msg }))
            ).into_response();
        }
    };

    let geojson_str: String = row.get("geojson");
    let geojson_value = match serde_json::from_str(&geojson_str) {
        Ok(val) => val,
        Err(e) => {
            eprintln!("Failed to parse returned GeoJSON: {}", e);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("Invalid GeoJSON returned from database: {}", e) }))
            ).into_response();
        }
    };

    let symbol = SymbolOutput {
        id: row.get("id"),
        name: row.get("name"),
        geojson: geojson_value,
        sidc: row.get("sidc"),
    };
    
    println!("Symbol created successfully: {:?}", symbol);

    (
        axum::http::StatusCode::CREATED,
        Json(json!({ "status": "success", "data": symbol }))
    ).into_response()
}

/// DELETE /symbols — delete all symbols
#[utoipa::path(
    delete,
    path = "/api/symbols",
    tag = "Symbols",
    summary = "Delete every symbol",
    responses(
        (status = 200, description = "All gone", body = crate::docs::Status)
    )
)]
pub async fn delete_symbols(State(pool): State<Pool>) -> impl IntoResponse {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            eprintln!("Failed to get DB connection: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": format!("Database connection failed: {}", e) }))
            ).into_response();
        }
    };

    if let Err(e) = client.execute("DELETE FROM symbols", &[]).await {
        eprintln!("Failed to delete symbols: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "status": "error", "message": format!("Failed to delete symbols: {}", e) }))
        ).into_response();
    }

    println!("All symbols deleted successfully");
    (
        StatusCode::OK,
        Json(json!({ "status": "success", "message": "All symbols removed successfully" }))
    ).into_response()
}

/// Fields a client may change on a symbol. Anything left out stays as it is.
#[derive(Deserialize, ToSchema)]
pub struct SymbolPatch {
    name: Option<String>,
    #[schema(value_type = Object, example = json!({"type": "Point", "coordinates": [39.17, 21.54]}))]
    geojson: Option<serde_json::Value>,
    sidc: Option<String>,
}

fn error(status: StatusCode, message: String) -> axum::response::Response {
    (status, Json(json!({ "status": "error", "message": message }))).into_response()
}

#[utoipa::path(
    put,
    path = "/api/symbols/{id}",
    tag = "Symbols",
    summary = "Move a symbol, or change its name or code",
    params(("id" = i32, Path, description = "The id the server gave it")),
    request_body = SymbolPatch,
    responses(
        (status = 200, description = "The symbol as it is now", body = crate::docs::SymbolReply),
        (status = 400, description = "The GeoJSON is not a geometry this kind of item can have", body = crate::docs::Status),
        (status = 404, description = "There is nothing with that id", body = crate::docs::Status)
    )
)]
pub async fn update_symbol(
    State(pool): State<Pool>,
    axum::extract::Path(id): axum::extract::Path<i32>,
    Json(patch): Json<SymbolPatch>
) -> axum::response::Response {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            return error(StatusCode::INTERNAL_SERVER_ERROR, format!("Database connection failed: {}", e));
        }
    };

    // A NULL parameter leaves its column untouched.
    let geojson = patch.geojson.map(|g| g.to_string());
    let row = match
        client.query_opt(
            "UPDATE symbols SET name = COALESCE($2::varchar, name), \
             geom = COALESCE(ST_GeomFromGeoJSON($3::text), geom), \
             sidc = COALESCE($4::varchar, sidc) \
             WHERE id = $1 RETURNING id, name, ST_AsGeoJSON(geom) as geojson, sidc",
            &[&id, &patch.name, &geojson, &patch.sidc]
        ).await
    {
        Ok(Some(row)) => row,
        Ok(None) => return error(StatusCode::NOT_FOUND, format!("No symbol with id {}", id)),
        Err(e) => return error(StatusCode::BAD_REQUEST, format!("Failed to update symbol: {}", e)),
    };

    let symbol = SymbolOutput {
        id: row.get("id"),
        name: row.get("name"),
        geojson: serde_json::from_str(row.get::<_, String>("geojson").as_str()).unwrap_or_default(),
        sidc: row.get("sidc"),
    };
    (StatusCode::OK, Json(json!({ "status": "success", "data": symbol }))).into_response()
}

/// DELETE /api/symbols/{id}: remove one symbol.
#[utoipa::path(
    delete,
    path = "/api/symbols/{id}",
    tag = "Symbols",
    summary = "Delete one symbol",
    params(("id" = i32, Path, description = "The id the server gave it")),
    responses(
        (status = 200, description = "Deleted", body = crate::docs::Status),
        (status = 404, description = "There is nothing with that id", body = crate::docs::Status)
    )
)]
pub async fn delete_symbol(
    State(pool): State<Pool>,
    axum::extract::Path(id): axum::extract::Path<i32>
) -> axum::response::Response {
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            return error(StatusCode::INTERNAL_SERVER_ERROR, format!("Database connection failed: {}", e));
        }
    };
    match client.execute("DELETE FROM symbols WHERE id = $1", &[&id]).await {
        Ok(0) => error(StatusCode::NOT_FOUND, format!("No symbol with id {}", id)),
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => error(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete symbol: {}", e)),
    }
}
