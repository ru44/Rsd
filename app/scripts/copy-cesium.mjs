// Copies Cesium's runtime files (workers, textures, widget styles) into
// public/cesium so the app serves them itself and never needs the internet.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/cesium/Build/Cesium");
const dest = resolve(root, "public/cesium");

if (!existsSync(src)) {
  console.error("cesium is not installed; run `pnpm install` first");
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
for (const dir of ["Assets", "ThirdParty", "Widgets", "Workers"]) {
  cpSync(resolve(src, dir), resolve(dest, dir), { recursive: true });
}
console.log("copied Cesium runtime files to public/cesium");
