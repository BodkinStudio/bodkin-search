import { z } from "zod";
import { parseAuditConfig } from "@/server/lib/audit/types";
import { canonicalUrlKey, normalizeUrl } from "@/server/lib/audit/url-utils";
import { AppError } from "@/server/lib/errors";
import { getIssueDescriptor } from "@/shared/audit-issues";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";

export const NEW_CRITICAL_AUDIT_ISSUE_DETECTOR_VERSION =
  "new-critical-audit-issue-v1";
const NEW_CRITICAL_AUDIT_ISSUE_POLICY = { maxCandidates: 3 } as const;

const auditSchema = z.object({
  id: z.string().trim().min(1).max(100),
  projectId: z.string().trim().min(1).max(100),
  startUrl: z.string().trim().min(1).max(4096),
  status: z.literal("completed"),
  config: z.string().max(10_000),
  startedAt: z.string().trim().min(10).max(40),
});
const issueSchema = z.object({
  id: z.string().trim().min(1).max(100),
  auditId: z.string().trim().min(1).max(100),
  pageUrl: z.string().trim().min(1).max(4096),
  issueType: z.string().trim().min(1).max(100),
  severity: z.literal("critical"),
  detailsJson: z.string().max(10_000).nullable(),
});
const inputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
  runId: z.string().trim().min(1).max(100),
  capturedAt: z.string().datetime({ offset: true }),
  baselineAudit: auditSchema,
  currentAudit: auditSchema,
  baselineIssues: z.array(issueSchema).max(100_000),
  currentIssues: z.array(issueSchema).max(100_000),
});

type Audit = z.output<typeof auditSchema>;
type Issue = z.output<typeof issueSchema>;

export function canonicalAuditInstant(value: string, label: string) {
  const fields =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)| (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/.exec(
      value,
    );
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
    throw new AppError("VALIDATION_ERROR", `${label} is invalid`);
  return parsed.toISOString();
}

function comparableAuditScope(audit: { startUrl: string; config: string }) {
  const startUrl = normalizeUrl(audit.startUrl);
  const config = parseAuditConfig(audit.config);
  if (!startUrl || !config)
    throw new AppError("VALIDATION_ERROR", "Saved audit scope is invalid");
  return {
    startUrl: canonicalUrlKey(startUrl),
    maxPages: config.maxPages,
  };
}

export function areAuditsComparable(
  left: { startUrl: string; config: string },
  right: { startUrl: string; config: string },
) {
  const leftScope = comparableAuditScope(left);
  const rightScope = comparableAuditScope(right);
  return (
    leftScope.startUrl === rightScope.startUrl &&
    leftScope.maxPages === rightScope.maxPages
  );
}

export function findComparableAuditPair(rawAudits: unknown[]) {
  const audits = z
    .array(auditSchema)
    .parse(rawAudits)
    .toSorted(
      (left, right) =>
        canonicalAuditInstant(right.startedAt, "Audit timestamp").localeCompare(
          canonicalAuditInstant(left.startedAt, "Audit timestamp"),
        ) || left.id.localeCompare(right.id),
    );
  const current = audits[0];
  if (!current) return { current: null, baseline: null };
  comparableAuditScope(current);
  const baseline = audits
    .slice(1)
    .find((candidate) => areAuditsComparable(candidate, current));
  return { current, baseline: baseline ?? null };
}

function parseBrokenLinkTarget(issue: Issue) {
  if (!issue.detailsJson)
    throw new AppError(
      "VALIDATION_ERROR",
      "Broken-link audit evidence is incomplete",
    );
  let value: unknown;
  try {
    value = JSON.parse(issue.detailsJson);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "Broken-link audit evidence is invalid",
    );
  }
  const parsed = z
    .object({ targetUrl: z.string().min(1).max(4096) })
    .safeParse(value);
  const targetUrl = parsed.success ? normalizeUrl(parsed.data.targetUrl) : null;
  if (!targetUrl)
    throw new AppError(
      "VALIDATION_ERROR",
      "Broken-link audit target is invalid",
    );
  return targetUrl;
}

export function criticalAuditIssueIdentity(raw: unknown) {
  const issue = issueSchema.parse(raw);
  const descriptor = getIssueDescriptor(issue.issueType);
  const pageUrl = normalizeUrl(issue.pageUrl);
  if (!descriptor || descriptor.severity !== "critical" || !pageUrl)
    throw new AppError(
      "VALIDATION_ERROR",
      "Saved critical audit issue is invalid",
    );
  const targetUrl =
    issue.issueType === "broken-internal-link"
      ? parseBrokenLinkTarget(issue)
      : null;
  return {
    issue,
    issueType: issue.issueType,
    title: descriptor.title,
    explanation: descriptor.explanation,
    howToFix: descriptor.howToFix,
    pageUrl,
    targetUrl,
    stableKey: JSON.stringify([issue.issueType, pageUrl, targetUrl]),
  };
}

function newCriticalAuditIssueEvidenceRef(input: {
  baselineAuditId: string;
  currentAuditId: string;
  issueId: string;
}) {
  const values = [input.baselineAuditId, input.currentAuditId, input.issueId];
  if (values.some((value) => !value || value.length > 100))
    throw new AppError(
      "VALIDATION_ERROR",
      "Audit evidence identity is invalid",
    );
  return `audit_result:v1:${values.map(encodeURIComponent).join(":")}`;
}

export function parseNewCriticalAuditIssueEvidenceRef(value: string) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "audit_result" || parts[1] !== "v1")
    return null;
  try {
    const [baselineAuditId, currentAuditId, issueId] = parts
      .slice(2)
      .map(decodeURIComponent);
    return [baselineAuditId, currentAuditId, issueId].every(
      (part) => part.length >= 1 && part.length <= 100,
    ) && baselineAuditId !== currentAuditId
      ? { baselineAuditId, currentAuditId, issueId }
      : null;
  } catch {
    return null;
  }
}

export type NewCriticalAuditIssueCandidate = ReturnType<
  typeof criticalAuditIssueIdentity
> & {
  status: "candidate";
  baselineAudit: Audit;
  currentAudit: Audit;
  signal: RecordGrowthSignalInput;
};

export function detectNewCriticalAuditIssues(
  raw: z.input<typeof inputSchema>,
): NewCriticalAuditIssueCandidate[] {
  const input = inputSchema.parse(raw);
  if (
    input.baselineAudit.projectId !== input.projectId ||
    input.currentAudit.projectId !== input.projectId ||
    !areAuditsComparable(input.baselineAudit, input.currentAudit)
  )
    throw new AppError("VALIDATION_ERROR", "Audit comparison is invalid");
  const baselineAt = canonicalAuditInstant(
    input.baselineAudit.startedAt,
    "Baseline audit timestamp",
  );
  const currentAt = canonicalAuditInstant(
    input.currentAudit.startedAt,
    "Current audit timestamp",
  );
  if (baselineAt >= currentAt)
    throw new AppError("VALIDATION_ERROR", "Audit comparison order is invalid");
  if (
    input.baselineIssues.some(
      (issue) => issue.auditId !== input.baselineAudit.id,
    ) ||
    input.currentIssues.some((issue) => issue.auditId !== input.currentAudit.id)
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Audit issue belongs to another audit",
    );

  const baselineKeys = new Set(
    input.baselineIssues.map(
      (issue) => criticalAuditIssueIdentity(issue).stableKey,
    ),
  );
  const uniqueCurrent = new Map<
    string,
    ReturnType<typeof criticalAuditIssueIdentity>
  >();
  for (const issue of input.currentIssues) {
    const identity = criticalAuditIssueIdentity(issue);
    if (!uniqueCurrent.has(identity.stableKey))
      uniqueCurrent.set(identity.stableKey, identity);
  }
  return [...uniqueCurrent.values()]
    .filter(({ stableKey }) => !baselineKeys.has(stableKey))
    .toSorted(
      (left, right) =>
        left.issueType.localeCompare(right.issueType) ||
        left.pageUrl.localeCompare(right.pageUrl) ||
        (left.targetUrl ?? "").localeCompare(right.targetUrl ?? "") ||
        left.issue.id.localeCompare(right.issue.id),
    )
    .slice(0, NEW_CRITICAL_AUDIT_ISSUE_POLICY.maxCandidates)
    .map((identity) => ({
      ...identity,
      status: "candidate" as const,
      baselineAudit: input.baselineAudit,
      currentAudit: input.currentAudit,
      signal: {
        projectId: input.projectId,
        runId: input.runId,
        signalType: "new_critical_audit_issue",
        entityType: "audit_issue",
        entityRef: identity.issue.id,
        metric: "critical_audit_issue_presence",
        severity: "critical",
        confidence: 1,
        periodStart: baselineAt.slice(0, 10),
        periodEnd: currentAt.slice(0, 10),
        baselineValue: 0,
        currentValue: 1,
        deltaValue: 1,
        deltaPercent: null,
        evidenceKind: "audit_result",
        evidenceRef: newCriticalAuditIssueEvidenceRef({
          baselineAuditId: input.baselineAudit.id,
          currentAuditId: input.currentAudit.id,
          issueId: identity.issue.id,
        }),
        capturedAt: input.capturedAt,
      },
    }));
}
