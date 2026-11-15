// Builds public/places.json, the offline list of cities behind "Find a place".
//
// Source: GeoNames "cities15000" (every city over 15,000 people), licensed
// CC BY 4.0. Download and unzip
//   https://download.geonames.org/export/dump/cities15000.zip
// then run:  node scripts/build-places.mjs path/to/cities15000.txt
//
// Each place becomes [name, country code, lat, lon, population, Arabic name?],
// largest first, so the search can show big cities before small ones.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/build-places.mjs path/to/cities15000.txt");
  process.exit(1);
}

const ARABIC = /^[ء-ي٠-٩\s'-]+$/;
const rows = [];
for (const line of readFileSync(input, "utf8").split("\n")) {
  const f = line.split("\t");
  if (f.length < 15) continue;
  const row = [f[1], f[8], +(+f[4]).toFixed(4), +(+f[5]).toFixed(4), +f[14] || 0];
  const arabic = f[3].split(",").find((n) => ARABIC.test(n));
  if (arabic) row.push(arabic);
  rows.push(row);
}
rows.sort((a, b) => b[4] - a[4]);

const out = join(dirname(fileURLToPath(import.meta.url)), "../public/places.json");
writeFileSync(out, JSON.stringify(rows));
console.log(`${rows.length} places -> ${out}`);
