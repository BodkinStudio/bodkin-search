import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Customer sites pin a release by URL and Subresource Integrity hash, so a
// release file is immutable once written: never overwrite or delete one a
// site may still load. public/bodkin-journeys.js is the frozen pre-pinning
// URL kept only until existing installs move to a pinned snippet.
const result = await build({
  entryPoints: ["src/client/analytics/tracker.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "BodkinJourneys",
  target: "es2020",
  write: false,
});
const code = result.outputFiles[0].contents;
const digest = createHash("sha384").update(code).digest();
const path = `/bodkin-journeys/${digest.toString("hex").slice(0, 16)}.js`;

mkdirSync("public/bodkin-journeys", { recursive: true });
if (!existsSync(`public${path}`)) writeFileSync(`public${path}`, code);
writeFileSync(
  "src/client/analytics/tracker-release.json",
  `${JSON.stringify({ path, integrity: `sha384-${digest.toString("base64")}` }, null, 2)}\n`,
);
console.log(`Journey tracker ${path}: ${gzipSync(code).byteLength} bytes gzip`);
