// Copies Cesium's runtime files (workers, textures, widget styles) into
// public/cesium so the app serves them itself and never needs the internet.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = resolve(root, "node_modules/cesium/package.json");
const src = resolve(root, "node_modules/cesium/Build/Cesium");
const dest = resolve(root, "public/cesium");
const stamp = resolve(dest, ".version");

if (!existsSync(src)) {
  console.error("cesium is not installed; run `pnpm install` first");
  process.exit(1);
}

// Skip when this Cesium version is already copied. Besides being faster, this
// matters: wiping the folder under a running dev server makes Vite stop
// serving these files until it is restarted.
const version = JSON.parse(readFileSync(pkg, "utf8")).version;
if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) {
  console.log(`Cesium ${version} runtime files already in public/cesium`);
} else {
  rmSync(dest, { recursive: true, force: true });
  for (const dir of ["Assets", "ThirdParty", "Widgets", "Workers"]) {
    cpSync(resolve(src, dir), resolve(dest, dir), { recursive: true });
  }
  writeFileSync(stamp, version);
  console.log(`copied Cesium ${version} runtime files to public/cesium`);
}
