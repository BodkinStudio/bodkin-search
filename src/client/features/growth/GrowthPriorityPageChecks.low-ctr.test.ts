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

describe("Growth low-CTR check states", () => {
  beforeEach(resetHarness);
  afterEach(teardownHarness);

  it("keeps low-CTR retry identity separate and refuses an unrecoverable dispatch", () => {
    harness.lowCtrMutate.mockImplementation((key: string) => {
      expect(harness.storage.get("growth:low-ctr-check:project_1")).toBe(key);
    });
    click(render(), "Find low-CTR opportunities");
    expect(harness.lowCtrMutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(harness.strikingMutate).not.toHaveBeenCalled();

    harness.states = [];
    click(render(), "Retry low-CTR request");
    expect(harness.lowCtrMutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.sequence).toBe(1);

    click(render(), "Start new low-CTR check");
    expect(harness.lowCtrMutate).toHaveBeenLastCalledWith("request_2");

    harness.states = [];
    harness.storage.clear();
    harness.storageWriteFails = true;
    click(render(), "Find low-CTR opportunities");
    expect(harness.lowCtrMutate).toHaveBeenCalledTimes(3);
    expect(textContent(render())).toContain(
      "Allow browser session storage before finding low-CTR opportunities",
    );
  });

  it("shows low-CTR eligibility, disabled setup, pending and running states", () => {
    const ready = render();
    expect(textContent(ready)).toContain("at least 100 impressions");
    expect(textContent(ready)).toContain("remain in the top four");
    expect(textContent(ready)).toContain("at least one percentage point");
    expect(textContent(ready)).toContain(
      "25% of their prior click-through rate",
    );
    expect(
      findButton(ready, "Find low-CTR opportunities")?.props.disabled,
    ).toBe(false);

    harness.setup = "missing_connection";
    expect(
      findButton(render(), "Find low-CTR opportunities")?.props.disabled,
    ).toBe(true);

    harness.setup = "ready";
    harness.lowCtrIsPending = true;
    const pending = render();
    const pendingButton = findButton(pending, "Checking click-through rates…");
    expect(pendingButton?.props.disabled).toBe(true);
    expect(pendingButton?.props["aria-busy"]).toBe(true);
    expect(textContent(pending)).toContain("Checking click-through rates…");

    harness.lowCtrIsPending = false;
    click(render(), "Find low-CTR opportunities");
    harness.lowCtrMutation?.onSuccess({
      run: {
        id: "low_ctr_running",
        status: "running",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: null,
        failureCode: null,
        failureMessage: null,
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    expect(renderToStaticMarkup(render())).toContain(
      "This low-CTR check is still running",
    );
    expect(harness.storage.get("growth:low-ctr-check:project_1")).toBe(
      "request_1",
    );
  });

  it("reports low-CTR success, empty, incomplete and failed terminal outcomes", () => {
    render();
    harness.lowCtrMutation?.onSuccess({
      run: {
        id: "low_ctr_success",
        status: "completed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: null,
        failureMessage: null,
      },
      replayed: false,
      candidateCount: 2,
      savedOpportunityCount: 1,
      alreadyCoveredCount: 1,
    });
    let html = renderToStaticMarkup(render());
    expect(html).toContain(
      "Found 2 eligible low-CTR opportunities. Newly saved: 1. Already covered: 1.",
    );
    expect(html).toContain('href="#growth-opportunities"');
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthPriorityRecommendations", "project_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthProjectSummary", "project_1"],
    });

    harness.lowCtrMutation?.onSuccess({
      run: {
        id: "low_ctr_empty",
        status: "completed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: null,
        failureMessage: null,
      },
      replayed: true,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    html = renderToStaticMarkup(render());
    expect(html).toContain("Retrieved the saved result");
    expect(html).toContain("No eligible low-CTR opportunities were found");

    harness.lowCtrMutation?.onSuccess({
      run: {
        id: "low_ctr_incomplete",
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
      "query data was incomplete, so no low-CTR opportunity was saved",
    );

    harness.lowCtrMutation?.onSuccess({
      run: {
        id: "low_ctr_failed",
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
    html = renderToStaticMarkup(render());
    expect(html).toContain("The low-CTR check failed");
    expect(html).toContain("Search Console query data could not be read");

    harness.lowCtrIsError = true;
    html = renderToStaticMarkup(render());
    expect(html).toContain("safe test error");
    expect(html).toContain('role="alert"');
  });
});
