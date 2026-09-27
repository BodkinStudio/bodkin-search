import { beforeEach, describe, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  events: vi.fn(),
  customers: vi.fn(),
  outcomes: vi.fn(),
  settings: vi.fn(),
  windowFor: () => ({
    from: "2026-09-01T00:00:00Z",
    to: "2026-09-30T23:59:59Z",
  }),
}));
const { events, customers, outcomes, settings } = repository;
vi.mock("./AnalyticsRepository", () => ({ AnalyticsRepository: repository }));
vi.mock("./AnalyticsReportingConfiguration", async () => {
  const { defaultStages } = await import("@/shared/analytics/funnels");
  return {
    reportingSettings: async () => ({
      completionWindowDays: 7,
      onboardingEvent: "activation_achieved",
      onboardingInstrumented: false,
      onboardingWaitDays: 7,
    }),
    configuredStages: async (_project: string, template: "external") =>
      defaultStages(template),
  };
});
import { AnalyticsQueries } from "./AnalyticsQueries";
const q = {
  projectId: "p",
  environment: "production" as const,
  limit: 100,
  offset: 0,
};
const event = (overrides: Record<string, unknown> = {}) => ({
  id: "e1",
  eventId: "public-1",
  projectId: "p",
  sourceId: "website",
  environment: "production",
  contextId: "c1",
  sessionId: "s1",
  name: "page_view",
  occurredAt: "2026-09-01T00:00:00.000Z",
  receivedAt: "2026-09-01T00:00:00.000Z",
  sequence: 0,
  pageHost: "site.test",
  pagePath: "/",
  referrerHost: null,
  campaignSource: null,
  campaignMedium: null,
  campaignName: null,
  action: null,
  destination: null,
  placement: null,
  trust: "public",
  policyVersion: "v1",
  ...overrides,
});
beforeEach(() => {
  events.mockResolvedValue([]);
  customers.mockResolvedValue([]);
  outcomes.mockResolvedValue([]);
  settings.mockResolvedValue({
    primaryOutcome: "registration_completed",
    personalAccess: true,
  });
});
describe("AnalyticsQueries", () => {
  it("keeps inferred links separate from map paths", async () => {
    events.mockResolvedValue([
      event(),
      event({
        id: "e2",
        eventId: "public-2",
        contextId: "c2",
        pagePath: "/pricing",
      }),
    ]);
    customers.mockResolvedValue([
      {
        externalId: "org-exact",
        issuer: "crm",
        method: "exact",
        acquiredAt: "2026-09-01T01:00:00Z",
        contextId: "c1",
        reason: "verified_context",
        lifecycle: "registration_completed",
        decisionVersion: 1,
        clickEventId: null,
      },
      {
        externalId: "org-inferred",
        issuer: "crm",
        method: "ip_time",
        acquiredAt: "2026-09-01T01:00:00Z",
        contextId: "c2",
        reason: "matched",
        lifecycle: "registration_completed",
        decisionVersion: 1,
        clickEventId: "e2",
      },
    ]);
    const map = await AnalyticsQueries.journeyMap(q);
    expect(map.paths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contextId: "c1",
          organizationId: "org-exact",
          customerBinding: "exact",
        }),
        expect.objectContaining({
          contextId: "c2",
          organizationId: null,
          customerBinding: "anonymous",
        }),
      ]),
    );
    expect(map.inferredAttributions).toEqual([
      expect.objectContaining({ organizationId: "org-inferred" }),
    ]);
  });
  it("uses ordered per-context funnel cohorts and labels absent stages", async () => {
    events.mockResolvedValue([
      event(),
      event({
        id: "e2",
        name: "acquisition_clicked",
        receivedAt: "2026-09-01T01:00:00.000Z",
      }),
      event({
        id: "e3",
        name: "product_opened",
        receivedAt: "2026-09-01T02:00:00.000Z",
      }),
      event({
        id: "e4",
        name: "registration_completed",
        receivedAt: "2026-09-01T03:00:00.000Z",
      }),
      event({ id: "e5", contextId: "c2", name: "registration_completed" }),
    ]);
    const funnel = await AnalyticsQueries.funnels(q);
    expect(funnel).toMatchObject({
      cohortSize: 1,
      pending: 0,
      completionWindow: "7 days",
    });
    expect(
      funnel.stages.find((s) => s.name === "product_opened"),
    ).toMatchObject({ count: 1, coverage: "Observed" });
  });
  it("rejects personal reads when the project disables them", async () => {
    settings.mockResolvedValue({
      primaryOutcome: "registration_completed",
      personalAccess: false,
    });
    await expect(AnalyticsQueries.journeys(q)).rejects.toThrow(
      "Individual journey access",
    );
    await expect(AnalyticsQueries.overview(q)).resolves.toMatchObject({
      visitors: 0,
    });
  });
});
