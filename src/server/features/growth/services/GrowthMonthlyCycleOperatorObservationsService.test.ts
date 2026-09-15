import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendOperatorObservationRecord } from "../repositories/GrowthMonthlyCycleOperatorObservationsRepository";

const repository = vi.hoisted(() => ({
  append:
    vi.fn<
      (
        record: AppendOperatorObservationRecord,
      ) => Promise<AppendOperatorObservationRecord | null>
    >(),
}));
vi.mock(
  "../repositories/GrowthMonthlyCycleOperatorObservationsRepository",
  () => ({
    GrowthMonthlyCycleOperatorObservationsRepository: repository,
  }),
);

import { GrowthMonthlyCycleOperatorObservationsService as service } from "./GrowthMonthlyCycleOperatorObservationsService";

const input = {
  projectId: "project_1",
  actorId: "user_1",
  runId: "monthly_run_1",
  requestKey: "11111111-1111-4111-8111-111111111111",
  preparation: "minor" as const,
  failure: "explained" as const,
  duplicateSpam: "not_observed" as const,
  note: "Operator checked the source inputs.",
};

const saved = {
  id: "observation_1",
  projectId: input.projectId,
  runId: input.runId,
  requestKey: input.requestKey,
  preparation: input.preparation,
  failure: input.failure,
  duplicateSpam: input.duplicateSpam,
  note: input.note,
  reviewerId: input.actorId,
  createdAt: "2026-09-05T12:00:00.000Z",
};

describe("GrowthMonthlyCycleOperatorObservationsService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(saved.createdAt));
    repository.append.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("uses server identity and time while keeping reviewer provenance private", async () => {
    repository.append.mockResolvedValue(saved);
    await expect(service.appendObservation(input)).resolves.toEqual({
      id: saved.id,
      runId: saved.runId,
      preparation: saved.preparation,
      failure: saved.failure,
      duplicateSpam: saved.duplicateSpam,
      note: saved.note,
      createdAt: saved.createdAt,
    });
    const appended = repository.append.mock.calls[0]?.[0];
    expect(appended).toMatchObject({
      ...saved,
      id: appended?.id,
    });
    expect(appended?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("returns not found when no eligible terminal monthly run was inserted", async () => {
    repository.append.mockResolvedValue(null);
    await expect(service.appendObservation(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("conflicts when an idempotency key resolves to different evidence or reviewer", async () => {
    repository.append.mockResolvedValue({ ...saved, preparation: "none" });
    await expect(service.appendObservation(input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    repository.append.mockResolvedValue({ ...saved, reviewerId: "user_2" });
    await expect(service.appendObservation(input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
