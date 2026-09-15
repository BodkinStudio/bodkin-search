#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT_FILES = new Set([
  ".gitignore",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite-plugin-lean-worker-bundle.ts",
  "worker-configuration.d.ts",
  "wrangler.jsonc",
  "src/server/features/onboarding/openseo-fact-sheet.md",
  "public/site.webmanifest",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
const ASSET_EXTENSIONS = new Set([
  ".svg",
  ".png",
  ".ico",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ".woff",
  ".woff2",
]);

export function isGrowthPreviewSource(file) {
  if (ROOT_FILES.has(file)) return true;
  const parts = file.split("/");
  if (
    parts.some((part) => !part || part.startsWith(".")) ||
    file.includes("\\")
  )
    return false;
  if (/\.(?:pem|key|p12|pfx|sqlite|sqlite3|db)$/i.test(file)) return false;
  if (parts[0] === "drizzle")
    return parts.length === 2 && file.endsWith(".sql");
  const extension = path.extname(file).toLowerCase();
  if (parts[0] === "src") return SOURCE_EXTENSIONS.has(extension);
  return parts[0] === "public" && ASSET_EXTENSIONS.has(extension);
}

export function growthPreviewEnvironment(inherited, previewRoot, port) {
  // Allowlist, never spread the calling shell: provider keys, cloud tokens,
  // NODE_OPTIONS and an existing database URL must not reach the preview.
  return {
    PATH: inherited.PATH ?? "/usr/bin:/bin",
    LANG: "en_GB.UTF-8",
    CI: "true",
    AUTH_MODE: "local_noauth",
    DATABASE_PROVIDER: "d1",
    PORT: String(port),
    BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    CLOUDFLARE_VITE_FORCE_LOCAL: "true",
    VITE_SHOW_DEVTOOLS: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG: "warn",
    WRANGLER_LOG_PATH: path.join(previewRoot, ".preview-logs"),
    XDG_CONFIG_HOME: path.join(previewRoot, ".preview-config"),
  };
}

export function growthPreviewPort(args) {
  if (args.length === 0) return 3217;
  if (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1])) {
    throw new Error("Usage: node scripts/growth-preview.mjs [--port 3217]");
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Preview port must be an integer between 1024 and 65535.");
  }
  return port;
}

export function growthPreviewCancellation(signals = process) {
  const controller = new AbortController();
  const stop = () =>
    controller.abort(
      Object.assign(new Error("Preview stopped."), { code: "PREVIEW_STOPPED" }),
    );
  signals.on("SIGINT", stop);
  signals.on("SIGTERM", stop);
  return {
    signal: controller.signal,
    dispose() {
      signals.off("SIGINT", stop);
      signals.off("SIGTERM", stop);
    },
  };
}

async function checkPort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      server.close(resolve),
    );
  });
}

export async function copyGrowthPreviewSource(
  projectRoot,
  previewRoot,
  signal,
) {
  signal.throwIfAborted();
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "-z"],
    { cwd: projectRoot, maxBuffer: 4 * 1024 * 1024 },
  );
  for (const file of new Set(
    stdout.split("\0").filter(isGrowthPreviewSource),
  )) {
    signal.throwIfAborted();
    const source = path.join(projectRoot, file);
    // Never follow a user-created source symlink out of the copied tree.
    const resolved = await realpath(source);
    const relative = path.relative(projectRoot, resolved);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      !(await lstat(source)).isFile()
    ) {
      throw new Error(
        `Preview source is not a regular in-repository file: ${file}`,
      );
    }
    const destination = path.join(previewRoot, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  // Tailwind scans the Vite root. Runtime database/registry writes are not
  // CSS sources and must not turn ordinary requests into full-page reloads.
  await appendFile(
    path.join(previewRoot, ".gitignore"),
    "\n# Disposable preview runtime, never application source\n.preview-config/\n.preview-logs/\n.wrangler/\n.tanstack/\n",
  );
}

async function linkDependencies(projectRoot, previewRoot, signal) {
  signal.throwIfAborted();
  const installed = path.join(projectRoot, "node_modules");
  const target = path.join(previewRoot, "node_modules");
  await mkdir(target);
  for (const name of await readdir(installed)) {
    signal.throwIfAborted();
    // Keep .vite and .vite-temp local; do not share hidden package caches.
    if (name.startsWith(".")) continue;
    if (name.startsWith("@")) {
      await mkdir(path.join(target, name));
      for (const pkg of await readdir(path.join(installed, name))) {
        signal.throwIfAborted();
        await symlink(
          await realpath(path.join(installed, name, pkg)),
          path.join(target, name, pkg),
        );
      }
    } else {
      await symlink(
        await realpath(path.join(installed, name)),
        path.join(target, name),
      );
    }
  }
}

function run(command, args, options, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "inherit", "inherit"],
    });
    const stop = () => child.kill("SIGTERM");
    let spawnError;
    signal.addEventListener("abort", stop, { once: true });
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, childSignal) => {
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(signal.reason);
      else if (spawnError) reject(spawnError);
      else if (code === 0) resolve();
      else
        reject(
          new Error(
            `${path.basename(command)} exited with ${code ?? childSignal}`,
          ),
        );
    });
  });
}

const SEED = `
INSERT INTO "user" (id, name, email, email_verified)
VALUES ('local-admin', 'admin', 'admin@localhost', 1);
INSERT INTO organization (id, name, slug, created_at)
VALUES ('delegated-local-admin', 'admin workspace', 'delegated-admin-6c6f63616c2d61646d696e', CAST(unixepoch() * 1000 AS INTEGER));
INSERT INTO projects (id, organization_id, name, domain)
VALUES ('growth-preview', 'delegated-local-admin', 'Growth preview', NULL);
`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: node scripts/growth-preview.mjs [--port 3217]\nStarts a loopback-only sample app with disposable source/data and no inherited credentials. Uses installed dependencies; installs nothing. Stop with Ctrl+C. Restart to include source edits.",
    );
    return;
  }
  const port = growthPreviewPort(process.argv.slice(2));
  await checkPort(port);
  const projectRoot = await realpath(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const cancellation = growthPreviewCancellation();
  const { signal } = cancellation;
  let previewRoot;
  try {
    previewRoot = await mkdtemp(path.join(tmpdir(), "bodkin-growth-preview-"));
    await copyGrowthPreviewSource(projectRoot, previewRoot, signal);
    await linkDependencies(projectRoot, previewRoot, signal);
    const options = {
      cwd: previewRoot,
      env: growthPreviewEnvironment(process.env, previewRoot, port),
    };
    const wrangler = path.join(
      projectRoot,
      "node_modules/wrangler/bin/wrangler.js",
    );
    await run(
      process.execPath,
      [wrangler, "d1", "migrations", "apply", "DB", "--local"],
      options,
      signal,
    );
    const seedPath = path.join(previewRoot, "growth-preview-seed.sql");
    await writeFile(seedPath, SEED);
    await run(
      process.execPath,
      [wrangler, "d1", "execute", "DB", "--local", "--file", seedPath],
      options,
      signal,
    );
    console.log(
      `\nGrowth sample preview: http://127.0.0.1:${port}/p/growth-preview/growth`,
    );
    console.log(
      `Disposable workspace: ${previewRoot}\nNo provider credentials loaded. Stop with Ctrl+C; restart to include source edits.\n`,
    );
    await run(
      process.execPath,
      [
        path.join(projectRoot, "node_modules/vite/bin/vite.js"),
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      options,
      signal,
    );
  } finally {
    // This path is created only by mkdtemp above, never accepted from input.
    try {
      if (previewRoot) await rm(previewRoot, { recursive: true, force: true });
    } finally {
      cancellation.dispose();
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = error.code === "PREVIEW_STOPPED" ? 0 : 1;
  });
}
