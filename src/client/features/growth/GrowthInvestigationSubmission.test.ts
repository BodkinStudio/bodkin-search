import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthInvestigationReview } from "./GrowthInvestigation";
import { GrowthInvestigationForm } from "./GrowthInvestigationForm";

const harness = vi.hoisted(() => ({
  cursor: 0,
  states: [] as (string | null | undefined)[],
  ref: { current: false },
  mutate: vi.fn(),
  error: false,
  settled: undefined as undefined | (() => void),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: string | null) => {
    const index = harness.cursor++;
    if (harness.states[index] === undefined) harness.states[index] = initial;
    return [
      harness.states[index],
      (value: string | null) => {
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
    data: {
      recommendationId: "recommendation_1",
      title: "Investigate",
      rationale: "Cause unknown",
      steps: ["Check the evidence"],
      displayUrls: [],
      status: "proposed",
      actionId: null,
      dueOn: null,
      templateVersion: "v1",
    },
    refetch: vi.fn(),
  }),
  useMutation: (options: { onSettled: () => void }) => {
    harness.settled = options.onSettled;
    return { mutate: harness.mutate, isPending: false, isError: harness.error };
  },
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));
vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthInvestigation: vi.fn(),
  approveGrowthInvestigation: vi.fn(),
}));

type ActionProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSubmit?: (dueOn: string) => void;
  onClick?: () => void;
};
function find(
  node: ReactNode,
  kind: "form" | "retry",
): { props: ActionProps } | null {
  if (!isValidElement<ActionProps>(node)) return null;
  if (
    kind === "form"
      ? node.type === GrowthInvestigationForm
      : node.props.children === "Retry approval"
  )
    return node;
  for (const child of Children.toArray(node.props.children)) {
    const result = find(child, kind);
    if (result) return result;
  }
  return null;
}
function render() {
  harness.cursor = 0;
  return GrowthInvestigationReview({
    projectId: "project_1",
    signalId: "signal_1",
  });
}

describe("Growth investigation approval submission", () => {
  beforeEach(() => {
    harness.states = [];
    harness.ref = { current: false };
    harness.mutate.mockReset();
    harness.error = false;
  });

  it("blocks two dispatches before React can render the pending state", () => {
    const submit = find(render(), "form")?.props.onSubmit;
    expect(submit).toBeTypeOf("function");
    submit?.("2026-09-04");
    submit?.("2026-09-05");
    expect(harness.mutate).toHaveBeenCalledExactlyOnceWith("2026-09-04");
  });

  it("freezes the original due date and retries only that date after an uncertain response", () => {
    find(render(), "form")?.props.onSubmit?.("2026-09-04");
    harness.settled?.();
    harness.error = true;
    const tree = render();
    expect(find(tree, "form")?.props.disabled).toBe(true);
    find(tree, "form")?.props.onSubmit?.("2026-09-05");
    expect(harness.mutate).toHaveBeenCalledTimes(1);
    find(tree, "retry")?.props.onClick?.();
    expect(harness.mutate).toHaveBeenNthCalledWith(2, "2026-09-04");
  });

  it("never submits on mount or remount", () => {
    render();
    harness.states = [];
    render();
    expect(harness.mutate).not.toHaveBeenCalled();
  });
});
