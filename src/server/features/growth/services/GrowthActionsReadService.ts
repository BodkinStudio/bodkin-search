import { AppError } from "@/server/lib/errors";
import {
  growthActionsReadPageDtoSchema,
  growthActionsReadRequestSchema,
  type GrowthActionsReadPageDto,
  type GrowthActionsReadRequest,
} from "@/types/schemas/growth-action-reads";
import { GrowthActionsRepository } from "../repositories/GrowthActionsRepository";
import {
  growthEvidenceDisplayActionText,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";

const MAX_TARGETS_PER_ACTION = 100;
const MAX_DISPLAY_TARGETS = 5;
const MAX_TITLE_LENGTH = 300;
const MAX_CATEGORY_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 400;
const MAX_PROSE_TARGET_LENGTH = 2000;

type StoredTarget = {
  targetType: "url" | "keyword" | "cluster" | "site";
  targetValue: string;
};

function codeUnitCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function targetKey(target: StoredTarget) {
  return `${target.targetType}\u0000${target.targetValue}`;
}

function boundedActionText(value: string, maxLength: number) {
  const projected = growthEvidenceDisplayActionText(value);
  return {
    ...projected,
    content: projected.content.slice(0, maxLength),
    truncated: projected.truncated || projected.content.length > maxLength,
  };
}

function displayTarget(target: StoredTarget) {
  if (target.targetType === "url") {
    const projected = growthEvidenceDisplayUrl(target.targetValue);
    return {
      type: "url" as const,
      value: projected.value,
      queryOrFragmentOmitted: projected.omitted,
      withheld: projected.withheld,
    };
  }
  const projected = boundedActionText(
    target.targetValue,
    MAX_PROSE_TARGET_LENGTH,
  );
  return {
    type: target.targetType,
    value: projected.content,
    redacted: projected.redacted,
    truncated: projected.truncated,
  };
}

function actionDto(
  action: Awaited<
    ReturnType<typeof GrowthActionsRepository.listActionsPage>
  >[number],
  targets: StoredTarget[],
) {
  if (targets.length > MAX_TARGETS_PER_ACTION)
    throw new AppError(
      "INTERNAL_ERROR",
      "Stored Growth Action exceeds the target integrity limit",
    );
  const title = boundedActionText(action.title, MAX_TITLE_LENGTH);
  const category = boundedActionText(action.category, MAX_CATEGORY_LENGTH);
  const description = boundedActionText(
    action.description,
    MAX_DESCRIPTION_LENGTH,
  );
  const sortedTargets = targets.toSorted((left, right) =>
    codeUnitCompare(targetKey(left), targetKey(right)),
  );
  const projectedTargets = sortedTargets.map(displayTarget);
  return {
    id: action.id,
    title: title.content,
    titleRedacted: title.redacted,
    titleTruncated: title.truncated,
    category: category.content,
    categoryRedacted: category.redacted,
    categoryTruncated: category.truncated,
    description: description.content,
    descriptionRedacted: description.redacted,
    descriptionTruncated: description.truncated,
    priorityScore: action.priorityScore,
    status: action.status,
    version: action.stateVersion,
    dueAt: action.dueAt,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    targetCount: sortedTargets.length,
    displayTargets: projectedTargets.slice(0, MAX_DISPLAY_TARGETS),
    displayTargetsOmitted: sortedTargets.length > MAX_DISPLAY_TARGETS,
    displayTargetsWithheld: projectedTargets.some(
      (target) => target.type === "url" && target.withheld,
    ),
  };
}

async function listActions(
  input: GrowthActionsReadRequest,
): Promise<GrowthActionsReadPageDto> {
  const request = growthActionsReadRequestSchema.parse(input);
  const rows = await GrowthActionsRepository.listActionsPage(request);
  const emitted = rows.slice(0, request.limit);
  const targets = await GrowthActionsRepository.listActionTargetsForActions(
    request.projectId,
    emitted.map((action) => action.id),
  );
  const targetsByAction = new Map<string, StoredTarget[]>();
  for (const target of targets) {
    const current = targetsByAction.get(target.actionId) ?? [];
    current.push(target as StoredTarget);
    targetsByAction.set(target.actionId, current);
  }
  const hasMore = rows.length > request.limit;
  const last = emitted.at(-1);
  return growthActionsReadPageDtoSchema.parse({
    actions: emitted.map((action) =>
      actionDto(action, targetsByAction.get(action.id) ?? []),
    ),
    limit: request.limit,
    hasMore,
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  });
}

export const GrowthActionsReadService = { listActions } as const;
