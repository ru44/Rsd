//! Where the desktop app keeps what people draw: one SQLite file in the
//! app's data folder. It stands in for the server's PostGIS tables, with the
//! same fields, so the map code cannot tell the two apart.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;

const SCHEMA: &str = "
    -- AUTOINCREMENT so a removed id is never handed out again: undo and redo
    -- keep track of items by id, as they do with the server.
    CREATE TABLE IF NOT EXISTS areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        geojson TEXT NOT NULL,
        color TEXT,
        shape TEXT,
        floor_m REAL,
        ceiling_m REAL
    );
    CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        geojson TEXT NOT NULL,
        sidc TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS markers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        geojson TEXT NOT NULL,
        color TEXT
    );
";

#[derive(Debug)]
pub enum StoreError {
    /// The request itself is wrong, such as a shape that is not a shape.
    Invalid(String),
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        StoreError::Db(e)
    }
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Invalid(msg) => f.write_str(msg),
            StoreError::Db(e) => write!(f, "database error: {e}"),
        }
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;

#[derive(Deserialize)]
pub struct AreaInput {
    pub name: String,
    pub geojson: Value,
    pub color: Option<String>,
    pub shape: Option<String>,
    pub floor_m: Option<f64>,
    pub ceiling_m: Option<f64>,
}

#[derive(Deserialize, Default)]
pub struct AreaPatch {
    pub name: Option<String>,
    pub geojson: Option<Value>,
    pub color: Option<String>,
    pub floor_m: Option<f64>,
    pub ceiling_m: Option<f64>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Area {
    pub id: i64,
    pub name: String,
    pub geojson: Value,
    pub color: Option<String>,
    pub shape: Option<String>,
    pub floor_m: Option<f64>,
    pub ceiling_m: Option<f64>,
}

#[derive(Deserialize)]
pub struct SymbolInput {
    pub name: String,
    pub geojson: Value,
    pub sidc: String,
}

#[derive(Deserialize, Default)]
pub struct SymbolPatch {
    pub name: Option<String>,
    pub geojson: Option<Value>,
    pub sidc: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Symbol {
    pub id: i64,
    pub name: String,
    pub geojson: Value,
    pub sidc: String,
}

#[derive(Deserialize)]
pub struct MarkerInput {
    pub name: String,
    pub geojson: Value,
    pub color: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Marker {
    pub id: i64,
    pub name: String,
    pub geojson: Value,
    pub color: Option<String>,
}

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        Self::init(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.execute_batch(SCHEMA)?;
        Ok(Store { conn })
    }

    // ---- areas: drawn shapes, lines, text labels and volumes ----

    pub fn areas(&self) -> Result<Vec<Area>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, geojson, color, shape, floor_m, ceiling_m FROM areas ORDER BY id",
        )?;
        let rows = stmt.query_map([], area_from_row)?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn create_area(&self, a: AreaInput) -> Result<Area> {
        let geojson = geometry(&a.geojson, &["Polygon", "LineString", "Point"])?;
        self.conn.execute(
            "INSERT INTO areas (name, geojson, color, shape, floor_m, ceiling_m) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![a.name, geojson, a.color, a.shape, a.floor_m, a.ceiling_m],
        )?;
        self.area(self.conn.last_insert_rowid())?
            .ok_or(StoreError::Db(rusqlite::Error::QueryReturnedNoRows))
    }

    /// Changes only the fields given. None when there is no such area.
    pub fn update_area(&self, id: i64, p: AreaPatch) -> Result<Option<Area>> {
        let geojson = match &p.geojson {
            Some(g) => Some(geometry(g, &["Polygon", "LineString", "Point"])?),
            None => None,
        };
        self.conn.execute(
            "UPDATE areas SET name = COALESCE(?2, name), geojson = COALESCE(?3, geojson), \
             color = COALESCE(?4, color), floor_m = COALESCE(?5, floor_m), \
             ceiling_m = COALESCE(?6, ceiling_m) WHERE id = ?1",
            params![id, p.name, geojson, p.color, p.floor_m, p.ceiling_m],
        )?;
        self.area(id)
    }

    pub fn delete_area(&self, id: i64) -> Result<bool> {
        Ok(self.conn.execute("DELETE FROM areas WHERE id = ?1", [id])? > 0)
    }

    pub fn delete_areas(&self) -> Result<()> {
        self.conn.execute("DELETE FROM areas", [])?;
        Ok(())
    }

    fn area(&self, id: i64) -> Result<Option<Area>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, name, geojson, color, shape, floor_m, ceiling_m FROM areas WHERE id = ?1",
                [id],
                area_from_row,
            )
            .optional()?)
    }

    // ---- symbols: military symbols, one point each ----

    pub fn symbols(&self) -> Result<Vec<Symbol>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, geojson, sidc FROM symbols ORDER BY id")?;
        let rows = stmt.query_map([], symbol_from_row)?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn create_symbol(&self, s: SymbolInput) -> Result<Symbol> {
        let geojson = geometry(&s.geojson, &["Point"])?;
        self.conn.execute(
            "INSERT INTO symbols (name, geojson, sidc) VALUES (?1, ?2, ?3)",
            params![s.name, geojson, s.sidc],
        )?;
        self.symbol(self.conn.last_insert_rowid())?
            .ok_or(StoreError::Db(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn update_symbol(&self, id: i64, p: SymbolPatch) -> Result<Option<Symbol>> {
        let geojson = match &p.geojson {
            Some(g) => Some(geometry(g, &["Point"])?),
            None => None,
        };
        self.conn.execute(
            "UPDATE symbols SET name = COALESCE(?2, name), geojson = COALESCE(?3, geojson), \
             sidc = COALESCE(?4, sidc) WHERE id = ?1",
            params![id, p.name, geojson, p.sidc],
        )?;
        self.symbol(id)
    }

    pub fn delete_symbol(&self, id: i64) -> Result<bool> {
        Ok(self.conn.execute("DELETE FROM symbols WHERE id = ?1", [id])? > 0)
    }

    pub fn delete_symbols(&self) -> Result<()> {
        self.conn.execute("DELETE FROM symbols", [])?;
        Ok(())
    }

    fn symbol(&self, id: i64) -> Result<Option<Symbol>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, name, geojson, sidc FROM symbols WHERE id = ?1",
                [id],
                symbol_from_row,
            )
            .optional()?)
    }

    // ---- markers: plain coloured pins ----

    pub fn markers(&self) -> Result<Vec<Marker>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, geojson, color FROM markers ORDER BY id")?;
        let rows = stmt.query_map([], |r| {
            Ok(Marker {
                id: r.get(0)?,
                name: r.get(1)?,
                geojson: parse(r.get(2)?),
                color: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    pub fn create_marker(&self, m: MarkerInput) -> Result<Marker> {
        let geojson = geometry(&m.geojson, &["Point"])?;
        self.conn.execute(
            "INSERT INTO markers (name, geojson, color) VALUES (?1, ?2, ?3)",
            params![m.name, geojson, m.color],
        )?;
        Ok(Marker {
            id: self.conn.last_insert_rowid(),
            name: m.name,
            geojson: parse(geojson),
            color: m.color,
        })
    }

    pub fn delete_markers(&self) -> Result<()> {
        self.conn.execute("DELETE FROM markers", [])?;
        Ok(())
    }
}

fn area_from_row(r: &Row) -> rusqlite::Result<Area> {
    Ok(Area {
        id: r.get(0)?,
        name: r.get(1)?,
        geojson: parse(r.get(2)?),
        color: r.get(3)?,
        shape: r.get(4)?,
        floor_m: r.get(5)?,
        ceiling_m: r.get(6)?,
    })
}

fn symbol_from_row(r: &Row) -> rusqlite::Result<Symbol> {
    Ok(Symbol {
        id: r.get(0)?,
        name: r.get(1)?,
        geojson: parse(r.get(2)?),
        sidc: r.get(3)?,
    })
}

fn parse(text: String) -> Value {
    serde_json::from_str(&text).unwrap_or(Value::Null)
}

/// Checks a GeoJSON geometry the way PostGIS would refuse a broken one, and
/// returns it as text with only its type and coordinates, as the server does.
fn geometry(g: &Value, allowed: &[&str]) -> Result<String> {
    let kind = g.get("type").and_then(Value::as_str).unwrap_or("");
    if !allowed.contains(&kind) {
        return Err(StoreError::Invalid(format!(
            "expected a GeoJSON {}, got {:?}",
            allowed.join(" or "),
            kind
        )));
    }
    let coords = g.get("coordinates").unwrap_or(&Value::Null);
    let ok = match kind {
        "Point" => position(coords),
        "LineString" => line(coords, 2),
        "Polygon" => coords
            .as_array()
            .is_some_and(|rings| !rings.is_empty() && rings.iter().all(|r| line(r, 4))),
        _ => false,
    };
    if !ok {
        return Err(StoreError::Invalid(format!("the {kind} has bad coordinates")));
    }
    Ok(json!({ "type": kind, "coordinates": coords }).to_string())
}

/// Longitude, latitude and an optional height, all finite numbers.
fn position(p: &Value) -> bool {
    p.as_array().is_some_and(|xs| {
        (2..=3).contains(&xs.len()) && xs.iter().all(|x| x.as_f64().is_some_and(f64::is_finite))
    })
}

fn line(l: &Value, min: usize) -> bool {
    l.as_array()
        .is_some_and(|ps| ps.len() >= min && ps.iter().all(position))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square() -> Value {
        json!({ "type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]] })
    }

    #[test]
    fn areas_round_trip_and_patch_only_what_is_given() {
        let s = Store::in_memory().unwrap();
        let a = s
            .create_area(AreaInput {
                name: "Zone".into(),
                geojson: square(),
                color: Some("#ff0000".into()),
                shape: Some("polygon".into()),
                floor_m: None,
                ceiling_m: None,
            })
            .unwrap();
        assert_eq!(a.name, "Zone");
        assert_eq!(a.geojson, square());

        let b = s
            .update_area(a.id, AreaPatch { name: Some("Renamed".into()), ..Default::default() })
            .unwrap()
            .unwrap();
        assert_eq!(b.name, "Renamed");
        assert_eq!(b.color.as_deref(), Some("#ff0000"));
        assert_eq!(s.areas().unwrap(), vec![b]);
    }

    #[test]
    fn removed_ids_are_not_reused() {
        let s = Store::in_memory().unwrap();
        let input = || SymbolInput {
            name: "HQ".into(),
            geojson: json!({ "type": "Point", "coordinates": [46.7, 24.7] }),
            sidc: "SFGPUCI----K".into(),
        };
        let first = s.create_symbol(input()).unwrap();
        assert!(s.delete_symbol(first.id).unwrap());
        let second = s.create_symbol(input()).unwrap();
        assert!(second.id > first.id);
    }

    #[test]
    fn missing_items_say_so() {
        let s = Store::in_memory().unwrap();
        assert!(s.update_area(42, AreaPatch::default()).unwrap().is_none());
        assert!(!s.delete_area(42).unwrap());
        assert!(s.update_symbol(42, SymbolPatch::default()).unwrap().is_none());
    }

    #[test]
    fn broken_shapes_are_refused() {
        let s = Store::in_memory().unwrap();
        let bad = |g: Value| SymbolInput { name: "x".into(), geojson: g, sidc: "S".into() };
        assert!(matches!(s.create_symbol(bad(square())), Err(StoreError::Invalid(_))));
        assert!(matches!(
            s.create_symbol(bad(json!({ "type": "Point", "coordinates": ["a", 1] }))),
            Err(StoreError::Invalid(_))
        ));
        assert!(matches!(
            s.create_area(AreaInput {
                name: "x".into(),
                geojson: json!({ "type": "Polygon", "coordinates": [[[0, 0], [1, 1]]] }),
                color: None,
                shape: None,
                floor_m: None,
                ceiling_m: None,
            }),
            Err(StoreError::Invalid(_))
        ));
    }

    #[test]
    fn extra_geojson_fields_are_dropped() {
        let s = Store::in_memory().unwrap();
        let m = s
            .create_marker(MarkerInput {
                name: "Pin".into(),
                geojson: json!({ "type": "Point", "coordinates": [1, 2], "crs": "junk" }),
                color: None,
            })
            .unwrap();
        assert_eq!(m.geojson, json!({ "type": "Point", "coordinates": [1, 2] }));
        assert_eq!(s.markers().unwrap(), vec![m]);
    }
}
