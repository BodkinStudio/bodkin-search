import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  copyGrowthPreviewSource,
  growthPreviewCancellation,
  growthPreviewEnvironment,
  growthPreviewPort,
  isGrowthPreviewSource,
} from "./growth-preview.mjs";

const execFileAsync = promisify(execFile);

test("cancellation covers setup, gaps between commands and repeated shutdown signals", () => {
  for (const stopSignal of ["SIGINT", "SIGTERM"]) {
    const signals = new EventEmitter();
    const cancellation = growthPreviewCancellation(signals);
    assert.equal(cancellation.signal.aborted, false);
    signals.emit(stopSignal);
    assert.throws(() => cancellation.signal.throwIfAborted(), {
      code: "PREVIEW_STOPPED",
    });
    signals.emit(stopSignal);
    assert.equal(signals.listenerCount(stopSignal), 1);
    cancellation.dispose();
    assert.equal(signals.listenerCount("SIGINT"), 0);
    assert.equal(signals.listenerCount("SIGTERM"), 0);
  }
});

test("preview environment drops credentials, remote database and injected Node options", () => {
  const env = growthPreviewEnvironment(
    {
      PATH: "/usr/bin:/bin",
      DATAFORSEO_API_KEY: "secret",
      OPENROUTER_API_KEY: "secret",
      CLOUDFLARE_API_TOKEN: "secret",
      DATABASE_URL: "postgres://private",
      DATABASE_PROVIDER: "postgres",
      AUTH_MODE: "hosted",
      NODE_OPTIONS: "--require /private/hook.js",
      POSTHOG_PUBLIC_KEY: "private",
      HTTP_PROXY: "http://private",
      PORT: "3000",
    },
    "/private/tmp/bodkin-growth-preview-test",
    3217,
  );
  assert.equal(env.AUTH_MODE, "local_noauth");
  assert.equal(env.DATABASE_PROVIDER, "d1");
  assert.equal(env.CLOUDFLARE_VITE_FORCE_LOCAL, "true");
  assert.equal(env.WRANGLER_SEND_METRICS, "false");
  assert.equal(env.BETTER_AUTH_URL, "http://127.0.0.1:3217");
  assert.equal(env.PORT, "3217");
  assert.equal(
    Object.values(env).some(
      (value) =>
        value.includes("secret") ||
        value.includes("private/hook") ||
        value.includes("postgres://"),
    ),
    false,
  );
  for (const key of [
    "DATAFORSEO_API_KEY",
    "OPENROUTER_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "DATABASE_URL",
    "NODE_OPTIONS",
    "POSTHOG_PUBLIC_KEY",
    "HTTP_PROXY",
  ])
    assert.equal(key in env, false);
});

test("snapshot file allowlist includes only app source, assets, migrations and required config", () => {
  for (const file of [
    ".gitignore",
    "src/routes/index.tsx",
    "public/favicon.svg",
    "drizzle/0049_growth.sql",
    "vite.config.ts",
    "wrangler.jsonc",
    "src/server/features/onboarding/openseo-fact-sheet.md",
    "public/site.webmanifest",
  ])
    assert.equal(isGrowthPreviewSource(file), true, file);
  for (const file of [
    "",
    ".env",
    ".env.local",
    ".env.example",
    ".dev.vars",
    ".wrangler/state/v3/data.sqlite",
    ".git/config",
    "src/.env.local",
    "src/private.pem",
    "src/private.txt",
    "src/token.json",
    "public/token.json",
    "public/private.txt",
    "src/../../.env",
    "/src/test.ts",
    "src\\test.ts",
    "docs/private.md",
    "node_modules/.vite/cache",
    "drizzle/meta/0049_snapshot.json",
  ])
    assert.equal(isGrowthPreviewSource(file), false, file);
});

test("snapshot copies only tracked app files, never arbitrary untracked source or assets", async () => {
  const temporary = await mkdtemp(
    path.join(tmpdir(), "bodkin-growth-preview-test-"),
  );
  try {
    const projectRoot = path.join(await realpath(temporary), "repository");
    const previewRoot = path.join(temporary, "snapshot");
    await mkdir(path.join(projectRoot, "src"), { recursive: true });
    await mkdir(path.join(projectRoot, "public"));
    await execFileAsync("git", ["init", "--quiet", projectRoot]);
    await writeFile(
      path.join(projectRoot, "src/app.ts"),
      "export const sample = true;\n",
    );
    await writeFile(path.join(projectRoot, ".gitignore"), ".env\n");
    await writeFile(path.join(projectRoot, "src/private.txt"), "private");
    await writeFile(path.join(projectRoot, "public/token.json"), "private");
    await execFileAsync(
      "git",
      [
        "add",
        ".gitignore",
        "src/app.ts",
        "src/private.txt",
        "public/token.json",
      ],
      { cwd: projectRoot },
    );
    await writeFile(path.join(projectRoot, "src/untracked.ts"), "private");
    await writeFile(path.join(projectRoot, "public/untracked.png"), "private");
    await copyGrowthPreviewSource(
      projectRoot,
      previewRoot,
      new AbortController().signal,
    );
    assert.equal(
      await readFile(path.join(previewRoot, "src/app.ts"), "utf8"),
      "export const sample = true;\n",
    );
    for (const file of [
      "src/private.txt",
      "public/token.json",
      "src/untracked.ts",
      "public/untracked.png",
    ])
      await assert.rejects(readFile(path.join(previewRoot, file)), {
        code: "ENOENT",
      });

    const runtimeFiles = [
      ".preview-config/.wrangler/registry/open-seo",
      ".preview-logs/worker.log",
      ".wrangler/state/v3/data.sqlite-wal",
      ".tanstack/cache.ts",
    ];
    for (const file of runtimeFiles) {
      await mkdir(path.dirname(path.join(previewRoot, file)), {
        recursive: true,
      });
      await writeFile(path.join(previewRoot, file), "runtime");
    }
    const ignores = await readFile(
      path.join(previewRoot, ".gitignore"),
      "utf8",
    );
    assert.ok(ignores.startsWith(".env\n"));
    // Exercise the installed Tailwind scanner against a snapshot with no .git
    // directory: runtime writes must never become hot-reload dependencies.
    const scriptRequire = createRequire(import.meta.url);
    const tailwindRequire = createRequire(
      scriptRequire.resolve("@tailwindcss/vite"),
    );
    const { Scanner } = tailwindRequire("@tailwindcss/oxide");
    const scanner = new Scanner({
      sources: [{ base: previewRoot, pattern: "**/*", negated: false }],
    });
    scanner.scan();
    assert.ok(scanner.files.some((file) => file.endsWith("/src/app.ts")));
    assert.equal(
      scanner.files.some((file) =>
        /\/\.(?:wrangler|preview-config|preview-logs|tanstack)\//.test(file),
      ),
      false,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("port parsing cannot change host or accept shell-like arguments", () => {
  assert.equal(growthPreviewPort([]), 3217);
  assert.equal(growthPreviewPort(["--port", "3218"]), 3218);
  for (const args of [
    ["--host", "0.0.0.0"],
    ["--port", "3000; command"],
    ["--port", "0"],
    ["--port", "65536"],
    ["--port", "3000", "--host", "0.0.0.0"],
  ])
    assert.throws(() => growthPreviewPort(args));
});
