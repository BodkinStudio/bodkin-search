import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  click,
  harness,
  renderMeasurementDueCheck,
  resetHarness,
  teardownHarness,
  textContent,
} from "./GrowthPriorityPageChecksTestHarness";

const run = {
  id: "measurement_due",
  status: "completed" as const,
  periodStart: "2026-09-04",
  periodEnd: "2026-09-04",
  startedAt: "2026-09-04T07:00:00.000Z",
  completedAt: "2026-09-04T07:00:01.000Z",
  failureCode: null,
  failureMessage: null,
};

describe("Growth measurement-due check states", () => {
  beforeEach(resetHarness);
  afterEach(teardownHarness);

  it("uses saved schedules without requiring Search Console setup", () => {
    harness.setup = "missing_connection";
    const ready = renderMeasurementDueCheck();
    expect(textContent(ready)).toContain("at least three Pacific days old");
    expect(textContent(ready)).toContain(
      "does not collect Search Console data",
    );
    click(ready, "Record Measurements due");
    expect(harness.measurementDueMutate).toHaveBeenCalledWith("request_1");
    expect(harness.storage.get("growth:measurement-due-check:project_1")).toBe(
      "request_1",
    );
  });

  it("reports saved, empty and bounded-attention results", () => {
    renderMeasurementDueCheck();
    harness.measurementDueMutation?.onSuccess({
      run,
      replayed: false,
      dueCount: 2,
    });
    let html = renderToStaticMarkup(renderMeasurementDueCheck());
    expect(html).toContain("Recorded 2 due Measurement workflow Signals");
    expect(html).toContain('href="#growth-work"');
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthProjectSummary", "project_1"],
    });

    harness.measurementDueMutation?.onSuccess({
      run,
      replayed: true,
      dueCount: 0,
    });
    html = renderToStaticMarkup(renderMeasurementDueCheck());
    expect(html).toContain("Retrieved the saved result");
    expect(html).toContain("No active Measurement has reached");

    harness.measurementDueMutation?.onSuccess({
      run: {
        ...run,
        status: "completed_with_errors",
        failureCode: "MEASUREMENT_SCAN_OVERFLOW",
        failureMessage:
          "More than 50 active Measurements need a separate bounded review.",
      },
      replayed: false,
      dueCount: 0,
    });
    html = renderToStaticMarkup(renderMeasurementDueCheck());
    expect(html).toContain("More than 50 active Measurements");
    expect(html).toContain('role="alert"');
  });

  it("blocks dispatch when retry storage is unavailable", () => {
    harness.storageWriteFails = true;
    click(renderMeasurementDueCheck(), "Record Measurements due");
    expect(harness.measurementDueMutate).not.toHaveBeenCalled();
    expect(textContent(renderMeasurementDueCheck())).toContain(
      "Allow browser session storage before checking due Measurements",
    );
  });
});
