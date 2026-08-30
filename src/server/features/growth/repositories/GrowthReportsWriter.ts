import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch, type BatchExecutor } from "@/db/runBatch";
import {
  growthActions,
  growthMeasurementResults,
  growthReportActions,
  growthReportMeasurementResults,
  growthReports,
  growthReportSections,
  projects,
} from "@/db/schema";
import type { EncodedGrowthReportSection } from "../services/GrowthReportSnapshot";

type ReportActorType = typeof growthReports.$inferSelect.createdByType;
type ReportType = typeof growthReports.$inferSelect.reportType;

type CreateGrowthReportGraphInput = {
  id: string;
  projectId: string;
  factHash: string;
  reportType: ReportType;
  periodStart: string;
  periodEnd: string;
  version: number;
  reportTimezone: string;
  dataCutoffAt: string;
  generatedAt: string;
  builderVersion: string;
  contentSchemaVersion: number;
  createdByType: ReportActorType;
  createdById: string;
  sections: (EncodedGrowthReportSection & { id: string })[];
  actionIds: string[];
  measurementResultIds: string[];
};

type PublishGrowthReportGraphInput = {
  projectId: string;
  reportId: string;
  factHash: string;
  publishedAt: string;
  publishedByType: ReportActorType;
  publishedById: string;
  sections: EncodedGrowthReportSection[];
  actionIds: string[];
  measurementResultIds: string[];
};

function lockForPostgres<T>(query: T, strength: "share" | "update"): T {
  if (getDatabaseProvider() !== "postgres") return query;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard is the runtime proof for this narrower Postgres builder surface
  const lockable = query as {
    for: (value: "share" | "update") => T;
  };
  return lockable.for(strength);
}

function sourceLocks(
  tx: BatchExecutor,
  projectId: string,
  actionIds: string[],
  measurementResultIds: string[],
) {
  if (getDatabaseProvider() !== "postgres") return [];
  const locks: Promise<unknown>[] = [];
  if (actionIds.length > 0) {
    locks.push(
      lockForPostgres(
        tx
          .select({ id: growthActions.id })
          .from(growthActions)
          .where(
            and(
              eq(growthActions.projectId, projectId),
              inArray(growthActions.id, actionIds),
            ),
          ),
        "share",
      ),
    );
  }
  if (measurementResultIds.length > 0) {
    locks.push(
      lockForPostgres(
        tx
          .select({ id: growthMeasurementResults.id })
          .from(growthMeasurementResults)
          .where(
            and(
              eq(growthMeasurementResults.projectId, projectId),
              inArray(growthMeasurementResults.id, measurementResultIds),
            ),
          ),
        "share",
      ),
    );
  }
  return locks;
}

export async function createGrowthReportGraph(
  input: CreateGrowthReportGraphInput,
) {
  await runBatch((tx) => {
    const parentSource = tx
      .select({
        id: sql<string>`${input.id}`.as("id"),
        projectId: projects.id,
        factHash: sql<string>`${input.factHash}`.as("fact_hash"),
        reportType: sql<ReportType>`${input.reportType}`.as("report_type"),
        periodStart: sql<string>`${input.periodStart}`.as("period_start"),
        periodEnd: sql<string>`${input.periodEnd}`.as("period_end"),
        version: sql<number>`${input.version}`.as("version"),
        status: sql<"draft">`'draft'`.as("status"),
        reportTimezone: sql<string>`${input.reportTimezone}`.as(
          "report_timezone",
        ),
        dataCutoffAt: sql<string>`${input.dataCutoffAt}`.as("data_cutoff_at"),
        generatedAt: sql<string>`${input.generatedAt}`.as("generated_at"),
        builderVersion: sql<string>`${input.builderVersion}`.as(
          "builder_version",
        ),
        contentSchemaVersion: sql<number>`${input.contentSchemaVersion}`.as(
          "content_schema_version",
        ),
        createdByType: sql<ReportActorType>`${input.createdByType}`.as(
          "created_by_type",
        ),
        createdById: sql<string>`${input.createdById}`.as("created_by_id"),
        publishedAt: sql<null>`NULL`.as("published_at"),
        publishedByType: sql<null>`NULL`.as("published_by_type"),
        publishedById: sql<null>`NULL`.as("published_by_id"),
        createdAt: sql<string>`${input.generatedAt}`.as("created_at"),
      })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          sql`${projects.archivedAt} IS NULL`,
        ),
      );
    const parent = tx
      .insert(growthReports)
      .select(lockForPostgres(parentSource, "share"))
      .onConflictDoNothing({
        target: [
          growthReports.projectId,
          growthReports.reportType,
          growthReports.periodStart,
          growthReports.periodEnd,
          growthReports.version,
        ],
      });
    const winnerWhere = and(
      eq(growthReports.projectId, input.projectId),
      eq(growthReports.id, input.id),
      eq(growthReports.factHash, input.factHash),
    );
    const sections = input.sections.map((section) =>
      tx
        .insert(growthReportSections)
        .select(
          tx
            .select({
              id: sql<string>`${section.id}`.as("id"),
              projectId: growthReports.projectId,
              reportId: growthReports.id,
              sectionType: sql<
                typeof section.sectionType
              >`${section.sectionType}`.as("section_type"),
              position: sql<number>`${section.position}`.as("position"),
              structuredContent: sql<string>`${section.structuredContent}`.as(
                "structured_content",
              ),
              createdAt: sql<string>`${input.generatedAt}`.as("created_at"),
            })
            .from(growthReports)
            .where(winnerWhere),
        )
        .onConflictDoNothing(),
    );
    const actions = input.actionIds.map((actionId) =>
      tx
        .insert(growthReportActions)
        .select(
          tx
            .select({
              projectId: growthReports.projectId,
              reportId: growthReports.id,
              actionId: sql<string>`${actionId}`.as("action_id"),
            })
            .from(growthReports)
            .where(winnerWhere),
        )
        .onConflictDoNothing({
          target: [
            growthReportActions.projectId,
            growthReportActions.reportId,
            growthReportActions.actionId,
          ],
        }),
    );
    const results = input.measurementResultIds.map((measurementResultId) =>
      tx
        .insert(growthReportMeasurementResults)
        .select(
          tx
            .select({
              projectId: growthReports.projectId,
              reportId: growthReports.id,
              measurementResultId: sql<string>`${measurementResultId}`.as(
                "measurement_result_id",
              ),
            })
            .from(growthReports)
            .where(winnerWhere),
        )
        .onConflictDoNothing({
          target: [
            growthReportMeasurementResults.projectId,
            growthReportMeasurementResults.reportId,
            growthReportMeasurementResults.measurementResultId,
          ],
        }),
    );
    return [
      ...sourceLocks(
        tx,
        input.projectId,
        input.actionIds,
        input.measurementResultIds,
      ),
      parent,
      ...sections,
      ...actions,
      ...results,
    ];
  });
}

function exactSourceMembershipSql(input: PublishGrowthReportGraphInput) {
  // Transient query parameters keep the D1 statement bounded; relationships
  // remain normalized rows, as in the Measurement writer's exact-set guards.
  const actionIds = JSON.stringify(input.actionIds);
  const resultIds = JSON.stringify(input.measurementResultIds);
  if (getDatabaseProvider() === "postgres") {
    return sql`(
      SELECT count(*) = count(DISTINCT expected.id)
      FROM jsonb_array_elements_text(${actionIds}::jsonb) AS expected(id)
    ) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${actionIds}::jsonb) AS expected(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM ${growthReportActions} report_action
        WHERE report_action.project_id = ${input.projectId}
          AND report_action.report_id = ${input.reportId}
          AND report_action.action_id = expected.id
      )
    ) AND (
      SELECT count(*) = count(DISTINCT expected.id)
      FROM jsonb_array_elements_text(${resultIds}::jsonb) AS expected(id)
    ) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${resultIds}::jsonb) AS expected(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM ${growthReportMeasurementResults} report_result
        WHERE report_result.project_id = ${input.projectId}
          AND report_result.report_id = ${input.reportId}
          AND report_result.measurement_result_id = expected.id
      )
    )`;
  }
  return sql`(
    SELECT count(*) = count(DISTINCT expected.value)
    FROM json_each(${actionIds}) AS expected
  ) AND NOT EXISTS (
    SELECT 1 FROM json_each(${actionIds}) AS expected
    WHERE NOT EXISTS (
      SELECT 1 FROM ${growthReportActions} report_action
      WHERE report_action.project_id = ${input.projectId}
        AND report_action.report_id = ${input.reportId}
        AND report_action.action_id = expected.value
    )
  ) AND (
    SELECT count(*) = count(DISTINCT expected.value)
    FROM json_each(${resultIds}) AS expected
  ) AND NOT EXISTS (
    SELECT 1 FROM json_each(${resultIds}) AS expected
    WHERE NOT EXISTS (
      SELECT 1 FROM ${growthReportMeasurementResults} report_result
      WHERE report_result.project_id = ${input.projectId}
        AND report_result.report_id = ${input.reportId}
        AND report_result.measurement_result_id = expected.value
    )
  )`;
}

function exactGraphSql(
  tx: BatchExecutor,
  input: PublishGrowthReportGraphInput,
) {
  const reportScope = and(
    eq(growthReportSections.projectId, input.projectId),
    eq(growthReportSections.reportId, input.reportId),
  );
  const sectionChecks = input.sections.map((section) =>
    exists(
      tx
        .select({ value: sql<number>`1` })
        .from(growthReportSections)
        .where(
          and(
            reportScope,
            eq(growthReportSections.sectionType, section.sectionType),
            eq(growthReportSections.position, section.position),
            eq(
              growthReportSections.structuredContent,
              section.structuredContent,
            ),
          ),
        ),
    ),
  );
  return and(
    sql`(SELECT count(*) FROM ${growthReportSections} WHERE ${growthReportSections.projectId} = ${input.projectId} AND ${growthReportSections.reportId} = ${input.reportId}) = ${input.sections.length}`,
    sql`(SELECT count(*) FROM ${growthReportActions} WHERE ${growthReportActions.projectId} = ${input.projectId} AND ${growthReportActions.reportId} = ${input.reportId}) = ${input.actionIds.length}`,
    sql`(SELECT count(*) FROM ${growthReportMeasurementResults} WHERE ${growthReportMeasurementResults.projectId} = ${input.projectId} AND ${growthReportMeasurementResults.reportId} = ${input.reportId}) = ${input.measurementResultIds.length}`,
    ...sectionChecks,
    exactSourceMembershipSql(input),
  );
}

export async function publishGrowthReportGraph(
  input: PublishGrowthReportGraphInput,
) {
  await runBatch((tx) => {
    const reportLock = lockForPostgres(
      tx
        .select({ id: growthReports.id })
        .from(growthReports)
        .where(
          and(
            eq(growthReports.projectId, input.projectId),
            eq(growthReports.id, input.reportId),
            eq(growthReports.factHash, input.factHash),
          ),
        ),
      "update",
    );
    const publish = tx
      .update(growthReports)
      .set({
        status: "published",
        publishedAt: input.publishedAt,
        publishedByType: input.publishedByType,
        publishedById: input.publishedById,
      })
      .where(
        and(
          eq(growthReports.projectId, input.projectId),
          eq(growthReports.id, input.reportId),
          eq(growthReports.factHash, input.factHash),
          eq(growthReports.status, "draft"),
          exactGraphSql(tx, input),
        ),
      );
    return [
      reportLock,
      ...sourceLocks(
        tx,
        input.projectId,
        input.actionIds,
        input.measurementResultIds,
      ),
      publish,
    ];
  });
}
