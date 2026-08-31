import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowthWorkOverview } from "@/types/schemas/growth-investigations";
import { GrowthWork, GrowthWorkList } from "./GrowthWork";

vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthWork: vi.fn(),
}));
vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkHistory: vi.fn(),
  updateGrowthWorkStatus: vi.fn(),
}));

const overview: GrowthWorkOverview = {
  limit: 50,
  actions: [
    {
      id: "action_1",
      title: "Investigate the pricing-page decline",
      status: "approved",
      stateVersion: 0,
      dueOn: "2026-09-04",
      createdAt: "2026-08-30T23:30:00.000Z",
      runId: "source_run_1",
      displayUrls: ["https://example.com/pricing"],
    },
  ],
};

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
}
function render(queryClient: QueryClient, projectId = "project_1") {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(GrowthWork, { projectId, onOpenCheck: vi.fn() }),
    ),
  );
}

function findSourceLink(
  node: ReactNode,
): { props: { onClick?: () => void } } | null {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node))
    return null;
  if (node.props.children === "Open source check") return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findSourceLink(child);
    if (found) return found;
  }
  return null;
}

describe("Growth work list", () => {
  it("has an accessible loading region and read-only refresh", () => {
    const html = render(client());
    expect(html).toContain('id="growth-work"');
    expect(html).toContain('aria-labelledby="growth-work-title"');
    expect(html).toContain("Loading saved work");
    expect(html).toContain("Refresh saved work");
  });

  it("explains the empty state and separates planning from implementation", () => {
    const queryClient = client();
    queryClient.setQueryData(["growthWork", "project_1"], {
      actions: [],
      limit: 50,
    });
    const html = render(queryClient);
    expect(html).toContain("No investigations approved yet");
    expect(html).toContain("does not mean the website has changed");
  });

  it("renders the persisted status, UTC dates, source and disclosed bound", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkList, {
        projectId: "project_1",
        data: overview,
        onOpenCheck: vi.fn(),
      }),
    );
    expect(html).toContain("50 most recently added investigations");
    expect(html).toContain("Approved");
    expect(html).toContain("Due date (UTC)");
    expect(html).toContain("4 Sept 2026");
    expect(html).toContain("30 Aug 2026");
    expect(html).toContain('href="#growth-live-check-title"');
    expect(html).toContain("Mark done or update status");
    expect(html).not.toContain("Save status");
  });

  it("opens the action's actual source run, not merely the latest check", () => {
    const open = vi.fn();
    const tree = GrowthWorkList({
      projectId: "project_1",
      data: overview,
      onOpenCheck: open,
    });
    findSourceLink(tree)?.props.onClick?.();
    expect(open).toHaveBeenCalledExactlyOnceWith("source_run_1");
  });

  it("keeps finished work visible as Done without labelling its impact evaluated", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkList, {
        projectId: "project_1",
        data: {
          ...overview,
          actions: [
            { ...overview.actions[0], status: "implemented", stateVersion: 1 },
          ],
        },
        onOpenCheck: vi.fn(),
      }),
    );
    expect(html).toContain("Done");
    expect(html).toContain("View status history");
    expect(html).toContain(overview.actions[0].title);
    expect(html).not.toContain("Evaluated");
  });

  it("does not display another project's saved work", () => {
    const queryClient = client();
    queryClient.setQueryData(["growthWork", "project_1"], overview);
    const html = render(queryClient, "project_2");
    expect(html).toContain("Loading saved work");
    expect(html).not.toContain(overview.actions[0].title);
  });

  it("offers error recovery without leaking raw errors", async () => {
    const queryClient = client();
    await queryClient
      .fetchQuery({
        queryKey: ["growthWork", "project_1"],
        queryFn: () => Promise.reject(new Error("private SQL")),
      })
      .catch(() => undefined);
    const html = render(queryClient);
    expect(html).toContain("Use Refresh saved work to try again");
    expect(html).not.toContain("private SQL");
  });

  it("keeps non-approved lifecycle states literal and wraps escaped historic content", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkList, {
        projectId: "project_1",
        data: {
          ...overview,
          actions: [
            {
              ...overview.actions[0],
              title: "<script>unsafe</script>",
              status: "measuring",
              dueOn: null,
              displayUrls: [null],
            },
          ],
        },
        onOpenCheck: vi.fn(),
      }),
    );
    expect(html).toContain("Measuring");
    expect(html).toContain("Not set");
    expect(html).toContain("Saved page URL withheld");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).not.toContain("<script>");
  });
});
