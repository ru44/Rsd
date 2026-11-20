//! Terrain for the 3D globe, made from DTED files as the map asks for it.
//!
//! Put DTED files (`.dt0`, `.dt1`, `.dt2`) in a folder, in any layout. Tiles
//! come out in Cesium's `heightmap-1.0` format, so CesiumJS can show them
//! with its standard `CesiumTerrainProvider`: `layer.json` describes the set,
//! and each tile is 65 by 65 heights over a square of the geographic grid
//! (two tiles cover the world at level 0). Nothing is converted beforehand.

pub mod dted;

use dted::Cell;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

/// Heights across one tile, on each side.
const SIZE: usize = 65;
/// Posts on each side of a cell's small copy, used for wide views.
const OVERVIEW: usize = 33;
/// Whole cells kept in memory: about 3 MB each at DTED level 1.
const CACHE_CELLS: usize = 32;

type Key = (i32, i32);

struct Entry {
    path: PathBuf,
    rows: usize,
    /// Read the first time a wide view needs it, then kept.
    overview: OnceLock<Option<Arc<Cell>>>,
}

/// Every DTED cell found, ready to make tiles from.
pub struct Terrain {
    cells: HashMap<Key, Entry>,
    max_level: u32,
    bounds: [f64; 4],
    /// Recently used cells, newest first.
    cache: Mutex<Vec<(Key, Arc<Cell>)>>,
}

fn is_dted(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| matches!(e.to_ascii_lowercase().as_str(), "dt0" | "dt1" | "dt2"))
}

/// Every DTED file in a folder and the folders inside it.
fn find_files(dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut folders = vec![dir.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let Ok(list) = std::fs::read_dir(&folder) else { continue };
        for item in list.flatten() {
            let path = item.path();
            if path.is_dir() {
                folders.push(path);
            } else if is_dted(&path) {
                found.push(path);
            }
        }
    }
    found
}

fn read_header(path: &Path) -> Result<dted::Header, String> {
    let mut first = [0u8; 80];
    std::fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut first))
        .map_err(|e| e.to_string())?;
    dted::header(&first)
}

/// The level at which a tile's 65 heights are as close together as the posts.
fn level_for(posts_per_degree: usize) -> u32 {
    let needed = 180.0 * posts_per_degree as f64 / (SIZE - 1) as f64;
    needed.log2().ceil().max(0.0) as u32
}

impl Terrain {
    /// Finds every DTED file under `dir`. None when there are none.
    pub fn open_dir(dir: &Path) -> Option<Terrain> {
        Terrain::from_files(find_files(dir))
    }

    /// Uses the given DTED files; ones that cannot be read are left out.
    /// Where two cover the same cell, the more detailed one is used.
    pub fn from_files(files: impl IntoIterator<Item = PathBuf>) -> Option<Terrain> {
        let mut cells: HashMap<Key, Entry> = HashMap::new();
        for path in files {
            let h = match read_header(&path) {
                Ok(h) => h,
                Err(e) => {
                    eprintln!("Skipping {}: {e}", path.display());
                    continue;
                }
            };
            if cells.get(&(h.lon0, h.lat0)).is_some_and(|old| old.rows >= h.rows) {
                continue;
            }
            cells.insert((h.lon0, h.lat0), Entry { path, rows: h.rows, overview: OnceLock::new() });
        }
        if cells.is_empty() {
            return None;
        }
        let finest = cells.values().map(|e| e.rows - 1).max().unwrap_or(1);
        let mut bounds = [180.0, 90.0, -180.0, -90.0];
        for &(lon, lat) in cells.keys() {
            bounds[0] = f64::min(bounds[0], f64::from(lon));
            bounds[1] = f64::min(bounds[1], f64::from(lat));
            bounds[2] = f64::max(bounds[2], f64::from(lon + 1));
            bounds[3] = f64::max(bounds[3], f64::from(lat + 1));
        }
        Some(Terrain { cells, max_level: level_for(finest), bounds, cache: Mutex::new(Vec::new()) })
    }

    pub fn cell_count(&self) -> usize {
        self.cells.len()
    }

    /// The most detailed tile level worth asking for.
    pub fn max_level(&self) -> u32 {
        self.max_level
    }

    /// West, south, east and north edges of all the cells together, in degrees.
    pub fn bounds(&self) -> [f64; 4] {
        self.bounds
    }

    /// The description CesiumJS reads first.
    pub fn layer_json(&self) -> String {
        let [w, s, e, n] = self.bounds;
        format!(
            concat!(
                r#"{{"tilejson":"2.1.0","name":"DTED","description":"Terrain from {} DTED cells","#,
                r#""version":"1.0.0","format":"heightmap-1.0","scheme":"tms","projection":"EPSG:4326","#,
                r#""tiles":["{{z}}/{{x}}/{{y}}.terrain?v={{version}}"],"minzoom":0,"maxzoom":{},"#,
                r#""bounds":[{},{},{},{}],"attribution":""}}"#
            ),
            self.cells.len(),
            self.max_level,
            w,
            s,
            e,
            n
        )
    }

    /// Reads a whole cell, from memory when it was used lately.
    fn cell(&self, key: Key) -> Option<Arc<Cell>> {
        {
            let mut cache = self.cache.lock().unwrap();
            if let Some(i) = cache.iter().position(|(k, _)| *k == key) {
                let hit = cache.remove(i);
                let cell = hit.1.clone();
                cache.insert(0, hit);
                return Some(cell);
            }
        }
        let cell = Arc::new(self.read(key)?);
        let mut cache = self.cache.lock().unwrap();
        cache.insert(0, (key, cell.clone()));
        cache.truncate(CACHE_CELLS);
        Some(cell)
    }

    fn read(&self, key: Key) -> Option<Cell> {
        let path = &self.cells.get(&key)?.path;
        match std::fs::read(path).map_err(|e| e.to_string()).and_then(|b| Cell::parse(&b)) {
            Ok(cell) => Some(cell),
            Err(e) => {
                eprintln!("Cannot read {}: {e}", path.display());
                None
            }
        }
    }

    fn overview(&self, key: Key) -> Option<Arc<Cell>> {
        let entry = self.cells.get(&key)?;
        entry.overview.get_or_init(|| self.read(key).map(|c| Arc::new(c.shrink(OVERVIEW)))).clone()
    }

    /// Cells overlapping a rectangle. With `edges`, cells that only touch it count too.
    fn cells_in(&self, west: f64, south: f64, east: f64, north: f64, edges: bool) -> Vec<Key> {
        let overlaps = |&(lon, lat): &Key| {
            let (lon, lat) = (f64::from(lon), f64::from(lat));
            if edges {
                lon <= east && lon + 1.0 >= west && lat <= north && lat + 1.0 >= south
            } else {
                lon < east && lon + 1.0 > west && lat < north && lat + 1.0 > south
            }
        };
        let (x0, x1) = (west.floor() as i32 - 1, east.ceil() as i32);
        let (y0, y1) = (south.floor() as i32 - 1, north.ceil() as i32);
        let span = i64::from(x1 - x0 + 1) * i64::from(y1 - y0 + 1);
        if span > self.cells.len() as i64 {
            self.cells.keys().copied().filter(overlaps).collect()
        } else {
            (x0..=x1)
                .flat_map(|x| (y0..=y1).map(move |y| (x, y)))
                .filter(|k| self.cells.contains_key(k) && overlaps(k))
                .collect()
        }
    }

    /// One tile: 65 by 65 heights from the north-west corner, row by row,
    /// then which of its four children have data, then "all land". None for
    /// a tile outside the grid or more detailed than the data.
    pub fn tile(&self, z: u32, x: u32, y: u32) -> Option<Vec<u8>> {
        if z > self.max_level || x >= 2 << z || y >= 1 << z {
            return None;
        }
        let width = 180.0 / f64::from(1u32 << z);
        let (west, south) = (-180.0 + f64::from(x) * width, -90.0 + f64::from(y) * width);
        let step = width / (SIZE - 1) as f64;
        // When heights are far apart, a cell's small copy is enough.
        let wide = step >= 1.0 / (OVERVIEW - 1) as f64;
        let grids: HashMap<Key, Arc<Cell>> = self
            .cells_in(west, south, west + width, south + width, true)
            .into_iter()
            .filter_map(|k| Some((k, if wide { self.overview(k)? } else { self.cell(k)? })))
            .collect();

        let mut out = Vec::with_capacity(SIZE * SIZE * 2 + 2);
        for row in 0..SIZE {
            let lat = south + width - row as f64 * step;
            for col in 0..SIZE {
                let lon = west + col as f64 * step;
                let h = sample(&grids, lon, lat).unwrap_or(0.0);
                // heightmap-1.0 stores (height + 1000 m) * 5 as a 16-bit number.
                let v = ((h + 1000.0) * 5.0).round().clamp(0.0, 65535.0) as u16;
                out.extend_from_slice(&v.to_le_bytes());
            }
        }
        out.push(self.children(z, west, south, width));
        out.push(0); // water mask: all land
        Some(out)
    }

    /// Bits for the south-west, south-east, north-west and north-east children.
    fn children(&self, z: u32, west: f64, south: f64, width: f64) -> u8 {
        if z >= self.max_level {
            return 0;
        }
        let half = width / 2.0;
        [(0.0, 0.0), (half, 0.0), (0.0, half), (half, half)]
            .iter()
            .enumerate()
            .filter(|(_, (dx, dy))| {
                let (w, s) = (west + dx, south + dy);
                !self.cells_in(w, s, w + half, s + half, false).is_empty()
            })
            .fold(0, |mask, (bit, _)| mask | 1 << bit)
    }

    /// Height above sea level at a place, in metres; None where there is no data.
    pub fn height(&self, lon: f64, lat: f64) -> Option<f64> {
        let grids: HashMap<Key, Arc<Cell>> = candidates(lon, lat)
            .into_iter()
            .filter_map(|k| Some((k, self.cell(k)?)))
            .collect();
        sample(&grids, lon, lat)
    }
}

/// The cell holding a place, and on a cell's edge also the cell on the other side.
fn candidates(lon: f64, lat: f64) -> Vec<Key> {
    let (x, y) = (lon.floor() as i32, lat.floor() as i32);
    let mut keys = vec![(x, y)];
    let (on_x, on_y) = (lon == lon.floor(), lat == lat.floor());
    if on_x {
        keys.push((x - 1, y));
    }
    if on_y {
        keys.push((x, y - 1));
    }
    if on_x && on_y {
        keys.push((x - 1, y - 1));
    }
    keys
}

fn sample(grids: &HashMap<Key, Arc<Cell>>, lon: f64, lat: f64) -> Option<f64> {
    candidates(lon, lat).into_iter().find_map(|k| grids.get(&k)?.sample(lon, lat))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A fresh, empty folder for one test.
    fn folder() -> PathBuf {
        static N: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!("rsgis-terrain-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Heights that rise 1000 m per degree east and 500 m per degree north
    /// from the south-west corner of 45E 24N, the same across cell edges.
    fn slope(lon: f64, lat: f64) -> f64 {
        1000.0 * (lon - 45.0) + 500.0 * (lat - 24.0)
    }

    fn write_cell(dir: &Path, name: &str, lon0: i32, lat0: i32, posts: usize) {
        let step = 1.0 / (posts - 1) as f64;
        let file = dted::write(lon0, lat0, posts, posts, |c, r| {
            slope(f64::from(lon0) + c as f64 * step, f64::from(lat0) + r as f64 * step).round() as i16
        });
        std::fs::write(dir.join(name), file).unwrap();
    }

    /// Height at a column and row of a tile, back in metres.
    fn tile_height(tile: &[u8], col: usize, row: usize) -> f64 {
        let i = 2 * (row * SIZE + col);
        f64::from(u16::from_le_bytes([tile[i], tile[i + 1]])) / 5.0 - 1000.0
    }

    #[test]
    fn finds_dted_files_in_folders_and_skips_the_rest() {
        let dir = folder();
        std::fs::create_dir_all(dir.join("e045")).unwrap();
        write_cell(&dir.join("e045"), "n24.dt1", 45, 24, 121);
        write_cell(&dir, "N24E046.DT1", 46, 24, 121);
        std::fs::write(dir.join("notes.txt"), "hello").unwrap();
        std::fs::write(dir.join("broken.dt1"), "UHL1 not really").unwrap();
        let t = Terrain::open_dir(&dir).unwrap();
        assert_eq!(t.cell_count(), 2);
        assert_eq!(t.bounds(), [45.0, 24.0, 47.0, 25.0]);
        assert!(t.layer_json().contains(r#""format":"heightmap-1.0""#));
        assert!(Terrain::open_dir(&folder()).is_none());
    }

    #[test]
    fn picks_the_level_from_the_spacing_of_posts() {
        assert_eq!(level_for(120), 9); // DTED level 0
        assert_eq!(level_for(1200), 12); // level 1
        assert_eq!(level_for(3600), 14); // level 2
    }

    #[test]
    fn keeps_the_more_detailed_file_for_a_cell() {
        let dir = folder();
        write_cell(&dir, "a.dt0", 45, 24, 121);
        write_cell(&dir, "a.dt1", 45, 24, 1201);
        let t = Terrain::open_dir(&dir).unwrap();
        assert_eq!(t.cell_count(), 1);
        assert_eq!(t.max_level(), 12);
    }

    #[test]
    fn heights_follow_the_ground_across_cell_edges() {
        let dir = folder();
        write_cell(&dir, "a.dt1", 45, 24, 121);
        write_cell(&dir, "b.dt1", 46, 24, 121);
        let t = Terrain::open_dir(&dir).unwrap();
        assert!((t.height(45.5, 24.5).unwrap() - slope(45.5, 24.5)).abs() < 1.0);
        assert!((t.height(46.0, 24.25).unwrap() - slope(46.0, 24.25)).abs() < 1.0);
        assert_eq!(t.height(10.0, 10.0), None);
    }

    #[test]
    fn a_detailed_tile_holds_the_heights_from_north_west_to_south_east() {
        let dir = folder();
        write_cell(&dir, "a.dt1", 45, 24, 241);
        write_cell(&dir, "b.dt1", 46, 24, 241);
        let t = Terrain::open_dir(&dir).unwrap();
        // Level 9 tiles are 0.3515625 degrees wide; this one spans 45.70E to
        // 46.05E and 24.26N to 24.61N, across the edge between the two cells.
        let (z, x, y) = (9, 642, 325);
        let width = 180.0 / 512.0;
        let (west, south) = (-180.0 + 642.0 * width, -90.0 + 325.0 * width);
        let tile = t.tile(z, x, y).unwrap();
        assert_eq!(tile.len(), SIZE * SIZE * 2 + 2);
        for (col, row) in [(0, 0), (64, 0), (0, 64), (64, 64), (32, 17)] {
            let lon = west + col as f64 * width / 64.0;
            let lat = south + width - row as f64 * width / 64.0;
            let got = tile_height(&tile, col, row);
            assert!((got - slope(lon, lat)).abs() < 1.0, "at {col},{row}: {got} vs {}", slope(lon, lat));
        }
        assert_eq!(tile[SIZE * SIZE * 2], 0b1111, "all four children have data");
    }

    #[test]
    fn a_world_tile_uses_small_copies_and_marks_children() {
        let dir = folder();
        write_cell(&dir, "a.dt1", 45, 24, 121);
        let t = Terrain::open_dir(&dir).unwrap();
        // Level 0: x 0 is the western half of the world, x 1 the eastern.
        let east = t.tile(0, 1, 0).unwrap();
        let west = t.tile(0, 0, 0).unwrap();
        assert!((0..SIZE * SIZE).all(|i| tile_height(&west, i % SIZE, i / SIZE) == 0.0));
        // Only the north-western child (0-90E, 0-90N) of the eastern half has data.
        assert_eq!(east[SIZE * SIZE * 2], 0b0100);
        assert_eq!(west[SIZE * SIZE * 2], 0);
        // At level 2 (45 degrees wide, posts 0.703125 apart) the tile from 45E 0N
        // has a post inside the cell, at column 1, row 29.
        let tile = t.tile(2, 5, 2).unwrap();
        let (lon, lat) = (45.0 + 0.703125, 45.0 - 29.0 * 0.703125);
        assert!((tile_height(&tile, 1, 29) - slope(lon, lat)).abs() < 1.0);
        assert_eq!(tile_height(&tile, 40, 40), 0.0, "sea level where there is no data");
    }

    #[test]
    fn says_no_to_tiles_outside_the_grid_or_too_detailed() {
        let dir = folder();
        write_cell(&dir, "a.dt0", 45, 24, 121);
        let t = Terrain::open_dir(&dir).unwrap();
        assert!(t.tile(0, 2, 0).is_none());
        assert!(t.tile(1, 0, 2).is_none());
        assert!(t.tile(10, 0, 0).is_none());
        assert!(t.tile(9, 0, 0).is_some());
        assert_eq!(t.tile(9, 0, 0).unwrap()[SIZE * SIZE * 2], 0, "the last level has no children");
    }
}
