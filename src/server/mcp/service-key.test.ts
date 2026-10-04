import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

import { AppError } from "@/server/lib/errors";
import type { ToolContext } from "@/server/mcp/context";
import {
  enforceServiceKeyPolicy,
  isServiceKey,
  SERVICE_CLIENT_ID,
} from "@/server/mcp/service-key";

const PROJECT = "765f38ea-ff6a-48bf-8a5c-a6a368a5e9dc";

function ctx(clientId: string | null): ToolContext {
  return {
    auth: {
      userId: "u",
      userEmail: "sherpa-agent@bodkin.studio",
      organizationId: "o",
      scopes: [],
      clientId,
      baseUrl: "https://search.bodkin.studio",
    },
  };
}

function refused(fn: () => void) {
  let code: unknown;
  try {
    fn();
  } catch (error) {
    code = error instanceof AppError ? error.code : error;
  }
  expect(code).toBe("FORBIDDEN");
}

describe("service key", () => {
  beforeEach(() => {
    mockEnv.MCP_SERVICE_KEY_ID = "key-123";
    mockEnv.MCP_SERVICE_PROJECT_ID = PROJECT;
  });

  it("is only the key the deployment names", () => {
    expect(isServiceKey("key-123")).toBe(true);
    expect(isServiceKey("key-999")).toBe(false);
    expect(isServiceKey(undefined)).toBe(false);
    mockEnv.MCP_SERVICE_KEY_ID = "";
    expect(isServiceKey("")).toBe(false);
  });

  it("may call read tools on its own project", () => {
    for (const tool of [
      "growth_get_priority_recommendations",
      "growth_get_page_context",
      "get_search_console_performance",
      "get_google_analytics_page_performance",
    ]) {
      expect(() =>
        enforceServiceKeyPolicy(tool, { projectId: PROJECT }, ctx(SERVICE_CLIENT_ID)),
      ).not.toThrow();
    }
    expect(() =>
      enforceServiceKeyPolicy("whoami", {}, ctx(SERVICE_CLIENT_ID)),
    ).not.toThrow();
  });

  it("never spends credits, edits or configures, even on its own project", () => {
    for (const tool of [
      "get_serp_results",
      "research_keywords",
      "run_site_audit",
      "save_keywords",
      "growth_record_change",
      "update_project_context",
      "create_project",
      "not_a_tool",
    ]) {
      refused(() =>
        enforceServiceKeyPolicy(tool, { projectId: PROJECT }, ctx(SERVICE_CLIENT_ID)),
      );
    }
  });

  it("never reaches another project, or a project-less read beyond whoami", () => {
    refused(() =>
      enforceServiceKeyPolicy(
        "growth_get_page_context",
        { projectId: "another-project" },
        ctx(SERVICE_CLIENT_ID),
      ),
    );
    refused(() => enforceServiceKeyPolicy("list_projects", {}, ctx(SERVICE_CLIENT_ID)));
  });

  it("reaches nothing when no project is bound", () => {
    mockEnv.MCP_SERVICE_PROJECT_ID = "";
    refused(() =>
      enforceServiceKeyPolicy(
        "growth_get_page_context",
        { projectId: PROJECT },
        ctx(SERVICE_CLIENT_ID),
      ),
    );
  });

  it("leaves every other caller unchanged", () => {
    expect(() =>
      enforceServiceKeyPolicy("get_serp_results", { projectId: "x" }, ctx("api_key")),
    ).not.toThrow();
    expect(() => enforceServiceKeyPolicy("create_project", {}, ctx(null))).not.toThrow();
  });
});
