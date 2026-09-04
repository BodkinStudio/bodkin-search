import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { expect, vi } from "vitest";

export const harness = {
  cursor: 0,
  mutationCursor: 0,
  states: [] as unknown[],
  mutation: undefined as
    | undefined
    | Record<string, (value: unknown) => unknown>,
  strikingMutation: undefined as
    | undefined
    | Record<string, (value: unknown) => unknown>,
  lowCtrMutation: undefined as
    | undefined
    | Record<string, (value: unknown) => unknown>,
  mutate: vi.fn(),
  strikingMutate: vi.fn(),
  lowCtrMutate: vi.fn(),
  invalidate: vi.fn(),
  storage: new Map<string, string>(),
  storageWriteFails: false,
  setup: "ready" as "ready" | "missing_connection" | "missing_key_pages",
  isError: false,
  strikingIsError: false,
  strikingIsPending: false,
  lowCtrIsError: false,
  lowCtrIsPending: false,
  sequence: 0,
};

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (harness.states[index] === undefined)
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
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[] }) =>
    options.queryKey[0] === "growthChecks"
      ? {
          isPending: false,
          isError: false,
          data: { setup: harness.setup, runs: [] },
          refetch: vi.fn(),
        }
      : {
          isEnabled: false,
          isPending: false,
          isError: false,
          refetch: vi.fn(),
        },
  useMutation: (options: Record<string, (value: unknown) => unknown>) => {
    const index = harness.mutationCursor++;
    if (index === 0) harness.mutation = options;
    else if (index === 1) harness.strikingMutation = options;
    else harness.lowCtrMutation = options;
    return {
      mutate:
        index === 0
          ? harness.mutate
          : index === 1
            ? harness.strikingMutate
            : harness.lowCtrMutate,
      isPending:
        index === 0
          ? false
          : index === 1
            ? harness.strikingIsPending
            : harness.lowCtrIsPending,
      isError:
        index === 0
          ? harness.isError
          : index === 1
            ? harness.strikingIsError
            : harness.lowCtrIsError,
      error: new Error("safe test error"),
    };
  },
  useQueryClient: () => ({ invalidateQueries: harness.invalidate }),
}));
vi.mock("@/serverFunctions/growthChecks", () => ({
  getGrowthCheckEvidence: vi.fn(),
  getGrowthCheckRun: vi.fn(),
  getGrowthChecksOverview: vi.fn(),
  runGrowthCheck: vi.fn(),
  runGrowthStrikingDistanceCheck: vi.fn(),
  runGrowthLowCtrCheck: vi.fn(),
}));
vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthInvestigation: vi.fn(),
  approveGrowthInvestigation: vi.fn(),
  reviewGrowthInvestigation: vi.fn(),
}));

import { GrowthPriorityPageChecks } from "./GrowthPriorityPageChecks";

export function findButton(
  node: ReactNode,
  label: string,
): {
  props: {
    onClick?: () => void;
    disabled?: boolean;
    "aria-busy"?: boolean;
  };
} | null {
  if (
    !isValidElement<{
      children?: ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      "aria-busy"?: boolean;
    }>(node)
  )
    return null;
  if (node.type === "button" && node.props.children === label) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

export function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(textContent).join("");
}

export function render(projectId = "project_1") {
  harness.cursor = 0;
  harness.mutationCursor = 0;
  return GrowthPriorityPageChecks({
    projectId,
    selectedRunId: null,
    onSelectRun: vi.fn(),
  });
}

export function click(tree: ReactNode, label: string) {
  const button = findButton(tree, label);
  expect(button, label).not.toBeNull();
  button?.props.onClick?.();
}

export function resetHarness() {
  harness.states = [];
  harness.storage.clear();
  harness.mutate.mockReset();
  harness.strikingMutate.mockReset();
  harness.lowCtrMutate.mockReset();
  harness.invalidate.mockReset();
  harness.storageWriteFails = false;
  harness.setup = "ready";
  harness.isError = false;
  harness.strikingIsError = false;
  harness.strikingIsPending = false;
  harness.lowCtrIsError = false;
  harness.lowCtrIsPending = false;
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
}

export function teardownHarness() {
  vi.unstubAllGlobals();
}
