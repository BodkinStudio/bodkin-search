import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActions,
  growthMeasurementPlans,
  growthMeasurementResults,
  growthReportActions,
  growthReportMeasurementResults,
  growthReports,
  growthReportSections,
  projects,
} from "@/db/schema";
import {
  createGrowthReportGraph,
  publishGrowthReportGraph,
} from "./GrowthReportsWriter";

type ReportCoordinate = Pick<
  typeof growthReports.$inferSelect,
  "projectId" | "reportType" | "periodStart" | "periodEnd" | "version"
>;

async function projectExists(projectId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);
  return row != null;
}

async function getReportByCoordinate(coordinate: ReportCoordinate) {
  const [row] = await db
    .select()
    .from(growthReports)
    .where(
      and(
        eq(growthReports.projectId, coordinate.projectId),
        eq(growthReports.reportType, coordinate.reportType),
        eq(growthReports.periodStart, coordinate.periodStart),
        eq(growthReports.periodEnd, coordinate.periodEnd),
        eq(growthReports.version, coordinate.version),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getReport(projectId: string, reportId: string) {
  const [row] = await db
    .select()
    .from(growthReports)
    .where(
      and(
        eq(growthReports.projectId, projectId),
        eq(growthReports.id, reportId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function listSections(projectId: string, reportId: string) {
  return db
    .select()
    .from(growthReportSections)
    .where(
      and(
        eq(growthReportSections.projectId, projectId),
        eq(growthReportSections.reportId, reportId),
      ),
    )
    .orderBy(growthReportSections.position);
}

async function listActionIds(projectId: string, reportId: string) {
  const rows = await db
    .select({ actionId: growthReportActions.actionId })
    .from(growthReportActions)
    .where(
      and(
        eq(growthReportActions.projectId, projectId),
        eq(growthReportActions.reportId, reportId),
      ),
    )
    .orderBy(growthReportActions.actionId);
  return rows.map(({ actionId }) => actionId);
}

async function listMeasurementResultIds(projectId: string, reportId: string) {
  const rows = await db
    .select({
      measurementResultId: growthReportMeasurementResults.measurementResultId,
    })
    .from(growthReportMeasurementResults)
    .where(
      and(
        eq(growthReportMeasurementResults.projectId, projectId),
        eq(growthReportMeasurementResults.reportId, reportId),
      ),
    )
    .orderBy(growthReportMeasurementResults.measurementResultId);
  return rows.map(({ measurementResultId }) => measurementResultId);
}

async function getReportGraph(projectId: string, reportId: string) {
  const report = await getReport(projectId, reportId);
  if (!report) return null;
  const [sections, actionIds, measurementResultIds] = await Promise.all([
    listSections(projectId, reportId),
    listActionIds(projectId, reportId),
    listMeasurementResultIds(projectId, reportId),
  ]);
  return { report, sections, actionIds, measurementResultIds };
}

async function resolveSources(
  projectId: string,
  actionIds: string[],
  measurementResultIds: string[],
) {
  // Keep the project predicate plus an IN list below D1's bound-parameter cap.
  const actionChunks = Array.from(
    { length: Math.ceil(actionIds.length / 90) },
    (_, index) => actionIds.slice(index * 90, (index + 1) * 90),
  );
  const actions = (
    await Promise.all(
      actionChunks.map((ids) =>
        db
          .select({
            id: growthActions.id,
            factHash: growthActions.factHash,
            status: growthActions.status,
            stateVersion: growthActions.stateVersion,
          })
          .from(growthActions)
          .where(
            and(
              eq(growthActions.projectId, projectId),
              inArray(growthActions.id, ids),
            ),
          ),
      ),
    )
  )
    .flat()
    .toSorted((left, right) => left.id.localeCompare(right.id));
  const measurementResults =
    measurementResultIds.length === 0
      ? []
      : await db
          .select({
            id: growthMeasurementResults.id,
            factHash: growthMeasurementResults.factHash,
            observationsHash: growthMeasurementResults.observationsHash,
            measurementPlanId: growthMeasurementResults.measurementPlanId,
            measurementPlanFactHash: growthMeasurementPlans.factHash,
            actionId: growthMeasurementPlans.actionId,
            actionFactHash: growthActions.factHash,
            actionStateVersion: growthActions.stateVersion,
          })
          .from(growthMeasurementResults)
          .innerJoin(
            growthMeasurementPlans,
            and(
              eq(
                growthMeasurementPlans.projectId,
                growthMeasurementResults.projectId,
              ),
              eq(
                growthMeasurementPlans.id,
                growthMeasurementResults.measurementPlanId,
              ),
            ),
          )
          .innerJoin(
            growthActions,
            and(
              eq(growthActions.projectId, growthMeasurementPlans.projectId),
              eq(growthActions.id, growthMeasurementPlans.actionId),
            ),
          )
          .where(
            and(
              eq(growthMeasurementResults.projectId, projectId),
              inArray(growthMeasurementResults.id, measurementResultIds),
              eq(growthMeasurementPlans.status, "completed"),
              eq(growthActions.status, "evaluated"),
            ),
          )
          .orderBy(growthMeasurementResults.id);
  return { actions, measurementResults };
}

export const GrowthReportsRepository = {
  projectExists,
  getReportByCoordinate,
  getReport,
  listSections,
  listActionIds,
  listMeasurementResultIds,
  getReportGraph,
  resolveSources,
  createGrowthReportGraph,
  publishGrowthReportGraph,
} as const;
