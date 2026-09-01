import { AppError } from "@/server/lib/errors";
import {
  growthPriorityRecommendationsPageDtoSchema,
  growthPriorityRecommendationsRequestSchema,
  type GrowthPriorityRecommendationsPageDto,
  type GrowthPriorityRecommendationsRequest,
} from "@/types/schemas/growth-priority-recommendations";
import { GrowthPriorityRecommendationsRepository } from "../repositories/GrowthPriorityRecommendationsRepository";
import {
  growthEvidenceDisplayActionText,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";

const MAX_STORED_CHILDREN = 100;
const MAX_DISPLAY_CHILDREN = 5;

type Target = {
  targetType: "url" | "keyword" | "cluster" | "site";
  targetValue: string;
};
type Step = { position: number; content: string };

function boundedText(value: string, max: number) {
  const projected = growthEvidenceDisplayActionText(value);
  return {
    content: projected.content.slice(0, max),
    redacted: projected.redacted,
    truncated: projected.truncated || projected.content.length > max,
  };
}

function displayTarget(row: Target) {
  if (row.targetType === "url") {
    const projected = growthEvidenceDisplayUrl(row.targetValue);
    return {
      type: "url" as const,
      value: projected.value,
      queryOrFragmentOmitted: projected.omitted,
      withheld: projected.withheld,
    };
  }
  const projected = boundedText(row.targetValue, 2000);
  return {
    type: row.targetType,
    value: projected.content,
    redacted: projected.redacted,
    truncated: projected.truncated,
  };
}

function timestamp(value: string | null, label: string) {
  return value === null
    ? null
    : canonicalTimestamp(sqliteTimestamp(value), label);
}

function sqliteTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
}

function codeUnitCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unresolvedStatus(value: string) {
  if (value === "proposed" || value === "snoozed" || value === "accepted")
    return value;
  throw new AppError(
    "INTERNAL_ERROR",
    "Stored Growth Recommendation has an ineligible status",
  );
}

function recommendationDto(
  row: Awaited<
    ReturnType<
      typeof GrowthPriorityRecommendationsRepository.listRecommendationsPage
    >
  >[number],
  targets: Target[],
  steps: Step[],
) {
  if (
    targets.length > MAX_STORED_CHILDREN ||
    steps.length > MAX_STORED_CHILDREN
  ) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Stored Growth Recommendation exceeds the child integrity limit",
    );
  }
  const title = boundedText(row.title, 300);
  const rationale = boundedText(row.rationale, 400);
  const category = boundedText(row.category, 100);
  const status = unresolvedStatus(row.status);
  const sortedTargets = targets.toSorted((left, right) =>
    codeUnitCompare(
      `${left.targetType}\u0000${left.targetValue}`,
      `${right.targetType}\u0000${right.targetValue}`,
    ),
  );
  const sortedSteps = steps.toSorted(
    (left, right) => left.position - right.position,
  );
  const displayTargets = sortedTargets.map(displayTarget);
  const displaySteps = sortedSteps.map((step) =>
    boundedText(step.content, 2000),
  );
  return {
    id: row.id,
    title: title.content,
    titleRedacted: title.redacted,
    titleTruncated: title.truncated,
    rationale: rationale.content,
    rationaleRedacted: rationale.redacted,
    rationaleTruncated: rationale.truncated,
    category: category.content,
    categoryRedacted: category.redacted,
    categoryTruncated: category.truncated,
    impact: row.impact,
    commercialRelevance: row.commercialRelevance,
    effort: row.effort,
    urgency: row.urgency,
    confidence: row.confidence,
    priorityScore: row.priorityScore,
    status,
    reviewVersion: row.reviewVersion,
    snoozedUntil: timestamp(row.snoozedUntil, "Recommendation snoozedUntil"),
    reviewedAt: timestamp(row.reviewedAt, "Recommendation reviewedAt"),
    createdAt: canonicalTimestamp(
      sqliteTimestamp(row.createdAt),
      "Recommendation createdAt",
    ),
    needsAction: status === "accepted",
    targetCount: targets.length,
    displayTargets: displayTargets.slice(0, MAX_DISPLAY_CHILDREN),
    displayTargetsOmitted: displayTargets.length > MAX_DISPLAY_CHILDREN,
    displayTargetsWithheld: displayTargets.some(
      (value) => value.type === "url" && value.withheld,
    ),
    stepCount: steps.length,
    displaySteps: displaySteps.slice(0, MAX_DISPLAY_CHILDREN),
    displayStepsOmitted: displaySteps.length > MAX_DISPLAY_CHILDREN,
  };
}

async function listPriorityRecommendations(
  input: GrowthPriorityRecommendationsRequest,
): Promise<GrowthPriorityRecommendationsPageDto> {
  const request = growthPriorityRecommendationsRequestSchema.parse(input);
  const rows =
    await GrowthPriorityRecommendationsRepository.listRecommendationsPage(
      request,
    );
  const emitted = rows.slice(0, request.limit);
  const ids = emitted.map((row) => row.id);
  const [targetRows, stepRows] = await Promise.all([
    GrowthPriorityRecommendationsRepository.listTargetsForRecommendations(
      request.projectId,
      ids,
    ),
    GrowthPriorityRecommendationsRepository.listStepsForRecommendations(
      request.projectId,
      ids,
    ),
  ]);
  const targetsByRecommendation = new Map<string, Target[]>();
  for (const value of targetRows) {
    const values = targetsByRecommendation.get(value.recommendationId) ?? [];
    values.push(value as Target);
    targetsByRecommendation.set(value.recommendationId, values);
  }
  const stepsByRecommendation = new Map<string, Step[]>();
  for (const value of stepRows) {
    const values = stepsByRecommendation.get(value.recommendationId) ?? [];
    values.push(value);
    stepsByRecommendation.set(value.recommendationId, values);
  }
  const hasMore = rows.length > request.limit;
  const last = emitted.at(-1);
  return growthPriorityRecommendationsPageDtoSchema.parse({
    recommendations: emitted.map((row) =>
      recommendationDto(
        row,
        targetsByRecommendation.get(row.id) ?? [],
        stepsByRecommendation.get(row.id) ?? [],
      ),
    ),
    limit: request.limit,
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            priorityScore: last.priorityScore,
            createdAt: canonicalTimestamp(
              sqliteTimestamp(last.createdAt),
              "Recommendation createdAt",
            ),
            id: last.id,
          }
        : null,
  });
}

export const GrowthPriorityRecommendationsReadService = {
  listPriorityRecommendations,
} as const;
