import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "journey-tracker.spec.ts",
  workers: 1,
  use: { channel: "chrome" },
  reporter: "list",
});
