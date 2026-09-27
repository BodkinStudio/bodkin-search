import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({
  projectId: "project_one",
  component: undefined as
    | (() => ReactElement<{ projectId: string }>)
    | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  redirect: vi.fn(),
  createFileRoute:
    () =>
    (options: { component: () => ReactElement<{ projectId: string }> }) => {
      route.component = options.component;
      return {
        useParams: () => ({ projectId: route.projectId, section: "work" }),
        useSearch: () => ({}),
        useNavigate: () => () => undefined,
      };
    },
}));
vi.mock("./GrowthSections", () => ({ GrowthSection: () => null }));

import { Route } from "@/routes/_project/p/$projectId/growth/$section";

describe("Growth section project scope", () => {
  it("keys each Growth section to the project, remounting all nested query/filter/selection state", () => {
    expect(Route).toBeDefined();
    route.projectId = "project_one";
    const first = route.component!();
    route.projectId = "project_two";
    const second = route.component!();
    expect(first.key).toBe("project_one");
    expect(first.props.projectId).toBe("project_one");
    expect(second.key).toBe("project_two");
    expect(second.props.projectId).toBe("project_two");
    expect(first.key).not.toBe(second.key);
  });
});
