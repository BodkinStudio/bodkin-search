import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GrowthPlanRoute } from "./index";

const state = vi.hoisted(() => ({
  isSuccess: false,
  data: undefined as
    | undefined
    | {
        enabled: boolean;
        organizationId: string;
        memberships: { id: string; role: string }[];
      },
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => state,
}));
vi.mock("@/serverFunctions/clientWorkspaces", () => ({
  getWorkspaceSession: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useParams: () => ({ projectId: "project" }),
    useSearch: () => ({ edit: "1" }),
  }),
}));
vi.mock("@/client/features/growth/plan/GrowthPlanPage", () => ({
  GrowthPlanPage: ({
    canEdit,
    defaultEdit,
  }: {
    canEdit: boolean;
    defaultEdit: boolean;
  }) => `canEdit=${canEdit};defaultEdit=${defaultEdit}`,
}));

describe("Growth route workspace permission", () => {
  it.each([
    ["loading", false, undefined, false],
    [
      "error with stale owner data",
      false,
      {
        enabled: true,
        organizationId: "org",
        memberships: [{ id: "org", role: "owner" }],
      },
      false,
    ],
    [
      "viewer",
      true,
      {
        enabled: true,
        organizationId: "org",
        memberships: [{ id: "org", role: "viewer" }],
      },
      false,
    ],
    [
      "editor",
      true,
      {
        enabled: true,
        organizationId: "org",
        memberships: [{ id: "org", role: "editor" }],
      },
      true,
    ],
    [
      "missing membership",
      true,
      {
        enabled: true,
        organizationId: "org",
        memberships: [{ id: "other", role: "owner" }],
      },
      false,
    ],
    [
      "legacy",
      true,
      { enabled: false, organizationId: "org", memberships: [] },
      true,
    ],
  ] as const)("handles %s", (_label, success, data, expected) => {
    state.isSuccess = success;
    state.data = data
      ? { ...data, memberships: [...data.memberships] }
      : undefined;
    expect(renderToStaticMarkup(createElement(GrowthPlanRoute))).toBe(
      `canEdit=${expected};defaultEdit=true`,
    );
  });
});
