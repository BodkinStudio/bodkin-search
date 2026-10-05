import { readFileSync } from "node:fs";

// The analytics tables, as the SQLite migrations build them, for tests that
// run against a real in-memory database.
const ANALYTICS_MIGRATIONS = [
  "0073_aspiring_inertia",
  "0074_right_mephisto",
  "0075_panoramic_namora",
  "0076_dazzling_wolf_cub",
  "0079_wandering_zarda",
  "0082_milky_wolfpack",
  "0083_crazy_newton_destine",
];

export const analyticsMigrationSql = () =>
  ANALYTICS_MIGRATIONS.map((name) =>
    readFileSync(`drizzle/${name}.sql`, "utf8"),
  ).join("\n");
