import type { ServerJourneyEvent } from "@/types/schemas/analytics";

/** The stored outcome: payments keyed by payment id, everything else by event id. */
export function outcomeRow(
  event: ServerJourneyEvent,
  customerId: string,
  contextId: string | null,
) {
  return {
    id: crypto.randomUUID(),
    projectId: event.projectId,
    environment: event.environment,
    issuer: event.issuer,
    externalId:
      event.name === "payment_succeeded"
        ? `payment:${event.paymentId}`
        : event.eventId,
    customerId,
    contextId,
    name: event.name,
    occurredAt: event.occurredAt,
    amountMinor: event.amountMinor ?? null,
    currency: event.currency ?? null,
    paymentId: event.paymentId ?? null,
    source: event.source ?? null,
  };
}
