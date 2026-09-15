import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  middleware: [] as unknown[],
  handlers: [] as Array<
    (input: {
      data: unknown;
      context: {
        projectId: string;
        userId: string;
        userEmail: string;
        organizationId: string;
      };
    }) => Promise<unknown>
  >,
}));
const service = vi.hoisted(() => ({
  getInvestigation: vi.fn(),
  approveInvestigation: vi.fn(),
  reviewInvestigation: vi.fn(),
  getWork: vi.fn(),
}));
const proposals = vi.hoisted(() => ({
  getGrowthAiBrief: vi.fn(),
  saveGrowthAiBriefEdits: vi.fn(),
  approveGrowthAiBrief: vi.fn(),
}));
const aiBrief = vi.hoisted(() => ({ generateGrowthAiBrief: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: (value: unknown) => {
      registration.middleware.push(value);
      return {
        validator: (schema: z.ZodType) => ({
          handler: (
            handler: (input: {
              data: unknown;
              context: {
                projectId: string;
                userId: string;
                userEmail: string;
                organizationId: string;
              };
            }) => Promise<unknown>,
          ) => {
            registration.handlers.push(handler);
            return async (input: {
              data: unknown;
              context: {
                projectId: string;
                userId: string;
                userEmail: string;
                organizationId: string;
              };
            }) => {
              schema.parse(input.data);
              return handler(input);
            };
          },
        }),
      };
    },
  }),
}));
vi.mock("./middleware", () => ({
  requireProjectContext: ["project middleware"],
}));
vi.mock(
  "@/server/features/growth/services/GrowthInvestigationsService",
  () => ({ GrowthInvestigationsService: service }),
);
vi.mock(
  "@/server/features/growth/services/GrowthAiBriefService",
  () => aiBrief,
);

vi.mock(
  "@/server/features/growth/services/GrowthAiBriefProposalsService",
  () => proposals,
);

import {
  getSavedGrowthAiBrief,
  saveGrowthAiInvestigationBrief,
  approveGrowthAiInvestigationBrief,
  approveGrowthInvestigation,
  generateGrowthAiInvestigationBrief,
  getGrowthInvestigation,
  getGrowthWork,
  reviewGrowthInvestigation,
} from "./growthInvestigations";
import {
  saveGrowthAiBriefEditsSchema,
  approveGrowthAiBriefSchema,
  approveGrowthInvestigationSchema,
  reviewGrowthInvestigationSchema,
} from "@/types/schemas/growth-investigations";

describe("Growth investigation server functions", () => {
  it("uses only the authorized project and user", async () => {
    expect(getGrowthInvestigation).toBeTypeOf("function");
    expect(approveGrowthInvestigation).toBeTypeOf("function");
    expect(getGrowthWork).toBeTypeOf("function");
    expect(generateGrowthAiInvestigationBrief).toBeTypeOf("function");
    expect(reviewGrowthInvestigation).toBeTypeOf("function");
    service.getInvestigation.mockResolvedValue(null);
    service.approveInvestigation.mockResolvedValue({ id: "action_1" });
    service.reviewInvestigation.mockResolvedValue({ status: "dismissed" });
    service.getWork.mockResolvedValue({ actions: [], limit: 50 });
    aiBrief.generateGrowthAiBrief.mockResolvedValue({
      kind: "growth_ai_brief",
    });
    const context = {
      projectId: "project_authorized",
      userId: "user_authorized",
      userEmail: "user@example.com",
      organizationId: "organization_authorized",
    };
    await registration.handlers[0]({
      data: { projectId: "project_forged", signalId: "signal_1" },
      context,
    });
    await registration.handlers[1]({
      data: { projectId: "project_forged", signalId: "signal_1" },
      context,
    });
    await registration.handlers[2]({
      data: {
        projectId: "project_forged",
        signalId: "signal_1",
        dueOn: "2026-09-01",
      },
      context,
    });
    await registration.handlers[3]({
      data: {
        projectId: "project_forged",
        signalId: "signal_1",
        expectedVersion: 3,
        decision: "dismiss",
        dismissalReason: "irrelevant",
      },
      context,
    });
    await registration.handlers[4]({
      data: { projectId: "project_forged" },
      context,
    });
    expect(registration.middleware).toHaveLength(8);
    expect(
      registration.middleware.every(
        (entry) =>
          JSON.stringify(entry) === JSON.stringify(["project middleware"]),
      ),
    ).toBe(true);
    expect(service.getInvestigation).toHaveBeenCalledWith(
      "project_authorized",
      "signal_1",
    );
    expect(service.approveInvestigation).toHaveBeenCalledWith({
      projectId: "project_authorized",
      signalId: "signal_1",
      dueOn: "2026-09-01",
      actorId: "user_authorized",
    });
    expect(service.reviewInvestigation).toHaveBeenCalledWith({
      projectId: "project_authorized",
      signalId: "signal_1",
      expectedVersion: 3,
      decision: "dismiss",
      dismissalReason: "irrelevant",
    });
    expect(aiBrief.generateGrowthAiBrief).toHaveBeenCalledWith({
      organizationId: "organization_authorized",
      projectId: "project_authorized",
      signalId: "signal_1",
      userId: "user_authorized",
      userEmail: "user@example.com",
    });
    expect(service.getWork).toHaveBeenCalledWith("project_authorized");
  });

  it("rejects malformed calendar due dates", async () => {
    expect(() =>
      approveGrowthInvestigationSchema.parse({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-02-30",
      }),
    ).toThrow("valid calendar date");
  });

  it("rejects arbitrary review states and unknown review fields", () => {
    for (const value of [
      {
        projectId: "project_1",
        signalId: "signal_1",
        expectedVersion: 0,
        decision: "review_now",
        status: "accepted",
      },
      {
        projectId: "project_1",
        signalId: "signal_1",
        expectedVersion: 0,
        decision: "snooze",
        snoozeUntil: "2026-02-30",
      },
    ]) {
      expect(() => reviewGrowthInvestigationSchema.parse(value)).toThrow();
    }
  });
});

describe("Saved AI proposal boundary", () => {
  const context = {
    projectId: "authorized_project",
    userId: "authorized_user",
    userEmail: "user@example.com",
    organizationId: "authorized_org",
  };
  it("scopes saved reads and edits to the authorized project and approval actor", async () => {
    expect(getSavedGrowthAiBrief).toBeTypeOf("function");
    expect(saveGrowthAiInvestigationBrief).toBeTypeOf("function");
    expect(approveGrowthAiInvestigationBrief).toBeTypeOf("function");
    await registration.handlers[5]({
      data: { projectId: "forged", signalId: "signal_1" },
      context,
    });
    const edit = {
      projectId: "forged",
      briefId: "brief_1",
      expectedVersion: 2,
      title: "Review intent",
      proposedSteps: ["Read the page"],
      measurementApproach: "Compare relevant queries",
    };
    await registration.handlers[6]({ data: edit, context });
    await registration.handlers[7]({
      data: {
        projectId: "forged",
        briefId: "brief_1",
        expectedVersion: 2,
        dueOn: "2026-09-15",
      },
      context,
    });
    expect(proposals.getGrowthAiBrief).toHaveBeenCalledWith({
      projectId: "authorized_project",
      signalId: "signal_1",
    });
    expect(proposals.saveGrowthAiBriefEdits).toHaveBeenCalledWith({
      ...edit,
      projectId: "authorized_project",
    });
    expect(proposals.approveGrowthAiBrief).toHaveBeenCalledWith({
      projectId: "authorized_project",
      briefId: "brief_1",
      expectedVersion: 2,
      dueOn: "2026-09-15",
      actorId: "authorized_user",
    });
  });
  it("rejects browser-provided generated evidence, approval metadata and invalid proposal edits", () => {
    const edit = {
      projectId: "project",
      briefId: "brief",
      expectedVersion: 0,
      title: "Review intent",
      proposedSteps: ["Inspect the landing page"],
      measurementApproach: "Review the search queries",
    };
    for (const extra of [
      { generated: { observations: [] } },
      { model: "forged" },
      { approval: { actionId: "forged" } },
      { expectedVersion: -1 },
      { proposedSteps: [] },
      { title: " " },
    ]) {
      expect(() =>
        saveGrowthAiBriefEditsSchema.parse({ ...edit, ...extra }),
      ).toThrow();
    }
    expect(() =>
      approveGrowthAiBriefSchema.parse({
        projectId: "project",
        briefId: "brief",
        expectedVersion: 0,
        dueOn: "2026-02-30",
      }),
    ).toThrow();
    expect(() =>
      approveGrowthAiBriefSchema.parse({
        projectId: "project",
        briefId: "brief",
        expectedVersion: 0,
        dueOn: "2026-09-15",
        actorId: "forged",
      }),
    ).toThrow();
  });
});
