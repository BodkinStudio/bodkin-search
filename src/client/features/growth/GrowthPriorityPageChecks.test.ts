import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type * as React from "react";

const harness = vi.hoisted(() => ({
  cursor: 0,
  mutationCursor: 0,
  states: [] as unknown[],
  mutation: undefined as
    | undefined
    | Record<string, (value: unknown) => unknown>,
  strikingMutation: undefined as
    | undefined
    | Record<string, (value: unknown) => unknown>,
  mutate: vi.fn(),
  strikingMutate: vi.fn(),
  invalidate: vi.fn(),
  storage: new Map<string, string>(),
  storageWriteFails: false,
  setup: "ready" as "ready" | "missing_connection" | "missing_key_pages",
  isError: false,
  strikingIsError: false,
  strikingIsPending: false,
  sequence: 0,
}));

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
    else harness.strikingMutation = options;
    return {
      mutate: index === 0 ? harness.mutate : harness.strikingMutate,
      isPending: index === 0 ? false : harness.strikingIsPending,
      isError: index === 0 ? harness.isError : harness.strikingIsError,
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

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(textContent).join("");
}

function render(projectId = "project_1") {
  harness.cursor = 0;
  harness.mutationCursor = 0;
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
    harness.strikingMutate.mockReset();
    harness.invalidate.mockReset();
    harness.storageWriteFails = false;
    harness.setup = "ready";
    harness.isError = false;
    harness.strikingIsError = false;
    harness.strikingIsPending = false;
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

  it("keeps ranking-opportunity retries separate from decline-check retries", () => {
    click(render(), "Find ranking opportunities");
    expect(harness.strikingMutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(
      harness.storage.get("growth:striking-distance-check:project_1"),
    ).toBe("request_1");
    expect(harness.storage.has("growth:priority-page-check:project_1")).toBe(
      false,
    );

    harness.states = [];
    click(render(), "Retry ranking-opportunity request");
    expect(harness.strikingMutate).toHaveBeenLastCalledWith("request_1");
    expect(harness.sequence).toBe(1);

    click(render(), "Start new ranking-opportunity check");
    expect(harness.strikingMutate).toHaveBeenLastCalledWith("request_2");
    expect(
      harness.storage.get("growth:striking-distance-check:project_1"),
    ).toBe("request_2");
  });

  it("describes eligibility and disables the native action without setup", () => {
    harness.setup = "missing_key_pages";
    const tree = render();
    expect(textContent(tree)).toContain("positions 5–20");
    expect(textContent(tree)).toContain("configured priority pages");
    expect(textContent(tree)).toContain("at least 50 impressions");
    expect(textContent(tree)).toContain("current final 28-day window");
    expect(textContent(tree)).toContain("preceding 28 days as evidence");
    expect(findButton(tree, "Find ranking opportunities")?.props.disabled).toBe(
      true,
    );
  });

  it("announces and locks the ranking-opportunity action while pending", () => {
    harness.strikingIsPending = true;
    const tree = render();
    const button = findButton(tree, "Finding opportunities…");
    expect(button?.props.disabled).toBe(true);
    expect(button?.props["aria-busy"]).toBe(true);
    expect(textContent(tree)).toContain(
      "Finding ranking opportunities in final Search Console data",
    );
  });

  it("does not dispatch a ranking-opportunity check if retry storage fails", () => {
    harness.storageWriteFails = true;
    click(render(), "Find ranking opportunities");
    expect(harness.strikingMutate).not.toHaveBeenCalled();
    expect(textContent(render())).toContain(
      "Allow browser session storage before finding ranking opportunities",
    );
  });

  it("reports saved and already-covered opportunities and refreshes their reads", () => {
    click(render(), "Find ranking opportunities");
    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_1",
        status: "completed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: null,
        failureMessage: null,
      },
      replayed: false,
      candidateCount: 3,
      savedOpportunityCount: 2,
      alreadyCoveredCount: 1,
    });

    const html = renderToStaticMarkup(render());
    expect(html).toContain(
      "Found 3 eligible ranking opportunities. Newly saved: 2. Already covered: 1.",
    );
    expect(html).toContain('href="#growth-opportunities"');
    expect(
      harness.storage.has("growth:striking-distance-check:project_1"),
    ).toBe(false);
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthPriorityRecommendations", "project_1"],
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["growthProjectSummary", "project_1"],
    });
  });

  it("distinguishes no eligible result from incomplete and failed checks", () => {
    render();
    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_empty",
        status: "completed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: null,
        failureMessage: null,
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    expect(renderToStaticMarkup(render())).toContain(
      "No eligible ranking opportunities were found",
    );

    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_incomplete",
        status: "completed_with_errors",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: "INCOMPLETE_QUERY_INVENTORY",
        failureMessage: "Search Console returned incomplete query data.",
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    expect(renderToStaticMarkup(render())).toContain(
      "query data was incomplete, so no ranking opportunity was saved",
    );

    harness.strikingMutation?.onSuccess({
      run: {
        id: "striking_run_failed",
        status: "failed",
        periodStart: "2026-07-01",
        periodEnd: "2026-08-25",
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:01:00.000Z",
        failureCode: "SEARCH_CONSOLE_UNAVAILABLE",
        failureMessage: "Search Console query data could not be read.",
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    const failed = renderToStaticMarkup(render());
    expect(failed).toContain("ranking-opportunity check failed");
    expect(failed).toContain("Search Console query data could not be read");
  });
});
