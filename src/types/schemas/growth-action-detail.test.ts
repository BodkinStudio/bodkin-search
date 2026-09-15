/* eslint-disable max-lines -- one schema suite audits every nested public boundary and cap */
import { describe, expect, it } from "vitest";
import {
  growthActionDetailDtoSchema,
  growthActionDetailRequestSchema,
} from "./growth-action-detail";

const NOW = "2026-09-01T12:00:00.000Z";
const safe = (value = "safe") => ({
  value,
  redacted: false,
  truncated: false,
});
const url = (value: string | null = "https://example.com/pricing") => ({
  value,
  queryOrFragmentOmitted: false,
  withheld: value == null,
});

function signal(id = "signal_1") {
  return {
    id,
    signalType: safe("priority_page_decline"),
    entityType: safe("url"),
    entityRef: safe("https://example.com/pricing"),
    metric: safe("search_clicks"),
    severity: "critical",
    confidence: 0.9,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    baselineValue: 100,
    currentValue: 60,
    deltaValue: -40,
    deltaPercent: -40,
    evidenceKind: "gsc_period",
    capturedAt: NOW,
  };
}

function insight(id = "insight_1") {
  return {
    id,
    title: safe("Pricing visibility declined"),
    explanation: safe("The saved evidence shows a sustained decline."),
    hypothesis: safe("Improving the page may restore qualified traffic."),
    confidence: 0.8,
    createdAt: NOW,
    signals: [signal()],
    signalCoverage: { returned: 1, hasMore: false },
  };
}

function change(id = "change_1") {
  return {
    id,
    source: "deployment",
    changeType: "content_updated",
    description: safe("Published the revised pricing page."),
    happenedAt: NOW,
    urls: [url()],
    urlCoverage: { returned: 1, hasMore: false },
  };
}

function publicMetric() {
  return {
    metricType: "search_clicks",
    entityType: "url",
    entityKey: url("https://example.com/pricing"),
    isPrimary: true,
    observations: [
      {
        periodType: "baseline",
        effectiveStart: "2026-07-01",
        effectiveEnd: "2026-07-31",
        value: 100,
        completeness: 1,
        capturedAt: NOW,
      },
    ],
    comparison: {
      baselineValue: 100,
      measurementValue: 125,
      absoluteDelta: 25,
      percentDelta: 25,
      longTermValue: null,
      longTermAbsoluteDelta: null,
      longTermPercentDelta: null,
    },
  };
}

function detailDto() {
  return {
    asOf: NOW,
    consistency: "current_not_snapshot",
    changesAreTemporalContextNotCausalProof: true,
    action: {
      id: "action_1",
      title: safe("Repair pricing visibility"),
      description: safe("Restore measurable demand for the pricing page."),
      category: safe("content"),
      priorityScore: 10,
      status: "measuring",
      version: 4,
      dueAt: NOW,
      approvedAt: NOW,
      startedAt: NOW,
      implementedAt: NOW,
      evaluatedAt: null,
      cancelledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      targets: [
        { type: "url", ...url() },
        { type: "keyword", ...safe("pricing software") },
      ],
      targetCoverage: { returned: 2, hasMore: false },
    },
    history: [
      {
        version: 4,
        eventType: "status_changed",
        fromStatus: "implemented",
        toStatus: "measuring",
        note: safe("Start measurement"),
        createdAt: NOW,
      },
    ],
    historyCoverage: { returned: 1, hasMore: false },
    source: {
      run: {
        runType: "manual_analysis",
        status: "completed",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        startedAt: NOW,
        completedAt: NOW,
      },
      recommendation: {
        id: "recommendation_1",
        status: "accepted",
        title: safe("Repair pricing visibility"),
        rationale: safe("Clicks declined on a commercial page."),
        category: safe("content"),
        impact: 5,
        commercialRelevance: 5,
        effort: 2,
        urgency: 3,
        confidence: 0.8,
        priorityScore: 10,
        createdAt: NOW,
        reviewedAt: NOW,
        targets: [{ type: "url", ...url() }],
        targetCoverage: { returned: 1, hasMore: false },
        steps: [safe("Rewrite the page.")],
        stepCoverage: { returned: 1, hasMore: false },
      },
      insights: [insight()],
      insightCoverage: { returned: 1, hasMore: false },
    },
    changes: [change()],
    changeCoverage: { returned: 1, hasMore: false },
    measurement: {
      plan: {
        id: "plan_1",
        status: "active",
        actionVersion: 4,
        anchor: {
          state: "linked",
          anchorAt: NOW,
          anchorDate: "2026-09-01",
        },
        reportTimezone: "Europe/London",
        comparisonMode: "preceding_period",
        baselineStart: "2026-07-01",
        baselineEnd: "2026-07-31",
        cooldownEnd: "2026-09-02",
        measurementStart: "2026-09-03",
        measurementEnd: "2026-09-30",
        longMeasurementEnd: null,
        dueDate: "2026-09-30",
        completedAt: null,
      },
      metrics: [publicMetric()],
      metricCoverage: { returned: 1, hasMore: false },
      result: null,
    },
  };
}

describe("growthActionDetailRequestSchema", () => {
  it("accepts only the strict project and Action coordinates", () => {
    expect(
      growthActionDetailRequestSchema.parse({
        projectId: " project_1 ",
        actionId: " action_1 ",
      }),
    ).toEqual({ projectId: "project_1", actionId: "action_1" });

    for (const invalid of [
      { projectId: "project_1" },
      { actionId: "action_1" },
      { projectId: " ", actionId: "action_1" },
      { projectId: "project_1", actionId: "action_1", ownerUserId: "user" },
    ]) {
      expect(growthActionDetailRequestSchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });
});

describe("growthActionDetailDtoSchema", () => {
  it("accepts the bounded Measurement and explicit no-Measurement variants", () => {
    expect(growthActionDetailDtoSchema.parse(detailDto())).toMatchObject({
      consistency: "current_not_snapshot",
      changesAreTemporalContextNotCausalProof: true,
    });
    expect(
      growthActionDetailDtoSchema.safeParse({
        ...detailDto(),
        measurement: "none",
      }).success,
    ).toBe(true);
  });

  it("rejects private or unknown fields at every public boundary", () => {
    const base = detailDto();
    const candidates = [
      { ...base, organizationId: "org_private" },
      { ...base, action: { ...base.action, ownerUserId: "user_private" } },
      {
        ...base,
        history: [{ ...base.history[0], actorId: "actor_private" }],
      },
      {
        ...base,
        source: {
          ...base.source,
          run: { ...base.source.run, detectorVersion: "private-v1" },
        },
      },
      {
        ...base,
        source: {
          ...base.source,
          recommendation: {
            ...base.source.recommendation,
            factHash: "private-hash",
          },
        },
      },
      {
        ...base,
        source: {
          ...base.source,
          insights: [
            {
              ...base.source.insights[0],
              signals: [
                {
                  ...base.source.insights[0]?.signals[0],
                  evidenceRef: "private-evidence",
                },
              ],
            },
          ],
        },
      },
      {
        ...base,
        changes: [{ ...base.changes[0], externalRef: "private-reference" }],
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          plan: { ...base.measurement.plan, factHash: "private-hash" },
        },
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          metrics: [
            {
              ...base.measurement.metrics[0],
              observations: [
                {
                  ...base.measurement.metrics[0]?.observations[0],
                  evidenceRef: "private-evidence",
                },
              ],
            },
          ],
        },
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          result: {
            outcome: "positive",
            confidence: 0.8,
            summary: safe("Improved"),
            evaluatedAt: NOW,
            confoundingChangeCount: 1,
            changeEventIds: ["private-change"],
          },
        },
      },
    ];

    for (const candidate of candidates)
      expect(growthActionDetailDtoSchema.safeParse(candidate).success).toBe(
        false,
      );
  });

  it("enforces every public collection and coverage cap", () => {
    const base = detailDto();
    const overCap = [
      {
        ...base,
        action: {
          ...base.action,
          targets: Array.from({ length: 21 }, (_, index) => ({
            type: "keyword",
            ...safe(`keyword_${index}`),
          })),
        },
      },
      {
        ...base,
        history: Array.from({ length: 21 }, (_, index) => ({
          ...base.history[0],
          version: index,
        })),
      },
      {
        ...base,
        source: {
          ...base.source,
          recommendation: {
            ...base.source.recommendation,
            targets: Array.from({ length: 11 }, (_, index) => ({
              type: "keyword",
              ...safe(`keyword_${index}`),
            })),
          },
        },
      },
      {
        ...base,
        source: {
          ...base.source,
          recommendation: {
            ...base.source.recommendation,
            steps: Array.from({ length: 11 }, (_, index) =>
              safe(`step_${index}`),
            ),
          },
        },
      },
      {
        ...base,
        source: {
          ...base.source,
          insights: Array.from({ length: 6 }, (_, index) =>
            insight(`insight_${index}`),
          ),
        },
      },
      {
        ...base,
        source: {
          ...base.source,
          insights: [
            {
              ...insight(),
              signals: Array.from({ length: 6 }, (_, index) =>
                signal(`signal_${index}`),
              ),
            },
          ],
        },
      },
      {
        ...base,
        changes: Array.from({ length: 11 }, (_, index) =>
          change(`change_${index}`),
        ),
      },
      {
        ...base,
        changes: [
          {
            ...change(),
            urls: Array.from({ length: 6 }, (_, index) =>
              url(`https://example.com/${index}`),
            ),
          },
        ],
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          metrics: Array.from({ length: 11 }, () => publicMetric()),
        },
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          metrics: [
            {
              ...publicMetric(),
              observations: Array.from({ length: 4 }, (_, index) => ({
                ...publicMetric().observations[0],
                periodType: index === 0 ? "baseline" : "measurement",
              })),
            },
          ],
        },
      },
      {
        ...base,
        action: {
          ...base.action,
          targetCoverage: { returned: 21, hasMore: true },
        },
      },
    ];

    for (const candidate of overCap)
      expect(growthActionDetailDtoSchema.safeParse(candidate).success).toBe(
        false,
      );
  });

  it("rejects unknown vocabularies, invalid calendar dates, and out-of-range facts", () => {
    const base = detailDto();
    const invalid = [
      {
        ...base,
        source: {
          ...base.source,
          run: { ...base.source.run, runType: "unbounded_analysis" },
        },
      },
      {
        ...base,
        source: {
          ...base.source,
          run: { ...base.source.run, periodStart: "2026-02-30" },
        },
      },
      {
        ...base,
        source: {
          ...base.source,
          recommendation: {
            ...base.source.recommendation,
            confidence: 1.1,
          },
        },
      },
      {
        ...base,
        changes: [{ ...base.changes[0], source: "unknown_provider" }],
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          metrics: [
            {
              ...base.measurement.metrics[0],
              observations: [
                {
                  ...base.measurement.metrics[0]?.observations[0],
                  completeness: 1.1,
                },
              ],
            },
          ],
        },
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          metrics: [
            {
              ...base.measurement.metrics[0],
              entityKey: safe("https://example.com/private"),
            },
          ],
        },
      },
      {
        ...base,
        measurement: {
          ...base.measurement,
          metrics: [
            {
              ...base.measurement.metrics[0],
              entityType: "keyword",
              entityKey: url("https://example.com/wrong-shape"),
            },
          ],
        },
      },
    ];

    for (const candidate of invalid)
      expect(growthActionDetailDtoSchema.safeParse(candidate).success).toBe(
        false,
      );
  });
});
