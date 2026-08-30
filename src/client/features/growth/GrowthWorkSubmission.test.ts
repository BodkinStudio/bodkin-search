import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GrowthWorkItem,
  GrowthWorkOverview,
} from "@/types/schemas/growth-investigations";
import type { UpdateGrowthWorkStatusInput } from "@/types/schemas/growth-work";
import { GrowthWorkDeliveryPanel } from "./GrowthWorkDelivery";
import {
  GrowthWorkStatusForm,
  type GrowthWorkStatusDraft,
} from "./GrowthWorkStatusForm";

type MutationOptions = {
  retry: boolean;
  mutationFn: (data: UpdateGrowthWorkStatusInput) => Promise<unknown>;
  onMutate: () => Promise<unknown>;
  onSuccess: (saved: GrowthWorkItem) => Promise<void>;
  onSettled: () => void;
};
type HarnessState =
  | UpdateGrowthWorkStatusInput
  | string
  | boolean
  | number
  | null;
const harness = vi.hoisted(() => ({
  cursor: 0,
  states: [] as HarnessState[],
  ref: { current: false },
  mutate: vi.fn(),
  reset: vi.fn(),
  error: false,
  options: undefined as MutationOptions | undefined,
  fetchQuery: vi.fn(),
  cancelQueries: vi.fn(),
  invalidateQueries: vi.fn(),
  refetch: vi.fn(),
  work: undefined as GrowthWorkOverview | undefined,
  update: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: HarnessState) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [
      harness.states[index],
      (value: HarnessState | ((previous: HarnessState) => HarnessState)) => {
        harness.states[index] =
          typeof value === "function" ? value(harness.states[index]) : value;
      },
    ];
  },
  useRef: () => harness.ref,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isPending: false,
    isError: false,
    isFetching: false,
    data: { actionId: "action_1", events: [], limit: 50 },
    refetch: harness.refetch,
  }),
  useMutation: (options: MutationOptions) => {
    harness.options = options;
    return {
      mutate: harness.mutate,
      reset: harness.reset,
      isPending: false,
      isError: harness.error,
      error: new Error("private database details"),
    };
  },
  useQueryClient: () => ({
    setQueryData: (
      _key: string[],
      updater: (
        value: GrowthWorkOverview | undefined,
      ) => GrowthWorkOverview | undefined,
    ) => {
      harness.work = updater(harness.work);
    },
    cancelQueries: harness.cancelQueries,
    invalidateQueries: harness.invalidateQueries,
    fetchQuery: harness.fetchQuery,
  }),
}));
vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthWork: vi.fn(),
}));
vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkHistory: vi.fn(),
  updateGrowthWorkStatus: harness.update,
}));

const action: GrowthWorkItem = {
  id: "action_1",
  title: "Investigate",
  status: "approved",
  stateVersion: 0,
  dueOn: "2026-09-04",
  createdAt: "2026-08-30T10:00:00.000Z",
  runId: "run_1",
  displayUrls: [],
};
const request: UpdateGrowthWorkStatusInput = {
  projectId: "project_1",
  actionId: action.id,
  expectedStatus: "approved",
  expectedVersion: 0,
  status: "ready",
  note: "Evidence reviewed",
};
type ControlProps = {
  children?: ReactNode;
  disabled?: boolean;
  currentStatus?: string;
  onSubmit?: (draft: GrowthWorkStatusDraft) => void;
  onClick?: () => void;
};
function find(
  node: ReactNode,
  kind: "form" | "retry" | "refresh",
): { props: ControlProps } | null {
  if (!isValidElement<ControlProps>(node)) return null;
  if (
    kind === "form"
      ? node.type === GrowthWorkStatusForm
      : node.props.children ===
        (kind === "retry" ? "Retry same update" : "Check saved status")
  )
    return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = find(child, kind);
    if (found) return found;
  }
  return null;
}
function render(item = action, projectId = "project_1") {
  harness.cursor = 0;
  return GrowthWorkDeliveryPanel({ projectId, action: item });
}
function submit() {
  find(render(), "form")?.props.onSubmit?.({
    status: "ready",
    note: "  Evidence reviewed  ",
  });
}
function fail() {
  harness.options?.onSettled();
  harness.error = true;
}

beforeEach(() => {
  harness.states = [];
  harness.ref = { current: false };
  harness.error = false;
  harness.work = { actions: [action], limit: 50 };
  vi.clearAllMocks();
  harness.cancelQueries.mockResolvedValue(undefined);
  harness.fetchQuery.mockResolvedValue(harness.work);
});

describe("Work status submission", () => {
  it("dispatches once even before React renders pending state", () => {
    const onSubmit = find(render(), "form")?.props.onSubmit;
    onSubmit?.({ status: "ready", note: "  Evidence reviewed  " });
    onSubmit?.({ status: "cancelled", note: "Different intent" });
    expect(harness.mutate).toHaveBeenCalledExactlyOnceWith(request);
    expect(harness.options?.retry).toBe(false);
  });

  it("retries the identical version/status/note despite a newer displayed action", () => {
    submit();
    fail();
    const tree = render({ ...action, status: "blocked", stateVersion: 3 });
    expect(find(tree, "form")?.props.disabled).toBe(true);
    expect(find(tree, "form")?.props.currentStatus).toBe("approved");
    find(tree, "form")?.props.onSubmit?.({
      status: "implemented",
      note: "Changed",
    });
    expect(harness.mutate).toHaveBeenCalledTimes(1);
    find(tree, "retry")?.props.onClick?.();
    expect(harness.mutate).toHaveBeenNthCalledWith(2, request);
  });

  it("sends only the saved explicit request and leaves actor identity to the server", async () => {
    submit();
    await harness.options?.mutationFn(request);
    expect(harness.update).toHaveBeenCalledExactlyOnceWith({ data: request });
  });

  it("uses the returned current action, not the destination of a historical retry", async () => {
    submit();
    const later = {
      ...action,
      status: "implemented" as const,
      stateVersion: 4,
    };
    await harness.options?.onSuccess(later);
    harness.options?.onSettled();
    expect(harness.work?.actions).toEqual([later]);
    expect(find(render(later), "form")).toBeNull();
    expect(harness.mutate).toHaveBeenCalledTimes(1);
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["growthWorkHistory", "project_1", action.id],
    });
  });

  it("does not replace a newer cached version with a delayed response", async () => {
    render();
    const newer = { ...action, status: "measuring" as const, stateVersion: 5 };
    harness.work = { limit: 50, actions: [newer] };
    await harness.options?.onSuccess({
      ...action,
      status: "implemented",
      stateVersion: 4,
    });
    expect(harness.work?.actions).toEqual([newer]);
  });

  it("refreshes explicitly before unlocking an uncertain request without resubmitting", async () => {
    submit();
    fail();
    find(render(), "refresh")?.props.onClick?.();
    await vi.waitFor(() => expect(harness.reset).toHaveBeenCalledOnce());
    expect(harness.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["growthWork", "project_1"],
        staleTime: 0,
        retry: false,
      }),
    );
    expect(find(render(), "form")?.props.disabled).toBe(false);
    expect(harness.mutate).toHaveBeenCalledTimes(1);
    expect(harness.refetch).toHaveBeenCalledOnce();
  });

  it("keeps submitted intent locked when the recovery read fails", async () => {
    submit();
    fail();
    harness.fetchQuery.mockRejectedValueOnce(new Error("offline"));
    find(render(), "refresh")?.props.onClick?.();
    await vi.waitFor(() => expect(harness.ref.current).toBe(false));
    expect(harness.reset).not.toHaveBeenCalled();
    const tree = render();
    expect(find(tree, "form")?.props.disabled).toBe(true);
    find(tree, "retry")?.props.onClick?.();
    expect(harness.mutate).toHaveBeenNthCalledWith(2, request);
  });

  it("does not submit on mount, reload, or a fresh project mount", () => {
    render();
    harness.states = [];
    render();
    harness.states = [];
    render({ ...action, id: "action_2" }, "project_2");
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(harness.fetchQuery).not.toHaveBeenCalled();
  });
});
