import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { getGrowthChangeLog } from "@/serverFunctions/growthChangeLog";
import { GrowthChangeLog } from "./GrowthChangeLog";
import { GrowthChangeForm } from "./GrowthChangeForm";
import { GrowthChangeHistory } from "./GrowthChangeHistory";

vi.mock("@/serverFunctions/growthChangeLog", () => ({
  getGrowthChangeLog: vi.fn(),
  recordGrowthPageChange: vi.fn(),
}));

const overview: Awaited<ReturnType<typeof getGrowthChangeLog>> = {
  setup: "ready",
  keyPages: [{ id: "page_1", displayUrl: "https://example.com/pricing" }],
  changes: [],
  limit: 50,
};
const change = {
  id: "change_1",
  changeType: "content_updated" as const,
  description: "Rewrote the pricing comparison.",
  happenedAt: "2026-08-01T00:00:00.000Z",
  recordedAt: "2026-08-30T12:00:00.000Z",
  displayUrls: ["https://example.com/pricing"],
};

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false, retryOnMount: false },
    },
  });
}

function renderLog(queryClient: QueryClient, projectId = "project_1") {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(GrowthChangeLog, { projectId }),
    ),
  );
}

describe("Growth change log rendered contract", () => {
  it("has a named loading region without suggesting work was saved", () => {
    const html = renderLog(client());
    expect(html).toContain('id="growth-change-log"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading saved changes");
    expect(html).not.toContain("Change saved for");
  });

  it("offers logging with no Search Console prerequisite and honest empty history", () => {
    const queryClient = client();
    queryClient.setQueryData(["growthChangeLog", "project_1"], overview);
    const html = renderLog(queryClient);
    expect(html).toContain("Record a change");
    expect(html).toContain("No changes recorded yet");
    expect(html).toContain("cannot be edited");
    expect(html).toContain("does not show that a change caused a result");
    expect(html).not.toContain("Connect a Search Console");
  });

  it("does not render another project's cached history", () => {
    const queryClient = client();
    queryClient.setQueryData(["growthChangeLog", "project_1"], {
      ...overview,
      changes: [change],
    });
    const html = renderLog(queryClient, "project_2");
    expect(html).toContain("Loading saved changes");
    expect(html).not.toContain(change.description);
  });

  it("provides a safe read-failure message and refresh control", async () => {
    const queryClient = client();
    await queryClient
      .fetchQuery({
        queryKey: ["growthChangeLog", "project_1"],
        queryFn: () => Promise.reject(new Error("private database detail")),
      })
      .catch(() => undefined);
    const html = renderLog(queryClient);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Refresh saved changes");
    expect(html).not.toContain("private database detail");
  });

  it("labels native fields, UTC day semantics, limits and the save action", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthChangeForm, {
        keyPages: overview.keyPages,
        disabled: false,
        pending: false,
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Record a page change"');
    expect(html).toContain("Priority page");
    expect(html).toContain("Change type");
    expect(html).toContain("Date changed (UTC)");
    expect(html).toContain('type="date"');
    expect(html).toContain("What changed");
    expect(html).toContain('maxLength="5000"');
    expect(html).toContain("Save change");
    expect(html.match(/<label /g)).toHaveLength(4);
    expect(html.match(/required=""/g)).toHaveLength(4);
  });

  it("locks the submitted fields and button while saving", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthChangeForm, {
        keyPages: overview.keyPages,
        disabled: true,
        pending: true,
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("Saving change…");
  });

  it("distinguishes the change day from the recording day without execution claims", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthChangeHistory, {
        changes: [change],
        limit: 50,
      }),
    );
    expect(html).toContain("Content updated");
    expect(html).toContain("Changed 1 Aug 2026 (UTC)");
    expect(html).toContain("Manually recorded 30 Aug 2026 (UTC)");
    expect(html).toContain("not collected by a check");
    expect(html).toContain("50 most recent manual entries");
  });

  it("escapes user notes, wraps long content and handles withheld URLs", () => {
    const note =
      '<script>alert("unsafe")</script>' + " very long notes".repeat(40);
    const html = renderToStaticMarkup(
      createElement(GrowthChangeHistory, {
        changes: [{ ...change, description: note, displayUrls: [null] }],
        limit: 50,
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Read full note");
    expect(html).toContain("Page URL withheld");
    expect(html).toContain("overflow-wrap:anywhere");
  });
});
