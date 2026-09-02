import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GrowthInvestigationReviewInput,
  GrowthInvestigationView,
} from "@/types/schemas/growth-investigations";
import { GrowthInvestigationReview } from "./GrowthInvestigation";
import { GrowthInvestigationForm } from "./GrowthInvestigationForm";
import {
  GrowthInvestigationMutationFailure,
  GrowthInvestigationReviewControls,
  type GrowthDismissalReason,
} from "./GrowthInvestigationReviewControls";

type MutationOptions = {
  onSuccess?: (value: GrowthInvestigationView) => void;
  onError?: (error: Error) => void;
  onSettled: () => void;
};

const proposal: GrowthInvestigationView = {
  relationship: "controller",
  recommendationId: "recommendation_1",
  title: "Investigate",
  rationale: "Cause unknown",
  steps: ["Check the evidence"],
  displayUrls: [],
  status: "proposed",
  reviewVersion: 0,
  dismissalReason: null,
  snoozedUntil: null,
  actionId: null,
  dueOn: null,
  templateVersion: "v1",
};
let queryData: GrowthInvestigationView = proposal;

const harness = vi.hoisted(() => ({
  stateCursor: 0,
  mutationCursor: 0,
  states: [] as unknown[],
  ref: { current: false },
  approveMutate: vi.fn(),
  reviewMutate: vi.fn(),
  approveError: false,
  reviewError: false,
  reviewErrorMessage: "INTERNAL_ERROR",
  approvePending: false,
  reviewPending: false,
  mutationOptions: [] as MutationOptions[],
  refetch: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    if (harness.states[index] === undefined) harness.states[index] = initial;
    return [
      harness.states[index],
      (value: unknown) => {
        harness.states[index] = value;
      },
    ];
  },
  useRef: () => harness.ref,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isPending: false,
    isError: false,
    data: queryData,
    refetch: harness.refetch,
  }),
  useMutation: (options: MutationOptions) => {
    const index = harness.mutationCursor++;
    harness.mutationOptions[index] = options;
    return index === 0
      ? {
          mutate: harness.approveMutate,
          isPending: harness.approvePending,
          isError: harness.approveError,
          error: new Error("CONFLICT"),
        }
      : {
          mutate: harness.reviewMutate,
          isPending: harness.reviewPending,
          isError: harness.reviewError,
          error: new Error(harness.reviewErrorMessage),
        };
  },
  useQueryClient: () => ({
    setQueryData: harness.setQueryData,
    invalidateQueries: harness.invalidateQueries,
  }),
}));
vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthInvestigation: vi.fn(),
  approveGrowthInvestigation: vi.fn(),
  reviewGrowthInvestigation: vi.fn(),
}));

type ActionProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSubmit?: (dueOn: string) => void;
  onDismiss?: (reason: GrowthDismissalReason) => void;
  onSnooze?: (date: string) => void;
  onClick?: () => void;
  onRetry?: () => void;
  kind?: "approval" | "review";
};
type ActionKind =
  | "approvalForm"
  | "reviewControls"
  | "retryApproval"
  | "retryReview"
  | "reviewNow";

function matches(
  node: { type: unknown; props: ActionProps },
  kind: ActionKind,
) {
  if (kind === "approvalForm") return node.type === GrowthInvestigationForm;
  if (kind === "reviewControls")
    return node.type === GrowthInvestigationReviewControls;
  if (kind === "retryApproval" || kind === "retryReview")
    return (
      node.type === GrowthInvestigationMutationFailure &&
      node.props.kind === (kind === "retryApproval" ? "approval" : "review")
    );
  return (
    node.props.children === (kind === "reviewNow" ? "Review now" : undefined)
  );
}

function find(
  node: ReactNode,
  kind: ActionKind,
): { props: ActionProps } | null {
  if (!isValidElement<ActionProps>(node)) return null;
  if (matches(node, kind)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const result = find(child, kind);
    if (result) return result;
  }
  return null;
}

function render() {
  harness.stateCursor = 0;
  harness.mutationCursor = 0;
  return GrowthInvestigationReview({
    projectId: "project_1",
    signalId: "signal_1",
  });
}

describe("Growth investigation review submission", () => {
  beforeEach(() => {
    harness.states = [];
    harness.ref = { current: false };
    harness.approveMutate.mockReset();
    harness.reviewMutate.mockReset();
    harness.refetch.mockReset();
    harness.setQueryData.mockReset();
    harness.invalidateQueries.mockReset();
    harness.approveError = false;
    harness.reviewError = false;
    harness.reviewErrorMessage = "INTERNAL_ERROR";
    harness.approvePending = false;
    harness.reviewPending = false;
    harness.mutationOptions = [];
    queryData = proposal;
  });

  it("blocks two approval dispatches before React can render pending state", () => {
    const submit = find(render(), "approvalForm")?.props.onSubmit;
    submit?.("2026-09-04");
    submit?.("2026-09-05");
    expect(harness.approveMutate).toHaveBeenCalledExactlyOnceWith("2026-09-04");
  });

  it("freezes the original approval date after an uncertain response", () => {
    find(render(), "approvalForm")?.props.onSubmit?.("2026-09-04");
    harness.mutationOptions[0]?.onSettled();
    harness.approveError = true;
    const tree = render();
    expect(find(tree, "approvalForm")?.props.disabled).toBe(true);
    expect(find(tree, "reviewControls")?.props.disabled).toBe(true);
    find(tree, "approvalForm")?.props.onSubmit?.("2026-09-05");
    expect(harness.approveMutate).toHaveBeenCalledTimes(1);
    find(tree, "retryApproval")?.props.onRetry?.();
    expect(harness.approveMutate).toHaveBeenNthCalledWith(2, "2026-09-04");
  });

  it("blocks duplicate review dispatch and freezes the exact uncertain review", () => {
    const controls = find(render(), "reviewControls")?.props;
    controls?.onSnooze?.("2026-09-04");
    controls?.onDismiss?.("duplicate");
    const expected: GrowthInvestigationReviewInput = {
      projectId: "project_1",
      signalId: "signal_1",
      expectedVersion: 0,
      decision: "snooze",
      snoozeUntil: "2026-09-04",
    };
    expect(harness.reviewMutate).toHaveBeenCalledExactlyOnceWith(expected);

    harness.mutationOptions[1]?.onSettled();
    harness.reviewError = true;
    const uncertain = render();
    expect(find(uncertain, "approvalForm")?.props.disabled).toBe(true);
    expect(find(uncertain, "reviewControls")?.props.disabled).toBe(true);
    find(uncertain, "reviewControls")?.props.onDismiss?.("irrelevant");
    expect(harness.reviewMutate).toHaveBeenCalledTimes(1);
    find(uncertain, "retryReview")?.props.onRetry?.();
    expect(harness.reviewMutate).toHaveBeenNthCalledWith(2, expected);
  });

  it("unlocks a definitively rejected snooze so its date can be corrected", () => {
    find(render(), "reviewControls")?.props.onSnooze?.("2026-09-04");
    harness.mutationOptions[1]?.onError?.(new Error("VALIDATION_ERROR"));
    harness.mutationOptions[1]?.onSettled();
    harness.reviewError = true;
    harness.reviewErrorMessage = "VALIDATION_ERROR";

    const rejected = render();
    expect(find(rejected, "approvalForm")?.props.disabled).toBe(false);
    expect(find(rejected, "reviewControls")?.props.disabled).toBe(false);
    expect(find(rejected, "retryReview")).toBeNull();
    find(rejected, "reviewControls")?.props.onSnooze?.("2026-09-05");

    expect(harness.reviewMutate).toHaveBeenNthCalledWith(2, {
      projectId: "project_1",
      signalId: "signal_1",
      expectedVersion: 0,
      decision: "snooze",
      snoozeUntil: "2026-09-05",
    });
  });

  it("replaces cached investigation and invalidates summaries on success", () => {
    find(render(), "reviewControls")?.props.onDismiss?.("already_planned");
    const dismissed: GrowthInvestigationView = {
      ...proposal,
      status: "dismissed",
      reviewVersion: 1,
      dismissalReason: "already_planned",
    };
    harness.mutationOptions[1]?.onSuccess?.(dismissed);
    expect(harness.setQueryData).toHaveBeenCalledWith(
      ["growthInvestigation", "project_1", "signal_1"],
      dismissed,
    );
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["growthProjectSummary", "project_1"],
    });
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["growthPriorityRecommendations", "project_1"],
    });
  });

  it("invalidates the opportunities membership and project summary after approval", () => {
    find(render(), "approvalForm")?.props.onSubmit?.("2026-09-04");
    harness.mutationOptions[0]?.onSuccess?.({
      ...proposal,
      status: "accepted",
      actionId: "action_1",
      dueOn: "2026-09-04",
    });
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["growthWork", "project_1"],
    });
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["growthProjectSummary", "project_1"],
    });
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["growthPriorityRecommendations", "project_1"],
    });
  });

  it("dispatches Review now only from the rendered snoozed state", () => {
    queryData = {
      ...proposal,
      status: "snoozed",
      reviewVersion: 3,
      snoozedUntil: "2026-09-04T00:00:00.000Z",
    };
    find(render(), "reviewNow")?.props.onClick?.();
    expect(harness.reviewMutate).toHaveBeenCalledExactlyOnceWith({
      projectId: "project_1",
      signalId: "signal_1",
      expectedVersion: 3,
      decision: "review_now",
    });
  });

  it("locks approval and review callbacks while review is pending", () => {
    harness.reviewPending = true;
    const tree = render();
    expect(find(tree, "approvalForm")?.props.disabled).toBe(true);
    expect(find(tree, "reviewControls")?.props.disabled).toBe(true);
    find(tree, "approvalForm")?.props.onSubmit?.("2026-09-04");
    find(tree, "reviewControls")?.props.onDismiss?.("irrelevant");
    expect(harness.approveMutate).not.toHaveBeenCalled();
    expect(harness.reviewMutate).not.toHaveBeenCalled();
  });

  it("never submits on mount or remount", () => {
    render();
    harness.states = [];
    render();
    expect(harness.approveMutate).not.toHaveBeenCalled();
    expect(harness.reviewMutate).not.toHaveBeenCalled();
  });
});
