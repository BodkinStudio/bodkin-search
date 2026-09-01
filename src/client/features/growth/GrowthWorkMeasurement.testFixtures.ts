import type { GrowthWorkItem } from "@/types/schemas/growth-investigations";
import type {
  GrowthWorkMeasurementCandidate,
  GrowthWorkMeasurementOverview,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";

export const measurementAction: GrowthWorkItem = {
  id: "action_1",
  title: "Investigate pricing-page clicks",
  status: "implemented",
  stateVersion: 2,
  dueOn: "2026-09-04",
  createdAt: "2026-08-30T10:00:00.000Z",
  runId: "run_1",
  displayUrls: ["https://example.com/pricing"],
};

export const measurementCandidate: GrowthWorkMeasurementCandidate = {
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

export const measurementOverview: GrowthWorkMeasurementOverview = {
  actionId: measurementAction.id,
  actionStatus: "implemented",
  stateVersion: measurementAction.stateVersion,
  state: "eligible",
  targetCount: 1,
  candidates: [measurementCandidate],
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

export const activeMeasurementPlan: GrowthWorkMeasurementPlan = {
  id: "plan_1",
  status: "active",
  actionVersion: 3,
  implementationChange: measurementCandidate.change,
  schedule: measurementCandidate.schedule!,
  metrics: measurementOverview.proposedMetrics.map((metric) => ({
    ...metric,
    observations: [],
    comparison: {
      baselineValue: null,
      measurementValue: null,
      absoluteDelta: null,
      percentDelta: null,
      longTermValue: null,
      longTermAbsoluteDelta: null,
      longTermPercentDelta: null,
    },
  })),
  collection: {
    state: "waiting",
    canCollect: false,
    nextAvailableOn: "2026-10-09",
    periods: [
      {
        periodType: "baseline",
        startDate: "2026-07-04",
        endDate: "2026-07-31",
        sourceAvailableOn: "2026-08-03",
        status: "waiting",
        collectedMetricCount: 0,
        expectedMetricCount: 2,
      },
      {
        periodType: "measurement",
        startDate: "2026-08-09",
        endDate: "2026-09-05",
        sourceAvailableOn: "2026-09-08",
        status: "waiting",
        collectedMetricCount: 0,
        expectedMetricCount: 2,
      },
      {
        periodType: "long_term",
        startDate: "2026-09-06",
        endDate: "2026-10-30",
        sourceAvailableOn: "2026-11-02",
        status: "waiting",
        collectedMetricCount: 0,
        expectedMetricCount: 2,
      },
    ],
  },
  confounders: {
    state: "none",
    intervalStart: "2026-07-04",
    intervalEnd: "2026-10-30",
    candidates: [],
    limit: 50,
  },
  dueDate: "2026-10-30",
  result: null,
};
