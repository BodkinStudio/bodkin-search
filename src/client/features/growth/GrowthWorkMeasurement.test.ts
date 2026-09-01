import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowthWorkItem } from "@/types/schemas/growth-investigations";
import type {
  GrowthWorkMeasurementCandidate,
  GrowthWorkMeasurementOverview,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import {
  GrowthWorkMeasurement,
  GrowthWorkMeasurementPanel,
} from "./GrowthWorkMeasurement";
import { GrowthWorkMeasurementForm } from "./GrowthWorkMeasurementForm";
import { GrowthWorkMeasurementContent } from "./GrowthWorkMeasurementPresentation";

vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthWork: vi.fn(),
}));
vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkMeasurement: vi.fn(),
  startGrowthWorkMeasurement: vi.fn(),
}));

const action: GrowthWorkItem = {
  id: "action_1",
  title: "Investigate pricing-page clicks",
  status: "implemented",
  stateVersion: 2,
  dueOn: "2026-09-04",
  createdAt: "2026-08-30T10:00:00.000Z",
  runId: "run_1",
  displayUrls: ["https://example.com/pricing"],
};
const candidate: GrowthWorkMeasurementCandidate = {
  change: {
    id: "change_1",
    changeType: "content_updated",
    description: "Updated pricing copy.",
    happenedAt: "2026-08-01T00:00:00.000Z",
    recordedAt: "2026-08-02T00:00:00.000Z",
    displayUrls: ["https://example.com/pricing"],
  },
  schedule: {
    anchorAt: "2026-08-01T00:00:00.000Z",
    anchorDate: "2026-08-01",
    reportTimezone: "Europe/London",
    baselineStart: "2026-07-04",
    baselineEnd: "2026-07-31",
    cooldownEnd: "2026-08-08",
    measurementStart: "2026-08-09",
    measurementEnd: "2026-09-05",
    longMeasurementEnd: "2026-10-30",
  },
  unavailableReason: null,
};
const overview: GrowthWorkMeasurementOverview = {
  actionId: action.id,
  actionStatus: "implemented",
  stateVersion: action.stateVersion,
  state: "eligible",
  targetCount: 1,
  candidates: [candidate],
  proposedMetrics: [
    {
      metricType: "search_clicks",
      displayTarget: "https://example.com/pricing",
      isPrimary: true,
    },
    {
      metricType: "search_impressions",
      displayTarget: "https://example.com/pricing",
      isPrimary: false,
    },
  ],
  plan: null,
  limit: 50,
};
const activePlan: GrowthWorkMeasurementPlan = {
  id: "plan_1",
  status: "active",
  actionVersion: 3,
  implementationChange: candidate.change,
  schedule: candidate.schedule!,
  metrics: overview.proposedMetrics,
  dueDate: "2026-10-30",
  result: null,
};

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
}

function renderPanel(data?: GrowthWorkMeasurementOverview) {
  const queryClient = client();
  if (data)
    queryClient.setQueryData(
      ["growthWorkMeasurement", "project_1", action.id],
      data,
    );
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(GrowthWorkMeasurementPanel, {
        projectId: "project_1",
        action,
      }),
    ),
  );
}

describe("Work measurement rendered contract", () => {
  it("offers measurement only for Done, Measuring, and Evaluated Work", () => {
    for (const status of [
      "approved",
      "ready",
      "in_progress",
      "blocked",
      "cancelled",
    ] as const) {
      expect(
        renderToStaticMarkup(
          createElement(GrowthWorkMeasurement, {
            projectId: "project_1",
            action: { ...action, status },
          }),
        ),
      ).toBe("");
    }
    expect(
      renderToStaticMarkup(
        createElement(GrowthWorkMeasurement, {
          projectId: "project_1",
          action,
        }),
      ),
    ).toContain("Start measurement");
    expect(
      renderToStaticMarkup(
        createElement(GrowthWorkMeasurement, {
          projectId: "project_1",
          action: { ...action, status: "measuring" },
        }),
      ),
    ).toContain("View measurement");
    expect(
      renderToStaticMarkup(
        createElement(GrowthWorkMeasurement, {
          projectId: "project_1",
          action: { ...action, status: "evaluated" },
        }),
      ),
    ).toContain("View measured result");
  });

  it("starts closed without reading or offering a mutation", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkMeasurement, {
        projectId: "project_1",
        action,
      }),
    );
    expect(html).toContain("<details");
    expect(html).not.toContain("Loading measurement");
    expect(html).not.toContain("Choose a linked change");
  });

  it("announces loading and offers a read-only refresh", () => {
    const html = renderPanel();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading measurement");
    expect(html).toContain("Refreshing measurement");
    expect(html).not.toContain('aria-label="Start measurement from');
  });

  it("requires an explicit blank selection and renders server proposals", () => {
    const onSubmit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(GrowthWorkMeasurementForm, {
        candidates: [candidate],
        targetCount: 1,
        metrics: overview.proposedMetrics,
        disabled: false,
        pending: false,
        onSubmit,
      }),
    );
    expect(html).toContain(
      'aria-label="Start measurement from a recorded page change"',
    );
    expect(html).toContain('value="" selected=""');
    expect(html).toContain('required=""');
    expect(html).toContain("does not claim the change caused");
    expect(html).toContain("does not collect Google data");
    expect(html).not.toContain("Selected measurement anchor");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows and locks the exact selected record, schedule, and metrics", () => {
    const onSubmit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(GrowthWorkMeasurementForm, {
        candidates: [
          {
            ...candidate,
            change: {
              ...candidate.change,
              description: "<script>private()</script>",
              displayUrls: [null],
            },
          },
        ],
        selectedId: candidate.change.id,
        targetCount: 1,
        metrics: [
          {
            metricType: "search_clicks",
            displayTarget: null,
            isPrimary: true,
          },
        ],
        disabled: true,
        pending: true,
        onSubmit,
      }),
    );
    expect(html).toContain("Selected measurement anchor");
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("Starting measurement");
    expect(html).toContain("Page URL withheld");
    expect(html).toContain("Europe/London");
    expect(html).toContain("4 Jul 2026 – 31 Jul 2026");
    expect(html).toContain("Search clicks (primary)");
    expect(html).toContain("Target withheld");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("distinguishes missing changes, future changes, and bad saved state", () => {
    const empty = renderPanel({
      ...overview,
      state: "needs_change",
      candidates: [],
    });
    expect(empty).toContain("No manual page change is linked");
    expect(empty).toContain("Related page changes");
    expect(empty).not.toContain("Start measurement from a recorded");

    const future = renderPanel({
      ...overview,
      state: "needs_change",
      candidates: [
        { ...candidate, schedule: null, unavailableReason: "future_change" },
      ],
    });
    expect(future).toContain("future dates cannot start measurement");

    const inconsistent = renderPanel({
      ...overview,
      state: "inconsistent",
      plan: activePlan,
    });
    expect(inconsistent).toContain('role="alert"');
    expect(inconsistent).toContain("do not agree");
    expect(inconsistent).not.toContain("Measurement plan");
  });

  it("renders an existing plan as immutable, non-causal history", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkMeasurementContent, {
        data: {
          ...overview,
          actionStatus: "measuring",
          stateVersion: 3,
          state: "active",
          candidates: [],
          proposedMetrics: [],
          plan: activePlan,
        },
        disabled: false,
        pending: false,
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain("Measurement plan");
    expect(html).toContain("Measurement anchor");
    expect(html).toContain("does not show that the change caused");
    expect(html).toContain(
      "Google data collection and result calculation are later steps",
    );
    expect(html).toContain("Review due");
    expect(html).toContain("30 Oct 2026");
    expect(html).not.toContain("Choose a linked change");
  });

  it("explains a legacy plan without treating its missing anchor as an error", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkMeasurementContent, {
        data: {
          ...overview,
          actionStatus: "measuring",
          stateVersion: 3,
          state: "active",
          candidates: [],
          proposedMetrics: [],
          plan: { ...activePlan, implementationChange: null },
        },
        disabled: false,
        pending: false,
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain("predates linked-change anchors");
    expect(html).toContain("saved schedule remains unchanged");
    expect(html).not.toContain('role="alert"');
  });
});
