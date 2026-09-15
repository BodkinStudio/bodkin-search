import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type {
  GrowthActionStatus,
  GrowthActorType,
} from "@/types/schemas/growth-actions";

type GrowthActionEventFact = {
  projectId: string;
  actionId: string;
  actionVersion: number;
  eventType: "created" | "status_changed";
  fromStatus: GrowthActionStatus | null;
  toStatus: GrowthActionStatus;
  actorType: GrowthActorType;
  actorId: string;
  note: string | null;
};

type StoredGrowthActionEvent = GrowthActionEventFact & {
  factHash: string;
};

export async function growthActionEventFactHash(fact: GrowthActionEventFact) {
  return sha256Hex(JSON.stringify(fact));
}

export function assertGrowthActionEvent(
  event: StoredGrowthActionEvent | null | undefined,
  expected: StoredGrowthActionEvent,
) {
  if (
    !event ||
    event.projectId !== expected.projectId ||
    event.actionId !== expected.actionId ||
    event.actionVersion !== expected.actionVersion ||
    event.eventType !== expected.eventType ||
    event.fromStatus !== expected.fromStatus ||
    event.toStatus !== expected.toStatus ||
    event.actorType !== expected.actorType ||
    event.actorId !== expected.actorId ||
    event.note !== expected.note ||
    event.factHash !== expected.factHash
  ) {
    throw new AppError(
      "CONFLICT",
      "Stored Growth Action event does not match its immutable fact",
    );
  }
  return event;
}
