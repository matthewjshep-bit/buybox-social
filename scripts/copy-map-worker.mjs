// The map library runs tile work in a Web Worker loaded from its own file. Next.js
// bundles the library without that file, so it's served from public/ instead.
// The file name carries the version, so browsers never mix an old worker with new code.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const outDir = path.join(process.cwd(), "public/vendor");
mkdirSync(outDir, { recursive: true });
for (const old of readdirSync(outDir)) {
  if (old.startsWith("maplibre-gl-worker-")) rmSync(path.join(outDir, old));
}
const target = `maplibre-gl-worker-${version}.mjs`;
copyFileSync(path.join(path.dirname(pkgPath), "dist/maplibre-gl-worker.mjs"), path.join(outDir, target));
console.log(`copied ${target}`);
