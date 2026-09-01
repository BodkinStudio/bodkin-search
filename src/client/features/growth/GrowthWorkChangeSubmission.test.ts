import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GrowthWorkChangesOverview,
  LinkGrowthWorkChangeInput,
} from "@/types/schemas/growth-work";
import { GrowthWorkChangesPanel } from "./GrowthWorkChanges";
import { GrowthWorkChangeForm } from "./GrowthWorkChangeForm";

type Change = GrowthWorkChangesOverview["availableChanges"][number];
type State =
  | { request: LinkGrowthWorkChangeInput; change: Change }
  | boolean
  | number
  | null;
type Options = {
  retry: boolean;
  mutationFn: (data: LinkGrowthWorkChangeInput) => Promise<unknown>;
  onMutate: () => Promise<unknown>;
  onSuccess: () => void;
  onSettled: () => void;
};
const harness = vi.hoisted(() => ({
  states: [] as State[],
  cursor: 0,
  ref: { current: false },
  data: undefined as GrowthWorkChangesOverview | undefined,
  queryKey: [] as string[],
  queryFn: undefined as (() => Promise<unknown>) | undefined,
  queryError: false,
  error: false,
  pending: false,
  options: undefined as Options | undefined,
  mutate: vi.fn(),
  reset: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  read: vi.fn(),
  link: vi.fn(),
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
  useQuery: (options: {
    queryKey: string[];
    queryFn: () => Promise<unknown>;
  }) => {
    harness.queryKey = options.queryKey;
    harness.queryFn = options.queryFn;
    return {
      data: harness.data,
      isPending: !harness.data,
      isError: harness.queryError,
      isFetching: false,
      refetch: harness.refetch,
    };
  },
  useQueryClient: () => ({
    cancelQueries: harness.cancel,
    invalidateQueries: harness.invalidate,
  }),
  useMutation: (options: Options) => {
    harness.options = options;
    return {
      mutate: harness.mutate,
      reset: harness.reset,
      isPending: harness.pending,
      isError: harness.error,
    };
  },
}));
vi.mock("@/serverFunctions/growthWork", () => ({
  getGrowthWorkChanges: harness.read,
  linkGrowthWorkChange: harness.link,
}));

const change: Change = {
  id: "change_1",
  changeType: "content_updated",
  description: "Updated pricing copy.",
  happenedAt: "2026-08-01T00:00:00.000Z",
  recordedAt: "2026-08-02T00:00:00.000Z",
  displayUrls: [],
};
const request = {
  projectId: "project_1",
  actionId: "action_1",
  changeEventId: change.id,
};
type Props = {
  children?: ReactNode;
  onSubmit?: (id: string) => void;
  onClick?: () => void;
  disabled?: boolean;
  changes?: Change[];
  selectedId?: string;
};
function find(node: ReactNode, target: string): Props | undefined {
  if (!isValidElement<Props>(node)) return undefined;
  if (node.type === GrowthWorkChangeForm && target === "form")
    return node.props;
  if (node.type === "button" && node.props.children === target)
    return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = find(child, target);
    if (match) return match;
  }
  return undefined;
}
function render(projectId = request.projectId, actionId = request.actionId) {
  harness.cursor = 0;
  return GrowthWorkChangesPanel({ projectId, actionId });
}
function fail() {
  harness.error = true;
  harness.options?.onSettled();
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.states = [];
  harness.cursor = 0;
  harness.ref.current = false;
  harness.queryError = false;
  harness.error = false;
  harness.pending = false;
  harness.data = {
    actionId: "action_1",
    linkedChanges: [],
    availableChanges: [change],
    limit: 50,
  };
});

describe("Link saved change submission", () => {
  it("does not submit on render or refresh and scopes reads to project and Work", async () => {
    const tree = render("project_2", "action_2");
    expect(harness.queryKey).toEqual([
      "growthWorkChanges",
      "project_2",
      "action_2",
    ]);
    await harness.queryFn?.();
    expect(harness.read).toHaveBeenCalledWith({
      data: { projectId: "project_2", actionId: "action_2" },
    });
    find(tree, "Refresh saved links")?.onClick?.();
    expect(harness.refetch).toHaveBeenCalledOnce();
    expect(harness.mutate).not.toHaveBeenCalled();
  });
  it("dispatches one explicit pair despite double click", () => {
    const submit = find(render(), "form")?.onSubmit;
    submit?.(change.id);
    submit?.(change.id);
    expect(harness.mutate).toHaveBeenCalledExactlyOnceWith(request);
    expect(harness.options?.retry).toBe(false);
    expect(find(render(), "form")?.disabled).toBe(true);
  });
  it("does not dispatch arbitrary IDs or use a failed candidate read", () => {
    find(render(), "form")?.onSubmit?.("foreign_id");
    harness.queryError = true;
    find(render(), "form")?.onSubmit?.(change.id);
    expect(harness.mutate).not.toHaveBeenCalled();
  });
  it("keeps the submitted record and exact pair locked after uncertain save and refreshed candidates", () => {
    find(render(), "form")?.onSubmit?.(change.id);
    fail();
    harness.data = {
      actionId: "action_1",
      linkedChanges: [change],
      availableChanges: [],
      limit: 50,
    };
    const tree = render();
    expect(find(tree, "form")).toMatchObject({
      disabled: true,
      changes: [change],
      selectedId: change.id,
    });
    find(tree, "Retry link")?.onClick?.();
    find(tree, "Retry link")?.onClick?.();
    expect(harness.mutate).toHaveBeenCalledTimes(2);
    expect(harness.mutate).toHaveBeenNthCalledWith(2, request);
  });
  it("requires explicit recovery before selecting another record", () => {
    find(render(), "form")?.onSubmit?.(change.id);
    fail();
    find(render(), "Choose another change")?.onClick?.();
    expect(harness.reset).toHaveBeenCalledOnce();
    expect(find(render(), "form")?.disabled).toBe(false);
    expect(harness.mutate).toHaveBeenCalledTimes(1);
  });
  it("uses the existing link endpoint and refreshes the scoped association and measurement caches", async () => {
    find(render(), "form")?.onSubmit?.(change.id);
    await harness.options?.mutationFn(request);
    await harness.options?.onMutate();
    harness.options?.onSuccess();
    harness.options?.onSettled();
    expect(harness.link).toHaveBeenCalledExactlyOnceWith({ data: request });
    expect(harness.cancel).toHaveBeenCalledWith({
      queryKey: ["growthWorkChanges", "project_1", "action_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledTimes(2);
    expect(harness.invalidate).toHaveBeenNthCalledWith(1, {
      queryKey: ["growthWorkMeasurement", "project_1", "action_1"],
    });
    expect(harness.invalidate).toHaveBeenNthCalledWith(2, {
      queryKey: ["growthWorkChanges", "project_1", "action_1"],
    });
    expect(find(render(), "form")?.disabled).toBe(false);
  });
});
