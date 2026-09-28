import { AppError } from "@/server/lib/errors";
import { z } from "zod";
import { GscNotConnectedError } from "@/server/lib/gscErrors";
import {
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import {
  growthEvidenceDisplayActionText,
  growthEvidenceDisplayChangeDescription,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";
import { normalizeGrowthExactUrls } from "./GrowthTargetNormalizer";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";
import { GrowthPageContextRepository } from "../repositories/GrowthPageContextRepository";
import {
  growthPageContextDtoSchema,
  type GrowthPageContextDto,
} from "@/types/schemas/growth-page-context";

const LIMIT = 5;
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const text = (value: string, max: number) => {
  const safe = growthEvidenceDisplayActionText(value);
  return {
    value: safe.content.slice(0, max),
    redacted: safe.redacted,
    truncated: safe.truncated || safe.content.length > max,
  };
};
function timestamp(value: string, label: string) {
  return canonicalTimestamp(
    SQLITE_TIMESTAMP.test(value) ? `${value.replace(" ", "T")}Z` : value,
    label,
  );
}
function pacificDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((out, part) => {
      if (["year", "month", "day"].includes(part.type))
        out[part.type] = part.value;
      return out;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Pure 28-day final-data window, based on the Pacific date containing asOf. */
export function resolvePageContextGscWindow(asOf: Date) {
  const endDate = addDays(pacificDate(asOf), -3);
  return { startDate: addDays(endDate, -27), endDate };
}
function variants(workflow: string) {
  const u = new URL(workflow);
  const hosts = u.hostname.startsWith("www.")
    ? [u.hostname.slice(4), u.hostname]
    : [u.hostname, `www.${u.hostname}`];
  const paths =
    u.pathname === "/"
      ? ["/"]
      : [
          ...new Set([
            u.pathname.replace(/\/$/, ""),
            `${u.pathname.replace(/\/$/, "")}/`,
          ]),
        ];
  return new Set(
    hosts.flatMap((host) =>
      paths.flatMap((path) =>
        ["http", "https"].map((protocol) => `${protocol}://${host}${path}`),
      ),
    ),
  );
}
const gscMetricsShape = {
  clicks: z.number().finite().nonnegative(),
  impressions: z.number().finite().nonnegative(),
  ctr: z.number().finite().min(0).max(1),
  position: z.number().finite().nonnegative(),
} as const;
const gscAggregateRowSchema = z.object({
  ...gscMetricsShape,
  keys: z.array(z.unknown()).length(0).optional(),
});
const gscQueryRowsSchema = z.array(
  z.object({ ...gscMetricsShape, keys: z.tuple([z.string().min(1)]) }),
);
function validate(projectDomain: string | null, raw: string) {
  if (!projectDomain || raw.length > 2048)
    throw new AppError(
      "VALIDATION_ERROR",
      "Page URL or project domain is invalid",
    );
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Page URL is invalid");
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password)
    throw new AppError("VALIDATION_ERROR", "Page URL is invalid");
  let project: string;
  try {
    project = new URL(
      projectDomain.startsWith("http")
        ? projectDomain
        : `https://${projectDomain}`,
    ).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    throw new AppError("VALIDATION_ERROR", "Project domain is invalid");
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== project && !host.endsWith(`.${project}`))
    throw new AppError(
      "VALIDATION_ERROR",
      "Page URL must belong to the project domain",
    );
  if (growthEvidenceDisplayUrl(parsed.toString()).withheld)
    throw new AppError(
      "VALIDATION_ERROR",
      "Page URL contains private credential material",
    );
  parsed.hash = "";
  return parsed;
}
async function gsc(projectId: string, parsed: URL, asOf: Date) {
  const window = resolvePageContextGscWindow(asOf);
  const context = {
    source: "live_gsc_final" as const,
    matchScope: "gsc_parsed_requested_url" as const,
    calendar: "America/Los_Angeles" as const,
    searchType: "web" as const,
    dataState: "final" as const,
    ...window,
  };
  const filters = [
    {
      dimension: "page" as const,
      operator: "equals" as const,
      expression: parsed.toString(),
    },
  ];
  try {
    const [aggregate, queries] = await Promise.all([
      GscService.getPerformance({
        projectId,
        ...window,
        filters,
        dimensions: [],
        rowLimit: 1,
        type: "web",
        dataState: "final",
      }),
      GscService.getPerformance({
        projectId,
        ...window,
        filters,
        dimensions: ["query"],
        rowLimit: 11,
        type: "web",
        dataState: "final",
      }),
    ]);
    if (
      !Array.isArray(aggregate.rows) ||
      !Array.isArray(queries.rows) ||
      aggregate.siteUrl !== queries.siteUrl ||
      aggregate.rows.length > 1 ||
      queries.rows.length > 11 ||
      (aggregate.rows.length === 0 && queries.rows.length > 0)
    )
      return { state: "unavailable" as const, ...context };
    const aggregateRow =
      aggregate.rows.length === 1
        ? gscAggregateRowSchema.safeParse(aggregate.rows[0])
        : null;
    const queryRows = gscQueryRowsSchema.safeParse(queries.rows);
    if ((aggregateRow && !aggregateRow.success) || !queryRows.success)
      return { state: "unavailable" as const, ...context };
    return {
      state: "available" as const,
      ...context,
      aggregate: aggregateRow?.success
        ? {
            state: "reported" as const,
            clicks: aggregateRow.data.clicks,
            impressions: aggregateRow.data.impressions,
            ctr: aggregateRow.data.ctr,
            position: aggregateRow.data.position,
          }
        : { state: "not_reported" as const },
      queries: {
        items: queryRows.data.slice(0, 10).map((row) => ({
          query: text(row.keys[0], 300),
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        })),
        hasMore: queryRows.data.length > 10,
      },
    };
  } catch (error) {
    if (error instanceof GscNotConnectedError)
      return { state: "not_connected" as const, ...context };
    if (isExpectedGrantFailure(error))
      return { state: "reconnect_required" as const, ...context };
    return { state: "unavailable" as const, ...context };
  }
}

async function getPageContext(
  project: { id: string; domain: string | null },
  rawUrl: string,
  options: { now?: Date } = {},
): Promise<GrowthPageContextDto> {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Page context clock is invalid");
  // This complete validation intentionally precedes every repository and provider read.
  const domain = project.domain;
  const parsed = validate(domain, rawUrl);
  if (!domain)
    throw new AppError("VALIDATION_ERROR", "Project domain is invalid");
  const asOf = now.toISOString();
  const workflow = normalizeGrowthExactUrls(domain, [rawUrl])[0];
  const exact = normalizeKeyPageUrl(rawUrl);
  const [
    keyPage,
    recommendations,
    actions,
    changes,
    measurements,
    rankRows,
    searchPerformance,
  ] = await Promise.all([
    GrowthPageContextRepository.keyPage(project.id, exact),
    GrowthPageContextRepository.recommendations(
      project.id,
      workflow,
      asOf,
      LIMIT + 1,
    ),
    GrowthPageContextRepository.actions(project.id, workflow, asOf, LIMIT + 1),
    GrowthPageContextRepository.changes(project.id, workflow, asOf, LIMIT + 1),
    GrowthPageContextRepository.measurements(
      project.id,
      workflow,
      asOf,
      LIMIT + 1,
    ),
    GrowthPageContextRepository.ranks(
      project.id,
      asOf,
      [...variants(workflow)],
      11,
    ),
    gsc(project.id, parsed, now),
  ]);
  const ranks = rankRows;
  const displayUrl = growthEvidenceDisplayUrl(rawUrl);
  return growthPageContextDtoSchema.parse({
    asOf,
    consistency: "current_not_snapshot",
    page: {
      displayUrl: {
        value: displayUrl.value,
        queryOrFragmentOmitted: displayUrl.omitted,
        withheld: displayUrl.withheld,
      },
      identityScopes: [
        "key_page_exact",
        "growth_workflow_host_path",
        "gsc_parsed_requested_url",
        "rank_common_host_path_variants",
      ],
    },
    curation: !keyPage
      ? { state: "not_curated", matchScope: "key_page_exact" }
      : {
          state: "curated",
          matchScope: "key_page_exact",
          role: keyPage.role,
          commercialWeight: keyPage.commercialWeight,
          protected: keyPage.protected,
          activelyOptimized: keyPage.activelyOptimized,
          topic: keyPage.topic ? text(keyPage.topic, 200) : null,
          notes: keyPage.notes ? text(keyPage.notes, 500) : null,
          updatedAt: timestamp(keyPage.updatedAt, "Key-page updatedAt"),
        },
    searchPerformance,
    recommendations: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: recommendations.slice(0, LIMIT).map((r) => ({
        ...r,
        title: text(r.title, 300),
        createdAt: timestamp(r.createdAt, "Recommendation createdAt"),
      })),
      hasMore: recommendations.length > LIMIT,
    },
    actions: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: actions.slice(0, LIMIT).map((r) => ({
        ...r,
        title: text(r.title, 300),
        dueAt: timestamp(r.dueAt, "Action dueAt"),
        updatedAt: timestamp(r.updatedAt, "Action updatedAt"),
      })),
      hasMore: actions.length > LIMIT,
    },
    changes: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: changes.slice(0, LIMIT).map((r) => ({
        ...r,
        happenedAt: timestamp(r.happenedAt, "Change happenedAt"),
        description: (() => {
          const safe = growthEvidenceDisplayChangeDescription(r.description);
          return {
            value: safe.content.slice(0, 500),
            redacted: safe.redacted,
            truncated: safe.truncated || safe.content.length > 500,
          };
        })(),
      })),
      hasMore: changes.length > LIMIT,
    },
    measurements: {
      matchScope: "growth_workflow_host_path",
      stateScope: "current_not_historical",
      items: measurements.slice(0, LIMIT).map((r) => ({
        id: r.id,
        actionId: r.actionId,
        reportTimezone: r.reportTimezone,
        measurementEnd: r.measurementEnd,
        longMeasurementEnd: r.longMeasurementEnd,
        actionIntegrity:
          r.actionStatus === null
            ? "action_missing"
            : r.actionStatus !== "measuring"
              ? "action_state_mismatch"
              : r.actionStateVersion !== r.actionVersion
                ? "action_version_mismatch"
                : "consistent",
      })),
      hasMore: measurements.length > LIMIT,
    },
    ranks: {
      source: "saved_rank_snapshots",
      matchScope: "rank_common_host_path_variants",
      items: ranks.slice(0, 10).map((r) => ({
        keyword: text(r.keyword, 300),
        device: r.device,
        position: r.position,
        checkedAt: timestamp(r.checkedAt, "Rank checkedAt"),
      })),
      hasMore: ranks.length > 10,
    },
  });
}
export const GrowthPageContextService = { getPageContext } as const;
