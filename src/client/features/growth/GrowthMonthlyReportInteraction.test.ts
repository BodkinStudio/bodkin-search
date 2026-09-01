/* eslint-disable max-lines -- uncertain recovery is clearest as one hook/tree harness */
import { Children, isValidElement, type ReactNode } from "react";
import type * as React from "react";
import { QueryClient } from "@tanstack/query-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";

type Expectation = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  reportTimezone: string;
  version?: 1;
};
type MutationOptions = {
  mutationKey: string[];
  mutationFn: (request: Expectation) => Promise<GrowthMonthlyReportDto>;
  retry: boolean;
  onMutate: () => Promise<void>;
  onSuccess: (saved: GrowthMonthlyReportDto, request: Expectation) => void;
  onError: () => void;
  onSettled: () => void;
};
type QueryOptions = {
  queryKey: readonly string[];
  queryFn: () => Promise<GrowthMonthlyReportDto>;
  retry: boolean;
};
type QueryResult = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  data: GrowthMonthlyReportDto | undefined;
  refetch: () => Promise<{
    isSuccess: boolean;
    data: GrowthMonthlyReportDto;
  }>;
};
type StateUpdater = (prior: unknown) => unknown;

function isStateUpdater(value: unknown): value is StateUpdater {
  return typeof value === "function";
}

const ready: GrowthMonthlyReportDto = {
  state: "ready",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
};
const currentReady: GrowthMonthlyReportDto = {
  state: "ready",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  reportTimezone: "America/Los_Angeles",
};
const report: GrowthMonthlyReportDto = {
  state: "report",
  periodStart: ready.periodStart,
  periodEnd: ready.periodEnd,
  reportTimezone: ready.reportTimezone,
  report: {
    status: "draft",
    version: 1,
    generatedAt: "2026-09-01T09:00:00.000Z",
    dataCutoffAt: "2026-09-01T08:59:00.000Z",
    sections: [],
  },
};
const publishedReport: GrowthMonthlyReportDto = {
  ...report,
  report: {
    ...report.report,
    status: "published",
    publishedAt: "2026-09-01T10:00:00.000Z",
  },
};
const noActivity: GrowthMonthlyReportDto = {
  state: "no_activity",
  periodStart: ready.periodStart,
  periodEnd: ready.periodEnd,
  reportTimezone: ready.reportTimezone,
  message: "No eligible saved activity was found.",
};
const expectation: Expectation = {
  projectId: "project_1",
  periodStart: ready.periodStart,
  periodEnd: ready.periodEnd,
  reportTimezone: ready.reportTimezone,
};

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  stateCursor: 0,
  refs: [
    { current: false },
    { current: null as { focus: () => void } | null },
    { current: false },
    { current: null as { focus: () => void } | null },
    { current: null as { focus: () => void } | null },
    { current: null as { focus: () => void } | null },
    { current: null as { focus: () => void } | null },
  ],
  refCursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  effectCursor: 0,
  queryOptions: undefined as QueryOptions | undefined,
  mutationOptions: undefined as MutationOptions | undefined,
  publicationMutationOptions: undefined as MutationOptions | undefined,
  queryData: undefined as GrowthMonthlyReportDto | undefined,
  queryError: false,
  queryFetching: false,
  mutationPending: false,
  mutationError: false,
  publicationPending: false,
  publicationError: false,
  mutate: vi.fn(),
  reset: vi.fn(),
  refetch: vi.fn(),
  read: vi.fn(),
  build: vi.fn(),
  publish: vi.fn(),
  publicationRead: vi.fn(),
  publishMutate: vi.fn(),
  publishReset: vi.fn(),
}));

let client: QueryClient;

vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
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
  useRef: () => harness.refs[harness.refCursor++],
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    harness.effects[harness.effectCursor++] = effect;
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: QueryOptions): QueryResult => {
    harness.queryOptions = options;
    const cached = client.getQueryData<GrowthMonthlyReportDto>(
      options.queryKey,
    );
    return {
      isPending: false,
      isError: harness.queryError,
      isFetching: harness.queryFetching,
      data: cached ?? harness.queryData,
      refetch: harness.refetch,
    };
  },
  useMutation: (options: MutationOptions) => {
    const publication = options.mutationKey.some((key) =>
      key.includes("Publish"),
    );
    if (publication) harness.publicationMutationOptions = options;
    else harness.mutationOptions = options;
    return {
      mutate: publication ? harness.publishMutate : harness.mutate,
      reset: publication ? harness.publishReset : harness.reset,
      isPending: publication
        ? harness.publicationPending
        : harness.mutationPending,
      isError: publication ? harness.publicationError : harness.mutationError,
    };
  },
  useQueryClient: () => client,
}));

vi.mock("@/serverFunctions/growthReports", () => ({
  getGrowthMonthlyReport: harness.read,
  buildGrowthMonthlyReport: harness.build,
  getGrowthMonthlyPublicationStatus: harness.publicationRead,
  publishGrowthMonthlyReport: harness.publish,
}));

import {
  GrowthMonthlyReport,
  GrowthMonthlyReportState,
} from "./GrowthMonthlyReport";
import {
  GrowthMonthlyPublicationControl,
  GrowthMonthlyPublicationRecovery,
  type GrowthMonthlyPublicationControlProps,
  type GrowthMonthlyPublicationRecoveryProps,
} from "./GrowthMonthlyReportPublication";

type NodeProps = {
  children?: ReactNode;
  disabled?: boolean;
  locked?: boolean;
  onClick?: () => void;
  onBuild?: () => void;
  role?: string;
  tabIndex?: number;
};

function isPublicationControlElement(
  node: ReactNode,
): node is React.ReactElement<GrowthMonthlyPublicationControlProps> {
  return (
    isValidElement<GrowthMonthlyPublicationControlProps>(node) &&
    node.type === GrowthMonthlyPublicationControl
  );
}

function isPublicationRecoveryElement(
  node: ReactNode,
): node is React.ReactElement<GrowthMonthlyPublicationRecoveryProps> {
  return (
    isValidElement<GrowthMonthlyPublicationRecoveryProps>(node) &&
    node.type === GrowthMonthlyPublicationRecovery
  );
}

function textFor(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isPublicationControlElement(node))
    return textFor(GrowthMonthlyPublicationControl(node.props));
  if (isPublicationRecoveryElement(node))
    return textFor(GrowthMonthlyPublicationRecovery(node.props));
  if (!isValidElement<NodeProps>(node)) return "";
  return Children.toArray(node.props.children).map(textFor).join("");
}

function findButton(node: ReactNode, label: string): NodeProps | null {
  if (isPublicationControlElement(node))
    return findButton(GrowthMonthlyPublicationControl(node.props), label);
  if (isPublicationRecoveryElement(node))
    return findButton(GrowthMonthlyPublicationRecovery(node.props), label);
  if (!isValidElement<NodeProps>(node)) return null;
  if (node.type === "button" && textFor(node) === label) return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = findButton(child, label);
    if (match) return match;
  }
  return null;
}

function findState(node: ReactNode): NodeProps | null {
  if (!isValidElement<NodeProps>(node)) return null;
  if (node.type === GrowthMonthlyReportState) return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = findState(child);
    if (match) return match;
  }
  return null;
}

function findStatus(node: ReactNode, text: string): NodeProps | null {
  if (!isValidElement<NodeProps>(node)) return null;
  if (node.props.role === "status" && textFor(node).includes(text))
    return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const match = findStatus(child, text);
    if (match) return match;
  }
  return null;
}

function render() {
  harness.stateCursor = 0;
  harness.refCursor = 0;
  harness.effectCursor = 0;
  return GrowthMonthlyReport({ projectId: "project_1" });
}

function flushEffects() {
  for (const effect of harness.effects) effect();
}

function beginBuild() {
  findState(render())?.onBuild?.();
}

function failBuild() {
  harness.mutationOptions?.onError();
  harness.mutationOptions?.onSettled();
  harness.mutationError = true;
}

function beginPublication() {
  harness.queryData = report;
  findButton(render(), "Publish summary")?.onClick?.();
  findButton(render(), "Confirm publication")?.onClick?.();
}

function failPublication() {
  harness.publicationMutationOptions?.onError();
  harness.publicationMutationOptions?.onSettled();
  harness.publicationError = true;
}

describe("Growth Monthly Report interactions", () => {
  beforeEach(() => {
    client = new QueryClient();
    harness.states = [];
    harness.stateCursor = 0;
    harness.refCursor = 0;
    harness.effects = [];
    harness.effectCursor = 0;
    harness.refs[0].current = false;
    harness.refs[1].current = null;
    harness.refs[2].current = null;
    harness.refs[3].current = null;
    harness.refs[4].current = null;
    harness.refs[5].current = null;
    harness.refs[6].current = false;
    harness.queryData = ready;
    harness.queryError = false;
    harness.queryFetching = false;
    harness.mutationPending = false;
    harness.mutationError = false;
    harness.publicationPending = false;
    harness.publicationError = false;
    vi.clearAllMocks();
    harness.refetch.mockResolvedValue({ isSuccess: true, data: ready });
    harness.read.mockResolvedValue(ready);
    harness.build.mockResolvedValue(report);
    harness.publish.mockResolvedValue(report);
    harness.publicationRead.mockResolvedValue(report);
  });

  it("keeps render and refresh read-only", async () => {
    const tree = render();
    expect(harness.mutate).not.toHaveBeenCalled();
    expect(harness.build).not.toHaveBeenCalled();
    expect(harness.queryOptions).toMatchObject({
      queryKey: ["growthMonthlyReport", "project_1"],
      retry: false,
    });
    await harness.queryOptions?.queryFn();
    expect(harness.read).toHaveBeenCalledExactlyOnceWith({
      data: { projectId: "project_1" },
    });
    findButton(tree, "Refresh summary")?.onClick?.();
    await vi.waitFor(() => expect(harness.refetch).toHaveBeenCalledOnce());
    expect(harness.mutate).not.toHaveBeenCalled();

    harness.refetch.mockResolvedValueOnce({ isSuccess: true, data: report });
    findButton(render(), "Refresh summary")?.onClick?.();
    await vi.waitFor(() => expect(harness.refetch).toHaveBeenCalledTimes(2));
    expect(textFor(render())).toContain("Saved frozen monthly summary loaded");
    expect(textFor(render())).not.toContain("content is unchanged");
  });

  it("dispatches one explicit build with the exact displayed coordinate", async () => {
    const onBuild = findState(render())?.onBuild;
    onBuild?.();
    onBuild?.();
    expect(harness.mutate).toHaveBeenCalledExactlyOnceWith(expectation);
    await harness.mutationOptions?.mutationFn(expectation);
    expect(harness.build).toHaveBeenCalledExactlyOnceWith({
      data: expectation,
    });
  });

  it("snapshots a draft coordinate before confirming and publishes it once", () => {
    harness.queryData = report;
    findButton(render(), "Publish summary")?.onClick?.();
    const confirmation = render();
    expect(textFor(confirmation)).toContain("Publish August 2026 summary?");
    expect(textFor(confirmation)).toContain(
      "does not share or send this report externally",
    );
    findButton(confirmation, "Confirm publication")?.onClick?.();
    findButton(confirmation, "Confirm publication")?.onClick?.();
    expect(harness.publishMutate).toHaveBeenCalledExactlyOnceWith({
      ...expectation,
      version: 1,
    });
  });

  it("keeps the frozen publication confirmation actionable after a cache rollover", () => {
    harness.queryData = report;
    findButton(render(), "Publish summary")?.onClick?.();
    harness.queryData = currentReady;
    const confirmation = render();
    expect(textFor(confirmation)).toContain("Publish August 2026 summary?");
    findButton(confirmation, "Confirm publication")?.onClick?.();
    expect(harness.publishMutate).toHaveBeenCalledWith({
      ...expectation,
      version: 1,
    });
  });

  it("cancels publication without mutation and restores the trigger focus", () => {
    harness.queryData = report;
    findButton(render(), "Publish summary")?.onClick?.();
    findButton(render(), "Cancel")?.onClick?.();
    expect(harness.publishMutate).not.toHaveBeenCalled();
    const triggerFocus = vi.fn();
    harness.refs[3].current = { focus: triggerFocus };
    const closed = render();
    flushEffects();
    expect(triggerFocus).toHaveBeenCalledOnce();
    expect(textFor(closed)).toContain("Publish summary");
  });

  it("focuses the inline confirmation without publishing on open", () => {
    harness.queryData = report;
    findButton(render(), "Publish summary")?.onClick?.();
    const confirmationFocus = vi.fn();
    harness.refs[4].current = { focus: confirmationFocus };
    const confirmation = render();
    flushEffects();
    expect(confirmationFocus).toHaveBeenCalledOnce();
    expect(harness.publishMutate).not.toHaveBeenCalled();
    expect(findButton(confirmation, "Refresh summary")?.disabled).toBe(true);
  });

  it("commits authoritative publication to cache and focuses the outcome", () => {
    beginPublication();
    const noticeFocus = vi.fn();
    harness.refs[1].current = { focus: noticeFocus };
    harness.publicationMutationOptions?.onSuccess(publishedReport, {
      ...expectation,
      version: 1,
    });
    harness.publicationMutationOptions?.onSettled();

    const saved = render();
    flushEffects();
    expect(client.getQueryData(["growthMonthlyReport", "project_1"])).toEqual(
      publishedReport,
    );
    expect(textFor(saved)).toContain("cannot be unpublished");
    expect(noticeFocus).toHaveBeenCalledOnce();
    expect(findButton(saved, "Publish summary")).toBeNull();
    expect(harness.refs[0].current).toBe(false);
  });

  it("retains the exact lock and focuses the alert after an ambiguous failure", () => {
    beginPublication();
    failPublication();
    const errorFocus = vi.fn();
    harness.refs[5].current = { focus: errorFocus };
    const uncertain = render();
    flushEffects();
    expect(errorFocus).toHaveBeenCalledOnce();
    expect(textFor(uncertain)).toContain(
      "The publication could not be confirmed",
    );
    expect(findButton(uncertain, "Cancel")).toBeNull();
    expect(findButton(uncertain, "Refresh summary")?.disabled).toBe(true);
    expect(findState(uncertain)?.locked).toBe(true);
    expect(harness.refs[0].current).toBe(true);
  });

  it("retries only the identical uncertain publication", () => {
    beginPublication();
    failPublication();
    const retry = findButton(render(), "Retry same publication");
    retry?.onClick?.();
    retry?.onClick?.();
    expect(harness.publishMutate).toHaveBeenCalledTimes(2);
    expect(harness.publishMutate).toHaveBeenNthCalledWith(1, {
      ...expectation,
      version: 1,
    });
    expect(harness.publishMutate).toHaveBeenNthCalledWith(2, {
      ...expectation,
      version: 1,
    });
  });

  it("confirms an exact published winner with a read-only status check", async () => {
    beginPublication();
    failPublication();
    harness.publicationRead.mockResolvedValueOnce(publishedReport);
    findButton(render(), "Check saved summary")?.onClick?.();
    await vi.waitFor(() => expect(harness.publishReset).toHaveBeenCalledOnce());
    expect(harness.publicationRead).toHaveBeenCalledExactlyOnceWith({
      data: { ...expectation, version: 1 },
    });
    expect(client.getQueryData(["growthMonthlyReport", "project_1"])).toEqual(
      publishedReport,
    );
    const noticeFocus = vi.fn();
    harness.refs[1].current = { focus: noticeFocus };
    const confirmed = render();
    flushEffects();
    expect(textFor(confirmed)).toContain("Published summary confirmed");
    expect(noticeFocus).toHaveBeenCalledOnce();
    expect(harness.refs[0].current).toBe(false);
  });

  it("keeps a confirmed draft locked for exact retry", async () => {
    beginPublication();
    failPublication();
    harness.publicationRead.mockResolvedValueOnce(report);
    findButton(render(), "Check saved summary")?.onClick?.();
    await vi.waitFor(() =>
      expect(harness.publicationRead).toHaveBeenCalledOnce(),
    );
    const draft = render();
    expect(textFor(draft)).toContain("No published version was found");
    expect(findButton(draft, "Refresh summary")?.disabled).toBe(true);
    expect(findButton(draft, "Retry same publication")).not.toBeNull();
  });

  it("keeps the exact lock when publication status cannot be read", async () => {
    beginPublication();
    failPublication();
    harness.publicationRead.mockRejectedValueOnce(new Error("NOT_FOUND"));
    findButton(render(), "Check saved summary")?.onClick?.();
    await vi.waitFor(() =>
      expect(harness.publicationRead).toHaveBeenCalledOnce(),
    );
    const failed = render();
    expect(textFor(failed)).toContain("Published status could not be checked");
    expect(findButton(failed, "Refresh summary")?.disabled).toBe(true);
  });

  it("commits a normal saved build to cache, unlocks and focuses its visible outcome", () => {
    beginBuild();
    const noticeFocus = vi.fn();
    harness.refs[1].current = { focus: noticeFocus };
    harness.mutationOptions?.onSuccess(report, expectation);
    harness.mutationOptions?.onSettled();

    const saved = render();
    flushEffects();
    expect(client.getQueryData(["growthMonthlyReport", "project_1"])).toEqual(
      report,
    );
    expect(textFor(saved)).toContain("saved as a frozen version");
    expect(findStatus(saved, "saved as a frozen version")).toMatchObject({
      role: "status",
      tabIndex: -1,
    });
    expect(noticeFocus).toHaveBeenCalledOnce();
    expect(harness.mutate).toHaveBeenCalledOnce();
  });

  it("commits and announces a no-activity build without leaving the retry lock", () => {
    beginBuild();
    const noticeFocus = vi.fn();
    harness.refs[1].current = { focus: noticeFocus };
    harness.mutationOptions?.onSuccess(noActivity, expectation);
    harness.mutationOptions?.onSettled();

    const saved = render();
    flushEffects();
    expect(client.getQueryData(["growthMonthlyReport", "project_1"])).toEqual(
      noActivity,
    );
    expect(textFor(saved)).toContain(
      "No eligible saved activity was available",
    );
    expect(noticeFocus).toHaveBeenCalledOnce();
    expect(harness.mutate).toHaveBeenCalledOnce();
  });

  it("requires a new explicit build after mutation success reports a changed coordinate", () => {
    beginBuild();
    const noticeFocus = vi.fn();
    harness.refs[1].current = { focus: noticeFocus };
    harness.mutationOptions?.onSuccess(currentReady, expectation);
    harness.mutationOptions?.onSettled();

    const current = render();
    flushEffects();
    expect(textFor(current)).toContain("nothing was built automatically");
    expect(noticeFocus).toHaveBeenCalledOnce();
    expect(harness.mutate).toHaveBeenCalledOnce();

    findState(current)?.onBuild?.();
    expect(harness.mutate).toHaveBeenNthCalledWith(2, {
      projectId: "project_1",
      periodStart: currentReady.periodStart,
      periodEnd: currentReady.periodEnd,
      reportTimezone: currentReady.reportTimezone,
    });
  });

  it("recovers the exact saved winner and moves focus to the outcome", async () => {
    beginBuild();
    failBuild();
    const errorFocus = vi.fn();
    harness.refs[2].current = { focus: errorFocus };
    const uncertain = render();
    flushEffects();
    expect(errorFocus).toHaveBeenCalledOnce();

    harness.read.mockResolvedValueOnce(report);
    findButton(uncertain, "Check saved summary")?.onClick?.();
    await vi.waitFor(() => expect(harness.reset).toHaveBeenCalledOnce());
    expect(harness.read).toHaveBeenLastCalledWith({ data: expectation });
    expect(client.getQueryData(["growthMonthlyReport", "project_1"])).toEqual(
      report,
    );
    expect(harness.mutate).toHaveBeenCalledTimes(1);

    const outcomeFocus = vi.fn();
    harness.refs[1].current = { focus: outcomeFocus };
    render();
    flushEffects();
    expect(outcomeFocus).toHaveBeenCalledOnce();
  });

  it("retries the identical uncertain coordinate", () => {
    beginBuild();
    failBuild();
    findButton(render(), "Retry build")?.onClick?.();
    expect(harness.mutate).toHaveBeenCalledTimes(2);
    expect(harness.mutate).toHaveBeenNthCalledWith(1, expectation);
    expect(harness.mutate).toHaveBeenNthCalledWith(2, expectation);
  });

  it("replaces a stale rollover expectation without building the new month", async () => {
    beginBuild();
    failBuild();
    harness.read.mockResolvedValueOnce(currentReady);
    findButton(render(), "Check saved summary")?.onClick?.();
    await vi.waitFor(() => expect(harness.reset).toHaveBeenCalledOnce());
    expect(client.getQueryData(["growthMonthlyReport", "project_1"])).toEqual(
      currentReady,
    );
    expect(harness.mutate).toHaveBeenCalledTimes(1);

    const outcomeFocus = vi.fn();
    harness.refs[1].current = { focus: outcomeFocus };
    const current = render();
    flushEffects();
    expect(outcomeFocus).toHaveBeenCalledOnce();
    expect(textFor(current)).toContain("Review the current period");
    findState(current)?.onBuild?.();
    expect(harness.mutate).toHaveBeenNthCalledWith(2, {
      projectId: "project_1",
      periodStart: currentReady.periodStart,
      periodEnd: currentReady.periodEnd,
      reportTimezone: currentReady.reportTimezone,
    });
  });
});
