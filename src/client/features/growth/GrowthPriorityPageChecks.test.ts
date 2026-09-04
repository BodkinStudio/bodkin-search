import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  click,
  findButton,
  harness,
  render,
  resetHarness,
  teardownHarness,
  textContent,
} from "./GrowthPriorityPageChecksTestHarness";

describe("Growth check retry identity", () => {
  beforeEach(resetHarness);
  afterEach(teardownHarness);

  it("persists before dispatch and reuses an uncertain request after a full remount", () => {
    harness.mutate.mockImplementation((key: string) => {
      expect(harness.storage.get("growth:priority-page-check:project_1")).toBe(
        key,
      );
    });
    click(render(), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");

    harness.isError = true;
    click(render(), "Retry previous request");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");

    harness.states = []; // A navigation/reload loses all component state.
    harness.isError = false;
    click(render(), "Retry previous request");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.sequence).toBe(1);
  });

  it("retains a running replay, then clears only a known terminal outcome", () => {
    click(render(), "Run check");
    harness.mutation?.onSuccess({ run: { id: "run_1", status: "running" } });
    harness.states = [];
    click(render(), "Retry previous request");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");

    harness.mutation?.onSuccess({ run: { id: "run_1", status: "completed" } });
    expect(harness.storage.has("growth:priority-page-check:project_1")).toBe(
      false,
    );
    click(render(), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
  });

  it("requires an explicit new attempt to replace an unresolved request", () => {
    click(render(), "Run check");
    click(render(), "Start new check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
    expect(harness.storage.get("growth:priority-page-check:project_1")).toBe(
      "request_2",
    );
  });

  it("keeps pending requests scoped to their project", () => {
    click(render(), "Run check");
    harness.states = [];
    click(render("project_2"), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
    expect(harness.storage.get("growth:priority-page-check:project_1")).toBe(
      "request_1",
    );
    expect(harness.storage.get("growth:priority-page-check:project_2")).toBe(
      "request_2",
    );
  });

  it("does not dispatch if it cannot persist the retry identity", () => {
    harness.storageWriteFails = true;
    click(render(), "Run check");
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(harness.states[1]).toContain("Allow browser session storage");
  });

  it("rejects malformed persisted request identities", () => {
    harness.storage.set(
      "growth:priority-page-check:project_1",
      "unsafe / nonce",
    );
    click(render(), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");
  });

  it("keeps ranking-opportunity retries separate from decline-check retries", () => {
    click(render(), "Find ranking opportunities");
    expect(harness.strikingMutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(
      harness.storage.get("growth:striking-distance-check:project_1"),
    ).toBe("request_1");
    expect(harness.storage.has("growth:priority-page-check:project_1")).toBe(
      false,
    );

    harness.states = [];
    click(render(), "Retry ranking-opportunity request");
    expect(harness.strikingMutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.sequence).toBe(1);

    click(render(), "Start new ranking-opportunity check");
    expect(harness.strikingMutate).toHaveBeenLastCalledWith("request_2");
    expect(
      harness.storage.get("growth:striking-distance-check:project_1"),
    ).toBe("request_2");
  });

  it("describes eligibility and disables the native action without setup", () => {
    harness.setup = "missing_key_pages";
    const tree = render();
    expect(textContent(tree)).toContain("positions 5–20");
    expect(textContent(tree)).toContain("configured priority pages");
    expect(textContent(tree)).toContain("at least 50 impressions");
    expect(textContent(tree)).toContain("current final 28-day window");
    expect(textContent(tree)).toContain("preceding 28 days as evidence");
    expect(findButton(tree, "Find ranking opportunities")?.props.disabled).toBe(
      true,
    );
  });

  it("announces and locks the ranking-opportunity action while pending", () => {
    harness.strikingIsPending = true;
    const tree = render();
    const button = findButton(tree, "Finding opportunities…");
    expect(button?.props.disabled).toBe(true);
    expect(button?.props["aria-busy"]).toBe(true);
    expect(textContent(tree)).toContain(
      "Finding ranking opportunities in final Search Console data",
    );
  });

  it("does not dispatch a ranking-opportunity check if retry storage fails", () => {
    harness.storageWriteFails = true;
    click(render(), "Find ranking opportunities");
    expect(harness.strikingMutate).not.toHaveBeenCalled();
    expect(textContent(render())).toContain(
      "Allow browser session storage before finding ranking opportunities",
    );
  });

  it("reports saved and already-covered opportunities and refreshes their reads", () => {
    click(render(), "Find ranking opportunities");
    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_1",
        status: "completed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: null,
        failureMessage: null,
      },
      replayed: false,
      candidateCount: 3,
      savedOpportunityCount: 2,
      alreadyCoveredCount: 1,
    });

    const html = renderToStaticMarkup(render());
    expect(html).toContain(
      "Found 3 eligible ranking opportunities. Newly saved: 2. Already covered: 1.",
    );
    expect(html).toContain('href="#growth-opportunities"');
    expect(
      harness.storage.has("growth:striking-distance-check:project_1"),
    ).toBe(false);
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthPriorityRecommendations", "project_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthProjectSummary", "project_1"],
    });
  });

  it("distinguishes no eligible result from incomplete and failed checks", () => {
    render();
    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_empty",
        status: "completed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: null,
        failureMessage: null,
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    expect(renderToStaticMarkup(render())).toContain(
      "No eligible ranking opportunities were found",
    );

    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_incomplete",
        status: "completed_with_errors",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: "INCOMPLETE_QUERY_INVENTORY",
        failureMessage: "Search Console returned incomplete query data.",
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    expect(renderToStaticMarkup(render())).toContain(
      "query data was incomplete, so no ranking opportunity was saved",
    );

    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_failed",
        status: "failed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: "SEARCH_CONSOLE_UNAVAILABLE",
        failureMessage: "Search Console query data could not be read.",
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    const failed = renderToStaticMarkup(render());
    expect(failed).toContain("ranking-opportunity check failed");
    expect(failed).toContain("Search Console query data could not be read");
  });
});
