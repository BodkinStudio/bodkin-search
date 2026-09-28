import { AppError } from "@/server/lib/errors";
import {
  growthMonthlyCycleOperatorObservationDtoSchema,
  type AppendGrowthMonthlyCycleOperatorObservationInput,
} from "@/types/schemas/growth-monthly-cycle-operator-observations";
import { GrowthMonthlyCycleOperatorObservationsRepository as repository } from "../repositories/GrowthMonthlyCycleOperatorObservationsRepository";

async function appendObservation(
  input: AppendGrowthMonthlyCycleOperatorObservationInput & {
    projectId: string;
    actorId: string;
  },
) {
  const createdAt = new Date().toISOString();
  const saved = await repository.append({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    runId: input.runId,
    requestKey: input.requestKey,
    preparation: input.preparation,
    failure: input.failure,
    duplicateSpam: input.duplicateSpam,
    note: input.note,
    reviewerId: input.actorId,
    createdAt,
  });
  if (!saved)
    throw new AppError(
      "NOT_FOUND",
      "Eligible completed monthly review run not found",
    );
  const exact =
    saved.runId === input.runId &&
    saved.preparation === input.preparation &&
    saved.failure === input.failure &&
    saved.duplicateSpam === input.duplicateSpam &&
    saved.note === input.note &&
    saved.reviewerId === input.actorId;
  if (!exact)
    throw new AppError(
      "CONFLICT",
      "Request key was already used for different operator evidence",
    );
  return growthMonthlyCycleOperatorObservationDtoSchema.parse({
    id: saved.id,
    runId: saved.runId,
    preparation: saved.preparation,
    failure: saved.failure,
    duplicateSpam: saved.duplicateSpam,
    note: saved.note,
    createdAt: saved.createdAt,
  });
}

export const GrowthMonthlyCycleOperatorObservationsService = {
  appendObservation,
} as const;
