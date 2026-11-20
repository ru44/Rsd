//! Reading DTED (Digital Terrain Elevation Data) files: levels 0, 1 and 2.
//!
//! A file covers one cell of one degree by one degree. It starts with three
//! text records (UHL, DSI, ACC), then holds one record per line of longitude,
//! west to east, each listing heights from south to north. Heights are whole
//! metres above mean sea level, stored as 16-bit signed magnitude numbers.

/// A post with no height measured.
pub const VOID: i16 = -32767;

const UHL_LEN: usize = 80;
/// The data records start after the UHL (80), DSI (648) and ACC (2700) records.
const DATA_START: usize = UHL_LEN + 648 + 2700;

/// What the first record of a file says about it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Header {
    /// South-west corner of the cell, in whole degrees.
    pub lon0: i32,
    pub lat0: i32,
    /// Lines of longitude (west to east) and posts along each (south to north).
    pub cols: usize,
    pub rows: usize,
}

/// One cell's heights, or a smaller copy of them.
pub struct Cell {
    pub lon0: i32,
    pub lat0: i32,
    pub cols: usize,
    pub rows: usize,
    /// `heights[col * rows + row]`, columns west to east, rows south to north.
    heights: Vec<i16>,
}

/// "0450000E" or "0243000N": degrees, minutes, seconds and a hemisphere.
fn angle(field: &[u8]) -> Option<f64> {
    let text = std::str::from_utf8(field).ok()?.trim();
    let (digits, hemisphere) = text.split_at(text.len().checked_sub(1)?);
    let n = digits.len();
    if n < 5 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let deg: f64 = digits[..n - 4].parse().ok()?;
    let min: f64 = digits[n - 4..n - 2].parse().ok()?;
    let sec: f64 = digits[n - 2..].parse().ok()?;
    let value = deg + min / 60.0 + sec / 3600.0;
    match hemisphere {
        "N" | "E" => Some(value),
        "S" | "W" => Some(-value),
        _ => None,
    }
}

fn number(field: &[u8]) -> Option<usize> {
    std::str::from_utf8(field).ok()?.trim().parse().ok()
}

/// Reads the first record. Needs only the first 80 bytes of the file.
pub fn header(bytes: &[u8]) -> Result<Header, String> {
    if bytes.len() < UHL_LEN || &bytes[..3] != b"UHL" {
        return Err("not a DTED file: it does not start with a UHL record".into());
    }
    let bad = |what: &str| format!("the DTED header has no readable {what}");
    let lon = angle(&bytes[4..12]).ok_or_else(|| bad("longitude"))?;
    let lat = angle(&bytes[12..20]).ok_or_else(|| bad("latitude"))?;
    let cols = number(&bytes[47..51]).ok_or_else(|| bad("number of longitude lines"))?;
    let rows = number(&bytes[51..55]).ok_or_else(|| bad("number of latitude points"))?;
    if cols < 2 || rows < 2 {
        return Err("the DTED file has too few posts".into());
    }
    Ok(Header { lon0: lon.round() as i32, lat0: lat.round() as i32, cols, rows })
}

/// Signed magnitude: the top bit is the sign, the rest the size.
fn decode(raw: u16) -> i16 {
    let size = (raw & 0x7FFF) as i16;
    if raw & 0x8000 != 0 { -size } else { size }
}

impl Cell {
    /// Reads a whole DTED file.
    pub fn parse(bytes: &[u8]) -> Result<Cell, String> {
        let h = header(bytes)?;
        // Sentinel, block count, longitude count, latitude count, heights, checksum.
        let record = 8 + 2 * h.rows + 4;
        if bytes.len() < DATA_START + h.cols * record {
            return Err("the DTED file is cut short".into());
        }
        let mut heights = Vec::with_capacity(h.cols * h.rows);
        for col in 0..h.cols {
            let start = DATA_START + col * record;
            if bytes[start] != 0xAA {
                return Err(format!("DTED data record {col} is damaged"));
            }
            let data = &bytes[start + 8..start + 8 + 2 * h.rows];
            heights.extend(data.chunks_exact(2).map(|p| decode(u16::from_be_bytes([p[0], p[1]]))));
        }
        Ok(Cell { lon0: h.lon0, lat0: h.lat0, cols: h.cols, rows: h.rows, heights })
    }

    fn at(&self, col: usize, row: usize) -> i16 {
        self.heights[col * self.rows + row]
    }

    /// Height at a place in or on the edge of the cell, blended from the four
    /// posts around it. Posts with no height are left out; None if all four are.
    pub fn sample(&self, lon: f64, lat: f64) -> Option<f64> {
        let last_col = (self.cols - 1) as f64;
        let last_row = (self.rows - 1) as f64;
        let fx = ((lon - f64::from(self.lon0)) * last_col).clamp(0.0, last_col);
        let fy = ((lat - f64::from(self.lat0)) * last_row).clamp(0.0, last_row);
        let c = (fx.floor() as usize).min(self.cols - 2);
        let r = (fy.floor() as usize).min(self.rows - 2);
        let (tx, ty) = (fx - c as f64, fy - r as f64);
        let mut sum = 0.0;
        let mut weight = 0.0;
        for (dc, dr, w) in [
            (0, 0, (1.0 - tx) * (1.0 - ty)),
            (1, 0, tx * (1.0 - ty)),
            (0, 1, (1.0 - tx) * ty),
            (1, 1, tx * ty),
        ] {
            let h = self.at(c + dc, r + dr);
            if h != VOID && w > 0.0 {
                sum += w * f64::from(h);
                weight += w;
            }
        }
        // Exactly on a post: its own height, even when it is the only one.
        if weight == 0.0 {
            let h = self.at(fx.round() as usize, fy.round() as usize);
            return (h != VOID).then_some(f64::from(h));
        }
        Some(sum / weight)
    }

    /// The same cell with `n` by `n` posts, for views too wide to need more.
    pub fn shrink(&self, n: usize) -> Cell {
        let step = 1.0 / (n - 1) as f64;
        let mut heights = Vec::with_capacity(n * n);
        for col in 0..n {
            for row in 0..n {
                let lon = f64::from(self.lon0) + col as f64 * step;
                let lat = f64::from(self.lat0) + row as f64 * step;
                heights.push(self.sample(lon, lat).map_or(VOID, |h| h.round() as i16));
            }
        }
        Cell { lon0: self.lon0, lat0: self.lat0, cols: n, rows: n, heights }
    }
}

/// Writes a DTED file, for tests here and in the programs that use this crate.
#[doc(hidden)]
pub fn write(lon0: i32, lat0: i32, cols: usize, rows: usize, height: impl Fn(usize, usize) -> i16) -> Vec<u8> {
    let corner = |v: i32, pos: char, neg: char| format!("{:03}0000{}", v.unsigned_abs(), if v < 0 { neg } else { pos });
    let mut out = format!(
        "UHL1{}{}{:04}{:04}NA  U  {:12}{:04}{:04}0{:24}",
        corner(lon0, 'E', 'W'),
        corner(lat0, 'N', 'S'),
        (36000 / (cols - 1).max(1)).min(9999),
        (36000 / (rows - 1).max(1)).min(9999),
        "",
        cols,
        rows,
        ""
    )
    .into_bytes();
    assert_eq!(out.len(), UHL_LEN);
    out.extend(format!("DSI{:645}", "").bytes());
    out.extend(format!("ACC{:2697}", "").bytes());
    for col in 0..cols {
        let start = out.len();
        out.push(0xAA);
        out.extend([0, 0, 0]);
        out.extend((col as u16).to_be_bytes());
        out.extend([0, 0]);
        for row in 0..rows {
            let h = height(col, row);
            let raw = if h < 0 { 0x8000 | h.unsigned_abs() } else { h as u16 };
            out.extend(raw.to_be_bytes());
        }
        let sum: u32 = out[start..].iter().map(|&b| u32::from(b)).sum();
        out.extend(sum.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_header() {
        let file = write(-46, 24, 121, 121, |_, _| 0);
        assert_eq!(header(&file).unwrap(), Header { lon0: -46, lat0: 24, cols: 121, rows: 121 });
        assert_eq!(header(&write(45, -3, 5, 9, |_, _| 0)).unwrap().lat0, -3);
        assert!(header(b"not a dted file at all, just some text that is long enough to pass the length").is_err());
    }

    #[test]
    fn reads_heights_below_sea_level_and_voids() {
        let cell = Cell::parse(&write(35, 31, 3, 3, |c, r| match (c, r) {
            (0, 0) => -400,
            (2, 2) => VOID,
            _ => 10 * c as i16 + r as i16,
        }))
        .unwrap();
        assert_eq!(cell.at(0, 0), -400);
        assert_eq!(cell.at(2, 1), 21);
        assert_eq!(cell.at(2, 2), VOID);
        assert_eq!(cell.sample(35.0, 31.0), Some(-400.0));
    }

    #[test]
    fn blends_between_posts() {
        // 1 m per post eastward, 2 m per post northward, on an 11 by 11 cell.
        let cell = Cell::parse(&write(45, 24, 11, 11, |c, r| (c + 2 * r) as i16)).unwrap();
        let h = cell.sample(45.25, 24.5).unwrap();
        assert!((h - (2.5 + 10.0)).abs() < 1e-9, "{h}");
        assert_eq!(cell.sample(46.0, 25.0), Some(30.0)); // north-east corner
    }

    #[test]
    fn leaves_out_missing_posts() {
        let cell = Cell::parse(&write(0, 0, 2, 2, |c, _| if c == 0 { VOID } else { 50 })).unwrap();
        assert_eq!(cell.sample(0.5, 0.5), Some(50.0));
        let empty = Cell::parse(&write(0, 0, 2, 2, |_, _| VOID)).unwrap();
        assert_eq!(empty.sample(0.5, 0.5), None);
    }

    #[test]
    fn refuses_a_cut_short_file() {
        let file = write(0, 0, 5, 5, |_, _| 1);
        assert!(Cell::parse(&file[..file.len() - 10]).is_err());
    }

    #[test]
    fn shrinks_a_cell() {
        let cell = Cell::parse(&write(10, 10, 101, 101, |c, r| (c + r) as i16)).unwrap();
        let small = cell.shrink(11);
        assert_eq!((small.cols, small.rows), (11, 11));
        assert_eq!(small.sample(10.5, 10.5), Some(100.0));
    }
}
