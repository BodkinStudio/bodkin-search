import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import policy from "./server-function-policy.json";
import {
  canManageRole,
  canWorkspace,
  workspaceCapabilitySchema,
} from "@/shared/workspaces/permissions";

describe("workspace server operation policy", () => {
  it("covers every server function by its compiler metadata name and source path", () => {
    const discovered: string[] = [];
    for (const name of readdirSync("src/serverFunctions")) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      const filename = `src/serverFunctions/${name}`;
      const source = ts.createSourceFile(
        filename,
        readFileSync(filename, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isVariableDeclaration(node) &&
          node.initializer?.getText(source).includes("createServerFn(")
        )
          discovered.push(`${filename}:${node.name.getText(source)}`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(Object.keys(policy).toSorted()).toEqual(discovered.toSorted());
    // ensureUser parses these at request time; a stale name would 500.
    for (const rule of Object.values(policy))
      if (rule.capability !== "self" && rule.capability !== "blocked")
        expect(workspaceCapabilitySchema.parse(rule.capability)).toBeTruthy();
    expect(
      Object.hasOwn(
        policy,
        "src/serverFunctions/unknown.ts:unreviewedOperation",
      ),
    ).toBe(false);
  });
  it("gives viewers only reads, lets editors run paid work, rejects legacy roles and limits administrators", () => {
    expect(canWorkspace("viewer", "read")).toBe(true);
    for (const capability of workspaceCapabilitySchema.options.slice(1))
      expect(canWorkspace("viewer", capability)).toBe(false);
    expect(canWorkspace("editor", "run")).toBe(true);
    expect(canWorkspace("editor", "configure")).toBe(false);
    expect(canWorkspace("admin", "own")).toBe(false);
    expect(canWorkspace("member", "read")).toBe(false);
    expect(canManageRole("admin", "owner", "viewer")).toBe(false);
    expect(canManageRole("admin", "viewer", "admin")).toBe(false);
    expect(canManageRole("admin", "editor", "viewer")).toBe(true);
  });
});
