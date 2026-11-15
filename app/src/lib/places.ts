// "Find a place" without the internet: a list of the world's cities that
// ships with the app (see scripts/build-places.mjs), searched in the browser.

export interface Place {
  name: string;
  /** Two-letter country code. */
  country: string;
  lat: number;
  lon: number;
  population: number;
}
/** [name, country code, lat, lon, population, Arabic name?], largest first. */
type Row = [string, string, number, number, number, string?];

let rows: Row[] | null = null;
let keys: string[] = [];
let loading: Promise<void> | null = null;

/** Lower case, no accents, no punctuation: "Sulţānah" and "sultanah" match. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Fetches the list once. Safe to call again; later calls reuse the first. */
export function loadPlaces(url = `${import.meta.env.BASE_URL}places.json`): Promise<void> {
  loading ??= fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`places: ${r.status}`))))
    .then((data: Row[]) => setPlaces(data))
    .catch((e) => {
      loading = null; // let a later search try again
      throw e;
    });
  return loading;
}

export function setPlaces(data: Row[]) {
  rows = data;
  keys = data.map((r) => fold(r[0]));
}

const toPlace = (r: Row): Place => ({ name: r[0], country: r[1], lat: r[2], lon: r[3], population: r[4] });

/**
 * Cities matching what was typed, best first: exact names, then names that
 * start with it, then names with a word that starts with it; bigger cities
 * first within each group. "paris, fr" or "paris, france" narrows by country.
 */
export function searchPlaces(query: string, limit = 8): Place[] {
  if (!rows) return [];
  const [namePart, countryPart] = query.split(",").map((s) => s.trim());
  const q = fold(namePart ?? "");
  if (q.length < 2) return [];
  const country = countryPart ? fold(countryPart) : "";
  const groups: Row[][] = [[], [], []];

  for (let i = 0; i < rows.length; i++) {
    const key = keys[i];
    const row = rows[i];
    let rank = key === q ? 0 : key.startsWith(q) ? 1 : key.includes(" " + q) ? 2 : -1;
    // Arabic names are matched as typed.
    if (rank < 0 && row[5] && row[5].includes(namePart)) rank = row[5] === namePart ? 0 : 1;
    if (rank < 0 || groups[rank].length >= limit) continue;
    if (country && row[1].toLowerCase() !== country && !fold(countryName(row[1])).startsWith(country)) continue;
    groups[rank].push(row);
  }
  return groups.flat().slice(0, limit).map(toPlace);
}

/** How high to look at a place from: big cities need a wider view. */
export function viewHeightM(population: number): number {
  if (population >= 5_000_000) return 160_000;
  if (population >= 1_000_000) return 90_000;
  if (population >= 100_000) return 45_000;
  return 20_000;
}
