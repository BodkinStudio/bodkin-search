import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { buildGrowthPreview } from "@/server/features/growth/services/GrowthPreviewService";
import { GrowthPreviewDetail } from "./GrowthPreviewDetail";
import {
  GrowthPreviewPage,
  GrowthPreviewRequestState,
} from "./GrowthPreviewPage";
import { GrowthPreviewWorkspace } from "./GrowthPreviewWorkspace";

vi.mock("@/serverFunctions/growthPreview", () => ({
  getGrowthPreview: vi.fn(),
}));
vi.mock("@/serverFunctions/growthChecks", () => ({
  getGrowthChecksOverview: vi.fn(),
  getGrowthCheckRun: vi.fn(),
  getGrowthCheckEvidence: vi.fn(),
  runGrowthCheck: vi.fn(),
}));

describe("GrowthPreview rendered contract", () => {
  it("labels the preview even before data is available", () => {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        {
          client: new QueryClient(),
        },
        createElement(GrowthPreviewPage, {
          projectId: "real_project",
        }),
      ),
    );
    expect(html).toContain("Check priority pages");
    expect(html).toContain("View synthetic sample evidence");
    expect(html).toContain("sample data for example.com");
    expect(html).toContain(
      "secondary demonstration is the same for every project",
    );
    expect(html).toContain("Loading sample evidence");
    expect(html).toContain('aria-busy="true"');
  });

  it("renders flagged facts, explicit non-causal history and usable list controls", async () => {
    const data = await buildGrowthPreview();
    const html = renderToStaticMarkup(
      createElement(GrowthPreviewWorkspace, { data }),
    );
    for (const text of [
      "Pricing",
      "308",
      "140",
      "168",
      "-54.5%",
      "Current sample context",
      "Selected sample change history",
      "Source details and limitations",
      "No AI interpretation",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('for="growth-page-filter"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("do not show that a change caused the decline");
    expect(html).not.toContain(">Accept<");
    expect(html).not.toContain(">Run live<");
  });

  it("renders missing metrics as unavailable and never produces an evidence packet for them", async () => {
    const data = await buildGrowthPreview();
    const page = data.pages.find(
      (item) => item.keyPageId === "key_incomplete",
    )!;
    const html = renderToStaticMarkup(
      createElement(GrowthPreviewDetail, { page, data }),
    );
    expect(html.match(/Unavailable/g)).toHaveLength(2);
    expect(html).toContain("Missing data is not zero clicks");
    expect(html).toContain("No evidence packet or recommendation was created");
    expect(html).not.toContain("Source details and limitations");
  });

  it("provides an accessible, non-sensitive failure message and retry", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthPreviewRequestState, {
        status: "error",
        onRetry: vi.fn(),
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry preview");
    expect(html).toContain("No work has been saved");
  });
});
