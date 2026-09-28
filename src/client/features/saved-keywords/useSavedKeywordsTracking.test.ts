import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SavedKeywordRow } from "@/types/keywords";

const state: unknown[] = [];
let stateIndex = 0;
let mutationOptions: {
  mutationFn: (request: { configId: string; keywords: string[] }) => unknown;
  onSuccess: (
    result: { added: number; checkTriggered: boolean },
    request: { configId: string; keywords: string[] },
  ) => void;
  onError: (error: unknown) => void;
} | null = null;
const mutate = vi.fn();
const invalidateQueries = vi.fn();

vi.mock("react", () => ({
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => {
    const index = stateIndex++;
    state[index] ??= initial;
    return [state[index], (value: unknown) => (state[index] = value)];
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: typeof mutationOptions) => {
    mutationOptions = options;
    return { isPending: false, mutate };
  },
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/serverFunctions/rank-tracking", () => ({
  addTrackingKeywords: vi.fn(),
}));
vi.mock("@/client/lib/error-messages", () => ({
  getStandardErrorMessage: (error: unknown) => `Error: ${String(error)}`,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { useSavedKeywordsTracking } from "./useSavedKeywordsTracking";

function row(keyword: string, id = keyword): SavedKeywordRow {
  return {
    id,
    projectId: "project-id",
    keyword,
    locationCode: 2840,
    languageCode: "en",
    createdAt: "2026-01-01T00:00:00.000Z",
    searchVolume: null,
    cpc: null,
    competition: null,
    keywordDifficulty: null,
    intent: null,
    monthlySearches: [],
    fetchedAt: null,
    tags: [],
  };
}

function render(selectedRows: SavedKeywordRow[]) {
  stateIndex = 0;
  return useSavedKeywordsTracking({
    projectId: "project-id",
    selectedRows,
    onSuccess: onSuccess,
  });
}

const onSuccess = vi.fn();

type TrackingModalProps = {
  keywords: string[];
  lockedConfigId: string | null;
  error: string | null;
  onClose: () => void;
  onConfirm: (configId: string) => void;
};

function modalProps(result: ReturnType<typeof render>): TrackingModalProps {
  const candidate = result.modal;
  const props: unknown =
    candidate && typeof candidate === "object" && "props" in candidate
      ? candidate.props
      : null;
  if (!isRecord(props)) {
    throw new Error("Expected SavedKeywordsTrackingModal props");
  }
  const keywords = props.keywords;
  const onConfirm = props.onConfirm;
  const onClose = props.onClose;
  const lockedConfigId = props.lockedConfigId;
  const error = props.error;
  if (
    !isStringArray(keywords) ||
    !isConfirmCallback(onConfirm) ||
    !isVoidCallback(onClose)
  ) {
    throw new Error("Expected SavedKeywordsTrackingModal props");
  }
  return {
    keywords,
    lockedConfigId: typeof lockedConfigId === "string" ? lockedConfigId : null,
    error: typeof error === "string" ? error : null,
    onClose,
    onConfirm,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isVoidCallback(value: unknown): value is () => void {
  return typeof value === "function";
}

function isConfirmCallback(
  value: unknown,
): value is (configId: string) => void {
  return typeof value === "function";
}

describe("useSavedKeywordsTracking", () => {
  beforeEach(() => {
    state.length = 0;
    stateIndex = 0;
    mutationOptions = null;
    mutate.mockReset();
    invalidateQueries.mockReset();
    onSuccess.mockReset();
  });

  it("blocks a selection with no usable terms", () => {
    let result = render([row("  ")]);
    result.open();
    result = render([row("  ")]);
    expect(modalProps(result).error).toContain("no usable keywords");
    modalProps(result).onConfirm("config-a");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not submit when opened or cancelled", () => {
    let result = render([row("first")]);
    result.open();
    result = render([row("first")]);
    expect(modalProps(result).keywords).toEqual(["first"]);
    expect(mutate).not.toHaveBeenCalled();

    modalProps(result).onClose();
    expect(render([row("first")]).modal).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("retries the exact failed request and refreshes its rank-tracking caches on success", () => {
    let result = render([row(" first ", "one"), row("second", "two")]);
    result.open();
    result = render([row(" first ", "one"), row("second", "two")]);
    modalProps(result).onConfirm("config-a");
    expect(mutate).toHaveBeenCalledWith({
      configId: "config-a",
      keywords: ["first", "second"],
    });

    mutationOptions?.onError("network down");
    result = render([row("changed", "three")]);
    expect(modalProps(result).lockedConfigId).toBe("config-a");
    expect(modalProps(result).keywords).toEqual(["first", "second"]);
    expect(modalProps(result).error).toBe("Error: network down");

    modalProps(result).onConfirm("config-b");
    expect(mutate).toHaveBeenLastCalledWith({
      configId: "config-a",
      keywords: ["first", "second"],
    });

    mutationOptions?.onSuccess(
      { added: 1, checkTriggered: true },
      { configId: "config-a", keywords: ["first", "second"] },
    );
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["rankTrackingResults", "project-id", "config-a"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["rankTrackingCostEstimate", "project-id", "config-a"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["rankTrackingLatestRun", "project-id", "config-a"],
    });
  });
});
