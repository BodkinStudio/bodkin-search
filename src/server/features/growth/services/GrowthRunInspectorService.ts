import { AppError } from "@/server/lib/errors";
import {
  growthRunInspectorDtoSchema,
  type GrowthRunInspectorDto,
} from "@/types/schemas/growth-run-inspector";
import { GrowthRunInspectorRepository } from "../repositories/GrowthRunInspectorRepository";

const LIMIT = 20;

function durationMs(startedAt: string, completedAt: string | null, asOf: Date) {
  const start = new Date(startedAt).valueOf();
  const end = completedAt ? new Date(completedAt).valueOf() : asOf.valueOf();
  return Math.max(0, end - start);
}

function entityCount(value: unknown) {
  return Number(value);
}

async function getRunInspector(
  projectId: string,
  now = new Date(),
): Promise<GrowthRunInspectorDto> {
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Run inspector clock is invalid");
  const rows = await GrowthRunInspectorRepository.listRecentRuns(
    projectId,
    LIMIT + 1,
  );
  return growthRunInspectorDtoSchema.parse({
    asOf: now.toISOString(),
    limit: LIMIT,
    hasMore: rows.length > LIMIT,
    runs: rows.slice(0, LIMIT).map((run) => ({
      id: run.id,
      runType: run.runType,
      trigger: run.trigger,
      status: run.status,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: durationMs(run.startedAt, run.completedAt, now),
      detectorVersion: run.detectorVersion,
      analysisVersion: run.analysisVersion,
      providerCostMinor: run.providerCostMinor,
      failure:
        run.failureCode && run.failureMessage
          ? { code: run.failureCode, message: run.failureMessage }
          : null,
      entities: {
        signals: entityCount(run.signalCount),
        insights: entityCount(run.insightCount),
        recommendations: entityCount(run.recommendationCount),
        linkedActions: entityCount(run.linkedActionCount),
      },
    })),
  });
}

export const GrowthRunInspectorService = { getRunInspector } as const;
