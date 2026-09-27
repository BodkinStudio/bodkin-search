import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPage } from "@/server/lib/scrape";
import { GrowthPageMonitorRepository as repo } from "../repositories/GrowthPageMonitorRepository";
import { GrowthChangeEventsService } from "./GrowthChangeEventsService";
import { GrowthPageMonitorService } from "./GrowthPageMonitorService";

vi.mock("@/server/lib/scrape", () => ({ fetchPage: vi.fn() }));
vi.mock("../repositories/GrowthPageMonitorRepository", () => ({
  GrowthPageMonitorRepository: {
    projectDomain: vi.fn(),
    listKeyPageUrls: vi.fn(),
    listActionTargetUrls: vi.fn(),
    latestSnapshots: vi.fn(),
    insertSnapshot: vi.fn(),
  },
}));
vi.mock("./GrowthChangeEventsService", () => ({
  GrowthChangeEventsService: { recordMonitorEvent: vi.fn() },
}));

const lastWeek = {
  capturedAt: "2026-09-20T00:00:00.000Z",
  statusCode: 200,
  resolvedUrl: "https://site.test/",
  title: "Home",
  metaDescription: null,
  h1: null,
  canonical: null,
  indexable: 1,
  wordCount: 0,
  contentHash: null,
};
const now = new Date("2026-09-27T00:00:00.000Z");

beforeEach(() => {
  vi.mocked(repo.projectDomain).mockResolvedValue("site.test");
  vi.mocked(repo.listKeyPageUrls).mockResolvedValue(["/pricing"]);
  vi.mocked(repo.listActionTargetUrls).mockResolvedValue([]);
  vi.mocked(repo.latestSnapshots).mockResolvedValue(
    new Map(
      ["https://site.test/", "https://site.test/pricing"].map((url) => [
        url,
        { ...lastWeek, id: url, url, projectId: "p" },
      ]),
    ),
  );
});

describe("GrowthPageMonitorService.checkPages", () => {
  it("leaves a rate-limited page for next week instead of logging it removed", async () => {
    vi.mocked(fetchPage).mockResolvedValue({
      status: 429,
      resolvedUrl: "https://site.test/",
      text: null,
    });
    await GrowthPageMonitorService.checkPages({ projectId: "p" }, now);
    expect(GrowthChangeEventsService.recordMonitorEvent).not.toHaveBeenCalled();
    expect(repo.insertSnapshot).not.toHaveBeenCalled();
  });

  it("keeps checking the other pages when one fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(fetchPage)
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({
        status: 404,
        resolvedUrl: "https://site.test/pricing",
        text: null,
      });
    const result = await GrowthPageMonitorService.checkPages(
      { projectId: "p" },
      now,
    );
    expect(result.changes).toBe(1);
    expect(repo.insertSnapshot).toHaveBeenCalledTimes(1);
  });
});
