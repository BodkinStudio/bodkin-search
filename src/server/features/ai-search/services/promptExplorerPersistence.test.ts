import type { PromptExplorerInput } from "@/types/schemas/ai-search";
import { beforeEach, describe, expect, it, vi } from "vitest";

const llmResponse = vi.fn();
const getCached = vi.fn();
const setCached = vi.fn();
const savePromptExplorerSnapshot = vi.fn();

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ aiSearch: { llmResponse } }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  AI_SEARCH_PROMPT_CACHE_NAMESPACE: "prompt",
  buildCacheKey: async () => "cache-key",
  getCached,
  setCached,
}));
vi.mock(
  "@/server/features/ai-search/repositories/PromptExplorerSnapshotRepository",
  () => ({
    savePromptExplorerSnapshot,
  }),
);

const { explorePrompt } = await import("./promptExplorer");

const input: PromptExplorerInput = {
  projectId: "project-1",
  prompt: "What is OpenSEO?",
  models: ["chat_gpt"],
  webSearch: true,
  webSearchCountryCode: "GB" as const,
};
const billing = {
  organizationId: "org-1",
  userId: "test-user",
  userEmail: "test@example.com",
};
const upstream = {
  model_name: "gpt-5",
  web_search: true,
  output_tokens: 12,
  items: [
    {
      type: "message",
      sections: [
        {
          type: "text",
          text: "An answer",
          annotations: [
            { title: "Source", url: "https://example.test/source" },
          ],
        },
      ],
    },
  ],
};

describe("Prompt Explorer snapshot persistence and cache provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCached.mockResolvedValue(undefined);
  });
  it("preserves fresh status without inventing a generation timestamp", async () => {
    getCached.mockResolvedValue(null);
    llmResponse.mockResolvedValue(upstream);
    setCached.mockResolvedValue(undefined);
    savePromptExplorerSnapshot.mockResolvedValue("snapshot-1");
    const result = await explorePrompt(input, billing);
    expect(result.snapshotId).toBe("snapshot-1");
    expect(result.snapshotSaveError).toBeUndefined();
    expect(result.results[0]).toMatchObject({
      status: "success",
      cacheProvenance: { source: "fresh" },
    });
    expect(
      result.results[0]?.status === "success" &&
        result.results[0].cacheProvenance?.generatedAt,
    ).toBeNull();
    expect(savePromptExplorerSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        webSearch: true,
        webSearchCountryCode: "GB",
      }),
    );
  });

  it("reports cached delivery without treating legacy receipt times as generation evidence", async () => {
    getCached.mockResolvedValue({
      status: "success",
      model: "chat_gpt",
      modelName: "gpt-5",
      text: "Cached",
      citations: [],
      fanOutQueries: [],
      brandMentioned: null,
      outputTokens: 1,
      webSearch: true,
      cacheProvenance: {
        source: "fresh",
        generatedAt: "2026-09-01T00:00:00.000Z",
      },
    });
    savePromptExplorerSnapshot.mockResolvedValue("snapshot-2");
    const result = await explorePrompt(input, billing);
    expect(llmResponse).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      status: "success",
      cacheProvenance: {
        source: "cached",
        generatedAt: null,
      },
    });
  });

  it("marks legacy cache entries as unknown instead of inventing a generation time", async () => {
    getCached.mockResolvedValue({
      status: "success",
      model: "chat_gpt",
      modelName: "gpt-5",
      text: "Legacy",
      citations: [],
      fanOutQueries: [],
      brandMentioned: null,
      outputTokens: 1,
      webSearch: true,
    });
    savePromptExplorerSnapshot.mockResolvedValue("snapshot-3");
    const result = await explorePrompt(input, billing);
    expect(result.results[0]).toMatchObject({
      status: "success",
      cacheProvenance: { source: "cached", generatedAt: null },
    });
  });

  it("keeps usable paid results when persistence fails and returns a visible warning", async () => {
    getCached.mockResolvedValue(null);
    llmResponse.mockResolvedValue(upstream);
    savePromptExplorerSnapshot.mockRejectedValue(
      new Error("database unavailable"),
    );
    const result = await explorePrompt(input, billing);
    expect(result.snapshotId).toBeUndefined();
    expect(result.snapshotSaveError).toContain("could not be saved");
    expect(result.results[0]).toMatchObject({
      status: "success",
      text: "An answer",
    });
  });
});
