import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowthWorkMeasurementOverview } from "@/types/schemas/growth-work";
import {
  GrowthWorkMeasurement,
  GrowthWorkMeasurementPanel,
} from "./GrowthWorkMeasurement";
import { GrowthWorkMeasurementForm } from "./GrowthWorkMeasurementForm";
import { GrowthWorkMeasurementContent } from "./GrowthWorkMeasurementPresentation";
import {
  activeMeasurementPlan as activePlan,
  measurementAction as action,
  measurementCandidate as candidate,
  measurementOverview as overview,
} from "./GrowthWorkMeasurement.testFixtures";

vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthWork: vi.fn(),
}));
vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkMeasurement: vi.fn(),
  startGrowthWorkMeasurement: vi.fn(),
  collectGrowthWorkMeasurement: vi.fn(),
}));

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
      "Search Console is read only when you choose to collect",
    );
    expect(html).toContain("Review due");
    expect(html).toContain("30 Oct 2026");
    expect(html).toContain("Google available");
    expect(html).toContain("Waiting for Google data");
    expect(html).toContain("3 Aug 2026");
    expect(html).toContain("Possible confounding changes");
    expect(html).toContain("does not show that the comparison was unaffected");
    expect(html).not.toContain("Choose a linked change");
  });

  it("renders accessible collection and observed-comparison tables without fabricating missing values", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthWorkMeasurementContent, {
        data: {
          ...overview,
          actionStatus: "measuring",
          stateVersion: 3,
          state: "active",
          candidates: [],
          proposedMetrics: [],
          plan: {
            ...activePlan,
            collection: {
              ...activePlan.collection,
              state: "ready",
              canCollect: true,
              periods: activePlan.collection.periods.map((period, index) => ({
                ...period,
                status: index < 2 ? ("collected" as const) : ("ready" as const),
                collectedMetricCount: index < 2 ? 2 : 0,
              })),
            },
            metrics: activePlan.metrics.map((metric, index) => ({
              ...metric,
              observations: [
                {
                  periodType: "baseline" as const,
                  value: index === 0 ? 0 : 100,
                  completeness: 1,
                  capturedAt: "2026-08-03T07:00:00.000Z",
                },
                {
                  periodType: "measurement" as const,
                  value: index === 0 ? 5 : 120,
                  completeness: 1,
                  capturedAt: "2026-09-08T07:00:00.000Z",
                },
              ],
              comparison: {
                baselineValue: index === 0 ? 0 : 100,
                measurementValue: index === 0 ? 5 : 120,
                absoluteDelta: index === 0 ? 5 : 20,
                percentDelta: index === 0 ? null : 20,
                longTermValue: null,
                longTermAbsoluteDelta: null,
                longTermPercentDelta: null,
              },
            })),
          },
        },
        disabled: false,
        pending: false,
        onSubmit: vi.fn(),
        collectionControl: createElement(
          "button",
          { type: "button" },
          "Collect available data",
        ),
      }),
    );
    expect(html).toContain("Collection status for each measurement period");
    expect(html).toContain(
      "Baseline, primary and long-term measurement values",
    );
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("Google available");
    expect(html).toContain("3 Aug 2026");
    expect(html).toContain("8 Sept 2026");
    expect(html).toContain("2 Nov 2026");
    expect(html).toContain("Collected (2/2 metrics)");
    expect(html).toContain("Ready to collect");
    expect(html).toContain("Not collected");
    expect(html).toContain("+5");
    expect(html).not.toContain("+5 (");
    expect(html).toContain("+20 (+20%)");
    expect(html).toContain("observations, not proof");
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
