import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  click,
  findButton,
  harness,
  renderPersistentRankDropCheck,
  resetHarness,
  teardownHarness,
  textContent,
} from "./GrowthPriorityPageChecksTestHarness";

const run = {
  id: "rank_drop",
  status: "completed" as const,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-22",
  startedAt: "2026-09-01T00:00:00.000Z",
  completedAt: "2026-09-01T00:01:00.000Z",
  failureCode: null,
  failureMessage: null,
};

describe("Growth persistent rank-drop check states", () => {
  beforeEach(resetHarness);
  afterEach(teardownHarness);

  it("uses a separate retry identity and does not require Search Console", () => {
    harness.setup = "missing_connection";
    const ready = renderPersistentRankDropCheck();
    expect(textContent(ready)).toContain("three consecutive later full checks");
    expect(textContent(ready)).toContain("does not run a new paid rank check");
    expect(
      findButton(ready, "Find persistent rank drops")?.props.disabled,
    ).toBe(false);
    click(ready, "Find persistent rank drops");
    expect(harness.persistentRankDropMutate).toHaveBeenCalledWith("request_1");
    expect(
      harness.storage.get("growth:persistent-rank-drop-check:project_1"),
    ).toBe("request_1");
    expect(harness.lowCtrMutate).not.toHaveBeenCalled();

    harness.states = [];
    click(
      renderPersistentRankDropCheck(),
      "Retry persistent rank-drop request",
    );
    expect(harness.persistentRankDropMutate).toHaveBeenLastCalledWith(
      "request_1",
    );
    click(
      renderPersistentRankDropCheck(),
      "Start new persistent rank-drop check",
    );
    expect(harness.persistentRankDropMutate).toHaveBeenLastCalledWith(
      "request_2",
    );
  });

  it("reports saved, empty and insufficient-history results", () => {
    renderPersistentRankDropCheck();
    harness.persistentRankDropMutation?.onSuccess({
      run,
      replayed: false,
      candidateCount: 2,
      savedOpportunityCount: 1,
      alreadyCoveredCount: 1,
    });
    let html = renderToStaticMarkup(renderPersistentRankDropCheck());
    expect(html).toContain(
      "Found 2 persistent rank drops. Newly saved: 1. Already covered: 1.",
    );
    expect(html).toContain('href="#growth-opportunities"');
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthPriorityRecommendations", "project_1"],
    });

    harness.persistentRankDropMutation?.onSuccess({
      run,
      replayed: true,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    html = renderToStaticMarkup(renderPersistentRankDropCheck());
    expect(html).toContain("Retrieved the saved result");
    expect(html).toContain(
      "No tracked keyword stayed at least three positions below its baseline",
    );

    harness.persistentRankDropMutation?.onSuccess({
      run: {
        ...run,
        status: "completed_with_errors",
        failureCode: "INSUFFICIENT_RANK_HISTORY",
        failureMessage:
          "Rank tracking needs four completed full checks before persistent drops can be detected.",
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    html = renderToStaticMarkup(renderPersistentRankDropCheck());
    expect(html).toContain("needs four completed full checks");
    expect(html).toContain('role="alert"');
  });

  it("blocks dispatch when retry storage is unavailable", () => {
    harness.storageWriteFails = true;
    click(renderPersistentRankDropCheck(), "Find persistent rank drops");
    expect(harness.persistentRankDropMutate).not.toHaveBeenCalled();
    expect(textContent(renderPersistentRankDropCheck())).toContain(
      "Allow browser session storage before finding persistent rank drops",
    );
  });
});
