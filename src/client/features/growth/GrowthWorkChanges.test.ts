import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowthWorkChangesOverview } from "@/types/schemas/growth-work";
import { GrowthWorkChanges, GrowthWorkChangesPanel } from "./GrowthWorkChanges";
import { GrowthWorkChangeForm } from "./GrowthWorkChangeForm";

vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkChanges: vi.fn(),
  linkGrowthWorkChange: vi.fn(),
}));

const change: GrowthWorkChangesOverview["availableChanges"][number] = {
  id: "change_1",
  changeType: "content_updated",
  description: "Updated pricing copy.",
  happenedAt: "2026-08-01T00:00:00.000Z",
  recordedAt: "2026-08-02T00:00:00.000Z",
  displayUrls: ["https://example.com/pricing"],
};

function renderPanel(data?: GrowthWorkChangesOverview) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (data)
    client.setQueryData(["growthWorkChanges", "project_1", "action_1"], data);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GrowthWorkChangesPanel, {
        projectId: "project_1",
        actionId: "action_1",
      }),
    ),
  );
}

describe("Related page change rendered contracts", () => {
  it("starts closed without loading a panel or offering a mutation", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkChanges, {
        projectId: "project_1",
        actionId: "action_1",
      }),
    );
    expect(html).toContain("Related page changes");
    expect(html).not.toContain("Link saved change");
    expect(html).not.toContain("Loading related changes");
  });

  it("shows loading feedback and a read-only refresh control", () => {
    const html = renderPanel();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading related changes");
    expect(html).toContain("Refresh saved links");
    expect(html).not.toContain("Link saved change");
  });

  it("keeps old linked records separate from candidates and gives honest empty guidance", () => {
    const html = renderPanel({
      actionId: "action_1",
      linkedChanges: [change],
      availableChanges: [],
      limit: 50,
    });
    expect(html).toContain("Updated pricing copy.");
    expect(html).toContain(
      '<h4 class="font-semibold">Linked manual changes</h4>',
    );
    expect(html).toContain('<h5 class="font-medium">');
    expect(html).toContain("No recent manual changes available");
    expect(html).toContain('href="#growth-change-log"');
    expect(html).toContain("does not change the work status");
  });

  it("does not confuse an empty association with an empty change log", () => {
    const html = renderPanel({
      actionId: "action_1",
      linkedChanges: [],
      availableChanges: [change],
      limit: 50,
    });
    expect(html).toContain("No manual page changes linked to this work yet");
    expect(html).toContain("Link saved change");
    expect(html).not.toContain("No changes recorded yet");
  });

  it("requires an explicit selection and explains that links cannot be removed", () => {
    const onSubmit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(GrowthWorkChangeForm, {
        changes: [change],
        limit: 50,
        disabled: false,
        pending: false,
        onSubmit,
      }),
    );
    expect(html).toContain('aria-label="Link a saved page change"');
    expect(html).toContain('value="" selected=""');
    expect(html).toContain("Links cannot be removed here");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain('required=""');
    expect(html).not.toContain("Selected change");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the exact selected record with safe text and locks pending fields", () => {
    const onSubmit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(GrowthWorkChangeForm, {
        changes: [
          {
            ...change,
            description: "<script>private()</script>",
            displayUrls: [null],
          },
        ],
        selectedId: change.id,
        limit: 50,
        disabled: true,
        pending: true,
        onSubmit,
      }),
    );
    expect(html).toContain("Selected change");
    expect(html).toContain('value="change_1" selected=""');
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("Linking change");
    expect(html).toContain("Page URL withheld");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
