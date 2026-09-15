import { YouTubeMalformedResponseError } from "@/server/lib/youtubeErrors";

const METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares",
] as const;
export const YOUTUBE_OVERVIEW_METRICS = METRICS;
export const YOUTUBE_VIDEO_METRICS = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
] as const;
export const YOUTUBE_TRAFFIC_SOURCE_METRICS = [
  "views",
  "estimatedMinutesWatched",
] as const;
const STRING_DIMENSIONS = new Set(["day", "video", "insightTrafficSourceType"]);

type RawReport = {
  columnHeaders: Array<{ name: string; columnType: string; dataType: string }>;
  rows: unknown[][];
};
type NormalizedYouTubeReport = {
  rows: Array<Record<string, string | number | null>>;
  observedThrough: string | null;
};

function invalid(): never {
  throw new YouTubeMalformedResponseError();
}
function numeric(
  value: unknown,
  dataType: string,
  metric: string,
): number | null {
  if (value === null) return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) invalid();
  // YouTube can return signed likes (observed in channel Analytics reports).
  // Keep the reported value; other requested metrics remain non-negative.
  if (
    (parsed < 0 && metric !== "likes") ||
    (dataType === "INTEGER" && !Number.isInteger(parsed))
  )
    invalid();
  return parsed;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid();
  return value;
}

export function normalizeYouTubeReport(
  raw: RawReport,
  input: {
    dimensions?: "day" | "video" | "insightTrafficSourceType";
    metrics: readonly string[];
    range?: { startDate: string; endDate: string };
  },
): NormalizedYouTubeReport {
  const expected = [
    ...(input.dimensions ? [input.dimensions] : []),
    ...input.metrics,
  ];
  if (
    new Set(expected).size !== expected.length ||
    raw.columnHeaders.length !== expected.length
  )
    invalid();
  const names = raw.columnHeaders.map((header) => header.name);
  const headersByName = new Map(
    raw.columnHeaders.map((header) => [header.name, header]),
  );
  if (
    new Set(names).size !== names.length ||
    names.some((name) => !expected.includes(name)) ||
    expected.some((name) => !names.includes(name))
  )
    invalid();
  for (const header of raw.columnHeaders) {
    const dimension = STRING_DIMENSIONS.has(header.name);
    if (
      (dimension && header.columnType !== "DIMENSION") ||
      (!dimension && header.columnType !== "METRIC")
    )
      invalid();
    if (
      dimension
        ? header.dataType !== "STRING"
        : !["INTEGER", "FLOAT", "DOUBLE"].includes(header.dataType)
    )
      invalid();
  }
  if (!input.dimensions && raw.rows.length > 1) invalid();
  const rows = raw.rows.map((rawRow) => {
    if (rawRow.length !== names.length) invalid();
    return Object.fromEntries(
      names.map((name, index) => [
        name,
        name === "day"
          ? date(rawRow[index])
          : STRING_DIMENSIONS.has(name)
            ? stringDimension(name, rawRow[index])
            : numeric(rawRow[index], headersByName.get(name)!.dataType, name),
      ]),
    );
  });
  const days = rows
    .map((row) => row.day)
    .filter((value): value is string => typeof value === "string");
  if (
    new Set(days).size !== days.length ||
    (input.range &&
      days.some(
        (value) =>
          value < input.range!.startDate || value > input.range!.endDate,
      ))
  )
    invalid();
  if (input.dimensions && input.dimensions !== "day") {
    const values = rows
      .map((row) => row[input.dimensions!])
      .filter((value): value is string => typeof value === "string");
    if (new Set(values).size !== values.length) invalid();
  }
  if (input.dimensions === "day")
    rows.sort((a, b) => String(a.day ?? "").localeCompare(String(b.day ?? "")));
  days.sort();
  return { rows, observedThrough: days.at(-1) ?? null };
}

function stringDimension(name: string, value: unknown): string {
  const maxLength = name === "video" ? 64 : 128;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    invalid();
  return value;
}
