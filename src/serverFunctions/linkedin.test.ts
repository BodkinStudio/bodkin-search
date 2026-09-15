import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const registration = vi.hoisted(() => ({
  handlers: [] as Array<
    (input: {
      data: unknown;
      context: { projectId: string };
    }) => Promise<unknown>
  >,
}));
const service = vi.hoisted(() => ({
  import: vi.fn(),
  overview: vi.fn(),
  topPosts: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: (schema: z.ZodType) => ({
        handler: (
          handler: (input: {
            data: unknown;
            context: { projectId: string };
          }) => Promise<unknown>,
        ) => {
          registration.handlers.push(handler);
          return async (input: {
            data: unknown;
            context: { projectId: string };
          }) => {
            schema.parse(input.data);
            return handler(input);
          };
        },
      }),
    }),
  }),
}));
vi.mock("./middleware", () => ({
  requireProjectContext: [],
  requireAuthenticatedContext: [],
}));
vi.mock("@/server/features/linkedin/services/LinkedInPageApiService", () => ({
  LinkedInPageApiService: {},
}));
vi.mock(
  "@/server/features/linkedin/services/LinkedInPageReportingService",
  () => ({
    LinkedInPageReportingService: { overview: service.overview },
  }),
);
vi.mock("@/server/features/linkedin/oauth", () => ({
  createLinkedInAuthorizationUrl: vi.fn(),
}));
vi.mock("@/server/mcp/public-origin", () => ({ getPublicOrigin: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));
vi.mock(
  "@/server/features/linkedin/services/LinkedInPageContentService",
  () => ({
    LinkedInPageContentService: {
      import: service.import,
      topPosts: service.topPosts,
    },
  }),
);

import {
  getLinkedInPageOverview,
  getLinkedInPostPerformance,
  importLinkedInPageContent,
} from "./linkedin";

const context = { projectId: "authorized-project" };
type AsyncCall = (input: unknown) => Promise<unknown>;

function isAsyncCall(value: unknown): value is AsyncCall {
  return typeof value === "function";
}

function invoke(value: unknown, input: unknown) {
  if (!isAsyncCall(value)) throw new Error("Expected an async server function");
  return value(input);
}

const post = {
  postUrl: "https://www.linkedin.com/posts/example",
  postText: "Example",
  publishedAt: "2026-08-02",
  impressions: 10,
  membersReached: null,
  videoViews: null,
  clicks: null,
  reactions: null,
  comments: null,
  reposts: null,
  follows: null,
  providerClickThroughRate: null,
  providerEngagementRate: null,
};

describe("LinkedIn server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.import.mockResolvedValue({ status: "ok" });
    service.overview.mockResolvedValue({ status: "ok" });
    service.topPosts.mockResolvedValue({ status: "ok" });
  });

  it("always uses the project authorized by middleware", async () => {
    await registration.handlers[0]?.({
      data: {
        projectId: "forged",
        pageName: "OpenSEO",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        posts: [post],
      },
      context,
    });
    await registration.handlers[1]?.({
      data: {
        projectId: "forged",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      },
      context,
    });
    await registration.handlers[2]?.({
      data: { projectId: "forged" },
      context,
    });
    expect(service.import).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "authorized-project" }),
    );
    expect(service.overview).toHaveBeenCalledWith({
      projectId: "authorized-project",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(service.topPosts).toHaveBeenCalledWith({
      projectId: "authorized-project",
    });
  });

  it("rejects extra fields and invalid normalized imports", async () => {
    await expect(
      invoke(importLinkedInPageContent, {
        data: {
          projectId: "p",
          pageName: "OpenSEO",
          startDate: "2026-08-01",
          endDate: "2026-08-31",
          posts: [post],
          rawWorkbook: "forged",
        },
        context,
      }),
    ).rejects.toThrow();
    await expect(
      invoke(getLinkedInPageOverview, {
        data: { projectId: "p", token: "forged" },
        context,
      }),
    ).rejects.toThrow();
    expect(getLinkedInPostPerformance).toBeDefined();
  });
});
