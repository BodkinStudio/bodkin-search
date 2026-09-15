import { AppError } from "@/server/lib/errors";
import {
  growthActionDetailDtoSchema,
  growthActionDetailRequestSchema,
  type GrowthActionDetailDto,
  type GrowthActionDetailRequest,
} from "@/types/schemas/growth-action-detail";
import { GrowthActionDetailRepository } from "../repositories/GrowthActionDetailRepository";
import { GrowthMeasurementsRepository } from "../repositories/GrowthMeasurementsRepository";
import { GrowthMeasurementsService } from "./GrowthMeasurementsService";
import {
  growthEvidenceDisplayActionText,
  growthEvidenceDisplayChangeDescription,
  growthEvidenceDisplayMeasurementSummary,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";

const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function text(
  value: string,
  max: number,
  projector = growthEvidenceDisplayActionText,
) {
  const projected = projector(value);
  return {
    value: projected.content.slice(0, max),
    redacted: projected.redacted,
    truncated: projected.truncated || projected.content.length > max,
  };
}
function timestamp(value: string, label: string) {
  return canonicalTimestamp(
    SQLITE_TIMESTAMP.test(value) ? `${value.replace(" ", "T")}Z` : value,
    label,
  );
}
function nullableTimestamp(value: string | null, label: string) {
  return value == null ? null : timestamp(value, label);
}
function target(row: {
  targetType: "url" | "keyword" | "cluster" | "site";
  targetValue: string;
}) {
  if (row.targetType === "url") {
    const value = growthEvidenceDisplayUrl(row.targetValue);
    return {
      type: "url" as const,
      value: value.value,
      queryOrFragmentOmitted: value.omitted,
      withheld: value.withheld,
    };
  }
  return {
    type: row.targetType,
    ...text(row.targetValue, 2000),
  };
}
function coverage<T>(rows: T[], limit: number) {
  return {
    rows: rows.slice(0, limit),
    coverage: {
      returned: Math.min(rows.length, limit),
      hasMore: rows.length > limit,
    },
  };
}
function byCodeUnit<T>(rows: T[], key: (row: T) => string) {
  return rows.toSorted((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0,
  );
}

async function getAction(
  input: GrowthActionDetailRequest,
  options: { now?: Date } = {},
): Promise<GrowthActionDetailDto> {
  const request = growthActionDetailRequestSchema.parse(input);
  const now = options.now ?? new Date();
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Action detail clock is invalid");
  const asOf = now.toISOString();
  const stored = await GrowthActionDetailRepository.getDetail(
    request.projectId,
    request.actionId,
    asOf,
  );
  if (!stored) throw new AppError("NOT_FOUND", "Growth Action not found");
  const { root } = stored;
  const actionTargets = coverage(stored.actionTargets, 20);
  const history = coverage(stored.history, 20);
  const recommendationTargets = coverage(stored.recommendationTargets, 10);
  const steps = coverage(stored.steps, 10);
  const insights = coverage(stored.insights, 5);
  const changes = coverage(stored.changes, 10);
  const signalsByInsight = new Map<string, typeof stored.signals>();
  for (const signal of stored.signals)
    signalsByInsight.set(signal.insightId, [
      ...(signalsByInsight.get(signal.insightId) ?? []),
      signal,
    ]);
  const urlsByChange = new Map<string, typeof stored.urls>();
  for (const value of stored.urls)
    urlsByChange.set(value.changeEventId, [
      ...(urlsByChange.get(value.changeEventId) ?? []),
      value,
    ]);
  for (const [key, values] of signalsByInsight)
    signalsByInsight.set(
      key,
      byCodeUnit(values, ({ id }) => id),
    );
  for (const [key, values] of urlsByChange)
    urlsByChange.set(
      key,
      byCodeUnit(values, ({ url }) => url),
    );
  const plan = await GrowthMeasurementsRepository.getMeasurementPlanByAction(
    request.projectId,
    request.actionId,
  );
  const measurement = plan
    ? await measurementDto(request.projectId, plan.id)
    : "none";
  return growthActionDetailDtoSchema.parse({
    asOf,
    consistency: "current_not_snapshot",
    changesAreTemporalContextNotCausalProof: true,
    action: {
      id: root.action.id,
      title: text(root.action.title, 300),
      description: text(root.action.description, 1000),
      category: text(root.action.category, 100),
      priorityScore: root.action.priorityScore,
      status: root.action.status,
      version: root.action.stateVersion,
      dueAt: timestamp(root.action.dueAt, "Action due time"),
      approvedAt: timestamp(root.action.approvedAt, "Action approval time"),
      startedAt: nullableTimestamp(root.action.startedAt, "Action start time"),
      implementedAt: nullableTimestamp(
        root.action.implementedAt,
        "Action implementation time",
      ),
      evaluatedAt: nullableTimestamp(
        root.action.evaluatedAt,
        "Action evaluation time",
      ),
      cancelledAt: nullableTimestamp(
        root.action.cancelledAt,
        "Action cancellation time",
      ),
      createdAt: timestamp(root.action.createdAt, "Action creation time"),
      updatedAt: timestamp(root.action.updatedAt, "Action update time"),
      targets: actionTargets.rows.map(target),
      targetCoverage: actionTargets.coverage,
    },
    history: history.rows.map((event) => ({
      version: event.actionVersion,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note == null ? null : text(event.note, 500),
      createdAt: timestamp(event.createdAt, "Action event creation time"),
    })),
    historyCoverage: history.coverage,
    source: {
      run: {
        runType: root.run.runType,
        status: root.run.status,
        periodStart: root.run.periodStart,
        periodEnd: root.run.periodEnd,
        startedAt: timestamp(root.run.startedAt, "Growth Run start time"),
        completedAt: nullableTimestamp(
          root.run.completedAt,
          "Growth Run completion time",
        ),
      },
      recommendation: {
        id: root.recommendation.id,
        status: root.recommendation.status,
        title: text(root.recommendation.title, 300),
        rationale: text(root.recommendation.rationale, 1000),
        category: text(root.recommendation.category, 100),
        impact: root.recommendation.impact,
        commercialRelevance: root.recommendation.commercialRelevance,
        effort: root.recommendation.effort,
        urgency: root.recommendation.urgency,
        confidence: root.recommendation.confidence,
        priorityScore: root.recommendation.priorityScore,
        createdAt: timestamp(
          root.recommendation.createdAt,
          "Recommendation creation time",
        ),
        reviewedAt: nullableTimestamp(
          root.recommendation.reviewedAt,
          "Recommendation review time",
        ),
        targets: recommendationTargets.rows.map(target),
        targetCoverage: recommendationTargets.coverage,
        steps: steps.rows.map((step) => text(step.content, 1000)),
        stepCoverage: steps.coverage,
      },
      insights: insights.rows.map((insight) => {
        const signalRows = coverage(signalsByInsight.get(insight.id) ?? [], 5);
        return {
          id: insight.id,
          title: text(insight.title, 300),
          explanation: text(insight.explanation, 1000),
          hypothesis: text(insight.hypothesis, 1000),
          confidence: insight.confidence,
          createdAt: timestamp(insight.createdAt, "Insight creation time"),
          signals: signalRows.rows.map((signal) => ({
            id: signal.id,
            signalType: text(signal.signalType, 100),
            entityType: text(signal.entityType, 100),
            entityRef: text(signal.entityRef, 500),
            metric: text(signal.metric, 200),
            severity: signal.severity,
            confidence: signal.confidence,
            periodStart: signal.periodStart,
            periodEnd: signal.periodEnd,
            baselineValue: signal.baselineValue,
            currentValue: signal.currentValue,
            deltaValue: signal.deltaValue,
            deltaPercent: signal.deltaPercent,
            evidenceKind: signal.evidenceKind,
            capturedAt: timestamp(signal.capturedAt, "Signal capture time"),
          })),
          signalCoverage: signalRows.coverage,
        };
      }),
      insightCoverage: insights.coverage,
    },
    changes: changes.rows.map((change) => {
      const urlRows = coverage(urlsByChange.get(change.id) ?? [], 5);
      return {
        id: change.id,
        source: change.source,
        changeType: change.changeType,
        description: text(
          change.description,
          500,
          growthEvidenceDisplayChangeDescription,
        ),
        happenedAt: timestamp(change.happenedAt, "Change occurrence time"),
        urls: urlRows.rows.map(({ url: raw }) => {
          const value = growthEvidenceDisplayUrl(raw);
          return {
            value: value.value,
            queryOrFragmentOmitted: value.omitted,
            withheld: value.withheld,
          };
        }),
        urlCoverage: urlRows.coverage,
      };
    }),
    changeCoverage: changes.coverage,
    measurement,
  });
}

async function measurementDto(projectId: string, planId: string) {
  const verified = await GrowthMeasurementsService.getMeasurement(
    projectId,
    planId,
  );
  const metrics = coverage(
    byCodeUnit(
      verified.metrics,
      (metric) =>
        `${metric.metricType}\u0000${metric.entityType}\u0000${metric.entityKey}\u0000${metric.id}`,
    ),
    10,
  );
  return {
    plan: {
      id: verified.plan.id,
      status: verified.plan.status,
      actionVersion: verified.plan.actionVersion,
      anchor: {
        state: verified.implementationChangeEventId
          ? ("linked" as const)
          : ("legacy" as const),
        anchorAt: timestamp(verified.plan.anchorAt, "Measurement anchor time"),
        anchorDate: verified.plan.anchorDate,
      },
      reportTimezone: verified.plan.reportTimezone,
      comparisonMode: verified.plan.comparisonMode,
      baselineStart: verified.plan.baselineStart,
      baselineEnd: verified.plan.baselineEnd,
      cooldownEnd: verified.plan.cooldownEnd,
      measurementStart: verified.plan.measurementStart,
      measurementEnd: verified.plan.measurementEnd,
      longMeasurementEnd: verified.plan.longMeasurementEnd,
      dueDate: verified.dueDate,
      completedAt: nullableTimestamp(
        verified.plan.completedAt,
        "Measurement completion time",
      ),
    },
    metrics: metrics.rows.map((metric) => {
      const comparison = verified.comparisons.find(
        ({ metricId }) => metricId === metric.id,
      );
      if (!comparison)
        throw new AppError(
          "CONFLICT",
          "Stored Measurement comparison is incomplete",
        );
      const key =
        metric.entityType === "url"
          ? (() => {
              const value = growthEvidenceDisplayUrl(metric.entityKey);
              return {
                value: value.value,
                queryOrFragmentOmitted: value.omitted,
                withheld: value.withheld,
              };
            })()
          : text(metric.entityKey, 2000);
      return {
        metricType: metric.metricType,
        entityType: metric.entityType,
        entityKey: key,
        isPrimary: metric.isPrimary,
        observations: verified.observations
          .filter(({ metricId }) => metricId === metric.id)
          .map(
            ({
              periodType,
              effectiveStart,
              effectiveEnd,
              value,
              completeness,
              capturedAt,
            }) => ({
              periodType,
              effectiveStart,
              effectiveEnd,
              value,
              completeness,
              capturedAt: timestamp(
                capturedAt,
                "Measurement Observation capture time",
              ),
            }),
          ),
        comparison: {
          baselineValue: comparison.baselineValue,
          measurementValue: comparison.currentValue,
          absoluteDelta: comparison.absoluteDelta,
          percentDelta: comparison.percentDelta,
          longTermValue: comparison.longTermValue,
          longTermAbsoluteDelta: comparison.longTermAbsoluteDelta,
          longTermPercentDelta: comparison.longTermPercentDelta,
        },
      };
    }),
    metricCoverage: metrics.coverage,
    result: verified.result
      ? {
          outcome: verified.result.outcome,
          confidence: verified.result.confidence,
          summary: text(
            verified.result.summary,
            1000,
            growthEvidenceDisplayMeasurementSummary,
          ),
          evaluatedAt: timestamp(
            verified.result.evaluatedAt,
            "Measurement Result evaluation time",
          ),
          confoundingChangeCount: verified.confoundingChangeEventIds.length,
        }
      : null,
  };
}
export const GrowthActionDetailService = { getAction } as const;
