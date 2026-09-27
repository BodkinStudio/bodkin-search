import type { JourneyEvent } from "@/types/schemas/analytics";
export const now = new Date("2026-09-15T12:00:00.000Z");
export const ids = {
  website: "00000000-0000-4000-8000-000000000010",
  product: "00000000-0000-4000-8000-000000000011",
  click: "00000000-0000-4000-8000-000000000100",
  entry: "00000000-0000-4000-8000-000000000101",
  identity: "00000000-0000-4000-8000-000000000102",
};
export function event(overrides: Partial<JourneyEvent> = {}): JourneyEvent {
  return {
    schemaVersion: 1,
    eventId: ids.click,
    projectKey: "00000000-0000-4000-8000-000000000001",
    sourceId: ids.website,
    environment: "production",
    contextId: "00000000-0000-4000-8000-000000000020",
    occurredAt: now.toISOString(),
    name: "acquisition_clicked",
    page: { host: "site.test", path: "/pricing" },
    properties: { action: "start_trial", destination: "product" },
    consent: {
      analytics: true,
      attribution: true,
      identity: true,
      policyVersion: "v1",
    },
    ...overrides,
  };
}
