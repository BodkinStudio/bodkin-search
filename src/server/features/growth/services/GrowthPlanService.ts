/* eslint-disable max-lines -- Workstreams, their plan Actions and that evidence are one plan aggregate with one service boundary */
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type { TransitionGrowthActionInput } from "@/types/schemas/growth-actions";
import type { ContextAuthor } from "@/types/schemas/projectContext";
import type {
  AddGrowthActionEvidenceInput,
  GrowthEvidenceSeriesInput,
  CreateGrowthPlanActionInput,
  CreateGrowthWorkstreamInput,
  GrowthActionEvidenceDto,
  GrowthActionEvidenceInput,
  GrowthPlanActionDto,
  GrowthPlanDto,
  GrowthWorkstreamDto,
  RemoveGrowthActionEvidenceInput,
  ReorderGrowthWorkstreamsInput,
  UpdateGrowthPlanActionInput,
  UpdateGrowthPlanNarrativeInput,
  UpdateGrowthWorkstreamInput,
} from "@/types/schemas/growth-plan";
import { GrowthPlanRepository as repo } from "../repositories/GrowthPlanRepository";
import {
  normalizeGrowthTargets,
  normalizeGrowthWordTargets,
} from "./GrowthTargetNormalizer";
import { growthActionEventFactHash } from "./GrowthActionEventFact";
import { GrowthActionsService } from "./GrowthActionsService";

type Actor = { actorType: "user" | "agent" | "system"; actorId: string };
type WorkstreamRow = Awaited<ReturnType<typeof repo.listWorkstreams>>[number];
type ActionRow = Awaited<ReturnType<typeof repo.getAction>> & object;
type TargetRow = Awaited<ReturnType<typeof repo.listActionTargets>>[number];
type EvidenceRow = Awaited<ReturnType<typeof repo.listActionEvidence>>[number];
type SeriesRow = Awaited<ReturnType<typeof repo.listEvidenceSeries>>[number];
type PointRow = Awaited<ReturnType<typeof repo.listEvidencePoints>>[number];
/** Series rows keyed by evidence id, and their points keyed by series id. */
type EvidenceSeries = {
  byEvidence: Map<string, SeriesRow>;
  pointsBySeries: Map<string, PointRow[]>;
};

// growth_actions.due_at holds a full ISO timestamp; the plan only ever talks in
// whole days, so the contract exposes the date half.
const toDueAt = (dueOn: string) => `${dueOn}T00:00:00.000Z`;
const toDueOn = (dueAt: string) => dueAt.slice(0, 10);

function collectSeries(
  series: SeriesRow[],
  points: PointRow[],
): EvidenceSeries {
  const pointsBySeries = new Map<string, PointRow[]>();
  for (const point of points)
    pointsBySeries.set(point.seriesId, [
      ...(pointsBySeries.get(point.seriesId) ?? []),
      point,
    ]);
  return {
    byEvidence: new Map(series.map((row) => [row.evidenceId, row])),
    pointsBySeries,
  };
}

const evidenceDto = (
  row: EvidenceRow,
  series: EvidenceSeries,
): GrowthActionEvidenceDto => {
  const stored = series.byEvidence.get(row.id);
  return {
    id: row.id,
    kind: row.kind,
    statement: row.statement,
    sourceLabel: row.sourceLabel,
    sourceUrl: row.sourceUrl,
    observedOn: row.observedOn,
    position: row.position,
    series: stored
      ? {
          id: stored.id,
          kind: stored.kind,
          title: stored.title,
          unit: stored.unit,
          // Already ordered by position in SQL.
          points: (series.pointsBySeries.get(stored.id) ?? []).map((point) => ({
            label: point.label,
            group: point.groupLabel,
            value: point.value,
            position: point.position,
          })),
        }
      : null,
  };
};

function actionDto(
  action: Pick<
    ActionRow,
    | "id"
    | "title"
    | "description"
    | "status"
    | "stateVersion"
    | "rationale"
    | "successMeasure"
    | "dueAt"
    | "recommendationId"
    | "workstreamPosition"
    | "createdAt"
    | "updatedAt"
  >,
  targets: TargetRow[],
  evidence: EvidenceRow[],
  series: EvidenceSeries,
): GrowthPlanActionDto {
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    status: action.status,
    stateVersion: action.stateVersion,
    rationale: action.rationale,
    successMeasure: action.successMeasure,
    dueOn: toDueOn(action.dueAt),
    isPlanAction: action.recommendationId === null,
    workstreamPosition: action.workstreamPosition,
    targets: targets.map(({ targetType, targetValue }) => ({
      targetType,
      targetValue,
    })),
    evidence: evidence.map((row) => evidenceDto(row, series)),
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
  };
}

function workstreamDto(
  row: WorkstreamRow,
  actions: GrowthPlanActionDto[],
): GrowthWorkstreamDto {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    commercialReason: row.commercialReason,
    status: row.status,
    targetLabel: row.targetLabel,
    targetBaseline: row.targetBaseline,
    targetValue: row.targetValue,
    targetDueOn: row.targetDueOn,
    actions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function byAction<T extends { actionId: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows)
    map.set(row.actionId, [...(map.get(row.actionId) ?? []), row]);
  return map;
}

// Positions are MAX+1 read inside the write. That is atomic on SQLite but not on
// Postgres, where two concurrent creates can read the same MAX and the loser
// raises a raw unique violation on the position index. Retry once, then say so.
const POSITION_INDEXES = [
  "growth_workstreams_project_position_key",
  "growth_actions_workstream_position_key",
  "growth_action_evidence_position_key",
  ".position",
  ".workstream_position",
];

function isPositionCollision(error: unknown): boolean {
  if (error instanceof AppError) return false;
  const constraint =
    typeof error === "object" && error !== null && "constraint" in error
      ? String(error.constraint)
      : "";
  const text = `${error instanceof Error ? error.message : String(error)} ${
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : ""
  } ${constraint}`;
  return (
    /unique|23505/i.test(text) &&
    POSITION_INDEXES.some((index) => text.includes(index))
  );
}

async function withPositionRetry<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!isPositionCollision(error)) throw error;
  }
  try {
    return await write();
  } catch (error) {
    if (!isPositionCollision(error)) throw error;
    throw new AppError(
      "CONFLICT",
      "Another change took that plan position; please try again",
    );
  }
}

// The plan's narrative lives in project context, so it stays readable to SAM,
// the MCP context tools and the settings UI rather than only to this feature.
const THESIS_SLUG = "growth-plan-thesis";
const LEDE_SLUG = "growth-plan-lede";

function narrativeOf(context: {
  customSections: { slug: string; content: string }[];
}) {
  const section = (slug: string) =>
    context.customSections.find((entry) => entry.slug === slug)?.content ??
    null;
  return { thesis: section(THESIS_SLUG), lede: section(LEDE_SLUG) };
}

async function readNarrative(projectId: string) {
  return narrativeOf(await ProjectContextService.getProjectContext(projectId));
}

async function getPlan(projectId: string): Promise<GrowthPlanDto> {
  const [
    workstreams,
    actions,
    targets,
    evidence,
    seriesRows,
    pointRows,
    narrative,
  ] = await Promise.all([
    repo.listWorkstreams(projectId),
    repo.listPlanActions(projectId),
    repo.listActionTargets(projectId),
    repo.listActionEvidence(projectId),
    repo.listEvidenceSeries(projectId),
    repo.listEvidencePoints(projectId),
    readNarrative(projectId),
  ]);
  const series = collectSeries(seriesRows, pointRows);
  const targetsByAction = byAction(targets);
  const evidenceByAction = byAction(evidence);

  const grouped = new Map<string, GrowthPlanActionDto[]>();
  for (const action of actions) {
    if (!action.workstreamId) continue;
    const dto = actionDto(
      action,
      targetsByAction.get(action.id) ?? [],
      evidenceByAction.get(action.id) ?? [],
      series,
    );
    grouped.set(action.workstreamId, [
      ...(grouped.get(action.workstreamId) ?? []),
      dto,
    ]);
  }
  // Sorted here rather than in SQL: SQLite orders NULLs first, Postgres last.
  for (const list of grouped.values())
    list.sort(
      (a, b) =>
        (a.workstreamPosition ?? Number.MAX_SAFE_INTEGER) -
          (b.workstreamPosition ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt),
    );

  const timestamps = [
    ...workstreams.map((row) => row.updatedAt),
    ...actions.map((row) => row.updatedAt),
    ...evidence.map((row) => row.createdAt),
  ];
  return {
    projectId,
    ...narrative,
    workstreams: workstreams.map((row) =>
      workstreamDto(row, grouped.get(row.id) ?? []),
    ),
    updatedAt: timestamps.toSorted().at(-1) ?? null,
  };
}

const narrativeUpdate = (
  slug: string,
  title: string,
  content: string | null,
) =>
  content === null
    ? { deleteCustomSection: slug }
    : { customSection: slug, title, content };

/** Writes or clears the plan's thesis and lede; null deletes the section. */
async function updateNarrative(
  input: UpdateGrowthPlanNarrativeInput & {
    projectDomain: string | null;
    updatedBy: ContextAuthor;
  },
) {
  // applyContextUpdates returns the context it just wrote, so there is no
  // second read and no window where the two disagree.
  return narrativeOf(
    await ProjectContextService.applyContextUpdates(
      { projectId: input.projectId, projectDomain: input.projectDomain },
      [
        narrativeUpdate(THESIS_SLUG, "Growth plan thesis", input.thesis),
        narrativeUpdate(LEDE_SLUG, "Growth plan lede", input.lede),
      ],
      input.updatedBy,
    ),
  );
}

async function readWorkstream(projectId: string, workstreamId: string) {
  const plan = await getPlan(projectId);
  const workstream = plan.workstreams.find(({ id }) => id === workstreamId);
  if (!workstream)
    throw new AppError("NOT_FOUND", "Growth Workstream not found");
  return workstream;
}

async function readAction(projectId: string, actionId: string) {
  const [action, targets, evidence, seriesRows, pointRows] = await Promise.all([
    repo.getAction(projectId, actionId),
    repo.listActionTargets(projectId, actionId),
    repo.listActionEvidence(projectId, actionId),
    repo.listEvidenceSeries(projectId, actionId),
    repo.listEvidencePoints(projectId, actionId),
  ]);
  if (!action) throw new AppError("NOT_FOUND", "Growth Action not found");
  return actionDto(
    action,
    targets,
    evidence,
    collectSeries(seriesRows, pointRows),
  );
}

type WorkstreamFact = Pick<
  WorkstreamRow,
  | "title"
  | "commercialReason"
  | "targetLabel"
  | "targetBaseline"
  | "targetValue"
  | "targetDueOn"
>;

function replayedWorkstream(row: WorkstreamRow, fact: WorkstreamFact) {
  if (
    row.title !== fact.title ||
    row.commercialReason !== fact.commercialReason ||
    row.targetLabel !== fact.targetLabel ||
    row.targetBaseline !== fact.targetBaseline ||
    row.targetValue !== fact.targetValue ||
    row.targetDueOn !== fact.targetDueOn
  )
    throw new AppError(
      "CONFLICT",
      "Growth Workstream request key is occupied by a different fact",
    );
  return workstreamDto(row, []);
}

async function createWorkstream(
  input: CreateGrowthWorkstreamInput & Actor,
): Promise<GrowthWorkstreamDto> {
  const creationKey = input.requestKey ?? null;
  const fields = {
    title: input.title,
    commercialReason: input.commercialReason,
    targetLabel: input.targetLabel ?? null,
    targetBaseline: input.targetBaseline ?? null,
    targetValue: input.targetValue ?? null,
    targetDueOn: input.targetDueOn ?? null,
  };
  if (creationKey) {
    const existing = await repo.getWorkstreamByCreationKey(
      input.projectId,
      creationKey,
    );
    // The same key replays; the same key carrying a different fact conflicts.
    if (existing) return replayedWorkstream(existing, fields);
  }

  const id = crypto.randomUUID();
  await withPositionRetry(() =>
    repo.insertWorkstream({
      id,
      projectId: input.projectId,
      creationKey,
      ...fields,
      actorType: input.actorType,
      actorId: input.actorId,
    }),
  );

  const saved = creationKey
    ? await repo.getWorkstreamByCreationKey(input.projectId, creationKey)
    : await repo.getWorkstream(input.projectId, id);
  if (!saved)
    throw new AppError("CONFLICT", "Growth Workstream was not created");
  return replayedWorkstream(saved, fields);
}

async function updateWorkstream(
  input: UpdateGrowthWorkstreamInput & Actor,
): Promise<GrowthWorkstreamDto> {
  const existing = await repo.getWorkstream(
    input.projectId,
    input.workstreamId,
  );
  if (!existing) throw new AppError("NOT_FOUND", "Growth Workstream not found");

  const { projectId, workstreamId, actorType, actorId, ...patch } = input;
  await repo.updateWorkstream({
    projectId,
    workstreamId,
    actorType,
    actorId,
    patch,
  });
  return readWorkstream(projectId, workstreamId);
}

async function reorderWorkstreams(
  input: ReorderGrowthWorkstreamsInput & Actor,
): Promise<GrowthPlanDto> {
  const existing = await repo.listWorkstreams(input.projectId);
  const ordered = new Set(input.orderedWorkstreamIds);
  if (
    ordered.size !== input.orderedWorkstreamIds.length ||
    ordered.size !== existing.length ||
    existing.some((row) => !ordered.has(row.id))
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Reorder must list every Growth Workstream in the project exactly once",
    );
  }

  await repo.reorderWorkstreams(input);
  return getPlan(input.projectId);
}

async function deleteWorkstream(input: {
  projectId: string;
  workstreamId: string;
}) {
  const existing = await repo.getWorkstream(
    input.projectId,
    input.workstreamId,
  );
  if (!existing) throw new AppError("NOT_FOUND", "Growth Workstream not found");
  const actionCount = await repo.countWorkstreamActions(
    input.projectId,
    input.workstreamId,
  );
  if (actionCount > 0)
    throw new AppError(
      "CONFLICT",
      "Move or remove this Workstream's Actions before deleting it",
    );

  await repo.deleteWorkstream(input.projectId, input.workstreamId);
  return { deleted: true } as const;
}

const MONTH_LABEL = /^\d{4}-\d{2}$/;

/** Rules Zod cannot express: they depend on the series kind. */
function normalizeSeries(series: GrowthEvidenceSeriesInput | null | undefined) {
  if (!series) return null;
  const points = series.points.map((point) => ({
    label: point.label,
    groupLabel: point.group ?? null,
    value: point.value,
  }));
  if (series.kind === "monthly") {
    const labels = points.map((point) => point.label);
    if (!labels.every((label) => MONTH_LABEL.test(label)))
      throw new AppError(
        "VALIDATION_ERROR",
        "A monthly series needs every point labelled YYYY-MM",
      );
    if (new Set(labels).size !== labels.length)
      throw new AppError(
        "VALIDATION_ERROR",
        "A monthly series cannot repeat a month",
      );
    // The chart reads the first and last point as the change over the window.
    if (labels.some((label, index) => index > 0 && label <= labels[index - 1]))
      throw new AppError(
        "VALIDATION_ERROR",
        "A monthly series must list its months in ascending order",
      );
  }
  if (series.kind === "matrix") {
    if (points.some((point) => point.groupLabel === null))
      throw new AppError(
        "VALIDATION_ERROR",
        "A matrix series needs a group on every point",
      );
    const cells = points.map(
      (point) => `${point.label}\u0000${point.groupLabel}`,
    );
    if (new Set(cells).size !== cells.length)
      throw new AppError(
        "VALIDATION_ERROR",
        "A matrix series cannot repeat a label and group pair",
      );
  }
  return { kind: series.kind, title: series.title, unit: series.unit, points };
}

const normalizeEvidence = (item: GrowthActionEvidenceInput) => ({
  kind: item.kind,
  statement: item.statement,
  sourceLabel: item.sourceLabel,
  sourceUrl: item.sourceUrl ?? null,
  observedOn: item.observedOn ?? null,
  series: normalizeSeries(item.series),
});

/**
 * Only the evidence row needs an id here; the writer derives the series and
 * point ids from it, so a replay rewrites the same keys and no-ops.
 */
const evidenceWrite = <T>(item: T) => ({ ...item, id: crypto.randomUUID() });

async function createPlanAction(
  input: CreateGrowthPlanActionInput & Actor,
): Promise<GrowthPlanActionDto> {
  const [workstream, projectDomain] = await Promise.all([
    repo.getWorkstream(input.projectId, input.workstreamId),
    repo.projectDomain(input.projectId),
  ]);
  if (!workstream)
    throw new AppError("NOT_FOUND", "Growth Workstream not found");
  const targetInputs = input.targets.map(({ targetType, targetValue }) => ({
    type: targetType,
    value: targetValue,
  }));
  // Only url and site targets are checked against the project domain, and a
  // project can legitimately have none set yet.
  const hosted = targetInputs.filter(
    (target) => target.type === "url" || target.type === "site",
  );
  if (hosted.length > 0 && !projectDomain)
    throw new AppError(
      "VALIDATION_ERROR",
      "Set the project's domain before adding URL or site targets to a plan Action",
    );
  // Canonicalise, dedupe and domain-check exactly as the Recommendation-born
  // path does, so the evidence charts can match these URLs to Search Console.
  const targets =
    hosted.length > 0 && projectDomain
      ? normalizeGrowthTargets(projectDomain, targetInputs)
      : normalizeGrowthWordTargets(
          targetInputs.filter(
            (
              target,
            ): target is { type: "keyword" | "cluster"; value: string } =>
              target.type === "keyword" || target.type === "cluster",
          ),
        );

  // Idempotency mirrors the Recommendation-born path: the same key with the
  // same fact replays, the same key with a different fact conflicts.
  const creationKey = input.requestKey ?? crypto.randomUUID();
  // The Action list surfaces description; a plan Action without one is best
  // described by the rationale the author already wrote.
  const description = input.description ?? input.rationale;
  const successMeasure = input.successMeasure ?? null;
  const dueAt = toDueAt(input.dueOn);
  const evidence = input.evidence.map(normalizeEvidence);
  const factHash = await sha256Hex(
    JSON.stringify({
      projectId: input.projectId,
      workstreamId: input.workstreamId,
      recommendationId: null,
      creationKey,
      title: input.title,
      description,
      category: input.category,
      priorityScore: input.priorityScore,
      rationale: input.rationale,
      successMeasure,
      dueAt,
      targets,
      evidence,
      // The actor is deliberately absent: the same requestKey replayed from the
      // app and from MCP is the same Action fact. The creation event keeps its
      // own actor-bearing fact hash.
    }),
  );

  const existing = await repo.getActionByCreationKey(
    input.projectId,
    creationKey,
  );
  if (existing) {
    if (existing.factHash !== factHash)
      throw new AppError(
        "CONFLICT",
        "Growth Action creation key is occupied by a different immutable fact",
      );
    return readAction(input.projectId, existing.id);
  }

  const id = crypto.randomUUID();
  const eventFactHash = await growthActionEventFactHash({
    projectId: input.projectId,
    actionId: id,
    actionVersion: 0,
    eventType: "created",
    fromStatus: null,
    toStatus: "approved",
    actorType: input.actorType,
    actorId: input.actorId,
    note: null,
  });
  await withPositionRetry(() =>
    repo.createPlanActionGraph({
      id,
      projectId: input.projectId,
      workstreamId: input.workstreamId,
      creationKey,
      factHash,
      title: input.title,
      description,
      category: input.category,
      priorityScore: input.priorityScore,
      rationale: input.rationale,
      successMeasure,
      dueAt,
      targets,
      evidence: evidence.map(evidenceWrite),
      eventId: crypto.randomUUID(),
      eventFactHash,
      actorType: input.actorType,
      actorId: input.actorId,
    }),
  );

  const saved = await repo.getActionByCreationKey(input.projectId, creationKey);
  if (!saved) throw new AppError("CONFLICT", "Growth Action was not created");
  if (saved.factHash !== factHash)
    throw new AppError(
      "CONFLICT",
      "Growth Action creation key is occupied by a different immutable fact",
    );
  return readAction(input.projectId, saved.id);
}

async function requirePlanAction(projectId: string, actionId: string) {
  const action = await repo.getAction(projectId, actionId);
  if (!action) throw new AppError("NOT_FOUND", "Growth Action not found");
  if (action.recommendationId !== null)
    throw new AppError(
      "CONFLICT",
      "Only a plan Action can be edited; this one belongs to a Recommendation",
    );
  return action;
}

async function updatePlanAction(
  input: UpdateGrowthPlanActionInput & Actor,
): Promise<GrowthPlanActionDto> {
  const action = await requirePlanAction(input.projectId, input.actionId);

  const moveToWorkstreamId =
    input.workstreamId && input.workstreamId !== action.workstreamId
      ? input.workstreamId
      : undefined;
  if (moveToWorkstreamId) {
    const workstream = await repo.getWorkstream(
      input.projectId,
      moveToWorkstreamId,
    );
    if (!workstream)
      throw new AppError("NOT_FOUND", "Growth Workstream not found");
  }

  await withPositionRetry(() =>
    repo.updatePlanAction({
      projectId: input.projectId,
      actionId: input.actionId,
      patch: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined
          ? {}
          : {
              description:
                input.description ?? action.rationale ?? action.title,
            }),
        ...(input.rationale === undefined
          ? {}
          : { rationale: input.rationale }),
        ...(input.successMeasure === undefined
          ? {}
          : { successMeasure: input.successMeasure }),
        ...(input.dueOn === undefined ? {} : { dueAt: toDueAt(input.dueOn) }),
      },
      moveToWorkstreamId,
    }),
  );
  return readAction(input.projectId, input.actionId);
}

/**
 * Plan Actions have no Recommendation, so the Work page's transition path (which
 * joins one) cannot move them. The lifecycle rules are unchanged: this only
 * projects the result back as a plan Action.
 */
async function transitionPlanAction(
  input: TransitionGrowthActionInput,
): Promise<GrowthPlanActionDto> {
  await requirePlanAction(input.projectId, input.actionId);
  await GrowthActionsService.transitionAction(input);
  return readAction(input.projectId, input.actionId);
}

/** The saved shape of one evidence item, for comparing a replay to its fact. */
const evidenceFact = (
  item: Pick<
    GrowthActionEvidenceDto,
    "kind" | "statement" | "sourceLabel" | "sourceUrl" | "observedOn"
  > & {
    series: {
      kind: string;
      title: string;
      unit: string;
      points: { label: string; group: string | null; value: number | null }[];
    } | null;
  },
) =>
  JSON.stringify({
    kind: item.kind,
    statement: item.statement,
    sourceLabel: item.sourceLabel,
    sourceUrl: item.sourceUrl,
    observedOn: item.observedOn,
    series: item.series
      ? {
          kind: item.series.kind,
          title: item.series.title,
          unit: item.series.unit,
          points: item.series.points.map(({ label, group, value }) => ({
            label,
            group,
            value,
          })),
        }
      : null,
  });

async function addActionEvidence(
  input: AddGrowthActionEvidenceInput & Actor,
): Promise<GrowthPlanActionDto> {
  await requirePlanAction(input.projectId, input.actionId);
  const evidence = normalizeEvidence(input.evidence);
  // The request key doubles as the row id, so a retry lands on the same row —
  // and the writer derives the series and point ids from it.
  const evidenceId = input.requestKey ?? crypto.randomUUID();
  await withPositionRetry(() =>
    repo.insertEvidence({
      ...evidence,
      id: evidenceId,
      projectId: input.projectId,
      actionId: input.actionId,
    }),
  );

  const action = await readAction(input.projectId, input.actionId);
  // The insert no-ops on a repeated id, so the stored row is the authority: the
  // same key carrying a different fact must conflict, as it does for
  // Workstreams and plan Actions.
  const saved = action.evidence.find((item) => item.id === evidenceId);
  if (!saved)
    throw new AppError("CONFLICT", "Growth Action evidence was not created");
  const fact = evidenceFact({
    ...evidence,
    series: evidence.series
      ? {
          ...evidence.series,
          points: evidence.series.points.map(
            ({ label, groupLabel, value }) => ({
              label,
              group: groupLabel,
              value,
            }),
          ),
        }
      : null,
  });
  if (evidenceFact(saved) !== fact)
    throw new AppError(
      "CONFLICT",
      "Request key is occupied by a different evidence fact",
    );
  return action;
}

async function removeActionEvidence(
  input: RemoveGrowthActionEvidenceInput,
): Promise<GrowthPlanActionDto> {
  await requirePlanAction(input.projectId, input.actionId);
  await repo.deleteEvidence(input.projectId, input.actionId, input.evidenceId);
  return readAction(input.projectId, input.actionId);
}

export const GrowthPlanService = {
  getPlan,
  updateNarrative,
  createWorkstream,
  updateWorkstream,
  reorderWorkstreams,
  deleteWorkstream,
  createPlanAction,
  updatePlanAction,
  transitionPlanAction,
  addActionEvidence,
  removeActionEvidence,
} as const;
