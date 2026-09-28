import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthenticatedAppLayout } from "./AppShell";
vi.mock("@/client/navigation/items", () => ({
  dataforseoHelpLinkOptions: { to: "/help/dataforseo-api-key" },
}));
const state = vi.hoisted(() => ({
  success: true,
  enabled: true,
  role: "viewer",
  check: false,
}));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/" }),
  Link: ({ children }: { children: React.ReactNode }) =>
    createElement("a", {}, children),
}));
vi.mock("@/serverFunctions/clientWorkspaces", () => ({
  getWorkspaceSession: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: (options: { queryKey: string[]; enabled?: boolean }) => {
    if (options.queryKey[0] === "workspace-session")
      return {
        isSuccess: state.success,
        data: state.success
          ? {
              enabled: state.enabled,
              organizationId: "a",
              memberships: [{ id: "a", role: state.role }],
            }
          : undefined,
      };
    if (options.queryKey[0] === "seoApiKeyStatus") {
      state.check = options.enabled === true;
      return { data: { configured: false }, isSuccess: true, isError: false };
    }
    return { data: [] };
  },
}));
vi.mock("@/client/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/client/features/gsc/GscReEngagementModal", () => ({
  GscReEngagementModal: () => null,
}));
vi.mock("@/client/lib/active-project", () => ({
  getLastProjectId: () => null,
}));
vi.mock("@/serverFunctions/config", () => ({ getSeoApiKeyStatus: vi.fn() }));
vi.mock("@/serverFunctions/projects", () => ({ getProjects: vi.fn() }));
describe("setup prompt permissions", () => {
  it.each([
    ["viewer", true, true, false],
    ["editor", true, true, false],
    ["admin", true, true, true],
    ["owner", true, true, true],
    ["unknown", true, true, false],
    ["viewer", false, true, false],
    ["viewer", true, false, true],
  ])(
    "role %s success %s client mode %s checks setup %s",
    (role, success, enabled, allowed) => {
      state.role = role;
      state.success = success;
      state.enabled = enabled;
      const html = renderToStaticMarkup(
        createElement(AuthenticatedAppLayout, {
          // oxlint-disable-next-line react/no-children-prop -- createElement in a non-JSX test file
          children: "Report",
          projectId: "sample",
        }),
      );
      expect(state.check).toBe(allowed);
      expect(html.includes("Setup needed:")).toBe(allowed);
    },
  );
});
