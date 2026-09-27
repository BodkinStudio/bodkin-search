import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { is } from "drizzle-orm";
import { expect, it } from "vitest";
import { PROJECT_ORGANIZATION_TABLES } from "./projectMoveTables";

const schemaModules = import.meta.glob<Record<string, unknown>>(
  "../../../db/*.schema.ts",
  { eager: true },
);

it("moves every table that copies a project's organization", () => {
  const tables = Object.values(schemaModules)
    .flatMap((module) => Object.values(module))
    .filter((value) => is(value, SQLiteTable))
    .map((table) => getTableConfig(table))
    .filter((config) => {
      const columns = config.columns.map((column) => column.name);
      return (
        columns.includes("project_id") && columns.includes("organization_id")
      );
    })
    .map((config) => config.name);
  expect(tables.toSorted()).toEqual(
    [...PROJECT_ORGANIZATION_TABLES].toSorted(),
  );
});
