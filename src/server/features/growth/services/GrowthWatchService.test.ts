import { describe, expect, it, vi } from "vitest";
import { GrowthWatchService, isoWeekKey } from "./GrowthWatchService";

const checks = vi.hoisted(() => ({
  strikingDistance: vi.fn(),
  lowCtr: vi.fn(),
  rankDrop: vi.fn(),
  auditIssue: vi.fn(),
  measurementDue: vi.fn(),
}));
vi.mock("../repositories/GrowthWatchRepository", () => ({
  GrowthWatchRepository: { listWatchedProjectIds: vi.fn() },
}));
vi.mock("./GrowthStrikingDistanceCheckService", () => ({
  GrowthStrikingDistanceCheckService: { runCheck: checks.strikingDistance },
}));
vi.mock("./GrowthLowCtrCheckService", () => ({
  GrowthLowCtrCheckService: { runCheck: checks.lowCtr },
}));
vi.mock("./GrowthPersistentRankDropCheckService", () => ({
  GrowthPersistentRankDropCheckService: { runCheck: checks.rankDrop },
}));
vi.mock("./GrowthCriticalAuditIssueCheckService", () => ({
  GrowthCriticalAuditIssueCheckService: { runCheck: checks.auditIssue },
}));
vi.mock("./GrowthMeasurementDueCheckService", () => ({
  GrowthMeasurementDueCheckService: { runCheck: checks.measurementDue },
}));

describe("Growth watch", () => {
  it("keys the week the ISO way across a year boundary", () => {
    expect(isoWeekKey(new Date("2026-09-27T12:00:00Z"))).toBe("2026-W39");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
  });

  it("runs every check with the week's key even when one fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    checks.rankDrop.mockRejectedValue(new Error("no rank tracking"));
    const results = await GrowthWatchService.watchProject(
      "project",
      new Date("2026-09-27T12:00:00Z"),
    );
    expect(results).toMatchObject({ rank_drop: "failed", low_ctr: "ok" });
    for (const check of Object.values(checks))
      expect(check).toHaveBeenCalledWith({
        projectId: "project",
        requestKey: "watch-2026-W39",
      });
  });
});
