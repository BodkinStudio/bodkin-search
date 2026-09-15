import { AppError } from "@/server/lib/errors";
import { invalidGrowthAssessmentCompletionTargetReason } from "@/shared/growth-assessment-quality";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import {
  saveGrowthAssessmentSchema,
  type GenerateGrowthAssessmentInput,
  type SaveGrowthAssessmentInput,
} from "@/types/schemas/growth-assessments";
import { GrowthAssessmentsRepository as repo } from "../repositories/GrowthAssessmentsRepository";
import { GrowthInsightsRepository } from "../repositories/GrowthInsightsRepository";

async function getAssessment(projectId: string) {
  return repo.getLatest(projectId);
}

async function saveAssessment(raw: SaveGrowthAssessmentInput) {
  const input = saveGrowthAssessmentSchema.parse(raw);
  const keyPages = await ProjectContextRepository.listKeyPages(input.projectId);
  const allowed = new Set(keyPages.map((page) => page.id));
  if (
    input.options.some(
      (option) => option.keyPageId && !allowed.has(option.keyPageId),
    )
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "The selected page must belong to this project",
    );
  if (
    input.options.some((option) => option.kind !== "page" && option.keyPageId)
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Only page options can select a project page",
    );
  const saved = await repo.append(input);
  if (!saved)
    throw new AppError(
      "CONFLICT",
      "This assessment changed; reload before saving",
    );
  return saved;
}

// Keep ordinary assessment reads and gates independent from optional AI
// infrastructure. It also means a missing hosted-only module cannot stop the
// review screen from loading.
async function generateAssessment(
  input: GenerateGrowthAssessmentInput & {
    organizationId: string;
    userId: string;
    userEmail: string;
  },
) {
  const { GrowthAssessmentGenerationService } =
    await import("./GrowthAssessmentGenerationService");
  return GrowthAssessmentGenerationService.generateAssessment(input);
}

async function confirmAssessment(projectId: string, expectedVersion: number) {
  const assessment = await repo.getLatest(projectId);
  if (!assessment || assessment.version !== expectedVersion)
    throw new AppError(
      "CONFLICT",
      "This priority changed; reload before accepting it",
    );
  const selected = assessment.options.find(
    (option) => option.id === assessment.selectedOptionId,
  );
  const invalidCompletionTarget = invalidGrowthAssessmentCompletionTargetReason(
    selected?.kind,
    assessment.successMeasure,
  );
  if (invalidCompletionTarget)
    throw new AppError(
      "VALIDATION_ERROR",
      `This saved suggestion needs replacing. ${invalidCompletionTarget}`,
    );
  if (assessment.status === "ready") return assessment;
  const options = assessment.options.map(
    ({
      id,
      kind,
      title,
      businessRelevance,
      evidenceSource,
      evidenceDate,
      evidenceScope,
      observation,
      uncertainty,
      nextValidation,
      disposition,
      keyPageId,
    }) => ({
      id,
      kind,
      title,
      businessRelevance,
      evidenceSource,
      evidenceDate,
      evidenceScope,
      observation,
      uncertainty,
      nextValidation,
      disposition,
      keyPageId,
    }),
  );
  return saveAssessment({
    projectId,
    expectedVersion,
    status: "ready",
    objective: assessment.objective,
    market: assessment.market,
    audience: assessment.audience,
    successMeasure: assessment.successMeasure,
    comparisonRationale: assessment.comparisonRationale,
    options,
    objectiveConfirmed: true,
  });
}

async function requireReadyForPage(projectId: string, pageUrl: string | null) {
  const assessment = await repo.getLatest(projectId);
  const selected = assessment?.options.find(
    (option) => option.id === assessment.selectedOptionId,
  );
  if (!assessment || assessment.status !== "ready" || !selected)
    throw new AppError(
      "VALIDATION_ERROR",
      "Complete a ready priority assessment and select the source page before proposing work",
    );
  const pages = await ProjectContextRepository.listKeyPages(projectId);
  const page = pages.find((candidate) => candidate.id === selected.keyPageId);
  if (!page || page.url !== pageUrl)
    throw new AppError(
      "VALIDATION_ERROR",
      "The ready assessment must select this source page before proposing work",
    );
  return { assessment, selected, page };
}

async function requireReadyForInvestigation(
  projectId: string,
  assessmentId: string,
) {
  const assessment = await repo.getLatest(projectId);
  const selected = assessment?.options.find(
    (option) => option.id === assessment.selectedOptionId,
  );
  if (
    !assessment ||
    assessment.id !== assessmentId ||
    assessment.status !== "ready" ||
    !selected ||
    selected.kind === "defer"
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Investigations require the latest accepted assessment and its selected project page",
    );
  if (selected.kind === "page") {
    const page = (await ProjectContextRepository.listKeyPages(projectId)).find(
      (candidate) => candidate.id === selected.keyPageId,
    );
    if (!page)
      throw new AppError(
        "VALIDATION_ERROR",
        "The accepted assessment's selected page is no longer in this project",
      );
    return { assessment, selected, page };
  }
  const url =
    selected.evidenceScope.match(
      /Canonical affected page: (https?:\/\/[^\s]+)\./,
    )?.[1] ??
    selected.observation.match(
      /(?:result URL | on )(https?:\/\/[^\s]+)\./,
    )?.[1];
  const domain = await GrowthInsightsRepository.projectDomain(projectId);
  const host = url
    ? new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    : null;
  if (!url || !domain || host !== domain.toLowerCase().replace(/^www\./, ""))
    throw new AppError(
      "VALIDATION_ERROR",
      "The accepted assessment must cite an exact page on this project before it can be investigated",
    );
  const page = { url };
  return { assessment, selected, page };
}

export const GrowthAssessmentsService = {
  getAssessment,
  confirmAssessment,
  saveAssessment,
  generateAssessment,
  requireReadyForPage,
  requireReadyForInvestigation,
} as const;
