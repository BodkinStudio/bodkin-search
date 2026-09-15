/* eslint-disable max-lines -- the start and finalization lock harness is intentionally kept together */
import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GrowthWorkItem,
  GrowthWorkOverview,
} from "@/types/schemas/growth-investigations";
import type {
  GrowthWorkMeasurementCandidate,
  GrowthWorkMeasurementOverview,
  StartGrowthWorkMeasurementInput,
} from "@/types/schemas/growth-work";
import { GrowthWorkMeasurementPanel } from "./GrowthWorkMeasurement";
import { GrowthWorkMeasurementContent } from "./GrowthWorkMeasurementPresentation";
import { activeMeasurementPlan } from "./GrowthWorkMeasurement.testFixtures";

type Frozen = {
  request: StartGrowthWorkMeasurementInput;
  candidate: GrowthWorkMeasurementCandidate;
};
type State = Frozen | string | boolean | number | null;
type CacheValue =
  | GrowthWorkMeasurementOverview
  | GrowthWorkOverview
  | undefined;
type MutationOptions = {
  retry: boolean;
  mutationFn: (data: StartGrowthWorkMeasurementInput) => Promise<unknown>;
  onMutate: () => Promise<void>;
  onSuccess: (saved: GrowthWorkMeasurementOverview) => void;
  onSettled: () => void;
};
type QueryOptions = {
  queryKey: string[];
  queryFn: () => Promise<GrowthWorkMeasurementOverview>;
  enabled: boolean;
  gcTime: number;
  retry: boolean;
  refetchOnMount: boolean;
  refetchOnReconnect: boolean;
  refetchOnWindowFocus: boolean;
};

const harness = vi.hoisted(() => ({
  states: [] as State[],
  cursor: 0,
  ref: { current: false },
  data: undefined as GrowthWorkMeasurementOverview | undefined,
  work: undefined as GrowthWorkOverview | undefined,
  queryError: false,
  mutationError: false,
  mutationPending: false,
  collecting: 0,
  queryOptions: undefined as QueryOptions | undefined,
  mutationOptions: undefined as MutationOptions | undefined,
  mutate: vi.fn(),
  reset: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
  fetchQuery: vi.fn(),
  refetch: vi.fn(),
  read: vi.fn(),
  start: vi.fn(),
  finalizationRecovery: null as unknown,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: State) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [
      harness.states[index],
      (value: State | ((prior: State) => State)) => {
        harness.states[index] =
          typeof value === "function" ? value(harness.states[index]) : value;
      },
    ];
  },
  useRef: () => harness.ref,
}));
vi.mock("@tanstack/react-query", () => ({
  useIsMutating: () => harness.collecting,
  useQuery: (options: QueryOptions) => {
    if (options.queryKey[0] === "growthWorkMeasurementFinalizeRecovery") {
      return { data: harness.finalizationRecovery };
    }
    harness.queryOptions = options;
    return {
      data: harness.data,
      isPending: !harness.data,
      isError: harness.queryError,
      isFetching: false,
      refetch: harness.refetch,
    };
  },
  useMutation: (options: MutationOptions) => {
    harness.mutationOptions = options;
    return {
      mutate: harness.mutate,
      reset: harness.reset,
      isPending: harness.mutationPending,
      isError: harness.mutationError,
      error: new Error("private SQL details"),
    };
  },
  useQueryClient: () => ({
    cancelQueries: harness.cancel,
    invalidateQueries: harness.invalidate,
    fetchQuery: harness.fetchQuery,
    setQueryData: (
      key: string[],
      update: (value: CacheValue) => CacheValue,
    ) => {
      const current =
        key[0] === "growthWorkMeasurement" ? harness.data : harness.work;
      const next = update(current);
      if (key[0] === "growthWorkMeasurement") {
        if (next === undefined || "state" in next) harness.data = next;
      } else if (next === undefined || "actions" in next) {
        harness.work = next;
      }
    },
  }),
}));
vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthWork: vi.fn(),
}));
vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkMeasurement: harness.read,
  startGrowthWorkMeasurement: harness.start,
}));

const action: GrowthWorkItem = {
  id: "action_1",
  title: "Investigate pricing",
  status: "implemented",
  stateVersion: 2,
  dueOn: "2026-09-04",
  createdAt: "2026-08-30T10:00:00.000Z",
  runId: "run_1",
  displayUrls: ["https://example.com/pricing"],
};
const candidate: GrowthWorkMeasurementCandidate = {
  change: {
    id: "change_1",
    changeType: "content_updated",
    description: "Updated pricing copy.",
    happenedAt: "2026-08-01T00:00:00.000Z",
    recordedAt: "2026-08-02T00:00:00.000Z",
    displayUrls: ["https://example.com/pricing"],
  },
  schedule: {
    anchorAt: "2026-08-01T00:00:00.000Z",
    anchorDate: "2026-08-01",
    reportTimezone: "UTC",
    baselineStart: "2026-07-04",
    baselineEnd: "2026-07-31",
    cooldownEnd: "2026-08-08",
    measurementStart: "2026-08-09",
    measurementEnd: "2026-09-05",
    longMeasurementEnd: null,
  },
  unavailableReason: null,
};
const eligible: GrowthWorkMeasurementOverview = {
  actionId: action.id,
  actionStatus: "implemented",
  stateVersion: action.stateVersion,
  state: "eligible",
  targetCount: 1,
  candidates: [candidate],
  proposedMetrics: [
    {
      metricType: "search_clicks",
      displayTarget: "https://example.com/pricing",
      isPrimary: true,
    },
  ],
  plan: null,
  limit: 50,
};
const request: StartGrowthWorkMeasurementInput = {
  projectId: "project_1",
  actionId: action.id,
  expectedActionVersion: action.stateVersion,
  implementationChangeEventId: candidate.change.id,
};

type ControlProps = {
  children?: ReactNode;
  data?: GrowthWorkMeasurementOverview;
  onSubmit?: (id: string) => void;
  onClick?: () => void;
  disabled?: boolean;
  frozenCandidate?: GrowthWorkMeasurementCandidate;
  selectedId?: string;
  collectionControl?: ReactNode;
  finalizationControl?: ReactNode;
};

function find(node: ReactNode, target: string): ControlProps | null {
  if (!isValidElement<ControlProps>(node)) return null;
  if (target === "content" && node.type === GrowthWorkMeasurementContent)
    return node.props;
  if (node.type === "button" && node.props.children === target)
    return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = find(child, target);
    if (match) return match;
  }
  return null;
}

function render(projectId = request.projectId, item = action) {
  harness.cursor = 0;
  return GrowthWorkMeasurementPanel({ projectId, action: item });
}

function submit() {
  find(render(), "content")?.onSubmit?.(candidate.change.id);
}

function fail() {
  harness.mutationOptions?.onSettled();
  harness.mutationError = true;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.states = [];
  harness.cursor = 0;
  harness.ref.current = false;
  harness.data = eligible;
  harness.work = { actions: [action], limit: 50 };
  harness.queryError = false;
  harness.mutationError = false;
  harness.mutationPending = false;
  harness.collecting = 0;
  harness.finalizationRecovery = null;
  harness.fetchQuery.mockResolvedValue(eligible);
});

describe("Start Work measurement submission", () => {
  it("does not mutate on render or refresh and scopes its lazy read", async () => {
    const tree = render("project_2", { ...action, id: "action_2" });
    expect(harness.queryOptions?.queryKey).toEqual([
      "growthWorkMeasurement",
      "project_2",
      "action_2",
    ]);
    await harness.queryOptions?.queryFn();
    expect(harness.read).toHaveBeenCalledWith({
      data: { projectId: "project_2", actionId: "action_2" },
    });
    find(tree, "Refresh measurement")?.onClick?.();
    expect(harness.refetch).toHaveBeenCalledOnce();
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(harness.queryOptions?.retry).toBe(false);
  });

  it("holds refreshes while measurement evidence is being collected", () => {
    harness.collecting = 1;
    const tree = render();

    expect(find(tree, "Refresh measurement")?.disabled).toBe(true);
    expect(harness.queryOptions?.refetchOnWindowFocus).toBe(false);
  });

  it("lets finalization lock normal refresh and collection together", () => {
    harness.data = {
      ...eligible,
      actionStatus: "measuring",
      stateVersion: 3,
      state: "active",
      candidates: [],
      proposedMetrics: [],
      plan: {
        ...activeMeasurementPlan,
        actionVersion: 3,
        review: {
          state: "ready",
          availableOn: "2026-10-31",
          primaryEvidenceComplete: true,
          missingPrimaryEvidenceCount: 0,
          revision: "a".repeat(64),
        },
      },
    };
    const initialContent = find(render(), "content");
    expect(isValidElement(initialContent?.finalizationControl)).toBe(true);
    if (
      !isValidElement<{ onLockChange: (locked: boolean) => void }>(
        initialContent?.finalizationControl,
      )
    )
      throw new Error("Expected finalization control");

    initialContent.finalizationControl.props.onLockChange(true);
    const lockedTree = render();
    const lockedContent = find(lockedTree, "content");
    expect(find(lockedTree, "Refresh measurement")?.disabled).toBe(true);
    find(lockedTree, "Refresh measurement")?.onClick?.();
    expect(harness.refetch).not.toHaveBeenCalled();
    expect(harness.queryOptions?.refetchOnWindowFocus).toBe(false);
    expect(isValidElement(lockedContent?.collectionControl)).toBe(true);
    if (
      !isValidElement<{ disabled?: boolean }>(lockedContent?.collectionControl)
    )
      throw new Error("Expected collection control");
    expect(lockedContent.collectionControl.props.disabled).toBe(true);
  });

  it("does not automatically reread stale measurement state after recovery remount", () => {
    const measurement = {
      ...eligible,
      actionStatus: "measuring" as const,
      stateVersion: 3,
      state: "active" as const,
      candidates: [],
      proposedMetrics: [],
      plan: {
        ...activeMeasurementPlan,
        actionVersion: 3,
        review: {
          state: "ready" as const,
          availableOn: "2026-10-31",
          primaryEvidenceComplete: true,
          missingPrimaryEvidenceCount: 0,
          revision: "a".repeat(64),
        },
      },
    };
    harness.data = undefined;
    harness.finalizationRecovery = { measurement };
    harness.states = [];

    const tree = render();

    expect(harness.queryOptions).toMatchObject({
      enabled: false,
      gcTime: Infinity,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    });
    expect(find(tree, "content")).toMatchObject({
      data: measurement,
      disabled: true,
    });
    expect(harness.read).not.toHaveBeenCalled();
    expect(harness.refetch).not.toHaveBeenCalled();
  });

  it("dispatches one explicit linked change and rejects arbitrary IDs", () => {
    const submitMeasurement = find(render(), "content")?.onSubmit;
    submitMeasurement?.("foreign_change");
    submitMeasurement?.(candidate.change.id);
    submitMeasurement?.(candidate.change.id);
    expect(harness.mutate).toHaveBeenCalledExactlyOnceWith(request);
    expect(harness.mutationOptions?.retry).toBe(false);
    expect(find(render(), "content")?.disabled).toBe(true);
  });

  it("freezes the exact record and request through uncertain retry", () => {
    submit();
    fail();
    harness.data = { ...eligible, candidates: [] };
    const tree = render();
    expect(find(tree, "content")).toMatchObject({
      disabled: true,
      frozenCandidate: candidate,
      selectedId: candidate.change.id,
    });
    expect(find(tree, "Refresh measurement")?.disabled).toBe(true);
    expect(harness.invalidate).not.toHaveBeenCalled();
    find(tree, "Retry same measurement")?.onClick?.();
    find(tree, "Retry same measurement")?.onClick?.();
    expect(harness.mutate).toHaveBeenCalledTimes(2);
    expect(harness.mutate).toHaveBeenNthCalledWith(2, request);
  });

  it("requires a successful authoritative check before unlocking", async () => {
    submit();
    fail();
    find(render(), "Check saved measurement")?.onClick?.();
    await vi.waitFor(() => expect(harness.reset).toHaveBeenCalledOnce());
    expect(harness.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["growthWorkMeasurement", "project_1", action.id],
        staleTime: 0,
        retry: false,
      }),
    );
    expect(find(render(), "content")?.disabled).toBe(false);
    expect(harness.mutate).toHaveBeenCalledTimes(1);
  });

  it("keeps the original selection locked when the check fails", async () => {
    submit();
    fail();
    harness.fetchQuery.mockRejectedValueOnce(new Error("offline"));
    find(render(), "Check saved measurement")?.onClick?.();
    await vi.waitFor(() => expect(harness.ref.current).toBe(false));
    expect(harness.reset).not.toHaveBeenCalled();
    const tree = render();
    expect(find(tree, "content")?.disabled).toBe(true);
    find(tree, "Retry same measurement")?.onClick?.();
    expect(harness.mutate).toHaveBeenNthCalledWith(2, request);
  });

  it("uses the authorized endpoint and refreshes only Work and history", async () => {
    submit();
    await harness.mutationOptions?.mutationFn(request);
    await harness.mutationOptions?.onMutate();
    const saved = {
      ...eligible,
      actionStatus: "measuring" as const,
      stateVersion: 3,
      state: "active" as const,
      candidates: [],
    };
    harness.mutationOptions?.onSuccess(saved);
    harness.mutationOptions?.onSettled();
    expect(harness.start).toHaveBeenCalledExactlyOnceWith({ data: request });
    expect(harness.work?.actions[0]).toMatchObject({
      status: "measuring",
      stateVersion: 3,
    });
    expect(harness.invalidate.mock.calls).toEqual([
      [{ queryKey: ["growthWork", "project_1"] }],
      [{ queryKey: ["growthWorkHistory", "project_1", action.id] }],
    ]);
  });

  it("does not submit on remount or replace a newer cached Work version", () => {
    render();
    harness.states = [];
    render("project_2", { ...action, id: "action_2" });
    expect(harness.mutate).not.toHaveBeenCalled();
    harness.work = {
      actions: [{ ...action, status: "evaluated", stateVersion: 5 }],
      limit: 50,
    };
    render();
    harness.mutationOptions?.onSuccess({
      ...eligible,
      actionStatus: "measuring",
      stateVersion: 3,
    });
    expect(harness.work.actions[0]).toMatchObject({
      status: "evaluated",
      stateVersion: 5,
    });
  });

  it("preserves equal-version measurement evidence until its authoritative refetch", () => {
    harness.data = {
      ...eligible,
      stateVersion: action.stateVersion,
      candidates: [],
    };
    render();
    harness.mutationOptions?.onSuccess(eligible);

    expect(harness.data?.candidates).toEqual([]);
  });
});
