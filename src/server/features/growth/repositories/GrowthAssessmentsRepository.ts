import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { growthAssessmentOptions, growthAssessments } from "@/db/schema";
import type { SaveGrowthAssessmentInput } from "@/types/schemas/growth-assessments";

async function getLatest(projectId: string) {
  const assessment = await db
    .select()
    .from(growthAssessments)
    .where(eq(growthAssessments.projectId, projectId))
    .orderBy(desc(growthAssessments.version))
    .limit(1);
  if (!assessment[0]) return null;
  const options = await db
    .select()
    .from(growthAssessmentOptions)
    .where(
      and(
        eq(growthAssessmentOptions.projectId, projectId),
        eq(growthAssessmentOptions.assessmentId, assessment[0].id),
      ),
    )
    .orderBy(growthAssessmentOptions.ordinal);
  return { ...assessment[0], options };
}

async function append(input: SaveGrowthAssessmentInput) {
  const current = await getLatest(input.projectId);
  const currentVersion = current?.version ?? 0;
  if (input.expectedVersion !== (current ? currentVersion : null)) return null;
  const id = crypto.randomUUID();
  const optionIds = input.options.map(() => crypto.randomUUID());
  const selectedIndex = input.options.findIndex(
    (option) => option.disposition === "selected",
  );
  const createdAt = new Date().toISOString();
  try {
    await runBatch((tx) => [
      tx.insert(growthAssessments).values({
        id,
        projectId: input.projectId,
        version: currentVersion + 1,
        status: input.status,
        objective: input.objective,
        market: input.market,
        audience: input.audience,
        successMeasure: input.successMeasure,
        objectiveConfirmed: input.objectiveConfirmed,
        comparisonRationale: input.comparisonRationale,
        selectedOptionId:
          selectedIndex === -1 ? null : optionIds[selectedIndex],
        createdAt,
      }),
      ...input.options.map(({ id: _priorOptionId, ...option }, ordinal) =>
        tx.insert(growthAssessmentOptions).values({
          id: optionIds[ordinal],
          projectId: input.projectId,
          assessmentId: id,
          ...option,
          ordinal,
        }),
      ),
    ]);
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; depth < 5 && cause instanceof Error; depth += 1) {
      if (
        /growth_assessments_project_version_key|UNIQUE constraint failed: growth_assessments.project_id, growth_assessments.version/i.test(
          cause.message,
        )
      )
        return null;
      cause = cause.cause;
    }
    throw error;
  }
  return getLatest(input.projectId);
}

export const GrowthAssessmentsRepository = { getLatest, append } as const;
