import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runBatch, type BatchExecutor } from "@/db/runBatch";
import {
  promptExplorerSnapshotCitations,
  promptExplorerSnapshotFanOutQueries,
  promptExplorerSnapshotModels,
  promptExplorerSnapshots,
} from "@/db/schema";
import type {
  PromptExplorerResult,
  PromptExplorerSnapshot,
  PromptExplorerSnapshotSummary,
} from "@/types/schemas/ai-search";
import {
  promptExplorerSnapshotSchema,
  promptExplorerSnapshotSummarySchema,
} from "@/types/schemas/ai-search";

const SNAPSHOT_LIST_LIMIT = 50;

type SaveInput = {
  projectId: string;
  result: PromptExplorerResult;
  webSearch: boolean;
  webSearchCountryCode: string | null;
};

export async function savePromptExplorerSnapshot(
  input: SaveInput,
): Promise<string> {
  const id = crypto.randomUUID();
  const capturedAt = input.result.fetchedAt;
  await runBatch((tx) => snapshotStatements(tx, id, capturedAt, input));
  return id;
}

function snapshotStatements(
  tx: BatchExecutor,
  id: string,
  capturedAt: string,
  input: SaveInput,
) {
  const statements: Promise<unknown>[] = [
    tx.insert(promptExplorerSnapshots).values({
      id,
      projectId: input.projectId,
      prompt: input.result.prompt,
      highlightBrand: input.result.highlightBrand,
      webSearch: input.webSearch,
      webSearchCountryCode: input.webSearchCountryCode,
      capturedAt,
    }),
  ];
  for (const result of input.result.results) {
    const provenance =
      result.status === "success"
        ? (result.cacheProvenance ?? {
            source: "unknown" as const,
            generatedAt: null,
          })
        : { source: "unknown" as const, generatedAt: null };
    statements.push(
      tx.insert(promptExplorerSnapshotModels).values({
        projectId: input.projectId,
        snapshotId: id,
        model: result.model,
        status: result.status,
        modelName: result.status === "success" ? result.modelName : null,
        answer: result.status === "success" ? result.text : null,
        errorCode: result.status === "error" ? result.errorCode : null,
        errorMessage: result.status === "error" ? result.message : null,
        outputTokens: result.status === "success" ? result.outputTokens : null,
        responseWebSearch:
          result.status === "success" ? result.webSearch : null,
        brandMentioned:
          result.status === "success" ? result.brandMentioned : null,
        cacheSource: provenance.source,
        generatedAt: provenance.generatedAt,
      }),
    );
    if (result.status === "success") {
      for (const [ordinal, citation] of result.citations.entries())
        statements.push(
          tx.insert(promptExplorerSnapshotCitations).values({
            projectId: input.projectId,
            snapshotId: id,
            model: result.model,
            ordinal,
            ...citation,
          }),
        );
      for (const [ordinal, query] of result.fanOutQueries.entries())
        statements.push(
          tx.insert(promptExplorerSnapshotFanOutQueries).values({
            projectId: input.projectId,
            snapshotId: id,
            model: result.model,
            ordinal,
            query,
          }),
        );
    }
  }
  return statements;
}

export async function listPromptExplorerSnapshots(
  projectId: string,
): Promise<PromptExplorerSnapshotSummary[]> {
  const snapshots = await db
    .select()
    .from(promptExplorerSnapshots)
    .where(eq(promptExplorerSnapshots.projectId, projectId))
    .orderBy(desc(promptExplorerSnapshots.capturedAt))
    .limit(SNAPSHOT_LIST_LIMIT);
  if (!snapshots.length) return [];
  const models = await db
    .select()
    .from(promptExplorerSnapshotModels)
    .where(
      and(
        eq(promptExplorerSnapshotModels.projectId, projectId),
        inArray(
          promptExplorerSnapshotModels.snapshotId,
          snapshots.map((row) => row.id),
        ),
      ),
    );
  return snapshots.map((row) =>
    promptExplorerSnapshotSummarySchema.parse({
      id: row.id,
      prompt: row.prompt,
      highlightBrand: row.highlightBrand,
      webSearch: row.webSearch,
      webSearchCountryCode: row.webSearchCountryCode,
      capturedAt: row.capturedAt,
      models: models
        .filter((model) => model.snapshotId === row.id)
        .map((model) => model.model),
    }),
  );
}

export async function getPromptExplorerSnapshot(
  projectId: string,
  id: string,
): Promise<PromptExplorerSnapshot | null> {
  const [snapshot] = await db
    .select()
    .from(promptExplorerSnapshots)
    .where(
      and(
        eq(promptExplorerSnapshots.projectId, projectId),
        eq(promptExplorerSnapshots.id, id),
      ),
    )
    .limit(1);
  if (!snapshot) return null;
  const [models, citations, fanOutQueries] = await Promise.all([
    db
      .select()
      .from(promptExplorerSnapshotModels)
      .where(
        and(
          eq(promptExplorerSnapshotModels.projectId, projectId),
          eq(promptExplorerSnapshotModels.snapshotId, id),
        ),
      ),
    db
      .select()
      .from(promptExplorerSnapshotCitations)
      .where(
        and(
          eq(promptExplorerSnapshotCitations.projectId, projectId),
          eq(promptExplorerSnapshotCitations.snapshotId, id),
        ),
      ),
    db
      .select()
      .from(promptExplorerSnapshotFanOutQueries)
      .where(
        and(
          eq(promptExplorerSnapshotFanOutQueries.projectId, projectId),
          eq(promptExplorerSnapshotFanOutQueries.snapshotId, id),
        ),
      ),
  ]);
  const stored = {
    id,
    snapshotId: id,
    snapshotSaveError: null,
    prompt: snapshot.prompt,
    highlightBrand: snapshot.highlightBrand,
    fetchedAt: snapshot.capturedAt,
    webSearch: snapshot.webSearch,
    webSearchCountryCode: snapshot.webSearchCountryCode,
    results: models
      .toSorted((a, b) => a.model.localeCompare(b.model))
      .map((model) =>
        model.status === "success"
          ? {
              status: "success" as const,
              model: model.model,
              modelName: model.modelName,
              text: model.answer ?? "",
              citations: citations
                .filter((citation) => citation.model === model.model)
                .toSorted((a, b) => a.ordinal - b.ordinal)
                .map(({ url, domain, title, matchedBrand }) => ({
                  url,
                  domain,
                  title,
                  matchedBrand,
                })),
              fanOutQueries: fanOutQueries
                .filter((query) => query.model === model.model)
                .toSorted((a, b) => a.ordinal - b.ordinal)
                .map((query) => query.query),
              brandMentioned: model.brandMentioned,
              outputTokens: model.outputTokens,
              webSearch: model.responseWebSearch ?? false,
              cacheProvenance: {
                source: model.cacheSource,
                generatedAt: model.generatedAt,
              },
            }
          : {
              status: "error" as const,
              model: model.model,
              errorCode: "UPSTREAM_ERROR" as const,
              message: model.errorMessage ?? "This model was unavailable.",
            },
      ),
  };
  return promptExplorerSnapshotSchema.parse(stored);
}
