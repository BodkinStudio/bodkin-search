import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowthWorkItem } from "@/types/schemas/growth-investigations";
import type { GrowthWorkHistory } from "@/types/schemas/growth-work";
import {
  GrowthWorkDelivery,
  GrowthWorkDeliveryPanel,
} from "./GrowthWorkDelivery";
import { GrowthWorkStatusForm } from "./GrowthWorkStatusForm";
import { GrowthWorkHistoryList } from "./GrowthWorkHistory";
import { growthWorkNextStatuses } from "./GrowthWorkPresentation";

vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthWork: vi.fn(),
}));
vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkHistory: vi.fn(),
  updateGrowthWorkStatus: vi.fn(),
}));

const action: GrowthWorkItem = {
  id: "action_1",
  title: "Investigate pricing-page clicks",
  status: "approved",
  stateVersion: 0,
  dueOn: "2026-09-04",
  createdAt: "2026-08-30T10:00:00.000Z",
  runId: "run_1",
  displayUrls: ["https://example.com/pricing"],
};
const history: GrowthWorkHistory = {
  actionId: action.id,
  limit: 50,
  events: [
    {
      version: 1,
      eventType: "status_changed",
      fromStatus: "approved",
      toStatus: "ready",
      recordedAt: "2026-08-30T13:45:00.000Z",
      note:
        "<script>private</script>\nA long unbroken note: " + "x".repeat(300),
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
function render(
  queryClient: QueryClient,
  item = action,
  projectId = "project_1",
) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(GrowthWorkDeliveryPanel, { projectId, action: item }),
    ),
  );
}

describe("Work delivery rendered contract", () => {
  it("loads history only after opening the native disclosure", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkDelivery, { projectId: "project_1", action }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("Update status and view history");
    expect(html).not.toContain("Save status");
    expect(html).not.toContain("Loading status history");
  });

  it("labels the form, starts with no selected status and keeps notes optional", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkStatusForm, {
        currentStatus: "in_progress",
        disabled: false,
        pending: false,
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Update work status"');
    expect(html).toContain('value="" selected=""');
    expect(html).toContain("Next status");
    expect(html).toContain("Note (optional)");
    expect(html).toContain('maxLength="5000"');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain(
      "website has changed or the results have been evaluated",
    );
    expect(html).toContain('value="blocked"');
    expect(html).toContain('value="implemented"');
    expect(html).toContain('value="cancelled"');
    expect(html).not.toContain('value="measuring"');
    expect(html).not.toContain('value="evaluated"');
  });

  it("uses the existing state machine without skipping ready or reopening work", () => {
    expect(growthWorkNextStatuses("approved")).toEqual(["ready", "cancelled"]);
    expect(growthWorkNextStatuses("ready")).toEqual([
      "in_progress",
      "cancelled",
    ]);
    expect(growthWorkNextStatuses("blocked")).toEqual([
      "in_progress",
      "implemented",
      "cancelled",
    ]);
    for (const status of [
      "implemented",
      "measuring",
      "evaluated",
      "cancelled",
    ] as const) {
      expect(growthWorkNextStatuses(status)).toEqual([]);
      const html = render(client(), { ...action, status, stateVersion: 4 });
      expect(html).not.toContain("Save status");
      expect(html).toContain("Recent status history");
    }
  });

  it("locks pending fields and gives a named loading state", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkStatusForm, {
        currentStatus: "approved",
        disabled: true,
        pending: true,
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("Saving status");
    expect(render(client())).toContain('aria-busy="true"');
  });

  it("renders literal status history with UTC times and escaped wrapping notes", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkHistoryList, { data: history }),
    );
    expect(html).toContain("50 most recent entries, newest first");
    expect(html).toContain("Approved to Ready");
    expect(html).toContain("13:45 (UTC)");
    expect(html).toContain('dateTime="2026-08-30T13:45:00.000Z"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).not.toContain("You");
  });

  it("shows creation and empty history without inventing a previous status", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkHistoryList, {
        data: {
          ...history,
          events: [
            {
              ...history.events[0],
              version: 0,
              eventType: "created",
              fromStatus: null,
              toStatus: "approved",
              note: null,
            },
          ],
        },
      }),
    );
    expect(html).toContain("Approved");
    expect(html).not.toContain(" to Approved");
    expect(
      renderToStaticMarkup(
        createElement(GrowthWorkHistoryList, {
          data: { ...history, events: [] },
        }),
      ),
    ).toContain("No status history");
  });

  it("does not reuse another project's or action's history", () => {
    const queryClient = client();
    queryClient.setQueryData(
      ["growthWorkHistory", "project_1", action.id],
      history,
    );
    expect(render(queryClient)).toContain("Approved to Ready");
    expect(render(queryClient, action, "project_2")).not.toContain(
      "Approved to Ready",
    );
    expect(render(queryClient, { ...action, id: "action_2" })).not.toContain(
      "Approved to Ready",
    );
  });

  it("offers a history retry without revealing database errors", async () => {
    const queryClient = client();
    await queryClient
      .fetchQuery({
        queryKey: ["growthWorkHistory", "project_1", action.id],
        queryFn: () => Promise.reject(new Error("private SQL/password")),
      })
      .catch(() => undefined);
    const html = render(queryClient);
    expect(html).toContain("Use Refresh history to try again");
    expect(html).not.toContain("private SQL/password");
  });
});
