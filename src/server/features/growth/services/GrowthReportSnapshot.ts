import { sha256Hex } from "@/server/lib/audit/ids";
import {
  canonicalizeGrowthReportSections,
  collectGrowthReportSourceIds,
  createGrowthReportSchema,
  decodeGrowthReportSectionContent,
  encodeGrowthReportSectionContent,
  type CreateGrowthReportInput,
  type GrowthReportSection,
  type GrowthReportSectionType,
} from "@/types/schemas/growth-reports";

export const GROWTH_REPORT_BUILDER_VERSION = "growth-report-builder-v1";

export type GrowthReportSnapshotFact = Omit<
  CreateGrowthReportInput,
  "generatedAt"
>;

export type EncodedGrowthReportSection = {
  sectionType: GrowthReportSectionType;
  position: number;
  structuredContent: string;
};

export type GrowthReportSnapshot = {
  input: CreateGrowthReportInput;
  fact: GrowthReportSnapshotFact;
  factHash: string;
  sections: EncodedGrowthReportSection[];
  directActionIds: string[];
  measurementResultIds: string[];
};

function growthReportSnapshotFact(
  input: CreateGrowthReportInput,
): GrowthReportSnapshotFact {
  return {
    projectId: input.projectId,
    reportType: input.reportType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    version: input.version,
    reportTimezone: input.reportTimezone,
    dataCutoffAt: input.dataCutoffAt,
    builderVersion: input.builderVersion,
    contentSchemaVersion: input.contentSchemaVersion,
    createdByType: input.createdByType,
    createdById: input.createdById,
    sections: input.sections,
  };
}

export async function buildGrowthReportSnapshot(
  value: unknown,
): Promise<GrowthReportSnapshot> {
  const input = createGrowthReportSchema.parse(value);
  const fact = growthReportSnapshotFact(input);
  const sourceIds = collectGrowthReportSourceIds(input.sections);
  return {
    input,
    fact,
    factHash: await sha256Hex(JSON.stringify(fact)),
    sections: input.sections.map(({ sectionType, position, content }) => ({
      sectionType,
      position,
      structuredContent: encodeGrowthReportSectionContent(content),
    })),
    directActionIds: sourceIds.actionIds,
    measurementResultIds: sourceIds.measurementResultIds,
  };
}

export function decodeGrowthReportSections(
  rows: readonly EncodedGrowthReportSection[],
): GrowthReportSection[] {
  return canonicalizeGrowthReportSections(
    rows.map(({ sectionType, position, structuredContent }) => ({
      sectionType,
      position,
      content: decodeGrowthReportSectionContent(structuredContent),
    })),
  );
}
