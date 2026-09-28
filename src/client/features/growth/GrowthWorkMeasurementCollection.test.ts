import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GrowthWorkMeasurementCollection as Collection,
  GrowthWorkMeasurementOverview,
} from "@/types/schemas/growth-work";
import { GrowthWorkMeasurementCollection } from "./GrowthWorkMeasurementCollection";

type MutationOptions = {
  mutationKey: string[];
  mutationFn: () => Promise<GrowthWorkMeasurementOverview>;
  retry: boolean;
  onMutate: () => Promise<void>;
  onSuccess: (saved: GrowthWorkMeasurementOverview) => Promise<void>;
  onSettled: () => void;
};
type ButtonProps = {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

const harness = vi.hoisted(() => ({
  ref: { current: false },
  state: null as string | null,
  pending: false,
  error: false,
  collect: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
  cache: undefined as GrowthWorkMeasurementOverview | undefined,
  options: undefined as MutationOptions | undefined,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useRef: () => harness.ref,
  useState: (initial: string | null) => [
    harness.state ?? initial,
    (value: string | null) => {
      harness.state = value;
    },
  ],
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: MutationOptions) => {
    harness.options = options;
    return {
      isPending: harness.pending,
      isError: harness.error,
      mutate: harness.collect,
    };
  },
  useQueryClient: () => ({
    cancelQueries: harness.cancel,
    invalidateQueries: harness.invalidate,
    setQueryData: (
      _key: string[],
      update: (
        current: GrowthWorkMeasurementOverview | undefined,
      ) => GrowthWorkMeasurementOverview | undefined,
    ) => {
      harness.cache = update(harness.cache);
    },
  }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("@/serverFunctions/growthWork", () => ({
  collectGrowthWorkMeasurement: harness.collect,
}));

const ready: Collection = {
  state: "ready",
  canCollect: true,
  nextAvailableOn: null,
  periods: [],
};
const saved: GrowthWorkMeasurementOverview = {
  actionId: "action_1",
  actionStatus: "measuring",
  stateVersion: 5,
  state: "active",
  targetCount: 1,
  candidates: [],
  proposedMetrics: [],
  plan: null,
  limit: 50,
};

function findButton(node: ReactNode, label: string): ButtonProps | null {
  if (!isValidElement<ButtonProps>(node)) return null;
  if (node.type === "button" && node.props.children === label)
    return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = findButton(child, label);
    if (match) return match;
  }
  return null;
}

function textFor(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<ButtonProps>(node)) return "";
  return Children.toArray(node.props.children).map(textFor).join("");
}

function render(
  collection = ready,
  disabled = false,
  operationRef?: { current: "collection" | "finalization" | null },
) {
  return GrowthWorkMeasurementCollection({
    projectId: "project_1",
    actionId: "action_1",
    stateVersion: 5,
    collection,
    disabled,
    operationRef,
  });
}

describe("Work measurement collection submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.ref.current = false;
    harness.state = null;
    harness.pending = false;
    harness.error = false;
    harness.cache = { ...saved, stateVersion: 6 };
  });

  it("does not collect on render and dispatches one explicit scoped request", async () => {
    const tree = render();
    expect(harness.collect).not.toHaveBeenCalled();
    expect(harness.options?.mutationKey).toEqual([
      "growthWorkMeasurementCollect",
      "project_1",
      "action_1",
    ]);
    expect(harness.options?.retry).toBe(false);

    findButton(tree, "Collect available data")?.onClick?.();
    findButton(tree, "Collect available data")?.onClick?.();
    expect(harness.collect).toHaveBeenCalledOnce();
    await harness.options?.mutationFn();
    expect(harness.collect).toHaveBeenCalledWith({
      data: {
        projectId: "project_1",
        actionId: "action_1",
        expectedActionVersion: 5,
      },
    });
  });

  it("uses scoped caches, preserves newer measurement data, and exposes safe status copy", async () => {
    render();
    await harness.options?.onMutate();
    await harness.options?.onSuccess(saved);
    harness.options?.onSettled();
    expect(harness.cancel).toHaveBeenCalledWith({
      queryKey: ["growthWorkMeasurement", "project_1", "action_1"],
    });
    expect(harness.invalidate.mock.calls).toEqual([
      [
        {
          queryKey: ["growthWorkMeasurement", "project_1", "action_1"],
          refetchType: "active",
        },
      ],
      [{ queryKey: ["growthWork", "project_1"] }],
    ]);
    expect(harness.cache?.stateVersion).toBe(6);
    expect(harness.ref.current).toBe(false);

    const missing = render({
      ...ready,
      state: "missing_connection",
      canCollect: false,
    });
    expect(findButton(missing, "Collect available data")).toBeNull();
    const waiting = render({
      ...ready,
      state: "waiting",
      canCollect: false,
      nextAvailableOn: "2026-10-09",
    });
    expect(findButton(waiting, "Collect available data")).toBeNull();
    harness.pending = true;
    const pending = render(ready);
    expect(findButton(pending, "Collecting available data…")?.disabled).toBe(
      true,
    );
    expect(textFor(pending)).toContain("Reading final Search Console data");
    harness.pending = false;
    harness.error = true;
    const failed = render(ready);
    expect(textFor(failed)).toContain("could not be confirmed");
    expect(textFor(failed)).not.toContain("private SQL details");
  });

  it("cannot dispatch while finalization owns the measurement controls", () => {
    const tree = render(ready, true);
    const button = findButton(tree, "Collect available data");

    expect(button?.disabled).toBe(true);
    button?.onClick?.();
    expect(harness.collect).not.toHaveBeenCalled();
    expect(textFor(tree)).toContain("Collection is paused");
  });

  it("cannot collect when finalization wins the same synchronous interaction", () => {
    const tree = render(ready, false, { current: "finalization" });

    findButton(tree, "Collect available data")?.onClick?.();
    expect(harness.collect).not.toHaveBeenCalled();
  });

  it("preserves equal-version evidence until the active-query refetch", async () => {
    harness.cache = {
      ...saved,
      stateVersion: saved.stateVersion,
      targetCount: 4,
    };
    render();
    await harness.options?.onSuccess({ ...saved, candidates: [] });

    expect(harness.cache).toEqual({
      ...saved,
      stateVersion: saved.stateVersion,
      targetCount: 4,
    });
  });
});
