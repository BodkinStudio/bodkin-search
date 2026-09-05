/* eslint-disable max-lines -- inspector rendering and mutation wiring share one canonical DTO fixture */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthRunInspectorDto } from "@/types/schemas/growth-run-inspector";

const query = vi.hoisted(() => ({
  options: null as null | Record<string, unknown>,
  refetch: vi.fn(),
  state: {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined as GrowthRunInspectorDto | undefined,
    refetch: vi.fn(),
  },
}));
const mutation = vi.hoisted(() => ({
  options: null as null | {
    mutationFn: () => Promise<unknown>;
    onSuccess: () => Promise<void>;
  },
  mutate: vi.fn(),
  state: {
    isPending: false,
    isError: false,
    isSuccess: false,
  },
}));
type AppendCall = {
  data: {
    runId: string;
    requestKey: string;
    preparation: string;
    failure: string;
    duplicateSpam: string;
    note: string | null;
  };
};
const serverFunctions = vi.hoisted(() => ({
  getGrowthRunInspector: vi.fn(),
  appendGrowthMonthlyCycleOperatorObservation:
    vi.fn<(input: AppendCall) => Promise<unknown>>(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    query.options = options;
    return query.state;
  },
  useMutation: (options: typeof mutation.options) => {
    mutation.options = options;
    return { ...mutation.state, mutate: mutation.mutate };
  },
}));
vi.mock("@/serverFunctions/growthRunInspector", () => serverFunctions);

import {
  GrowthMonitorCalibration,
  GrowthRunInspector,
  GrowthRunInspectorResults,
  createMonthlyCycleObservationRequestKey,
  formatGrowthRunDuration,
} from "./GrowthRunInspector";

const data: GrowthRunInspectorDto = {
  asOf: "2026-09-02T12:00:00.000Z",
  calibration: {
    limit: 200,
    hasMore: true,
    overall: {
      sampled: 6,
      accepted: 1,
      signalQualityFalsePositives: 2,
      otherDismissals: 1,
      unresolved: 1,
      reconciled: 1,
      classified: 3,
      classificationCoverage: 0.5,
      falsePositiveRate: 2 / 3,
      dismissalReasons: {
        irrelevant: 1,
        already_planned: 0,
        not_commercially_important: 0,
        insufficient_evidence: 1,
        wrong_diagnosis: 0,
        too_much_effort: 0,
        duplicate: 1,
        defer: 0,
      },
    },
    detectors: [
      {
        detectorVersion: "persistent-tracked-rank-drop-v1",
        sampled: 6,
        accepted: 1,
        signalQualityFalsePositives: 2,
        otherDismissals: 1,
        unresolved: 1,
        reconciled: 1,
        classified: 3,
        classificationCoverage: 0.5,
        falsePositiveRate: 2 / 3,
        dismissalReasons: {
          irrelevant: 1,
          already_planned: 0,
          not_commercially_important: 0,
          insufficient_evidence: 1,
          wrong_diagnosis: 0,
          too_much_effort: 0,
          duplicate: 1,
          defer: 0,
        },
      },
    ],
  },
  monthlyCycleEvidence: {
    limit: 6,
    hasMore: true,
    distinctPeriods: 1,
    latestPeriodsAdjacent: null,
    cycles: [
      {
        parent: {
          id: "monthly_1",
          trigger: "scheduled",
          status: "failed",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-31",
          startedAt: "2026-09-01T00:00:00.000Z",
          completedAt: "2026-09-01T00:01:05.000Z",
          failure: { code: "MONTHLY_REVIEW_FAILED", message: "Saved failure" },
        },
        child: null,
        report: null,
        recommendations: {
          accepted: 1,
          dismissed: 2,
          duplicateDismissals: 1,
          unresolved: 3,
          reconciled: 4,
        },
        operatorObservation: null,
      },
    ],
  },
  limit: 20,
  hasMore: true,
  runs: [
    {
      id: "run_1",
      runType: "manual_analysis",
      trigger: "manual",
      status: "failed",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:01:05.000Z",
      durationMs: 65_000,
      detectorVersion: "detector-v1",
      analysisVersion: "analysis-v1",
      providerCostMinor: 12,
      failure: { code: "SOURCE_FAILED", message: "Saved safe failure" },
      entities: {
        signals: 2,
        insights: 1,
        recommendations: 3,
        linkedActions: 1,
      },
    },
  ],
};

beforeEach(() => {
  query.refetch.mockReset();
  query.options = null;
  query.state = {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined,
    refetch: query.refetch,
  };
  mutation.options = null;
  mutation.mutate.mockReset();
  mutation.state = {
    isPending: false,
    isError: false,
    isSuccess: false,
  };
  serverFunctions.appendGrowthMonthlyCycleOperatorObservation.mockReset();
});

describe("GrowthRunInspector", () => {
  it("keeps the native disclosure closed and the read disabled initially", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toContain("<details open");
    expect(query.options).toMatchObject({ enabled: false, retry: false });
  });

  it("renders bounded history and every required diagnostic field", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthRunInspectorResults, { data }),
    );
    expect(html).toContain("Showing the latest 20 runs");
    expect(html).toContain("Manual analysis");
    expect(html).toContain("Failed");
    expect(html).toContain("run_1");
    expect(html).toContain("1m 5s");
    expect(html).toContain("detector-v1");
    expect(html).toContain("analysis-v1");
    expect(html).toContain("12 minor units");
    expect(html).toContain("SOURCE_FAILED");
    expect(html).toContain("Saved safe failure");
    expect(html).toContain("Linked Actions");
    expect(html).toContain(">3<");
  });

  it("renders bounded calibration without claiming a release decision", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthMonitorCalibration, {
        calibration: data.calibration,
      }),
    );
    expect(html).toContain("Daily-monitor calibration");
    expect(html).toContain("This cohort is capped");
    expect(html).toContain("66.7%");
    expect(html).toContain("Classification coverage");
    expect(html).toContain("50%");
    expect(html).toContain("persistent-tracked-rank-drop-v1");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("Irrelevant 1");
    expect(html).toContain("Insufficient evidence 1");
    expect(html).toContain("Duplicate 1");
    expect(html).toContain("No automatic release threshold");
  });

  it("renders bounded monthly-cycle evidence and its human decision boundary", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthRunInspectorResults, { data }),
    );
    expect(html).toContain("Monthly-cycle evidence");
    expect(html).toContain("Insufficient evidence");
    expect(html).toContain("Showing the latest 6 monthly review runs");
    expect(html).toContain("MONTHLY_REVIEW_FAILED");
    expect(html).toContain("No exact child run saved");
    expect(html).toContain("No exact version-one report saved");
    expect(html).toContain("No operator observation recorded");
    expect(html).toContain("duplicate dismissals 1");
    expect(html).toContain("human-recorded assertions");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');

    const adjacentHtml = renderToStaticMarkup(
      createElement(GrowthRunInspectorResults, {
        data: {
          ...data,
          monthlyCycleEvidence: {
            ...data.monthlyCycleEvidence,
            distinctPeriods: 2,
            latestPeriodsAdjacent: true,
            cycles: [
              ...data.monthlyCycleEvidence.cycles,
              {
                ...data.monthlyCycleEvidence.cycles[0],
                parent: {
                  ...data.monthlyCycleEvidence.cycles[0].parent,
                  id: "monthly_previous",
                  periodStart: "2026-07-01",
                  periodEnd: "2026-07-31",
                },
              },
            ],
          },
        },
      }),
    );
    expect(adjacentHtml).toContain("are calendar-adjacent");

    const observedHtml = renderToStaticMarkup(
      createElement(GrowthRunInspectorResults, {
        data: {
          ...data,
          monthlyCycleEvidence: {
            ...data.monthlyCycleEvidence,
            cycles: [
              {
                ...data.monthlyCycleEvidence.cycles[0],
                operatorObservation: {
                  preparation: "substantial",
                  failure: "unexplained",
                  duplicateSpam: "observed",
                  note: "Required a manual export.",
                  createdAt: "2026-09-05T12:00:00.000Z",
                },
              },
            ],
          },
        },
      }),
    );
    expect(observedHtml).toContain("Preparation:");
    expect(observedHtml).toContain("Substantial");
    expect(observedHtml).toContain("Unexplained");
    expect(observedHtml).toContain("Duplicate spam:");
    expect(observedHtml).toContain("Observed");
    expect(observedHtml).toContain("Required a manual export.");
    expect(observedHtml).not.toContain("reviewerId");
  });

  it("wires an accessible operator form to append, refresh and fresh request identities", async () => {
    query.state = { ...query.state, data };
    query.refetch.mockResolvedValue({ data });
    serverFunctions.appendGrowthMonthlyCycleOperatorObservation.mockResolvedValue(
      { id: "observation_1" },
    );
    let html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain("Record operator observation");
    expect(html).toContain("Target cycle");
    expect(html).toContain("Manual preparation");
    expect(html).toContain("Failure explanation");
    expect(html).toContain("Duplicate recommendation spam");
    expect(html).toContain("Optional note");
    expect(mutation.options).not.toBeNull();

    await mutation.options!.mutationFn();
    const appendCall =
      serverFunctions.appendGrowthMonthlyCycleOperatorObservation.mock
        .calls[0]?.[0];
    expect(appendCall?.data).toMatchObject({
      runId: "monthly_1",
      preparation: "not_assessed",
      failure: "not_assessed",
      duplicateSpam: "not_assessed",
      note: null,
    });
    expect(appendCall?.data.requestKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    await mutation.options!.onSuccess();
    expect(query.refetch).toHaveBeenCalledOnce();

    const firstKey = createMonthlyCycleObservationRequestKey();
    const secondKey = createMonthlyCycleObservationRequestKey();
    expect(firstKey).not.toBe(secondKey);

    mutation.state = { ...mutation.state, isPending: true };
    html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain("Saving observation…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");

    mutation.state = { ...mutation.state, isPending: false, isError: true };
    html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("could not be saved");

    mutation.state = { ...mutation.state, isError: false, isSuccess: true };
    html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("saved and dossier refreshed");
  });

  it("shows unavailable calibration when there is no sample", () => {
    const zero = {
      sampled: 0,
      accepted: 0,
      signalQualityFalsePositives: 0,
      otherDismissals: 0,
      unresolved: 0,
      reconciled: 0,
      classified: 0,
      classificationCoverage: null,
      falsePositiveRate: null,
      dismissalReasons: {
        irrelevant: 0,
        already_planned: 0,
        not_commercially_important: 0,
        insufficient_evidence: 0,
        wrong_diagnosis: 0,
        too_much_effort: 0,
        duplicate: 0,
        defer: 0,
      },
    };
    const html = renderToStaticMarkup(
      createElement(GrowthMonitorCalibration, {
        calibration: {
          limit: 200,
          hasMore: false,
          overall: zero,
          detectors: [],
        },
      }),
    );
    expect(html).toContain("No candidate investigation recommendations");
    expect(html).toContain("classification coverage");
    expect(html).toContain("observed rate are unavailable");
  });

  it("renders empty, loading and retryable error states", () => {
    let html = renderToStaticMarkup(
      createElement(GrowthRunInspectorResults, {
        data: { ...data, hasMore: false, runs: [] },
      }),
    );
    expect(html).toContain("No Growth runs");

    query.state = { ...query.state, isPending: true };
    html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading recent runs");

    query.state = { ...query.state, isPending: false, isError: true };
    html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry run history");
  });

  it("formats subsecond, second, minute, hour and day durations", () => {
    expect(formatGrowthRunDuration(0)).toBe("<1s");
    expect(formatGrowthRunDuration(5_000)).toBe("5s");
    expect(formatGrowthRunDuration(65_000)).toBe("1m 5s");
    expect(formatGrowthRunDuration(3_660_000)).toBe("1h 1m");
    expect(formatGrowthRunDuration(90_000_000)).toBe("1d 1h");
  });
});
