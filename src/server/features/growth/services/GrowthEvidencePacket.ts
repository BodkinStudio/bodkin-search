/* eslint-disable complexity, max-lines -- packet validation keeps its trust boundary auditable in one module */
import { z } from "zod";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import { safeHttpUrl } from "@/server/features/ai-search/safeUrl";
import { previousPeriod } from "@/server/features/gsc/searchPerformanceReport";
import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import { canonicalizeGrowthExactUrls } from "./GrowthTargetNormalizer";
import { PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION } from "./PriorityPageClickDeclineDetector";
import {
  growthEvidencePacketSchema,
  type GrowthEvidencePacket,
} from "@/types/schemas/growth-evidence-packet";
import {
  GROWTH_CHANGE_EVENT_SOURCES,
  GROWTH_CHANGE_EVENT_TYPES,
} from "@/types/schemas/growth-change-events";

const GROWTH_EVIDENCE_PACKET_VERSION = "growth-evidence-packet-v1";
const SOURCE_TIMEZONE = "America/Los_Angeles";
const MAX_PACKET_BYTES = 32_768;
const MAX_CONTEXT_SECTIONS = 4;
const MAX_KEY_PAGES = 100;
const MAX_EVENT_URLS = 100;
const SOURCE_TIMESTAMP_SCHEMA = z.string().datetime({ offset: true });
const CHANGE_EVENT_SOURCES = new Set<string>(GROWTH_CHANGE_EVENT_SOURCES);
const CHANGE_EVENT_TYPES = new Set<string>(GROWTH_CHANGE_EVENT_TYPES);
const CONTEXT_KEYS = [
  "business_overview",
  "current_goal",
  "positioning",
] as const;

type TextProjection = {
  content: string;
  redacted: boolean;
  truncated: boolean;
};
type Context = {
  sections: { key: string; content: string; updatedAt: string }[];
  keyPages: {
    id: string;
    url: string;
    role: "hub" | "spoke" | "money" | "other";
    topic: string | null;
    notes: string | null;
    commercialWeight: number | null;
    protected: boolean;
    activelyOptimized: boolean;
    updatedAt: string;
  }[];
};

type EvidencePacketSources = {
  organizationId: string;
  project: { id: string; name: string };
  signal: {
    id: string;
    projectId: string;
    runId: string;
    signalType: string;
    entityType: string;
    entityRef: string;
    metric: string;
    periodStart: string;
    periodEnd: string;
    baselineValue: number;
    currentValue: number;
    deltaValue: number;
    deltaPercent: number | null;
    evidenceKind: string;
    evidenceRef: string;
    capturedAt: string;
  };
  run: { id: string; projectId: string; detectorVersion: string | null };
  context: Context;
  assembledAt: string;
  selectedEventIds: string[];
  selectionProvided: boolean;
  events: {
    event: {
      id: string;
      projectId: string;
      changeType: string;
      source: string;
      description: string;
      happenedAt: string;
    };
    urls: string[];
  }[];
};

function invalid(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}
function codeUnitCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function sourceId(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 100 ||
    value.trim() !== value
  )
    invalid(`${label} is invalid`);
  return value;
}
function isoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid(`${label} must be a calendar date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid(`${label} must be a valid calendar date`);
  return parsed.valueOf();
}
function timestamp(value: string, label: string) {
  if (!SOURCE_TIMESTAMP_SCHEMA.safeParse(value).success)
    invalid(`${label} must be an offset timestamp`);
  isoDate(value.slice(0, 10), label);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) invalid(`${label} must be a timestamp`);
  return parsed;
}
function hasCredentialMaterial(value: string) {
  return /-----BEGIN(?: [A-Z]+)?(?: PRIVATE)?(?: KEY)?|api[_-]?key\s*["']?\s*[:=]|(?:access|refresh|id)[_-]?token\s*["']?\s*[:=]|client[_-]?secret\s*["']?\s*[:=]|password\s*["']?\s*[:=]|authorization\s*["']?\s*[:=]|\b(?:basic|bearer)\s+[a-z0-9._~+/-]+=*|\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}|\b(?:AIza|AKIA)[A-Za-z0-9_-]{8,}|https?:\/\/[^\s/@]+:[^\s/@]+@/i.test(
    value,
  );
}
function text(
  value: string | null,
  rawMax: number,
  max: number,
): TextProjection | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > rawMax)
    invalid("Narrative source text exceeds its raw bound");
  if (hasCredentialMaterial(value))
    return {
      content: "[redacted: recognised credential material]",
      redacted: true,
      truncated: false,
    };
  const safe = value
    .replace(/https?:\/\/[^\s)]+/gi, (match) => {
      try {
        const url = new URL(match);
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[invalid URL omitted]";
      }
    })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email omitted]");
  return {
    content: safe.slice(0, max),
    redacted: safe !== value,
    truncated: safe.length > max,
  };
}
function displayUrl(value: string) {
  const valid = safeHttpUrl(value);
  if (!valid || value.length > 2048 || hasCredentialMaterial(value))
    return { value: null, omitted: false, withheld: true };
  const url = new URL(valid);
  const omitted = Boolean(url.search || url.hash);
  url.search = "";
  url.hash = "";
  return { value: url.toString(), omitted, withheld: false };
}
function pacificDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    numberingSystem: "latn",
    timeZone: SOURCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(timestamp(value, "Change Event happenedAt"))
    .reduce<Record<string, string>>((out, part) => {
      if (["year", "month", "day"].includes(part.type))
        out[part.type] = part.value;
      return out;
    }, {});
}
function eventDate(value: string) {
  const p = pacificDate(value);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Pure, bounded projection. It does not read storage, time, environment, providers, or models. */
export async function buildGrowthEvidencePacket(
  s: EvidencePacketSources,
): Promise<GrowthEvidencePacket> {
  sourceId(s.organizationId, "Organization id");
  sourceId(s.project.id, "Project id");
  if (
    typeof s.project.name !== "string" ||
    s.project.name.length < 1 ||
    s.project.name.length > 120 ||
    s.project.name.trim() !== s.project.name
  )
    invalid("Project name is invalid");
  if (
    !Array.isArray(s.context.sections) ||
    s.context.sections.length > MAX_CONTEXT_SECTIONS ||
    !Array.isArray(s.context.keyPages) ||
    s.context.keyPages.length > MAX_KEY_PAGES ||
    !Array.isArray(s.selectedEventIds) ||
    s.selectedEventIds.length > 100 ||
    !Array.isArray(s.events) ||
    s.events.length > 10
  )
    invalid("Stored source collection exceeds its bound");
  const signal = s.signal;
  for (const [value, label] of [
    [signal.id, "Signal id"],
    [signal.projectId, "Signal project id"],
    [signal.runId, "Signal run id"],
    [signal.entityRef, "Signal entity ref"],
    [s.run.id, "Run id"],
    [s.run.projectId, "Run project id"],
  ] as const)
    sourceId(value, label);
  if (
    s.project.id !== signal.projectId ||
    s.run.projectId !== signal.projectId ||
    s.run.id !== signal.runId
  )
    invalid("Stored Growth identities disagree");
  if (
    signal.signalType !== "priority_page_click_decline" ||
    signal.entityType !== "key_page" ||
    signal.metric !== "gsc_clicks" ||
    signal.evidenceKind !== "gsc_period" ||
    !/^gsc:[a-f0-9]{64}$/.test(signal.evidenceRef) ||
    s.run.detectorVersion !== PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION
  )
    invalid("Signal is not supported by this evidence packet version");
  const start = isoDate(signal.periodStart, "Signal period start");
  const end = isoDate(signal.periodEnd, "Signal period end");
  const days = (end - start) / 86_400_000 + 1;
  if (!Number.isInteger(days) || days < 1 || days > 45)
    invalid("Signal current period must be 1 to 45 days");
  const captured = timestamp(signal.capturedAt, "Signal capturedAt");
  if (timestamp(s.assembledAt, "assembledAt") < captured)
    invalid("Packet cannot be assembled before capture");
  for (const value of [
    signal.baselineValue,
    signal.currentValue,
    signal.deltaValue,
    signal.deltaPercent,
  ])
    if (value == null || !Number.isFinite(value))
      invalid("Signal numeric facts must be finite");
  if (
    !Number.isSafeInteger(signal.baselineValue) ||
    !Number.isSafeInteger(signal.currentValue) ||
    !Number.isSafeInteger(signal.deltaValue) ||
    signal.baselineValue < 0 ||
    signal.currentValue < 0 ||
    signal.deltaValue >= 0 ||
    signal.currentValue >= signal.baselineValue ||
    signal.baselineValue === 0 ||
    signal.deltaValue !== signal.currentValue - signal.baselineValue ||
    signal.deltaPercent !==
      ((signal.currentValue - signal.baselineValue) / signal.baselineValue) *
        100
  )
    invalid("Signal numeric facts contradict the v1 detector");
  const latestFinalDate = new Date(
    `${calendarDateInTimezone(captured.toISOString(), SOURCE_TIMEZONE)}T00:00:00.000Z`,
  );
  latestFinalDate.setUTCDate(latestFinalDate.getUTCDate() - 3);
  if (signal.periodEnd > latestFinalDate.toISOString().slice(0, 10))
    invalid("Signal capture does not satisfy the final-data lag");
  const subject = s.context.keyPages.filter(
    (page) => page.id === signal.entityRef,
  );
  if (subject.length !== 1)
    invalid("Signal key page is missing or ambiguous in current context");
  const page = subject[0];
  sourceId(page.id, "Key page id");
  if (
    typeof page.url !== "string" ||
    page.url.length < 1 ||
    page.url.length > 2048 ||
    typeof page.protected !== "boolean" ||
    typeof page.activelyOptimized !== "boolean" ||
    (page.commercialWeight !== null &&
      (!Number.isInteger(page.commercialWeight) ||
        page.commercialWeight < 1 ||
        page.commercialWeight > 5))
  )
    invalid("Stored key page is invalid");
  const baseline = previousPeriod(signal.periodStart, signal.periodEnd);
  isoDate(baseline.startDate, "Derived baseline start");
  const url = displayUrl(page.url);
  const topic = text(page.topic, 200, 200);
  const notes = text(page.notes, 500, 400);
  const projectName = text(s.project.name, 120, 200)!;
  const sections = CONTEXT_KEYS.map((key) => {
    const rows = s.context.sections.filter((section) => section.key === key);
    if (rows.length > 1) invalid("Project context section is ambiguous");
    const row = rows[0];
    if (row && (typeof row.content !== "string" || row.content.length > 4000))
      invalid("Project context section exceeds its raw bound");
    const projected = text(row?.content ?? null, 4000, 800);
    return {
      key,
      content: projected?.content ?? null,
      updatedAt: row?.updatedAt ?? null,
      redacted: projected?.redacted ?? false,
      truncated: projected?.truncated ?? false,
    };
  });
  const subjectUrl = canonicalizeGrowthExactUrls([page.url])[0];
  const selected = [
    ...new Set(
      s.selectedEventIds.map((id) => sourceId(id, "Selected Change Event id")),
    ),
  ].toSorted(codeUnitCompare);
  if (selected.length > 10) invalid("At most 10 Change Events may be selected");
  if (!s.selectionProvided && (selected.length > 0 || s.events.length > 0))
    invalid("Unassessed Change Events must be absent");
  const eventById = new Map<string, (typeof s.events)[number]>();
  for (const graph of s.events) {
    const eventId = sourceId(graph.event.id, "Change Event id");
    if (
      !selected.includes(eventId) ||
      eventById.has(eventId) ||
      graph.event.projectId !== s.project.id ||
      !Array.isArray(graph.urls) ||
      graph.urls.length < 1 ||
      graph.urls.length > MAX_EVENT_URLS
    )
      invalid("Selected Change Event graph is invalid");
    if (
      !CHANGE_EVENT_SOURCES.has(graph.event.source) ||
      !CHANGE_EVENT_TYPES.has(graph.event.changeType) ||
      typeof graph.event.description !== "string" ||
      graph.event.description.length > 5000
    )
      invalid("Stored Change Event is invalid");
    for (const eventUrl of graph.urls)
      if (
        typeof eventUrl !== "string" ||
        eventUrl.length < 1 ||
        eventUrl.length > 2000
      )
        invalid("Stored Change Event URL is invalid");
    eventById.set(eventId, graph);
  }
  if (eventById.size !== selected.length)
    invalid("Selected Change Event graph is missing");
  const included = [...eventById.values()]
    .filter(({ event, urls }) => {
      const day = eventDate(event.happenedAt);
      return (
        day >= baseline.startDate &&
        day <= signal.periodEnd &&
        canonicalizeGrowthExactUrls(urls).includes(subjectUrl)
      );
    })
    .toSorted((a, b) => codeUnitCompare(a.event.id, b.event.id));
  const packet = {
    packetVersion: GROWTH_EVIDENCE_PACKET_VERSION,
    packetReference: "sha256:" + "0".repeat(64),
    trust: {
      classification: "internal_review_only",
      modelEgress: "not_enabled_in_this_slice",
      narrative: "untrusted_user_authored_context",
    },
    assembledAt: timestamp(s.assembledAt, "assembledAt").toISOString(),
    source: {
      organizationId: s.organizationId,
      projectId: s.project.id,
      signalId: signal.id,
      runId: s.run.id,
      evidenceReference: signal.evidenceRef,
      detectorVersion: PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION,
    },
    observation: {
      capturedAt: captured.toISOString(),
      currentPeriod: {
        startDate: signal.periodStart,
        endDate: signal.periodEnd,
      },
      baselinePeriod: { ...baseline, derivation: "preceding_equal_length_v1" },
      baselineClicks: signal.baselineValue,
      currentClicks: signal.currentValue,
      deltaClicks: signal.deltaValue,
      deltaPercent: signal.deltaPercent,
    },
    subject: {
      keyPageId: page.id,
      displayUrl: url.value,
      displayUrlOmittedQueryOrFragment: url.omitted,
      displayUrlWithheldCredentialMaterial: url.withheld,
      role: page.role,
      commercialWeight: page.commercialWeight,
      protected: page.protected,
      activelyOptimized: page.activelyOptimized,
      topic: topic?.content ?? null,
      topicRedacted: topic?.redacted ?? false,
      topicTruncated: topic?.truncated ?? false,
      notes: notes?.content ?? null,
      notesRedacted: notes?.redacted ?? false,
      notesTruncated: notes?.truncated ?? false,
      updatedAt: timestamp(page.updatedAt, "Key page updatedAt").toISOString(),
    },
    currentCommercialContext: {
      projectName: projectName.content,
      projectNameRedacted: projectName.redacted,
      projectNameTruncated: projectName.truncated,
      sections,
      currentNotHistorical: true,
    },
    selectedChangeEvents: {
      coverage: s.selectionProvided ? "caller_selected" : "not_assessed",
      selectedCount: selected.length,
      includedCount: included.length,
      omittedIrrelevantCount: selected.length - included.length,
      events: included.map(({ event }) => {
        const description = text(event.description, 5000, 400)!;
        return {
          id: event.id,
          changeType: event.changeType,
          source: event.source,
          happenedAt: timestamp(
            event.happenedAt,
            "Change Event happenedAt",
          ).toISOString(),
          description: description.content,
          descriptionRedacted: description.redacted,
          descriptionTruncated: description.truncated,
          match: "normalised_url_candidate" as const,
        };
      }),
    },
    limitations: [
      "GSC page rows may be omitted; raw rows, property/site totals, and impressions are not replayed.",
      "Current commercial context may postdate detection.",
      "Open Actions and unselected Change Events are not assessed.",
      "Selected URL matches are normalised candidates, not exact matches or causal conclusions.",
      "This packet is not a complete source replay or site-wide comparison.",
    ],
  };
  const parsed = growthEvidencePacketSchema.parse(packet);
  const canonical = { ...parsed, packetReference: undefined };
  const reference = `sha256:${await sha256Hex(JSON.stringify(canonical))}`;
  const result = growthEvidencePacketSchema.parse({
    ...parsed,
    packetReference: reference,
  });
  if (
    new TextEncoder().encode(JSON.stringify(result)).byteLength >
    MAX_PACKET_BYTES
  )
    invalid("Evidence packet exceeds the UTF-8 byte limit");
  return result;
}
