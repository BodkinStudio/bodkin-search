import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";

const harness = vi.hoisted(() => ({
  cursor: 0,
  states: [] as Array<string | null | undefined>,
  mutation: undefined as
    | undefined
    | Record<string, (value: unknown) => unknown>,
  mutate: vi.fn(),
  storage: new Map<string, string>(),
  storageWriteFails: false,
  isError: false,
  sequence: 0,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: (initial: string | null | (() => string | null)) => {
      const index = harness.cursor++;
      if (harness.states[index] === undefined)
        harness.states[index] =
          typeof initial === "function" ? initial() : initial;
      return [
        harness.states[index],
        (value: string | null) => {
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
          data: { setup: "ready", runs: [] },
          refetch: vi.fn(),
        }
      : {
          isEnabled: false,
          isPending: false,
          isError: false,
          refetch: vi.fn(),
        },
  useMutation: (options: Record<string, (value: unknown) => unknown>) => {
    harness.mutation = options;
    return {
      mutate: harness.mutate,
      isPending: false,
      isError: harness.isError,
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/serverFunctions/growthChecks", () => ({
  getGrowthCheckEvidence: vi.fn(),
  getGrowthCheckRun: vi.fn(),
  getGrowthChecksOverview: vi.fn(),
  runGrowthCheck: vi.fn(),
}));
vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthInvestigation: vi.fn(),
  approveGrowthInvestigation: vi.fn(),
  reviewGrowthInvestigation: vi.fn(),
}));

import { GrowthPriorityPageChecks } from "./GrowthPriorityPageChecks";

function findButton(
  node: ReactNode,
  label: string,
): { props: { onClick?: () => void } } | null {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node))
    return null;
  if (node.props.children === label) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

function render(projectId = "project_1") {
  harness.cursor = 0;
  return GrowthPriorityPageChecks({
    projectId,
    selectedRunId: null,
    onSelectRun: vi.fn(),
  });
}

function click(tree: ReactNode, label: string) {
  const button = findButton(tree, label);
  expect(button, label).not.toBeNull();
  button?.props.onClick?.();
}

describe("Growth check retry identity", () => {
  beforeEach(() => {
    harness.states = [];
    harness.storage.clear();
    harness.mutate.mockReset();
    harness.storageWriteFails = false;
    harness.isError = false;
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
  afterEach(() => vi.unstubAllGlobals());

  it("persists before dispatch and reuses an uncertain request after a full remount", () => {
    harness.mutate.mockImplementation((key: string) => {
      expect(harness.storage.get("growth:priority-page-check:project_1")).toBe(
        key,
      );
    });
    click(render(), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");

    harness.isError = true;
    click(render(), "Retry previous request");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");

    harness.states = []; // A navigation/reload loses all component state.
    harness.isError = false;
    click(render(), "Retry previous request");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.sequence).toBe(1);
  });

  it("retains a running replay, then clears only a known terminal outcome", () => {
    click(render(), "Run check");
    harness.mutation?.onSuccess({ run: { id: "run_1", status: "running" } });
    harness.states = [];
    click(render(), "Retry previous request");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");

    harness.mutation?.onSuccess({ run: { id: "run_1", status: "completed" } });
    expect(harness.storage.has("growth:priority-page-check:project_1")).toBe(
      false,
    );
    click(render(), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
  });

  it("requires an explicit new attempt to replace an unresolved request", () => {
    click(render(), "Run check");
    click(render(), "Start new check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
    expect(harness.storage.get("growth:priority-page-check:project_1")).toBe(
      "request_2",
    );
  });

  it("keeps pending requests scoped to their project", () => {
    click(render(), "Run check");
    harness.states = [];
    click(render("project_2"), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_2");
    expect(harness.storage.get("growth:priority-page-check:project_1")).toBe(
      "request_1",
    );
    expect(harness.storage.get("growth:priority-page-check:project_2")).toBe(
      "request_2",
    );
  });

  it("does not dispatch if it cannot persist the retry identity", () => {
    harness.storageWriteFails = true;
    click(render(), "Run check");
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(harness.states[1]).toContain("Allow browser session storage");
  });

  it("rejects malformed persisted request identities", () => {
    harness.storage.set(
      "growth:priority-page-check:project_1",
      "unsafe / nonce",
    );
    click(render(), "Run check");
    expect(harness.mutate).toHaveBeenLastCalledWith("request_1");
  });
});
