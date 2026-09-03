/* eslint-disable max-lines -- retry identity and bounded result rendering share one feature contract */
import { Children, createElement, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthMonthlyReviewResponse } from "@/types/schemas/growth-monthly-review";

type MutationOptions = {
  onSuccess: (saved: GrowthMonthlyReviewResponse) => void;
  onError: () => void;
  onSettled: () => void;
};
type NodeProps = {
  children?: ReactNode;
  onClick?: () => void;
};

const completed: Extract<GrowthMonthlyReviewResponse, { replayed: false }> = {
  replayed: false,
  consistency: "current_not_snapshot",
  run: {
    id: "review_1",
    status: "completed",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    startedAt: "2026-09-03T08:00:00.000Z",
    completedAt: "2026-09-03T08:01:00.000Z",
    failureCode: null,
    failureMessage: null,
  },
  check: {
    replayed: false,
    run: {
      id: "check_1",
      status: "completed",
      periodStart: "2026-07-07",
      periodEnd: "2026-09-01",
      startedAt: "2026-09-03T08:00:00.000Z",
      completedAt: "2026-09-03T08:00:30.000Z",
    },
  },
  dueMeasurements: {
    scanState: "complete",
    items: [
      {
        id: "measurement_1",
        actionId: "action_1",
        actionTitle: {
          value: "Review pricing page",
          redacted: false,
          truncated: false,
        },
        availableOn: "2026-09-01",
        reportTimezone: "Europe/London",
        actionStatus: "measuring",
        integrity: "consistent",
      },
    ],
    hasMore: false,
  },
  report: {
    state: "no_activity",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    reportTimezone: "Europe/London",
    message: "No eligible saved activity was found.",
  },
  warnings: [],
};

const partial: Extract<GrowthMonthlyReviewResponse, { replayed: false }> = {
  ...completed,
  run: {
    ...completed.run,
    status: "completed_with_errors",
    failureCode: "MONTHLY_REVIEW_PARTIAL",
    failureMessage:
      "Monthly review completed with one or more incomplete phases.",
  },
  dueMeasurements: {
    scanState: "overflow",
    items: [],
    hasMore: true,
  },
  report: null,
  warnings: ["DUE_MEASUREMENTS_OVERFLOW", "MONTHLY_REPORT_FAILED"],
};

const runningReplay: GrowthMonthlyReviewResponse = {
  replayed: true,
  run: {
    id: "review_1",
    status: "running",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    startedAt: "2026-09-03T08:00:00.000Z",
    completedAt: null,
    failureCode: null,
    failureMessage: null,
  },
};

const runningCheck: Extract<GrowthMonthlyReviewResponse, { replayed: false }> =
  {
    ...partial,
    check: {
      replayed: false,
      run: {
        id: "check_running",
        status: "running",
        periodStart: "2026-07-07",
        periodEnd: "2026-09-01",
        startedAt: "2026-09-03T08:00:00.000Z",
        completedAt: null,
      },
    },
    dueMeasurements: null,
    report: null,
    warnings: ["PRIORITY_PAGE_CHECK_RUNNING"],
  };

const harness = vi.hoisted(() => ({
  stateCursor: 0,
  states: [] as unknown[],
  refCursor: 0,
  refs: [
    { current: false },
    { current: null as { focus: () => void } | null },
    { current: null as { focus: () => void } | null },
    { current: null as { focus: () => void } | null },
    { current: null as { focus: () => void } | null },
  ],
  effects: [] as Array<() => void>,
  mutation: undefined as MutationOptions | undefined,
  mutate: vi.fn(),
  reset: vi.fn(),
  invalidate: vi.fn(),
  pending: false,
  error: false,
  storage: new Map<string, string>(),
  storageWriteFails: false,
  sequence: 0,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.stateCursor++;
      if (!(index in harness.states))
        harness.states[index] =
          typeof initial === "function"
            ? Reflect.apply(initial, undefined, [])
            : initial;
      return [
        harness.states[index],
        (value: unknown) => {
          harness.states[index] = value;
        },
      ];
    },
    useRef: () => harness.refs[harness.refCursor++],
    useEffect: (effect: () => void) => harness.effects.push(effect),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: MutationOptions) => {
    harness.mutation = options;
    return {
      mutate: harness.mutate,
      reset: harness.reset,
      isPending: harness.pending,
      isError: harness.error,
      error: new Error("private transport detail"),
    };
  },
  useQueryClient: () => ({ invalidateQueries: harness.invalidate }),
}));

vi.mock("@/serverFunctions/growthMonthlyReview", () => ({
  runGrowthMonthlyReview: vi.fn(),
}));

import { GrowthMonthlyReview } from "./GrowthMonthlyReview";
import { GrowthMonthlyReviewResult } from "./GrowthMonthlyReviewResult";

function textFor(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<NodeProps>(node)) return "";
  return Children.toArray(node.props.children).map(textFor).join("");
}

function findButton(node: ReactNode, label: string): NodeProps | null {
  if (!isValidElement<NodeProps>(node)) return null;
  if (node.type === "button" && textFor(node) === label) return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = findButton(child, label);
    if (match) return match;
  }
  return null;
}

function resetMount() {
  harness.states = [];
  harness.refs = [
    { current: false },
    { current: null },
    { current: null },
    { current: null },
    { current: null },
  ];
  harness.effects = [];
}

function render(projectId = "project_1", onOpenCheck = vi.fn()) {
  harness.stateCursor = 0;
  harness.refCursor = 0;
  harness.effects = [];
  return GrowthMonthlyReview({ projectId, onOpenCheck });
}

function runEffects() {
  for (const effect of harness.effects) effect();
}

function click(tree: ReactNode, label: string) {
  const button = findButton(tree, label);
  expect(button, label).not.toBeNull();
  button?.onClick?.();
}

function runNewReview(projectId = "project_1", onOpenCheck = vi.fn()) {
  click(render(projectId, onOpenCheck), "Run monthly review");
  click(render(projectId, onOpenCheck), "Run review now");
}

beforeEach(() => {
  resetMount();
  harness.mutate.mockReset();
  harness.reset.mockReset();
  harness.invalidate.mockReset();
  harness.pending = false;
  harness.error = false;
  harness.storage.clear();
  harness.storageWriteFails = false;
  harness.sequence = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `request_${++harness.sequence}`,
  });
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => harness.storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (harness.storageWriteFails) throw new Error("Storage unavailable");
        harness.storage.set(key, value);
      },
      removeItem: (key: string) => harness.storage.delete(key),
    },
  });
});

describe("Growth monthly review", () => {
  it("renders bounded phase outcomes and human-readable warnings", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthMonthlyReviewResult, {
        result: partial,
        onOpenCheck: vi.fn(),
      }),
    );

    expect(html).toContain("Needs attention");
    expect(html).toContain("Priority-page check");
    expect(html).toContain("Review required");
    expect(html).toContain("Monthly summary");
    expect(html).toContain('href="#growth-live-check-title"');
    expect(html).toContain('href="#growth-work"');
    expect(html).toContain('href="#growth-monthly-summary"');
    expect(html).toContain("More Measurements need review");
    expect(html).toContain("Growth could not prepare the monthly summary");
    expect(html).toContain("The list may change as time passes");
    expect(html).not.toContain("Attention needed");
    expect(html).not.toContain("DUE_MEASUREMENTS_OVERFLOW");
    expect(html).not.toContain("MONTHLY_REPORT_FAILED");
  });

  it("states the bounded truth for a running replay", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthMonthlyReviewResult, {
        result: runningReplay,
        onOpenCheck: vi.fn(),
      }),
    );
    expect(html).toContain("still marked running");
    expect(html).toContain("does not promise background completion");
    expect(html).toContain("does not reconstruct the individual phase results");
  });

  it("marks later phases not started while the child check is running", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthMonthlyReviewResult, {
        result: runningCheck,
        onOpenCheck: vi.fn(),
      }),
    );

    expect(html).toContain("Still running");
    expect(html.match(/Not started/g)).toHaveLength(2);
    expect(html).toContain("Waiting for the priority-page check");
    expect(html).not.toContain("due-Measurement queue could not be read");
    expect(html).not.toContain("No monthly summary result was returned");
  });

  it("persists before dispatch and reuses an uncertain key after remount", () => {
    harness.mutate.mockImplementation((key: string) => {
      expect(harness.storage.get("growth:monthly-review:project_1")).toBe(key);
    });
    runNewReview();
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");

    harness.mutation?.onError();
    harness.mutation?.onSettled();
    harness.error = true;
    resetMount();
    const uncertain = render();
    expect(renderToStaticMarkup(uncertain)).not.toContain(
      "private transport detail",
    );
    click(uncertain, "Retry previous request");
    click(render(), "Retry saved request");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.sequence).toBe(1);
  });

  it("clears a terminal key and refreshes affected views", () => {
    const onOpenCheck = vi.fn();
    runNewReview("project_1", onOpenCheck);
    harness.mutation?.onSuccess(completed);
    harness.mutation?.onSettled();

    expect(harness.storage.has("growth:monthly-review:project_1")).toBe(false);
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthOperatingOverview", "project_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthChecks", "project_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthPriorityRecommendations", "project_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthMonthlyReport", "project_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthCheckRun", "project_1", "check_1"],
    });

    const tree = render("project_1", onOpenCheck);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("1 due");
    expect(html).toContain("Run another review");
  });

  it("retains a running replay and makes a separate attempt explicit", () => {
    runNewReview();
    harness.mutation?.onSuccess(runningReplay);
    harness.mutation?.onSettled();
    expect(harness.storage.get("growth:monthly-review:project_1")).toBe(
      "request_1",
    );

    const tree = render();
    expect(renderToStaticMarkup(tree)).toContain("still marked running");
    click(tree, "Start new review");
    click(render(), "Run review now");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
    expect(harness.storage.get("growth:monthly-review:project_1")).toBe(
      "request_2",
    );
  });

  it("keeps pending identities project-scoped and ignores malformed storage", () => {
    runNewReview("project_1");
    expect(harness.storage.get("growth:monthly-review:project_1")).toBe(
      "request_1",
    );

    harness.mutation?.onSettled();
    harness.storage.set("growth:monthly-review:project_2", "unsafe / key");
    resetMount();
    runNewReview("project_2");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
    expect(harness.storage.get("growth:monthly-review:project_1")).toBe(
      "request_1",
    );
    expect(harness.storage.get("growth:monthly-review:project_2")).toBe(
      "request_2",
    );
  });

  it("blocks dispatch without retry storage and locks same-tick duplicates", () => {
    const focusPrimaryAction = vi.fn();
    harness.refs[3].current = { focus: focusPrimaryAction };
    harness.storageWriteFails = true;
    click(render(), "Run monthly review");
    click(render(), "Run review now");
    expect(harness.mutate).not.toHaveBeenCalled();
    const blocked = render();
    expect(textFor(blocked)).toContain("Allow browser session storage");
    expect(textFor(blocked)).toContain("Check storage and run");
    runEffects();
    expect(focusPrimaryAction).toHaveBeenCalledOnce();

    harness.storageWriteFails = false;
    click(blocked, "Check storage and run");
    expect(harness.mutate).not.toHaveBeenCalled();

    const confirmation = render();
    expect(textFor(confirmation)).toContain("Run a monthly review now?");
    click(confirmation, "Run review now");
    click(confirmation, "Run review now");
    expect(harness.mutate).toHaveBeenCalledTimes(1);
  });

  it("requires an inline confirmation and allows cancellation", () => {
    const focusPrimaryAction = vi.fn();
    harness.refs[3].current = { focus: focusPrimaryAction };
    click(render(), "Run monthly review");
    const confirmation = render();

    expect(textFor(confirmation)).toContain("Run a monthly review now?");
    expect(textFor(confirmation)).toContain("it will not publish anything");
    expect(harness.mutate).not.toHaveBeenCalled();

    click(confirmation, "Cancel");
    const cancelled = render();
    expect(textFor(cancelled)).not.toContain("Run a monthly review now?");
    runEffects();
    expect(focusPrimaryAction).toHaveBeenCalledOnce();
    expect(harness.mutate).not.toHaveBeenCalled();
  });

  it("returns focus to the separate-review action after cancellation", () => {
    harness.storage.set("growth:monthly-review:project_1", "request_1");
    resetMount();
    const focusNewReviewAction = vi.fn();
    harness.refs[4].current = { focus: focusNewReviewAction };

    click(render(), "Start new review");
    const confirmation = render();
    click(confirmation, "Cancel");
    render();
    runEffects();

    expect(focusNewReviewAction).toHaveBeenCalledOnce();
    expect(harness.mutate).not.toHaveBeenCalled();
  });
});
