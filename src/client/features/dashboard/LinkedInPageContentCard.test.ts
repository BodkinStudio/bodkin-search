import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  mutation: {} as Record<string, unknown>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => state.query,
  useMutation: () => state.mutation,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/client/features/dashboard/cardParts", () => ({
  CardShell: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("section", { "data-title": title }, children),
  Stat: ({
    label,
    value,
    sub,
  }: {
    label: string;
    value: string;
    sub?: ReactNode;
  }) => createElement("div", {}, label, ": ", value, sub),
  PercentDelta: () => createElement("span", {}, "period change"),
}));
vi.mock("@/serverFunctions/linkedin", () => ({
  getLinkedInPostPerformance: vi.fn(),
  importLinkedInPageContent: vi.fn(),
}));

import { LinkedInPageContentCard } from "./LinkedInPageContentCard";

const totals = {
  impressions: 1_200,
  membersReached: 900,
  videoViews: 300,
  clicks: 80,
  reactions: 50,
  comments: 8,
  reposts: 4,
  follows: 6,
};
const report = {
  status: "ok" as const,
  projectId: "project-1",
  source: {
    provider: "linkedin_page_content_manual" as const,
    pageName: "OpenSEO",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    importedAt: "2026-09-01T00:00:00Z",
    rowCount: 2,
  },
  current: totals,
  previous: { ...totals, impressions: 1_000 },
  comparison: { ...totals, impressions: 200 },
  completeness: "partial" as const,
  warnings: ["partial_current_metric_values" as const],
  posts: [
    {
      postUrl: "https://www.linkedin.com/posts/example",
      postText: "A useful LinkedIn post",
      publishedAt: "2026-08-15",
      ...totals,
      providerClickThroughRate: 6.67,
      providerEngagementRate: 5.5,
    },
  ],
};

function render() {
  return renderToStaticMarkup(
    createElement(LinkedInPageContentCard, { projectId: "project-1" }),
  );
}

describe("LinkedInPageContentCard", () => {
  beforeEach(() => {
    state.query = { data: report, refetch: vi.fn() };
    state.mutation = { mutate: vi.fn(), isPending: false };
  });

  it("renders imported provenance, partial disclosure, comparison, and top posts", () => {
    const markup = render();
    expect(markup).toContain("LinkedIn Page analytics");
    expect(markup).toContain("OpenSEO");
    expect(markup).toContain("Imported");
    expect(markup).toContain("1,200");
    expect(markup).toContain("period change");
    expect(markup).toContain("Some metrics were blank");
    expect(markup).toContain("A useful LinkedIn post");
    expect(markup).toContain("5.50% provider engagement rate");
  });

  it("does not render a period delta without an exact prior comparison", () => {
    state.query = {
      data: { ...report, previous: null, comparison: null },
      refetch: vi.fn(),
    };
    const markup = render();
    expect(markup).not.toContain("period change");
    expect(markup).toContain("Import the exact preceding period");
  });

  it("renders accessible loading and unexpected-error retry states", () => {
    state.query = { isPending: true };
    expect(render()).toContain('aria-busy="true"');
    state.query = { isError: true, refetch: vi.fn() };
    const errorMarkup = render();
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain("Retry");
  });

  it("renders the no-import upload workflow with explicit labels and raw-file privacy", () => {
    state.query = {
      data: {
        status: "error",
        projectId: "project-1",
        error: {
          code: "linkedin_no_import",
          message: "Import",
          actionUrl: "/dashboard",
        },
      },
      refetch: vi.fn(),
    };
    const markup = render();
    expect(markup).toContain("No LinkedIn analytics imported yet");
    expect(markup).toContain("Page Content export");
    expect(markup).toContain("Page name");
    expect(markup).toContain("Start date");
    expect(markup).toContain("End date");
    expect(markup).toContain("raw file stays in your browser");
    expect(markup).toContain('accept=".csv,.xls,.xlsx"');
    expect(markup).toContain("Import analytics");
  });

  it("communicates pending imports and disables submission", () => {
    state.mutation = { mutate: vi.fn(), isPending: true };
    const markup = render();
    expect(markup).toContain("Importing…");
    expect(markup).toContain("disabled");
  });
});
