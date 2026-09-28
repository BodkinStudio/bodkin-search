import { and, count, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActions,
  growthMeasurementResults,
  growthRecommendationSignalLinks,
  growthRuns,
  growthSignals,
} from "@/db/schema";

async function measurementOutcomeCounts(
  projectId: string,
  startAt: string,
  endAt: string,
) {
  const rows = await db
    .select({
      outcome: growthMeasurementResults.outcome,
      value: count(),
    })
    .from(growthMeasurementResults)
    .where(
      and(
        eq(growthMeasurementResults.projectId, projectId),
        gte(growthMeasurementResults.evaluatedAt, startAt),
        lt(growthMeasurementResults.evaluatedAt, endAt),
      ),
    )
    .groupBy(growthMeasurementResults.outcome);
  return rows.reduce(
    (totals, row) => {
      const value = Number(row.value);
      if (row.outcome === "strong_positive" || row.outcome === "positive")
        totals.materialGains += value;
      if (row.outcome === "strong_negative" || row.outcome === "negative")
        totals.materialLosses += value;
      return totals;
    },
    { materialGains: 0, materialLosses: 0 },
  );
}

async function strikingDistanceCount(
  projectId: string,
  startAt: string,
  endAt: string,
) {
  const [row] = await db
    .select({ value: count() })
    .from(growthRecommendationSignalLinks)
    .innerJoin(
      growthSignals,
      and(
        eq(growthSignals.projectId, growthRecommendationSignalLinks.projectId),
        eq(growthSignals.runId, growthRecommendationSignalLinks.signalRunId),
        eq(growthSignals.id, growthRecommendationSignalLinks.signalId),
      ),
    )
    .innerJoin(
      growthRuns,
      and(
        eq(growthRuns.projectId, growthSignals.projectId),
        eq(growthRuns.id, growthSignals.runId),
      ),
    )
    .where(
      and(
        eq(growthRecommendationSignalLinks.projectId, projectId),
        eq(growthRecommendationSignalLinks.relationship, "controller"),
        eq(growthSignals.signalType, "striking_distance_query"),
        eq(growthSignals.metric, "gsc_impressions"),
        inArray(growthRuns.status, ["completed", "completed_with_errors"]),
        gte(growthRecommendationSignalLinks.createdAt, startAt),
        lt(growthRecommendationSignalLinks.createdAt, endAt),
      ),
    );
  return Number(row?.value ?? 0);
}

async function actionsAtRiskCount(projectId: string, asOf: string) {
  const [row] = await db
    .select({ value: count() })
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        inArray(growthActions.status, [
          "approved",
          "ready",
          "in_progress",
          "blocked",
        ]),
        or(eq(growthActions.status, "blocked"), lte(growthActions.dueAt, asOf)),
      ),
    );
  return Number(row?.value ?? 0);
}

async function getCompactFacts(input: {
  projectId: string;
  startAt: string;
  endAt: string;
  asOf: string;
}) {
  const [outcomes, newStrikingDistanceOpportunities, actionsAtRisk] =
    await Promise.all([
      measurementOutcomeCounts(input.projectId, input.startAt, input.endAt),
      strikingDistanceCount(input.projectId, input.startAt, input.endAt),
      actionsAtRiskCount(input.projectId, input.asOf),
    ]);
  return {
    ...outcomes,
    newStrikingDistanceOpportunities,
    actionsAtRisk,
  };
}

export const GrowthWeeklyReviewRepository = { getCompactFacts } as const;
