import { AppError } from "@/server/lib/errors";
import {
  createGrowthReportSchema,
  GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
  MAX_GROWTH_REPORT_ACTION_SOURCES,
  publishGrowthReportSchema,
  type CreateGrowthReportInput,
  type PublishGrowthReportInput,
} from "@/types/schemas/growth-reports";
import { GrowthReportsRepository as repo } from "../repositories/GrowthReportsRepository";
import {
  assertExactGrowthReport,
  assertStoredGrowthReportGraph,
} from "./GrowthReportGraph";
import {
  buildGrowthReportSnapshot,
  GROWTH_REPORT_BUILDER_VERSION,
} from "./GrowthReportSnapshot";
import { GrowthSettingsService } from "./GrowthSettingsService";

type CreateGrowthReportRequest = Omit<
  CreateGrowthReportInput,
  "reportTimezone" | "generatedAt" | "builderVersion" | "contentSchemaVersion"
>;

type ExpectedSettings = {
  reportTimezone: string;
  updatedAt: string | null;
  persisted: boolean;
};
type ServiceClock = { now?: Date; expectedSettings?: ExpectedSettings };

const conflict = (message: string): never => {
  throw new AppError("CONFLICT", message);
};

const validation = (message: string): never => {
  throw new AppError("VALIDATION_ERROR", message);
};

function parseCreationRequest(input: CreateGrowthReportRequest) {
  try {
    const parsed = createGrowthReportSchema.parse({
      ...input,
      reportTimezone: "UTC",
      generatedAt: input.dataCutoffAt,
      builderVersion: GROWTH_REPORT_BUILDER_VERSION,
      contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
    });
    const {
      reportTimezone: _reportTimezone,
      generatedAt: _generatedAt,
      builderVersion: _builderVersion,
      contentSchemaVersion: _contentSchemaVersion,
      ...request
    } = parsed;
    return request;
  } catch {
    return validation("Growth Report input is invalid");
  }
}

function sourceActionIds(
  directActionIds: string[],
  results: { actionId: string }[],
) {
  const actionIds = [
    ...new Set([
      ...directActionIds,
      ...results.map(({ actionId }) => actionId),
    ]),
  ].toSorted();
  if (actionIds.length > MAX_GROWTH_REPORT_ACTION_SOURCES)
    validation(
      `A Report cannot link more than ${MAX_GROWTH_REPORT_ACTION_SOURCES} Actions`,
    );
  return actionIds;
}

const sameIds = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify(left) === JSON.stringify(right);

async function reportGraph(projectId: string, reportId: string) {
  const graph = await repo.getReportGraph(projectId, reportId);
  if (!graph) throw new AppError("NOT_FOUND", "Growth Report not found");
  return graph;
}

async function createGrowthReport(
  request: CreateGrowthReportRequest,
  options: ServiceClock = {},
) {
  const input = parseCreationRequest(request);
  const coordinate = {
    projectId: input.projectId,
    reportType: input.reportType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    version: input.version,
  };
  const existing = await repo.getReportByCoordinate(coordinate);
  if (existing) {
    const expected = await buildGrowthReportSnapshot({
      ...input,
      reportTimezone: existing.reportTimezone,
      generatedAt: existing.generatedAt,
      builderVersion: existing.builderVersion,
      contentSchemaVersion: existing.contentSchemaVersion,
    });
    return assertExactGrowthReport(
      await reportGraph(input.projectId, existing.id),
      expected,
    );
  }

  if (!(await repo.projectExists(input.projectId)))
    throw new AppError("NOT_FOUND", "Growth project not found");
  const settings = await GrowthSettingsService.getSettings(input.projectId);
  if (
    options.expectedSettings &&
    (settings.reportTimezone !== options.expectedSettings.reportTimezone ||
      settings.updatedAt !== options.expectedSettings.updatedAt ||
      settings.persisted !== options.expectedSettings.persisted)
  )
    conflict("Growth Report settings changed; retry the monthly build");
  const generatedAt = (options.now ?? new Date()).toISOString();
  let finalized: CreateGrowthReportInput;
  try {
    finalized = createGrowthReportSchema.parse({
      ...input,
      reportTimezone: settings.reportTimezone,
      generatedAt,
      builderVersion: GROWTH_REPORT_BUILDER_VERSION,
      contentSchemaVersion: GROWTH_REPORT_CONTENT_SCHEMA_VERSION,
    });
  } catch {
    return validation("Growth Report input is invalid");
  }
  const snapshot = await buildGrowthReportSnapshot(finalized);
  const sources = await repo.resolveSources(
    input.projectId,
    snapshot.directActionIds,
    snapshot.measurementResultIds,
  );
  if (
    sources.actions.length !== snapshot.directActionIds.length ||
    sources.measurementResults.length !== snapshot.measurementResultIds.length
  ) {
    throw new AppError(
      "NOT_FOUND",
      "Growth Report Action or terminal Measurement Result not found",
    );
  }
  const actionIds = sourceActionIds(
    snapshot.directActionIds,
    sources.measurementResults,
  );

  try {
    await repo.createGrowthReportGraph({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      factHash: snapshot.factHash,
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      version: input.version,
      reportTimezone: finalized.reportTimezone,
      dataCutoffAt: finalized.dataCutoffAt,
      generatedAt: finalized.generatedAt,
      builderVersion: finalized.builderVersion,
      contentSchemaVersion: finalized.contentSchemaVersion,
      createdByType: input.createdByType,
      createdById: input.createdById,
      sections: snapshot.sections.map((section) => ({
        id: crypto.randomUUID(),
        ...section,
      })),
      actionIds,
      measurementResultIds: snapshot.measurementResultIds,
      expectedSettings: options.expectedSettings,
    });
  } catch (error) {
    const winner = await repo.getReportByCoordinate(coordinate);
    if (winner)
      return assertExactGrowthReport(
        await reportGraph(input.projectId, winner.id),
        snapshot,
      );
    const current = await repo.resolveSources(
      input.projectId,
      snapshot.directActionIds,
      snapshot.measurementResultIds,
    );
    if (
      current.actions.length !== snapshot.directActionIds.length ||
      current.measurementResults.length !== snapshot.measurementResultIds.length
    ) {
      throw new AppError("NOT_FOUND", "Growth Report source was deleted");
    }
    throw error;
  }

  const winner = await repo.getReportByCoordinate(coordinate);
  if (!winner) conflict("Growth Report was not created");
  return assertExactGrowthReport(
    await reportGraph(input.projectId, winner.id),
    snapshot,
  );
}

async function getGrowthReport(projectId: string, reportId: string) {
  return assertStoredGrowthReportGraph(await reportGraph(projectId, reportId));
}

async function getGrowthReportByCoordinate(coordinate: {
  projectId: string;
  reportType: "monthly";
  periodStart: string;
  periodEnd: string;
  version: number;
}) {
  const report = await repo.getReportByCoordinate(coordinate);
  return report
    ? assertStoredGrowthReportGraph(
        await reportGraph(coordinate.projectId, report.id),
      )
    : null;
}

async function publishGrowthReport(
  input: PublishGrowthReportInput,
  options: ServiceClock = {},
) {
  let parsed: PublishGrowthReportInput;
  try {
    parsed = publishGrowthReportSchema.parse(input);
  } catch {
    return validation("Growth Report publication input is invalid");
  }
  const graph = await reportGraph(parsed.projectId, parsed.reportId);
  const stored = await assertStoredGrowthReportGraph(graph);
  if (stored.status === "published") return stored;

  const publishedAt = (options.now ?? new Date()).toISOString();
  if (publishedAt < stored.generatedAt)
    validation("Growth Report publication cannot predate generation");
  const snapshot = await buildGrowthReportSnapshot({
    projectId: stored.projectId,
    reportType: stored.reportType,
    periodStart: stored.periodStart,
    periodEnd: stored.periodEnd,
    version: stored.version,
    reportTimezone: stored.reportTimezone,
    dataCutoffAt: stored.dataCutoffAt,
    generatedAt: stored.generatedAt,
    builderVersion: stored.builderVersion,
    contentSchemaVersion: stored.contentSchemaVersion,
    createdByType: stored.createdByType,
    createdById: stored.createdById,
    sections: stored.sections,
  });
  const sources = await repo.resolveSources(
    stored.projectId,
    snapshot.directActionIds,
    snapshot.measurementResultIds,
  );
  if (
    sources.actions.length !== snapshot.directActionIds.length ||
    sources.measurementResults.length !== snapshot.measurementResultIds.length
  ) {
    conflict("Stored draft Growth Report source manifest is incomplete");
  }
  const actionIds = sourceActionIds(
    snapshot.directActionIds,
    sources.measurementResults,
  );
  if (
    !sameIds(stored.actionIds, actionIds) ||
    !sameIds(stored.measurementResultIds, snapshot.measurementResultIds)
  ) {
    conflict("Stored draft Growth Report source manifest is incomplete");
  }
  await repo.publishGrowthReportGraph({
    projectId: stored.projectId,
    reportId: stored.id,
    factHash: stored.factHash,
    publishedAt,
    publishedByType: parsed.actorType,
    publishedById: parsed.actorId,
    sections: snapshot.sections,
    actionIds,
    measurementResultIds: snapshot.measurementResultIds,
  });
  const winner = await assertStoredGrowthReportGraph(
    await reportGraph(stored.projectId, stored.id),
  );
  if (winner.status !== "published")
    conflict("Growth Report publication lost a concurrent source change");
  return winner;
}

export const GrowthReportsService = {
  createGrowthReport,
  getGrowthReport,
  getGrowthReportByCoordinate,
  publishGrowthReport,
} as const;
