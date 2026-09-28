import { AppError } from "@/server/lib/errors";
import {
  createGrowthReportSchema,
  MAX_GROWTH_REPORT_ACTION_SOURCES,
  type CreateGrowthReportInput,
} from "@/types/schemas/growth-reports";
import { GrowthReportsRepository as repo } from "../repositories/GrowthReportsRepository";
import {
  buildGrowthReportSnapshot,
  decodeGrowthReportSections,
  type GrowthReportSnapshot,
} from "./GrowthReportSnapshot";

type GrowthReportGraph = NonNullable<
  Awaited<ReturnType<typeof repo.getReportGraph>>
>;

const conflict = (message: string): never => {
  throw new AppError("CONFLICT", message);
};

function canonicalTimestamp(value: string, label: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== value)
    conflict(`Stored ${label} is not a canonical timestamp`);
  return value;
}

function assertLifecycle(graph: GrowthReportGraph) {
  const { report } = graph;
  if (report.createdAt !== report.generatedAt)
    conflict("Stored Growth Report creation time has drifted");
  if (graph.sections.some(({ createdAt }) => createdAt !== report.generatedAt))
    conflict("Stored Growth Report section time has drifted");
  if (report.status === "draft") {
    if (
      report.publishedAt != null ||
      report.publishedByType != null ||
      report.publishedById != null
    ) {
      conflict("Stored draft Growth Report has publication metadata");
    }
    return;
  }
  const { publishedAt, publishedByType, publishedById } = report;
  if (publishedAt == null || publishedByType == null || publishedById == null)
    return conflict(
      "Stored published Growth Report lacks publication metadata",
    );
  canonicalTimestamp(publishedAt, "Growth Report publication time");
  if (publishedAt < report.generatedAt)
    conflict("Stored Growth Report predates its generation time");
}

function storedInput(graph: GrowthReportGraph): CreateGrowthReportInput {
  try {
    const sections = decodeGrowthReportSections(
      graph.sections.map(({ sectionType, position, structuredContent }) => ({
        sectionType,
        position,
        structuredContent,
      })),
    );
    return createGrowthReportSchema.parse({
      projectId: graph.report.projectId,
      reportType: graph.report.reportType,
      periodStart: graph.report.periodStart,
      periodEnd: graph.report.periodEnd,
      version: graph.report.version,
      reportTimezone: graph.report.reportTimezone,
      dataCutoffAt: graph.report.dataCutoffAt,
      generatedAt: graph.report.generatedAt,
      builderVersion: graph.report.builderVersion,
      contentSchemaVersion: graph.report.contentSchemaVersion,
      createdByType: graph.report.createdByType,
      createdById: graph.report.createdById,
      sections,
    });
  } catch {
    return conflict("Stored Growth Report content is invalid or non-canonical");
  }
}

async function assertSourceGraph(
  graph: GrowthReportGraph,
  snapshot: GrowthReportSnapshot,
) {
  const resolved = await repo.resolveSources(
    graph.report.projectId,
    graph.actionIds,
    graph.measurementResultIds,
  );
  if (
    resolved.actions.length !== graph.actionIds.length ||
    resolved.measurementResults.length !== graph.measurementResultIds.length
  ) {
    conflict("Stored Growth Report has an invalid live source link");
  }
  const directResults = new Set(snapshot.measurementResultIds);
  if (graph.measurementResultIds.some((id) => !directResults.has(id)))
    conflict("Stored Growth Report has an unexpected Result link");
  const allowedActions = new Set(snapshot.directActionIds);
  for (const result of resolved.measurementResults)
    allowedActions.add(result.actionId);
  // Deleting a Result can leave its owner Action join behind. Each missing
  // Result can explain at most one such surviving navigation link.
  const missingResultCount =
    snapshot.measurementResultIds.length - graph.measurementResultIds.length;
  const unexplainedActionCount = graph.actionIds.filter(
    (id) => !allowedActions.has(id),
  ).length;
  if (
    graph.actionIds.length > MAX_GROWTH_REPORT_ACTION_SOURCES ||
    unexplainedActionCount > missingResultCount
  )
    conflict("Stored Growth Report has an unexpected Action link");
}

export async function assertStoredGrowthReportGraph(graph: GrowthReportGraph) {
  assertLifecycle(graph);
  const input = storedInput(graph);
  const snapshot = await buildGrowthReportSnapshot(input);
  if (snapshot.factHash !== graph.report.factHash)
    conflict("Stored Growth Report does not match its immutable fact");
  await assertSourceGraph(graph, snapshot);
  return {
    ...graph.report,
    sections: input.sections,
    actionIds: graph.actionIds,
    measurementResultIds: graph.measurementResultIds,
  };
}

export async function assertExactGrowthReport(
  graph: GrowthReportGraph,
  expected: GrowthReportSnapshot,
) {
  const report = await assertStoredGrowthReportGraph(graph);
  const stored = await buildGrowthReportSnapshot(storedInput(graph));
  if (
    graph.report.factHash !== expected.factHash ||
    JSON.stringify(stored.fact) !== JSON.stringify(expected.fact)
  ) {
    conflict("Growth Report version contains a different immutable fact");
  }
  return report;
}
