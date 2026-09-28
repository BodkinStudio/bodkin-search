import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
await build({
  entryPoints: ["src/client/analytics/tracker.ts"],
  outfile: "public/bodkin-journeys.js",
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "BodkinJourneys",
  target: "es2020",
});
console.log(
  `Journey tracker: ${gzipSync(readFileSync("public/bodkin-journeys.js")).byteLength} bytes gzip`,
);
