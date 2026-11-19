//! Map files the person adds, the way QGIS opens a downloaded layer: an
//! MBTiles file of pictures (PNG, JPEG or WebP tiles) shown as the base map.
//! The app ships without one; the built-in world map is always there.

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct MapInfo {
    /// The map's own name, or the file name when it has none.
    pub name: String,
    pub path: PathBuf,
    pub minzoom: u8,
    pub maxzoom: u8,
    /// West, south, east, north in degrees, when the file says.
    pub bounds: Option<[f64; 4]>,
}

pub struct MapFile {
    pub info: MapInfo,
    conn: Connection,
}

impl MapFile {
    /// Opens an MBTiles file and checks that it holds pictures this app can show.
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| format!("Could not open the file: {e}"))?;

        let meta = |key: &str| -> Option<String> {
            conn.query_row("SELECT value FROM metadata WHERE name = ?1", [key], |r| r.get(0))
                .optional()
                .ok()
                .flatten()
        };
        let has_tiles = conn
            .query_row(
                "SELECT 1 FROM tiles LIMIT 1",
                [],
                |_| Ok(()),
            )
            .optional();
        match has_tiles {
            Ok(Some(())) => {}
            Ok(None) => return Err("This map file has no tiles in it.".into()),
            Err(_) => return Err("This is not an MBTiles map file.".into()),
        }

        let format = meta("format").unwrap_or_default().to_lowercase();
        if format == "pbf" || format == "mvt" {
            return Err(
                "This is a vector map. rsGIS shows picture maps: MBTiles with PNG, JPEG or WebP tiles."
                    .into(),
            );
        }

        let zoom = |agg: &str| -> Option<u8> {
            conn.query_row(&format!("SELECT {agg}(zoom_level) FROM tiles"), [], |r| r.get(0))
                .ok()
        };
        let minzoom = meta("minzoom").and_then(|z| z.parse().ok()).or_else(|| zoom("MIN")).unwrap_or(0);
        let maxzoom = meta("maxzoom").and_then(|z| z.parse().ok()).or_else(|| zoom("MAX")).unwrap_or(18);
        let bounds = meta("bounds").and_then(|b| parse_bounds(&b));
        let name = meta("name")
            .filter(|n| !n.trim().is_empty())
            .or_else(|| path.file_stem().map(|s| s.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "My map".into());

        Ok(MapFile {
            info: MapInfo { name, path: path.to_path_buf(), minzoom, maxzoom, bounds },
            conn,
        })
    }

    /// One tile in the usual XYZ numbering (MBTiles counts rows from the bottom).
    pub fn tile(&self, z: u8, x: u32, y: u32) -> Option<Vec<u8>> {
        if z > 30 || x >= 1 << z || y >= 1 << z {
            return None;
        }
        let row = (1u32 << z) - 1 - y;
        self.conn
            .query_row(
                "SELECT tile_data FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND tile_row = ?3",
                rusqlite::params![z, x, row],
                |r| r.get(0),
            )
            .ok()
    }
}

fn parse_bounds(text: &str) -> Option<[f64; 4]> {
    let v: Vec<f64> = text.split(',').filter_map(|s| s.trim().parse().ok()).collect();
    match v[..] {
        [w, s, e, n] if w < e && s < n => Some([w, s, e, n]),
        _ => None,
    }
}

/// What kind of picture a tile is, from its first bytes.
pub fn content_type(data: &[u8]) -> &'static str {
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if data.starts_with(b"RIFF") && data.len() > 11 && &data[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/png"
    }
}

/// A clear 256 by 256 PNG, for places the map file does not cover.
pub const EMPTY_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00, 0x66,
    0xBC, 0x3A, 0x25, 0x00, 0x00, 0x00, 0x03, 0x50, 0x4C, 0x54, 0x45, 0x00, 0x00, 0x00, 0xA1,
    0x9B, 0x0F, 0x15, 0x00, 0x00, 0x00, 0x01, 0x74, 0x52, 0x4E, 0x53, 0x00, 0x40, 0xE6, 0xD8,
    0x66, 0x00, 0x00, 0x00, 0x1F, 0x49, 0x44, 0x41, 0x54, 0x68, 0xDE, 0xED, 0xC1, 0x01, 0x0D,
    0x00, 0x00, 0x00, 0xC2, 0xA0, 0xF7, 0x4F, 0x6D, 0x0E, 0x37, 0xA0, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0xBE, 0x0D, 0x21, 0x00, 0x00, 0x01, 0x9A, 0x60, 0xE1, 0xD5,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

#[cfg(test)]
pub mod tests {
    use super::*;

    /// Writes a small MBTiles file with one tile at z1/x1/y0 (XYZ numbering).
    pub fn sample(path: &Path, format: &str) {
        let c = Connection::open(path).unwrap();
        c.execute_batch(
            "CREATE TABLE metadata (name TEXT, value TEXT);
             CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);",
        )
        .unwrap();
        for (k, v) in [("name", "Test map"), ("format", format), ("minzoom", "1"), ("maxzoom", "1"), ("bounds", "0,0,180,85")] {
            c.execute("INSERT INTO metadata VALUES (?1, ?2)", [k, v]).unwrap();
        }
        // XYZ y=0 at z1 is TMS row 1.
        c.execute("INSERT INTO tiles VALUES (1, 1, 1, ?1)", [&[0xFF, 0xD8, 0xFF, 0x00][..]]).unwrap();
    }

    pub fn temp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("rsgis-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn reads_metadata_and_flips_rows() {
        let p = temp("ok.mbtiles");
        sample(&p, "jpg");
        let m = MapFile::open(&p).unwrap();
        assert_eq!(m.info.name, "Test map");
        assert_eq!((m.info.minzoom, m.info.maxzoom), (1, 1));
        assert_eq!(m.info.bounds, Some([0.0, 0.0, 180.0, 85.0]));
        let t = m.tile(1, 1, 0).unwrap();
        assert_eq!(content_type(&t), "image/jpeg");
        assert!(m.tile(1, 1, 1).is_none());
        assert!(m.tile(1, 5, 0).is_none());
    }

    #[test]
    fn refuses_vector_maps_and_other_files() {
        let p = temp("vector.mbtiles");
        sample(&p, "pbf");
        assert!(MapFile::open(&p).err().unwrap().contains("vector"));

        let q = temp("notes.txt");
        std::fs::write(&q, "hello").unwrap();
        assert!(MapFile::open(&q).is_err());
    }
}
