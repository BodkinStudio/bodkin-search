/* eslint-disable max-lines -- the exact retry and cache contract is clearest as one hook harness */
import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthWorkOverview } from "@/types/schemas/growth-investigations";
import type {
  FinalizeGrowthWorkMeasurementInput,
  GrowthWorkMeasurementConfounderCandidate,
  GrowthWorkMeasurementOverview,
} from "@/types/schemas/growth-work";
import { GrowthWorkMeasurementFinalization } from "./GrowthWorkMeasurementFinalization";
import {
  GrowthWorkMeasurementFinalizationForm,
  type GrowthWorkMeasurementFinalizationDraft,
} from "./GrowthWorkMeasurementFinalizationForm";
import {
  activeMeasurementPlan,
  measurementAction,
  measurementOverview,
} from "./GrowthWorkMeasurement.testFixtures";

type MutationOptions = {
  mutationKey: string[];
  mutationFn: (
    input: FinalizeGrowthWorkMeasurementInput,
  ) => Promise<GrowthWorkMeasurementOverview>;
  retry: boolean;
  onMutate: () => Promise<void>;
  onSuccess: (saved: GrowthWorkMeasurementOverview) => void;
  onSettled: () => void;
};

type CacheValue =
  | GrowthWorkMeasurementOverview
  | GrowthWorkOverview
  | undefined;

type FetchMeasurementOptions = {
  queryKey: string[];
  queryFn: () => Promise<GrowthWorkMeasurementOverview>;
  staleTime: number;
  retry: boolean;
};

function isStateUpdater(value: unknown): value is (prior: unknown) => unknown {
  return typeof value === "function";
}

function isCacheUpdater(
  value: unknown,
): value is (current: CacheValue) => CacheValue {
  return typeof value === "function";
}

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  ref: { current: false },
  pending: false,
  error: false,
  collecting: 0,
  finalizing: 0,
  options: undefined as MutationOptions | undefined,
  mutate: vi.fn(),
  reset: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
  remove: vi.fn(),
  fetchQuery:
    vi.fn<
      (
        options: FetchMeasurementOptions,
      ) => Promise<GrowthWorkMeasurementOverview>
    >(),
  finalize: vi.fn(),
  read: vi.fn(),
  measurementCache: undefined as GrowthWorkMeasurementOverview | undefined,
  workCache: undefined as GrowthWorkOverview | undefined,
  recoveryCache: null as unknown,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [
      harness.states[index],
      (value: unknown) => {
        harness.states[index] = isStateUpdater(value)
          ? value(harness.states[index])
          : value;
      },
    ];
  },
  useRef: () => harness.ref,
}));

vi.mock("@tanstack/react-query", () => ({
  useIsMutating: ({ mutationKey }: { mutationKey: string[] }) =>
    mutationKey[0] === "growthWorkMeasurementFinalize"
      ? harness.finalizing
      : harness.collecting,
  useMutation: (options: MutationOptions) => {
    harness.options = options;
    return {
      mutate: harness.mutate,
      reset: harness.reset,
      isPending: harness.pending,
      isError: harness.error,
      error: new Error("private SQL details"),
    };
  },
  useQuery: () => ({ data: harness.recoveryCache }),
  useQueryClient: () => ({
    cancelQueries: harness.cancel,
    invalidateQueries: harness.invalidate,
    removeQueries: (options: { queryKey: string[]; exact: boolean }) => {
      harness.remove(options);
      harness.recoveryCache = null;
    },
    fetchQuery: harness.fetchQuery,
    setQueryData: (key: string[], update: unknown) => {
      if (key[0] === "growthWorkMeasurementFinalizeRecovery") {
        harness.recoveryCache = isStateUpdater(update)
          ? update(harness.recoveryCache)
          : update;
        return;
      }
      const current =
        key[0] === "growthWorkMeasurement"
          ? harness.measurementCache
          : harness.workCache;
      if (!isCacheUpdater(update)) return;
      const next = update(current);
      if (key[0] === "growthWorkMeasurement") {
        if (next === undefined || "state" in next)
          harness.measurementCache = next;
      } else if (next === undefined || "actions" in next) {
        harness.workCache = next;
      }
    },
  }),
}));

vi.mock("@/serverFunctions/growthWork", () => ({
  finalizeGrowthWorkMeasurement: harness.finalize,
  getGrowthWorkMeasurement: harness.read,
}));

const candidate = {
  id: "change_2",
  changeType: "technical_fix" as const,
  description: "Fixed canonical output.",
  happenedAt: "2026-09-04T10:00:00.000Z",
  matchedDisplayUrls: ["https://example.com/pricing"],
};

const readyMeasurement: GrowthWorkMeasurementOverview = {
  ...measurementOverview,
  actionStatus: "measuring",
  stateVersion: 3,
  state: "active",
  candidates: [],
  proposedMetrics: [],
  plan: {
    ...activeMeasurementPlan,
    actionVersion: 3,
    confounders: {
      ...activeMeasurementPlan.confounders,
      state: "complete",
      candidates: [candidate],
    },
    review: {
      state: "ready",
      availableOn: "2026-10-31",
      primaryEvidenceComplete: true,
      missingPrimaryEvidenceCount: 0,
      revision: "a".repeat(64),
    },
  },
};

const completedMeasurement: GrowthWorkMeasurementOverview = {
  ...readyMeasurement,
  actionStatus: "evaluated",
  stateVersion: 4,
  state: "completed",
  plan: {
    ...readyMeasurement.plan!,
    status: "completed",
    collection: {
      ...readyMeasurement.plan!.collection,
      state: "closed",
      canCollect: false,
    },
    confounders: {
      ...readyMeasurement.plan!.confounders,
      state: "closed",
      candidates: [],
    },
    review: {
      ...readyMeasurement.plan!.review,
      state: "closed",
      revision: null,
    },
    result: {
      outcome: "positive",
      confidence: 0.79,
      summary: "Clicks rose, with overlapping technical work.",
      evaluatedAt: "2026-11-02T12:00:00.000Z",
      confoundingChanges: [
        {
          id: candidate.id,
          changeType: candidate.changeType,
          description: candidate.description,
          happenedAt: candidate.happenedAt,
        },
      ],
    },
  },
};

const draft: GrowthWorkMeasurementFinalizationDraft = {
  outcome: "positive",
  confidence: 0.79,
  summary: "Clicks rose, with overlapping technical work.",
  confoundingChangeEventIds: [candidate.id],
};

const request: FinalizeGrowthWorkMeasurementInput = {
  projectId: "project_1",
  actionId: measurementAction.id,
  expectedActionVersion: 3,
  reviewRevision: "a".repeat(64),
  ...draft,
};

type ControlProps = {
  children?: ReactNode;
  onSubmit?: (draft: GrowthWorkMeasurementFinalizationDraft) => void;
  onClick?: () => void;
  disabled?: boolean;
  pending?: boolean;
  draft?: GrowthWorkMeasurementFinalizationDraft;
  candidates?: GrowthWorkMeasurementConfounderCandidate[];
};

function find(node: ReactNode, target: string): ControlProps | null {
  if (!isValidElement<ControlProps>(node)) return null;
  if (target === "form" && node.type === GrowthWorkMeasurementFinalizationForm)
    return node.props;
  if (node.type === "button" && node.props.children === target)
    return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = find(child, target);
    if (match) return match;
  }
  return null;
}

function textFor(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<ControlProps>(node)) return "";
  return Children.toArray(node.props.children).map(textFor).join("");
}

function render({
  measurement = readyMeasurement,
  onLockChange = vi.fn(),
  operationRef,
}: {
  measurement?: GrowthWorkMeasurementOverview;
  onLockChange?: (locked: boolean) => void;
  operationRef?: { current: "collection" | "finalization" | null };
} = {}) {
  harness.cursor = 0;
  return {
    tree: GrowthWorkMeasurementFinalization({
      projectId: "project_1",
      measurement,
      onLockChange,
      operationRef,
    }),
    onLockChange,
  };
}

function submit(onLockChange = vi.fn()) {
  const rendered = render({ onLockChange });
  find(rendered.tree, "form")?.onSubmit?.(draft);
  return onLockChange;
}

function fail() {
  harness.options?.onSettled();
  harness.error = true;
}

describe("Work measurement finalization submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.states = [];
    harness.cursor = 0;
    harness.ref.current = false;
    harness.pending = false;
    harness.error = false;
    harness.collecting = 0;
    harness.finalizing = 0;
    harness.measurementCache = readyMeasurement;
    harness.recoveryCache = null;
    harness.workCache = {
      actions: [
        {
          ...measurementAction,
          status: "measuring",
          stateVersion: 3,
        },
      ],
      limit: 50,
    };
    harness.fetchQuery.mockResolvedValue(completedMeasurement);
  });

  it("does not finalize on render or remount and configures an explicit mutation", () => {
    const first = render().tree;
    harness.states = [];
    const second = render().tree;

    expect(find(first, "form")?.disabled).toBe(false);
    expect(find(second, "form")?.disabled).toBe(false);
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(harness.options?.mutationKey).toEqual([
      "growthWorkMeasurementFinalize",
      "project_1",
      measurementAction.id,
    ]);
    expect(harness.options?.retry).toBe(false);
  });

  it("dispatches one exact normalized request and locks immediately", async () => {
    const onLockChange = submit();
    find(render().tree, "form")?.onSubmit?.({
      ...draft,
      outcome: "negative",
    });

    expect(harness.mutate).toHaveBeenCalledExactlyOnceWith(request);
    expect(onLockChange).toHaveBeenCalledExactlyOnceWith(true);
    await harness.options?.mutationFn(request);
    expect(harness.finalize).toHaveBeenCalledExactlyOnceWith({ data: request });
  });

  it("blocks finalization while collection is active", () => {
    harness.collecting = 1;
    const { tree, onLockChange } = render();

    expect(find(tree, "form")?.disabled).toBe(true);
    find(tree, "form")?.onSubmit?.(draft);
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(onLockChange).not.toHaveBeenCalled();
    expect(textFor(tree)).toContain(
      "Finish collecting Search Console evidence",
    );
  });

  it("rehydrates a globally pending finalization as a disabled review", () => {
    harness.finalizing = 1;
    harness.states = [];
    const { tree } = render();

    expect(find(tree, "form")?.disabled).toBe(true);
    find(tree, "form")?.onSubmit?.(draft);
    expect(harness.mutate).not.toHaveBeenCalled();
  });

  it("cannot finalize when collection wins the same synchronous interaction", () => {
    const operationRef = { current: "collection" as const };
    const { tree } = render({ operationRef });

    find(tree, "form")?.onSubmit?.(draft);
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(operationRef.current).toBe("collection");
  });

  it("freezes the exact request and candidate presentation through an ambiguous failure", () => {
    submit();
    fail();
    const changed = {
      ...readyMeasurement,
      plan: {
        ...readyMeasurement.plan!,
        confounders: {
          ...readyMeasurement.plan!.confounders,
          state: "none" as const,
          candidates: [],
        },
        review: {
          ...readyMeasurement.plan!.review,
          revision: "b".repeat(64),
        },
      },
    };
    const tree = render({ measurement: changed }).tree;

    expect(find(tree, "form")).toMatchObject({
      disabled: true,
      draft,
      candidates: [candidate],
    });
    find(tree, "Retry same finalization")?.onClick?.();
    find(tree, "Retry same finalization")?.onClick?.();
    expect(harness.mutate).toHaveBeenCalledTimes(2);
    expect(harness.mutate).toHaveBeenNthCalledWith(2, request);
    expect(textFor(tree)).not.toContain("private SQL details");
  });

  it("rehydrates a frozen review from the query client after remount", () => {
    submit();
    fail();
    harness.error = false;
    harness.states = [];
    const tree = render().tree;

    expect(find(tree, "form")).toMatchObject({
      disabled: true,
      draft,
      candidates: [candidate],
    });
    expect(find(tree, "Retry same finalization")).not.toBeNull();
    expect(find(tree, "Check saved result")).not.toBeNull();
    find(tree, "Retry same finalization")?.onClick?.();
    expect(harness.mutate).toHaveBeenNthCalledWith(2, request);
  });

  it("uses an authoritative saved-result check before unlocking", async () => {
    const onLockChange = submit();
    fail();
    find(render({ onLockChange }).tree, "Check saved result")?.onClick?.();
    await vi.waitFor(() => expect(harness.reset).toHaveBeenCalledOnce());

    expect(harness.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["growthWorkMeasurement", "project_1", measurementAction.id],
        staleTime: 0,
        retry: false,
      }),
    );
    expect(harness.read).not.toHaveBeenCalled();
    const queryFn = harness.fetchQuery.mock.calls[0]?.[0]?.queryFn;
    await queryFn?.();
    expect(harness.read).toHaveBeenCalledWith({
      data: { projectId: "project_1", actionId: measurementAction.id },
    });
    expect(onLockChange.mock.calls).toEqual([[true], [false]]);
    expect(harness.mutate).toHaveBeenCalledOnce();
  });

  it("keeps recovery locked when the authoritative check fails", async () => {
    const onLockChange = submit();
    fail();
    harness.fetchQuery.mockRejectedValueOnce(new Error("offline"));
    find(render({ onLockChange }).tree, "Check saved result")?.onClick?.();
    await vi.waitFor(() => expect(harness.ref.current).toBe(false));

    expect(onLockChange.mock.calls).toEqual([[true]]);
    expect(harness.reset).not.toHaveBeenCalled();
    const tree = render({ onLockChange }).tree;
    expect(find(tree, "form")?.disabled).toBe(true);
    expect(textFor(tree)).toContain("remains locked");
  });

  it("keeps the frozen review when an authoritative check finds no result", async () => {
    const onLockChange = submit();
    fail();
    harness.fetchQuery.mockResolvedValueOnce(readyMeasurement);

    find(render({ onLockChange }).tree, "Check saved result")?.onClick?.();
    await vi.waitFor(() => expect(harness.ref.current).toBe(false));

    expect(harness.reset).not.toHaveBeenCalled();
    expect(onLockChange.mock.calls).toEqual([[true]]);
    const tree = render({ onLockChange }).tree;
    expect(find(tree, "form")?.disabled).toBe(true);
    expect(textFor(tree)).toContain("exact review remains locked");
  });

  it("preserves newer caches and invalidates only Work and history on success", async () => {
    harness.measurementCache = {
      ...completedMeasurement,
      stateVersion: 8,
    };
    harness.workCache = {
      actions: [
        {
          ...measurementAction,
          status: "evaluated",
          stateVersion: 8,
        },
      ],
      limit: 50,
    };
    const onLockChange = submit();
    await harness.options?.onMutate();
    harness.options?.onSuccess(completedMeasurement);
    harness.options?.onSettled();

    expect(harness.cancel.mock.calls).toEqual([
      [
        {
          queryKey: [
            "growthWorkMeasurement",
            "project_1",
            measurementAction.id,
          ],
        },
      ],
      [{ queryKey: ["growthWork", "project_1"] }],
    ]);
    expect(harness.measurementCache.stateVersion).toBe(8);
    expect(harness.workCache.actions[0]).toMatchObject({
      status: "evaluated",
      stateVersion: 8,
    });
    expect(harness.invalidate.mock.calls).toEqual([
      [{ queryKey: ["growthWork", "project_1"] }],
      [
        {
          queryKey: ["growthWorkHistory", "project_1", measurementAction.id],
        },
      ],
    ]);
    expect(harness.remove).toHaveBeenCalledWith({
      queryKey: [
        "growthWorkMeasurementFinalizeRecovery",
        "project_1",
        measurementAction.id,
      ],
      exact: true,
    });
    expect(onLockChange.mock.calls).toEqual([[true], [false]]);
  });

  it("shows waiting dates, hides closed review, and allows advisory discovery states", () => {
    const waiting = {
      ...readyMeasurement,
      plan: {
        ...readyMeasurement.plan!,
        review: {
          ...readyMeasurement.plan!.review,
          state: "waiting" as const,
          revision: null,
        },
      },
    };
    const waitingTree = render({ measurement: waiting }).tree;
    expect(find(waitingTree, "form")).toBeNull();
    expect(textFor(waitingTree)).toContain("31 Oct 2026");

    harness.states = [];
    const closedTree = render({ measurement: completedMeasurement }).tree;
    expect(closedTree).toBeNull();

    for (const state of ["overflow", "unavailable"] as const) {
      harness.states = [];
      harness.ref.current = false;
      harness.mutate.mockClear();
      harness.recoveryCache = null;
      const advisory = {
        ...readyMeasurement,
        plan: {
          ...readyMeasurement.plan!,
          confounders: {
            ...readyMeasurement.plan!.confounders,
            state,
            candidates: [],
          },
        },
      };
      const tree = render({ measurement: advisory }).tree;
      find(tree, "form")?.onSubmit?.({
        ...draft,
        confoundingChangeEventIds: [],
      });
      expect(harness.mutate).toHaveBeenCalledOnce();
    }
  });
});
