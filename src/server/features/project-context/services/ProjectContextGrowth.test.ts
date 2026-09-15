import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyContextUpdates,
  renderProjectContextMarkdown,
} from "./ProjectContextService";

const mocks = vi.hoisted(() => ({
  listSections: vi.fn(),
  upsertSection: vi.fn(),
  deleteSection: vi.fn(),
  listCompetitors: vi.fn(),
  upsertCompetitors: vi.fn(),
  deleteCompetitors: vi.fn(),
  listKeyPages: vi.fn(),
  upsertKeyPages: vi.fn(),
  deleteKeyPages: vi.fn(),
  listResearchLog: vi.fn(),
  appendResearchLogEntry: vi.fn(),
  pruneResearchLogBefore: vi.fn(),
}));

vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: mocks }),
);

vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: (tx: unknown) => readonly Promise<unknown>[]) => {
    for (const statement of build({})) await statement;
  },
}));

describe("Project Context Growth key pages", () => {
  beforeEach(() => {
    mocks.listSections.mockResolvedValue([]);
    mocks.listCompetitors.mockResolvedValue([]);
    mocks.listKeyPages.mockResolvedValue([]);
    mocks.listResearchLog.mockResolvedValue([]);
  });

  it("accepts project subdomains and forwards explicit Growth metadata", async () => {
    await applyContextUpdates(
      { projectId: "project_1", projectDomain: "acme.com" },
      [
        {
          addKeyPages: [
            {
              url: "https://Shop.Acme.com/pricing",
              commercialWeight: 5,
              protected: false,
              activelyOptimized: true,
            },
          ],
        },
      ],
      "user",
    );

    expect(mocks.upsertKeyPages).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      [
        {
          url: "https://shop.acme.com/pricing",
          role: null,
          topic: null,
          notes: null,
          commercialWeight: 5,
          protected: false,
          activelyOptimized: true,
        },
      ],
      "user",
    );
  });

  it.each([
    ["https://notacme.com/pricing", "acme.com"],
    ["https://acme.com.evil.test/pricing", "acme.com"],
    ["https://blog.acme.com/pricing", "shop.acme.com"],
  ])("rejects off-project key page %s", async (url, projectDomain) => {
    await expect(
      applyContextUpdates(
        { projectId: "project_1", projectDomain },
        [{ addKeyPages: [{ url }] }],
        "user",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.upsertKeyPages).not.toHaveBeenCalled();
  });

  it("rejects key-page additions when the project has no primary domain", async () => {
    await expect(
      applyContextUpdates(
        { projectId: "project_1", projectDomain: null },
        [{ addKeyPages: [{ url: "https://acme.com/pricing" }] }],
        "user",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.upsertKeyPages).not.toHaveBeenCalled();
  });

  it("rejects key-page URLs containing embedded credentials", async () => {
    await expect(
      applyContextUpdates(
        { projectId: "project_1", projectDomain: "acme.com" },
        [
          {
            addKeyPages: [{ url: "https://user:secret@acme.com/pricing" }],
          },
        ],
        "user",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.upsertKeyPages).not.toHaveBeenCalled();
  });

  it("resolves the whole batch before an off-domain key page can write", async () => {
    await expect(
      applyContextUpdates(
        { projectId: "project_1", projectDomain: "acme.com" },
        [
          { section: "current_goal", content: "Grow signups" },
          { addKeyPages: [{ url: "https://evil.test/pricing" }] },
        ],
        "user",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.upsertSection).not.toHaveBeenCalled();
    expect(mocks.upsertKeyPages).not.toHaveBeenCalled();
  });

  it("allows removal of a legacy off-domain page without a project domain", async () => {
    await applyContextUpdates(
      { projectId: "project_1", projectDomain: null },
      [{ removeKeyPages: ["https://legacy.test/page"] }],
      "user",
    );

    expect(mocks.deleteKeyPages).toHaveBeenCalledWith(
      expect.anything(),
      "project_1",
      ["https://legacy.test/page"],
    );
  });

  it("renders key-page Growth metadata for SAM and MCP readers", () => {
    const markdown = renderProjectContextMarkdown({
      sections: [],
      missingSections: [],
      customSections: [],
      competitors: [],
      keyPages: [
        {
          id: "page_1",
          url: "https://acme.com/pricing",
          role: "money",
          topic: "Pricing",
          notes: null,
          commercialWeight: 5,
          protected: true,
          activelyOptimized: true,
          updatedAt: "2026-08-29T10:00:00.000Z",
          updatedBy: "user",
        },
      ],
      researchLog: [],
    });

    expect(markdown).toContain(
      "https://acme.com/pricing — money · Pricing · commercial weight 5, protected, actively optimized",
    );
  });
});
