import { z } from "zod";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { AppError } from "@/server/lib/errors";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";

export const PERSISTENT_TRACKED_RANK_DROP_DETECTOR_VERSION =
  "persistent-tracked-rank-drop-v1";
export const PERSISTENT_RANK_DROP_POLICY = {
  requiredRuns: 4,
  persistentChecks: 3,
  minimumPositionLoss: 3,
  maxCandidates: 3,
} as const;

const snapshotSchema = z.strictObject({
  id: z.number().int().positive(),
  runId: z.string().trim().min(1).max(100),
  checkedAt: z.string().trim().min(10).max(40),
  position: z.number().int().positive().nullable(),
  url: z.string().trim().min(1).max(4096).nullable(),
});
const sequenceSchema = z.strictObject({
  configId: z.string().trim().min(1).max(100),
  domain: z.string().trim().min(1).max(2000),
  serpDepth: z.number().int().min(1).max(1000),
  trackingKeywordId: z.string().trim().min(1).max(100),
  keyword: z.string().trim().min(1).max(500),
  searchVolume: z.number().int().nonnegative().nullable(),
  device: z.enum(["desktop", "mobile"]),
  snapshots: z
    .array(snapshotSchema)
    .length(PERSISTENT_RANK_DROP_POLICY.requiredRuns),
});
const keyPageSchema = z.strictObject({
  id: z.string().trim().min(1).max(100),
  projectId: z.string().trim().min(1).max(100),
  url: z.string().trim().min(1).max(4096),
  commercialWeight: z.number().int().min(1).max(5).nullable(),
});
const inputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
  runId: z.string().trim().min(1).max(100),
  site: z.string().trim().min(1).max(2000),
  capturedAt: z.string().datetime({ offset: true }),
  keyPages: z.array(keyPageSchema).min(1).max(100),
  sequences: z.array(sequenceSchema).max(10_000),
});

function canonicalInstant(value: string) {
  const persistedTimestamp =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)| (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/;
  const fields = persistedTimestamp.exec(value);
  const year = Number(fields?.[1]);
  const month = Number(fields?.[2]);
  const day = Number(fields?.[3]);
  const validCalendarDate =
    Boolean(fields) &&
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  if (!validCalendarDate || Number.isNaN(parsed.valueOf()))
    throw new AppError(
      "VALIDATION_ERROR",
      "Rank snapshot timestamp is invalid",
    );
  return parsed.toISOString();
}

function codeUnitCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function persistentRankDropEvidenceRef(input: {
  serpDepth: number;
  snapshotIds: number[];
}) {
  if (
    !Number.isSafeInteger(input.serpDepth) ||
    input.serpDepth < 1 ||
    input.serpDepth > 1000 ||
    input.snapshotIds.length !== PERSISTENT_RANK_DROP_POLICY.requiredRuns ||
    input.snapshotIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
    new Set(input.snapshotIds).size !== input.snapshotIds.length
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Persistent rank-drop evidence is invalid",
    );
  return `rank_snapshot:v1:${input.serpDepth}:${input.snapshotIds.join(",")}`;
}

export function parsePersistentRankDropEvidenceRef(value: string) {
  const match = /^rank_snapshot:v1:(\d+):(\d+),(\d+),(\d+),(\d+)$/.exec(value);
  if (!match) return null;
  const serpDepth = Number(match[1]);
  const snapshotIds = match.slice(2).map(Number);
  return Number.isSafeInteger(serpDepth) &&
    serpDepth >= 1 &&
    serpDepth <= 1000 &&
    snapshotIds.every((id) => Number.isSafeInteger(id) && id >= 1) &&
    new Set(snapshotIds).size === snapshotIds.length
    ? { serpDepth, snapshotIds }
    : null;
}

export type PersistentRankDropCandidate = {
  status: "candidate";
  configId: string;
  domain: string;
  trackingKeywordId: string;
  keyword: string;
  device: "desktop" | "mobile";
  priorityPageUrl: string;
  commercialWeight: number | null;
  serpDepth: number;
  snapshots: z.output<typeof snapshotSchema>[];
  signal: RecordGrowthSignalInput;
};

export function detectPersistentTrackedRankDrops(
  raw: z.input<typeof inputSchema>,
): PersistentRankDropCandidate[] {
  const input = inputSchema.parse(raw);
  const pages = new Map<string, z.output<typeof keyPageSchema> | null>();
  for (const page of input.keyPages) {
    if (page.projectId !== input.projectId)
      throw new AppError(
        "VALIDATION_ERROR",
        "Key page belongs to another project",
      );
    const normalized = normalizeKeyPageUrl(page.url);
    pages.set(normalized, pages.has(normalized) ? null : page);
  }

  return input.sequences
    .flatMap((sequence): PersistentRankDropCandidate[] => {
      const [baseline, ...current] = sequence.snapshots;
      const checkedAt = sequence.snapshots.map((snapshot) =>
        canonicalInstant(snapshot.checkedAt),
      );
      if (
        new Set(sequence.snapshots.map((snapshot) => snapshot.runId)).size !==
          PERSISTENT_RANK_DROP_POLICY.requiredRuns ||
        checkedAt.some(
          (timestamp, index) => index > 0 && checkedAt[index - 1] >= timestamp,
        ) ||
        sequence.snapshots.some(
          (snapshot) =>
            snapshot.position !== null &&
            snapshot.position > sequence.serpDepth,
        )
      )
        throw new AppError("VALIDATION_ERROR", "Rank history is invalid");
      const baselinePosition = baseline.position;
      if (baselinePosition === null || !baseline.url) return [];
      let normalizedUrl: string;
      try {
        normalizedUrl = normalizeKeyPageUrl(baseline.url);
      } catch {
        throw new AppError("VALIDATION_ERROR", "Rank history URL is invalid");
      }
      const page = pages.get(normalizedUrl);
      if (!page) return [];
      const floors = current.map(
        (snapshot) => snapshot.position ?? sequence.serpDepth + 1,
      );
      if (
        floors.some(
          (position) =>
            position - baselinePosition <
            PERSISTENT_RANK_DROP_POLICY.minimumPositionLoss,
        )
      )
        return [];
      const latest = floors.at(-1)!;
      const evidenceRef = persistentRankDropEvidenceRef({
        serpDepth: sequence.serpDepth,
        snapshotIds: sequence.snapshots.map((snapshot) => snapshot.id),
      });
      const signal: RecordGrowthSignalInput = {
        projectId: input.projectId,
        runId: input.runId,
        signalType: "tracked_rank_drop",
        entityType: "tracked_keyword",
        entityRef: sequence.trackingKeywordId,
        metric: "organic_rank_position_floor",
        severity:
          current.every((snapshot) => snapshot.position === null) ||
          latest - baselinePosition >= 10
            ? "critical"
            : "warning",
        confidence: 0.9,
        periodStart: checkedAt[0].slice(0, 10),
        periodEnd: checkedAt.at(-1)!.slice(0, 10),
        baselineValue: baselinePosition,
        currentValue: latest,
        deltaValue: latest - baselinePosition,
        deltaPercent: (latest / baselinePosition - 1) * 100,
        evidenceKind: "rank_snapshot",
        evidenceRef,
        capturedAt: input.capturedAt,
      };
      if (signal.periodStart > signal.periodEnd) return [];
      return [
        {
          status: "candidate",
          configId: sequence.configId,
          domain: sequence.domain,
          trackingKeywordId: sequence.trackingKeywordId,
          keyword: sequence.keyword,
          device: sequence.device,
          priorityPageUrl: page.url,
          commercialWeight: page.commercialWeight,
          serpDepth: sequence.serpDepth,
          snapshots: sequence.snapshots,
          signal,
        },
      ];
    })
    .toSorted(
      (left, right) =>
        right.signal.deltaValue - left.signal.deltaValue ||
        (right.commercialWeight ?? 1) - (left.commercialWeight ?? 1) ||
        codeUnitCompare(left.keyword, right.keyword) ||
        codeUnitCompare(left.device, right.device) ||
        codeUnitCompare(left.configId, right.configId),
    )
    .slice(0, PERSISTENT_RANK_DROP_POLICY.maxCandidates);
}
