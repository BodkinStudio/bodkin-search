import { and, eq, exists, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  growthAiBriefCaveats,
  growthAiBriefCitationSources,
  growthAiBriefCitations,
  growthAiBriefClaims,
  growthAiBriefs,
  growthAiBriefSteps,
} from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import { AppError } from "@/server/lib/errors";
import type {
  GrowthAiBrief,
  SaveGrowthAiBriefEditsInput,
  SavedGrowthAiBrief,
} from "@/types/schemas/growth-investigations";
import { savedGrowthAiBriefSchema } from "@/types/schemas/growth-investigations";

type StoredBrief = typeof growthAiBriefs.$inferSelect;

async function readBrief(projectId: string, briefId: string) {
  const [brief] = await db
    .select()
    .from(growthAiBriefs)
    .where(
      and(
        eq(growthAiBriefs.projectId, projectId),
        eq(growthAiBriefs.id, briefId),
      ),
    )
    .limit(1);
  return brief ?? null;
}

async function materialize(brief: StoredBrief): Promise<SavedGrowthAiBrief> {
  const [claims, citations, links, steps, caveats] = await Promise.all([
    db
      .select()
      .from(growthAiBriefClaims)
      .where(
        and(
          eq(growthAiBriefClaims.projectId, brief.projectId),
          eq(growthAiBriefClaims.briefId, brief.id),
        ),
      )
      .orderBy(growthAiBriefClaims.kind, growthAiBriefClaims.ordinal),
    db
      .select()
      .from(growthAiBriefCitationSources)
      .where(
        and(
          eq(growthAiBriefCitationSources.projectId, brief.projectId),
          eq(growthAiBriefCitationSources.briefId, brief.id),
        ),
      )
      .orderBy(growthAiBriefCitationSources.citationId),
    db
      .select()
      .from(growthAiBriefCitations)
      .where(
        and(
          eq(growthAiBriefCitations.projectId, brief.projectId),
          eq(growthAiBriefCitations.briefId, brief.id),
        ),
      ),
    db
      .select()
      .from(growthAiBriefSteps)
      .where(
        and(
          eq(growthAiBriefSteps.projectId, brief.projectId),
          eq(growthAiBriefSteps.briefId, brief.id),
        ),
      )
      .orderBy(growthAiBriefSteps.ordinal),
    db
      .select()
      .from(growthAiBriefCaveats)
      .where(
        and(
          eq(growthAiBriefCaveats.projectId, brief.projectId),
          eq(growthAiBriefCaveats.briefId, brief.id),
        ),
      )
      .orderBy(growthAiBriefCaveats.ordinal),
  ]);
  const citationIds = new Map<string, string[]>();
  for (const link of links)
    citationIds.set(link.claimId, [
      ...(citationIds.get(link.claimId) ?? []),
      link.citationId,
    ]);
  const makeClaim = (claim: (typeof claims)[number]) => ({
    statement: claim.statement,
    citationIds: citationIds.get(claim.id) ?? [],
  });
  const requested = brief.requestedUrl;
  const generated = {
    kind: "growth_ai_brief" as const,
    generatedAt: brief.generatedAt,
    affectedPageUrl: brief.affectedPageUrl,
    currentBusinessContext: brief.currentBusinessContext,
    currentPageRead:
      brief.pageReadStatus === "read" && requested && brief.resolvedUrl
        ? {
            status: "read" as const,
            requestedUrl: requested,
            resolvedUrl: brief.resolvedUrl,
          }
        : brief.pageReadStatus === "not_available"
          ? { status: "not_available" as const }
          : { status: "unavailable" as const },
    businessRelevance: brief.businessRelevance,
    observations: claims
      .filter((claim) => claim.kind === "observation")
      .map(makeClaim),
    hypotheses: claims
      .filter((claim) => claim.kind === "hypothesis")
      .map((claim) => ({
        ...makeClaim(claim),
        confidence: claim.confidence,
      })),
    proposedSteps: steps
      .filter((step) => step.kind === "generated")
      .map((step) => step.content),
    measurementApproach: brief.generatedMeasurementApproach,
    caveats: caveats.map((caveat) => caveat.content),
    citations: citations.map((citation) => ({
      id: citation.citationId,
      label: citation.label,
      source: citation.source,
      snapshot: citation.snapshot,
    })),
  };
  return savedGrowthAiBriefSchema.parse({
    id: brief.id,
    projectId: brief.projectId,
    signalId: brief.signalId,
    recommendationId: brief.recommendationId,
    templateVersion: brief.templateVersion,
    model: brief.model,
    promptVersion: brief.promptVersion,
    generated,
    proposal: {
      title: brief.title,
      proposedSteps: steps
        .filter((step) => step.kind === "proposal")
        .map((step) => step.content),
      measurementApproach: brief.measurementApproach,
      version: brief.version,
    },
    approval:
      brief.approvedActionId &&
      brief.approvedVersion !== null &&
      brief.approvedDueOn &&
      brief.approvedAt &&
      brief.approvedActorId
        ? {
            actionId: brief.approvedActionId,
            version: brief.approvedVersion,
            dueOn: brief.approvedDueOn,
            approvedAt: brief.approvedAt,
            actorId: brief.approvedActorId,
          }
        : null,
  });
}

async function getBySignal(input: { projectId: string; signalId: string }) {
  const [brief] = await db
    .select()
    .from(growthAiBriefs)
    .where(
      and(
        eq(growthAiBriefs.projectId, input.projectId),
        eq(growthAiBriefs.signalId, input.signalId),
      ),
    )
    .limit(1);
  return brief ? materialize(brief) : null;
}

async function getById(projectId: string, briefId: string) {
  const brief = await readBrief(projectId, briefId);
  return brief ? materialize(brief) : null;
}

async function insertGenerated(input: {
  projectId: string;
  signalId: string;
  recommendationId: string;
  templateVersion: string;
  title: string;
  generated: GrowthAiBrief;
  model: string;
  promptVersion: string;
}) {
  const briefId = crypto.randomUUID();
  const now = new Date().toISOString();
  const page = input.generated.currentPageRead;
  const claims = [
    ...input.generated.observations.map((claim, ordinal) => ({
      ...claim,
      kind: "observation",
      ordinal,
      confidence: null,
    })),
    ...input.generated.hypotheses.map((claim, ordinal) => ({
      ...claim,
      kind: "hypothesis",
      ordinal,
      confidence: claim.confidence,
    })),
  ].map((claim) => ({ ...claim, id: crypto.randomUUID() }));
  try {
    await runBatch((tx) => [
      tx.insert(growthAiBriefs).values({
        id: briefId,
        projectId: input.projectId,
        signalId: input.signalId,
        recommendationId: input.recommendationId,
        templateVersion: input.templateVersion,
        model: input.model,
        promptVersion: input.promptVersion,
        generatedAt: input.generated.generatedAt,
        affectedPageUrl: input.generated.affectedPageUrl,
        currentBusinessContext: input.generated.currentBusinessContext,
        pageReadStatus: page.status,
        requestedUrl: page.status === "read" ? page.requestedUrl : null,
        resolvedUrl: page.status === "read" ? page.resolvedUrl : null,
        businessRelevance: input.generated.businessRelevance,
        title: input.title,
        generatedMeasurementApproach: input.generated.measurementApproach,
        measurementApproach: input.generated.measurementApproach,
        version: 0,
        createdAt: now,
        updatedAt: now,
      }),
      ...claims.map((claim) =>
        tx.insert(growthAiBriefClaims).values({
          id: claim.id,
          projectId: input.projectId,
          briefId,
          kind: claim.kind,
          ordinal: claim.ordinal,
          statement: claim.statement,
          confidence: claim.confidence,
        }),
      ),
      ...input.generated.citations.map((citation) =>
        tx.insert(growthAiBriefCitationSources).values({
          projectId: input.projectId,
          briefId,
          citationId: citation.id,
          label: citation.label,
          source: citation.source,
          snapshot: citation.snapshot,
        }),
      ),
      ...claims.flatMap((claim) =>
        [...new Set(claim.citationIds)].map((citationId) =>
          tx.insert(growthAiBriefCitations).values({
            projectId: input.projectId,
            briefId,
            claimId: claim.id,
            citationId,
          }),
        ),
      ),
      ...["generated", "proposal"].flatMap((kind) =>
        input.generated.proposedSteps.map((content, ordinal) =>
          tx.insert(growthAiBriefSteps).values({
            projectId: input.projectId,
            briefId,
            kind,
            ordinal,
            content,
          }),
        ),
      ),
      ...input.generated.caveats.map((content, ordinal) =>
        tx
          .insert(growthAiBriefCaveats)
          .values({ projectId: input.projectId, briefId, ordinal, content }),
      ),
    ]);
  } catch (error) {
    // A concurrent generator may have saved this source first. Never overwrite it.
    const winner = await getBySignal(input);
    if (winner) return winner;
    throw error;
  }
  const saved = await getById(input.projectId, briefId);
  if (!saved) throw new AppError("CONFLICT", "AI proposal could not be saved");
  return saved;
}

async function saveEdits(input: SaveGrowthAiBriefEditsInput) {
  const writeKey = crypto.randomUUID();
  const now = new Date().toISOString();
  await runBatch((tx) => {
    const winner = and(
      eq(growthAiBriefs.projectId, input.projectId),
      eq(growthAiBriefs.id, input.briefId),
      eq(growthAiBriefs.version, input.expectedVersion + 1),
      eq(growthAiBriefs.proposalWriteKey, writeKey),
      sql`${growthAiBriefs.approvedActionId} IS NULL`,
    );
    const won = exists(
      tx
        .select({ value: sql`1` })
        .from(growthAiBriefs)
        .where(winner),
    );
    return [
      tx
        .update(growthAiBriefs)
        .set({
          title: input.title,
          measurementApproach: input.measurementApproach,
          version: input.expectedVersion + 1,
          proposalWriteKey: writeKey,
          updatedAt: now,
        })
        .where(
          and(
            eq(growthAiBriefs.projectId, input.projectId),
            eq(growthAiBriefs.id, input.briefId),
            eq(growthAiBriefs.version, input.expectedVersion),
            sql`${growthAiBriefs.approvedActionId} IS NULL`,
          ),
        ),
      tx
        .delete(growthAiBriefSteps)
        .where(
          and(
            eq(growthAiBriefSteps.projectId, input.projectId),
            eq(growthAiBriefSteps.briefId, input.briefId),
            eq(growthAiBriefSteps.kind, "proposal"),
            won,
          ),
        ),
      ...input.proposedSteps.map((content, ordinal) =>
        tx.insert(growthAiBriefSteps).select(
          tx
            .select({
              projectId: growthAiBriefs.projectId,
              briefId: growthAiBriefs.id,
              kind: sql<string>`'proposal'`.as("kind"),
              ordinal: sql<number>`${ordinal}`.as("ordinal"),
              content: sql<string>`${content}`.as("content"),
            })
            .from(growthAiBriefs)
            .where(winner),
        ),
      ),
    ];
  });
  return getById(input.projectId, input.briefId);
}

export const GrowthAiBriefRepository = {
  getById,
  getBySignal,
  insertGenerated,
  saveEdits,
};
