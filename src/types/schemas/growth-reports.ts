import { z } from "zod";
import { GROWTH_ACTOR_TYPES } from "./growth-actions";
import { GROWTH_EVIDENCE_KINDS } from "./growth";

export const GROWTH_REPORT_TYPES = ["monthly"] as const;
export const GROWTH_REPORT_STATUSES = ["draft", "published"] as const;
export const GROWTH_REPORT_SECTION_TYPES = [
  "executive_summary",
  "performance",
  "meaningful_changes",
  "work_completed",
  "results_from_earlier_work",
  "risks",
  "opportunities",
  "next_month",
] as const;

export type GrowthReportSectionType =
  (typeof GROWTH_REPORT_SECTION_TYPES)[number];

const sectionPositionsSchema = z.record(
  z.enum(GROWTH_REPORT_SECTION_TYPES),
  z.number().int(),
);
export const GROWTH_REPORT_SECTION_POSITIONS = sectionPositionsSchema.parse(
  Object.fromEntries(
    GROWTH_REPORT_SECTION_TYPES.map((sectionType, position) => [
      sectionType,
      position,
    ]),
  ),
);

export const GROWTH_REPORT_CONTENT_SCHEMA_VERSION = 1;
const MAX_GROWTH_REPORT_SECTION_BYTES = 64 * 1024;
const MAX_GROWTH_REPORT_TOTAL_BYTES = 256 * 1024;
export const MAX_GROWTH_REPORT_ITEMS_PER_SECTION = 100;
export const MAX_GROWTH_REPORT_FACTS_PER_ITEM = 50;
export const MAX_GROWTH_REPORT_EVIDENCE_PER_ITEM = 50;
export const MAX_GROWTH_REPORT_ACTION_SOURCES = 100;
export const MAX_GROWTH_REPORT_RESULT_SOURCES = 50;

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const stableKey = boundedText(100).regex(/^[a-z0-9][a-z0-9._:-]*$/);
const id = boundedText(100);

const isoDate = boundedText(10).superRefine((value, context) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    context.addIssue({ code: "custom", message: "Use YYYY-MM-DD" });
    return;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    context.addIssue({ code: "custom", message: "Use a valid calendar date" });
  }
});

const canonicalTimestamp = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const reportTimezone = boundedText(100).refine(
  isValidTimeZone,
  "Use a valid IANA timezone, like Europe/London",
);

const positionedShape = {
  key: stableKey,
  position: z.number().int().min(0),
} as const;

function validateUniquePositioned(
  values: readonly { key: string; position: number }[],
  context: z.RefinementCtx,
) {
  const keys = new Set<string>();
  const positions = new Set<number>();
  for (const [index, value] of values.entries()) {
    if (keys.has(value.key))
      context.addIssue({
        code: "custom",
        path: [index, "key"],
        message: "Keys must be unique",
      });
    if (positions.has(value.position))
      context.addIssue({
        code: "custom",
        path: [index, "position"],
        message: "Positions must be unique",
      });
    keys.add(value.key);
    positions.add(value.position);
  }
  for (let position = 0; position < values.length; position += 1) {
    if (!positions.has(position))
      context.addIssue({
        code: "custom",
        message: "Positions must be contiguous from zero",
      });
  }
}

const byPosition = <T extends { position: number }>(values: readonly T[]) =>
  [...values].toSorted((left, right) => left.position - right.position);

const growthReportEvidenceRefSchema = z
  .object({
    kind: z.enum(GROWTH_EVIDENCE_KINDS),
    ref: boundedText(500),
  })
  .strict();

const growthReportFactSchema = z
  .object({
    ...positionedShape,
    label: boundedText(200),
    value: z.union([
      boundedText(2000),
      z
        .number()
        .finite()
        .transform((value) => (Object.is(value, -0) ? 0 : value)),
      z.boolean(),
      z.null(),
    ]),
  })
  .strict();

const growthReportSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("action"), id }).strict(),
  z.object({ type: z.literal("measurement_result"), id }).strict(),
]);

const evidenceSetSchema = z
  .array(growthReportEvidenceRefSchema)
  .max(MAX_GROWTH_REPORT_EVIDENCE_PER_ITEM)
  .transform((evidence) => {
    const byCoordinate = new Map(
      evidence.map((reference) => [
        `${reference.kind}\u0000${reference.ref}`,
        reference,
      ]),
    );
    return [...byCoordinate.values()].toSorted(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.ref.localeCompare(right.ref),
    );
  });

const factsSchema = z
  .array(growthReportFactSchema)
  .max(MAX_GROWTH_REPORT_FACTS_PER_ITEM)
  .superRefine((facts, context) => {
    validateUniquePositioned(facts, context);
    const semanticFacts = new Set<string>();
    for (const [index, fact] of facts.entries()) {
      const coordinate = JSON.stringify([fact.label, fact.value]);
      if (semanticFacts.has(coordinate))
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Facts must be unique",
        });
      semanticFacts.add(coordinate);
    }
  })
  .transform(byPosition);

export const growthReportItemSchema = z
  .object({
    ...positionedShape,
    title: boundedText(300),
    summary: boundedText(5000),
    facts: factsSchema,
    evidence: evidenceSetSchema,
    source: growthReportSourceSchema.nullable(),
  })
  .strict();

const itemsSchema = z
  .array(growthReportItemSchema)
  .max(MAX_GROWTH_REPORT_ITEMS_PER_SECTION)
  .superRefine(validateUniquePositioned)
  .transform(byPosition);

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export const growthReportSectionContentSchema = z
  .object({
    summary: boundedText(5000),
    items: itemsSchema,
  })
  .strict()
  .superRefine((content, context) => {
    if (jsonBytes(content) > MAX_GROWTH_REPORT_SECTION_BYTES)
      context.addIssue({
        code: "custom",
        message: "Report section content exceeds 64 KiB",
      });
  });

const SECTION_SOURCE_TYPES: Record<
  GrowthReportSectionType,
  readonly ("action" | "measurement_result")[]
> = {
  executive_summary: ["action", "measurement_result"],
  performance: ["measurement_result"],
  meaningful_changes: ["action", "measurement_result"],
  work_completed: ["action"],
  results_from_earlier_work: ["measurement_result"],
  risks: ["action"],
  opportunities: ["action"],
  next_month: ["action"],
};

export const growthReportSectionSchema = z
  .object({
    sectionType: z.enum(GROWTH_REPORT_SECTION_TYPES),
    position: z
      .number()
      .int()
      .min(0)
      .max(GROWTH_REPORT_SECTION_TYPES.length - 1),
    content: growthReportSectionContentSchema,
  })
  .strict()
  .superRefine((section, context) => {
    if (
      section.position !== GROWTH_REPORT_SECTION_POSITIONS[section.sectionType]
    )
      context.addIssue({
        code: "custom",
        path: ["position"],
        message: "Section position does not match the canonical report order",
      });
    const allowedSources = SECTION_SOURCE_TYPES[section.sectionType];
    for (const [index, item] of section.content.items.entries()) {
      if (item.source != null && !allowedSources.includes(item.source.type))
        context.addIssue({
          code: "custom",
          path: ["content", "items", index, "source"],
          message: `Source type is not allowed in ${section.sectionType}`,
        });
    }
  });

const reportSectionsSchema = z
  .array(growthReportSectionSchema)
  .length(GROWTH_REPORT_SECTION_TYPES.length)
  .superRefine((sections, context) => {
    const sectionTypes = new Set(
      sections.map((section) => section.sectionType),
    );
    if (sectionTypes.size !== GROWTH_REPORT_SECTION_TYPES.length)
      context.addIssue({
        code: "custom",
        message: "A Report must contain every section exactly once",
      });
  })
  .transform(byPosition);

export const createGrowthReportSchema = z
  .object({
    projectId: id,
    reportType: z.enum(GROWTH_REPORT_TYPES),
    periodStart: isoDate,
    periodEnd: isoDate,
    version: z.number().int().positive(),
    reportTimezone,
    dataCutoffAt: canonicalTimestamp,
    generatedAt: canonicalTimestamp,
    builderVersion: boundedText(100),
    contentSchemaVersion: z.literal(GROWTH_REPORT_CONTENT_SCHEMA_VERSION),
    createdByType: z.enum(GROWTH_ACTOR_TYPES),
    createdById: boundedText(200),
    sections: reportSectionsSchema,
  })
  .strict()
  .superRefine((report, context) => {
    if (report.periodStart > report.periodEnd)
      context.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Period end must be on or after period start",
      });
    if (report.dataCutoffAt > report.generatedAt)
      context.addIssue({
        code: "custom",
        path: ["dataCutoffAt"],
        message: "Data cutoff cannot follow report generation",
      });
    const sources = collectGrowthReportSourceIds(report.sections);
    if (sources.actionIds.length + sources.measurementResultIds.length === 0)
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "A Report must contain at least one sourced item",
      });
    if (sources.actionIds.length > MAX_GROWTH_REPORT_ACTION_SOURCES)
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "A Report cannot reference more than 100 Actions",
      });
    if (sources.measurementResultIds.length > MAX_GROWTH_REPORT_RESULT_SOURCES)
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "A Report cannot reference more than 50 Measurement Results",
      });
    const totalBytes = report.sections.reduce(
      (total, section) => total + jsonBytes(section.content),
      0,
    );
    if (totalBytes > MAX_GROWTH_REPORT_TOTAL_BYTES)
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Report section content exceeds 256 KiB in total",
      });
  });

export const publishGrowthReportSchema = z
  .object({
    projectId: id,
    reportId: id,
    actorType: z.enum(GROWTH_ACTOR_TYPES),
    actorId: boundedText(200),
  })
  .strict();

type Output<T extends z.ZodType> = z.output<T>;
type ContentSchema = typeof growthReportSectionContentSchema;
export type GrowthReportItem = Output<typeof growthReportItemSchema>;
type GrowthReportSectionContent = Output<ContentSchema>;
export type GrowthReportSection = Output<typeof growthReportSectionSchema>;
export type CreateGrowthReportInput = Output<typeof createGrowthReportSchema>;
export type PublishGrowthReportInput = Output<typeof publishGrowthReportSchema>;

export function canonicalizeGrowthReportSections(
  sections: readonly GrowthReportSection[],
): GrowthReportSection[] {
  return reportSectionsSchema.parse(sections);
}

export function encodeGrowthReportSectionContent(
  content: GrowthReportSectionContent,
): string {
  return JSON.stringify(growthReportSectionContentSchema.parse(content));
}

export function decodeGrowthReportSectionContent(
  structuredContent: string,
): GrowthReportSectionContent {
  let decoded: unknown;
  try {
    decoded = JSON.parse(structuredContent) as unknown;
  } catch {
    throw new Error("Stored report section content is not valid JSON");
  }
  const content = growthReportSectionContentSchema.parse(decoded);
  if (JSON.stringify(content) !== structuredContent)
    throw new Error("Stored report section content is not canonical JSON");
  return content;
}

export function collectGrowthReportSourceIds(
  sections: readonly GrowthReportSection[],
): { actionIds: string[]; measurementResultIds: string[] } {
  const actionIds = new Set<string>();
  const measurementResultIds = new Set<string>();
  for (const section of sections) {
    for (const item of section.content.items) {
      if (item.source?.type === "action") actionIds.add(item.source.id);
      if (item.source?.type === "measurement_result")
        measurementResultIds.add(item.source.id);
    }
  }
  return {
    actionIds: [...actionIds].toSorted(),
    measurementResultIds: [...measurementResultIds].toSorted(),
  };
}
