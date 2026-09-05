import { describe, expect, it } from "vitest";
import {
  detectMeasurementsDue,
  parseMeasurementDueEvidenceRef,
} from "./MeasurementDueDetector";

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    actionId: `action_${id}`,
    actionVersion: 2,
    reportTimezone: "Europe/London",
    measurementEnd: "2026-09-01",
    longMeasurementEnd: null,
    actionStatus: "measuring",
    actionStateVersion: 2,
    actionTitle: `Measure ${id}`,
    ...overrides,
  };
}

const input = {
  projectId: "project_1",
  runId: "run_1",
  capturedAt: "2026-09-04T07:00:00.000Z",
};

describe("MeasurementDueDetector", () => {
  it("waits for the final period plus three complete Pacific source days", () => {
    expect(
      detectMeasurementsDue({
        ...input,
        capturedAt: "2026-09-04T06:59:59.999Z",
        candidates: [candidate("primary")],
      }).detections,
    ).toEqual([]);

    const result = detectMeasurementsDue({
      ...input,
      candidates: [
        candidate("long", { longMeasurementEnd: "2026-09-02" }),
        candidate("primary"),
      ],
    });
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]).toMatchObject({
      measurementPlanId: "primary",
      actionId: "action_primary",
      sourceAvailableOn: "2026-09-04",
      signal: {
        signalType: "action_measurement_due",
        entityType: "growth_action",
        entityRef: "action_primary",
        metric: "measurement_review_due",
        severity: "info",
        confidence: 1,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-01",
        baselineValue: 0,
        currentValue: 1,
        deltaValue: 1,
        deltaPercent: null,
        evidenceKind: "manual_observation",
      },
    });
    expect(
      parseMeasurementDueEvidenceRef(
        result.detections[0]?.signal.evidenceRef ?? "",
      ),
    ).toEqual({
      measurementPlanId: "primary",
      actionVersion: 2,
      sourceAvailableOn: "2026-09-04",
    });
  });

  it("suppresses inconsistent Action graphs and orders eligible Plans deterministically", () => {
    const result = detectMeasurementsDue({
      ...input,
      candidates: [
        candidate("z"),
        candidate("missing", {
          actionStatus: null,
          actionStateVersion: null,
          actionTitle: null,
        }),
        candidate("wrong_state", { actionStatus: "implemented" }),
        candidate("wrong_version", { actionStateVersion: 3 }),
        candidate("a"),
      ],
    });
    expect(result.skippedInconsistentCount).toBe(3);
    expect(
      result.detections.map(({ measurementPlanId }) => measurementPlanId),
    ).toEqual(["a", "z"]);
  });

  it("fails closed on malformed windows and rejects malformed evidence references", () => {
    expect(() =>
      detectMeasurementsDue({
        ...input,
        candidates: [candidate("bad", { longMeasurementEnd: "2026-08-31" })],
      }),
    ).toThrow();
    expect(
      parseMeasurementDueEvidenceRef(
        "manual_observation:v1:measurement_due:plan:bad:2026-09-04",
      ),
    ).toBeNull();
  });
});
