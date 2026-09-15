import { AppError } from "@/server/lib/errors";
import {
  approveGrowthAiBriefSchema,
  growthAiBriefSchema,
  saveGrowthAiBriefEditsSchema,
  type ApproveGrowthAiBriefInput,
  type GrowthAiBrief,
  type SaveGrowthAiBriefEditsInput,
  type SavedGrowthAiBrief,
} from "@/types/schemas/growth-investigations";
import { GrowthAiBriefRepository as repo } from "../repositories/GrowthAiBriefRepository";
import { GrowthActionsRepository } from "../repositories/GrowthActionsRepository";
import { GrowthActionsService } from "./GrowthActionsService";
import { GrowthInvestigationsService } from "./GrowthInvestigationsService";
import { GrowthAssessmentsService } from "./GrowthAssessmentsService";
import {
  GROWTH_INVESTIGATION_TEMPLATE_VERSION,
  STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION,
} from "./GrowthInvestigationTemplate";

const supportedTemplates = new Set([
  GROWTH_INVESTIGATION_TEMPLATE_VERSION,
  STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION,
]);

export async function getGrowthAiBrief(input: {
  projectId: string;
  signalId: string;
}) {
  return repo.getBySignal(input);
}

/** Server-only boundary: generated facts never come from the browser. */
export async function persistGeneratedGrowthAiBrief(input: {
  projectId: string;
  signalId: string;
  generated: GrowthAiBrief;
  model: string;
  promptVersion: string;
}) {
  const existing = await repo.getBySignal(input);
  if (existing) return existing;
  const investigation = await GrowthInvestigationsService.getInvestigation(
    input.projectId,
    input.signalId,
  );
  if (
    !investigation ||
    investigation.relationship !== "controller" ||
    !supportedTemplates.has(investigation.templateVersion)
  )
    throw new AppError("NOT_FOUND", "Supported AI investigation not found");
  if (investigation.status !== "proposed")
    throw new AppError(
      "CONFLICT",
      "The source investigation is no longer available for approval",
    );
  const generated = growthAiBriefSchema.parse(input.generated);
  return repo.insertGenerated({
    ...input,
    generated,
    recommendationId: investigation.recommendationId,
    templateVersion: investigation.templateVersion,
    title: investigation.title,
  });
}

function sameEdits(
  saved: SavedGrowthAiBrief,
  input: SaveGrowthAiBriefEditsInput,
) {
  return (
    saved.proposal.title === input.title &&
    saved.proposal.measurementApproach === input.measurementApproach &&
    saved.proposal.proposedSteps.length === input.proposedSteps.length &&
    saved.proposal.proposedSteps.every(
      (step, index) => step === input.proposedSteps[index],
    )
  );
}

export async function saveGrowthAiBriefEdits(raw: SaveGrowthAiBriefEditsInput) {
  const input = saveGrowthAiBriefEditsSchema.parse(raw);
  const current = await repo.getById(input.projectId, input.briefId);
  if (!current) throw new AppError("NOT_FOUND", "AI proposal not found");
  if (current.approval)
    throw new AppError("CONFLICT", "An approved AI proposal cannot be edited");
  if (current.proposal.version !== input.expectedVersion) {
    if (
      current.proposal.version === input.expectedVersion + 1 &&
      sameEdits(current, input)
    )
      return current;
    throw new AppError(
      "CONFLICT",
      "AI proposal has changed; reload before saving",
    );
  }
  const saved = await repo.saveEdits(input);
  if (
    !saved ||
    saved.approval ||
    saved.proposal.version !== input.expectedVersion + 1 ||
    !sameEdits(saved, input)
  )
    throw new AppError(
      "CONFLICT",
      "AI proposal changed while saving; reload the saved version",
    );
  return saved;
}

function proposalDescription(brief: SavedGrowthAiBrief) {
  const text = [
    "AI proposal. Full generated evidence and approved work are attached.",
    ...brief.proposal.proposedSteps.map(
      (step, index) => `${index + 1}. ${step}`,
    ),
    `Proposed measurement approach: ${brief.proposal.measurementApproach}`,
  ].join("\n");
  return text.length <= 5000 ? text : `${text.slice(0, 4997)}...`;
}

async function replayApproval(
  brief: SavedGrowthAiBrief,
  input: ApproveGrowthAiBriefInput & { actorId: string },
) {
  const approval = brief.approval;
  if (
    !approval ||
    approval.version !== input.expectedVersion ||
    approval.dueOn !== input.dueOn ||
    approval.actorId !== input.actorId
  )
    throw new AppError(
      "CONFLICT",
      "AI proposal has already been approved with different details",
    );
  const action = await GrowthActionsService.getAction(
    input.projectId,
    approval.actionId,
  );
  if (!action) throw new AppError("CONFLICT", "Approved Action is unavailable");
  return { brief, action };
}

export async function approveGrowthAiBrief(
  raw: ApproveGrowthAiBriefInput & { actorId: string },
) {
  const { actorId, ...request } = raw;
  const input = { ...approveGrowthAiBriefSchema.parse(request), actorId };
  const brief = await repo.getById(input.projectId, input.briefId);
  if (!brief) throw new AppError("NOT_FOUND", "AI proposal not found");
  if (brief.approval) return replayApproval(brief, input);
  if (brief.proposal.version !== input.expectedVersion)
    throw new AppError(
      "CONFLICT",
      "AI proposal has changed; reload before approving",
    );
  const source = await GrowthInvestigationsService.getInvestigation(
    input.projectId,
    brief.signalId,
  );
  if (
    !source ||
    source.relationship !== "controller" ||
    source.recommendationId !== brief.recommendationId ||
    source.templateVersion !== brief.templateVersion ||
    !supportedTemplates.has(source.templateVersion)
  )
    throw new AppError("NOT_FOUND", "Source investigation is unavailable");
  if (source.status !== "proposed") {
    const winner = await repo.getById(input.projectId, input.briefId);
    if (winner?.approval) return replayApproval(winner, input);
    throw new AppError(
      "CONFLICT",
      "The original investigation has already been reviewed. Reload existing work.",
    );
  }
  const targets = await GrowthActionsRepository.listRecommendationTargets(
    input.projectId,
    brief.recommendationId,
  );
  await GrowthAssessmentsService.requireReadyForPage(
    input.projectId,
    targets.find((target) => target.targetType === "url")?.targetValue ?? null,
  );
  try {
    await GrowthActionsService.approveProposedRecommendation(
      {
        projectId: input.projectId,
        recommendationId: brief.recommendationId,
        creationKey: `growth-ai-brief:action:${brief.id}`,
        title: brief.proposal.title,
        description: proposalDescription(brief),
        dueAt: `${input.dueOn}T00:00:00.000Z`,
        targets: targets.map(({ targetType, targetValue }) => ({
          type: targetType,
          value: targetValue,
        })),
        actorType: "user",
        actorId,
        note: `Approved AI proposal ${brief.id} version ${brief.proposal.version}`,
      },
      source.reviewVersion,
      source.templateVersion ===
        STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION
        ? "key_page_identity"
        : "research_scope",
      {
        briefId: brief.id,
        expectedVersion: input.expectedVersion,
        dueOn: input.dueOn,
        actorId,
      },
    );
  } catch (error) {
    const winner = await repo.getById(input.projectId, input.briefId);
    if (winner?.approval) return replayApproval(winner, input);
    throw error;
  }
  const saved = await repo.getById(input.projectId, input.briefId);
  if (!saved?.approval)
    throw new AppError("CONFLICT", "AI proposal approval did not complete");
  return replayApproval(saved, input);
}
