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
function numeric(value: unknown): number | null {
  if (value === null) return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) invalid();
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
    dimensions?: "day";
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
  if (
    new Set(names).size !== names.length ||
    names.some((name) => !expected.includes(name)) ||
    expected.some((name) => !names.includes(name))
  )
    invalid();
  for (const header of raw.columnHeaders) {
    const dimension = header.name === "day";
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
        name === "day" ? date(rawRow[index]) : numeric(rawRow[index]),
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
  rows.sort((a, b) => String(a.day ?? "").localeCompare(String(b.day ?? "")));
  days.sort();
  return { rows, observedThrough: days.at(-1) ?? null };
}
