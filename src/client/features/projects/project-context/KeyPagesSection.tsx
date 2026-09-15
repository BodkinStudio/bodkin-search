import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import {
  KEY_PAGE_ROLES,
  type KeyPageRole,
  type ProjectContextUpdate,
} from "@/types/schemas/projectContext";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormActions,
  listClass,
  Provenance,
  RowActions,
  SectionHeader,
  useContextUpdate,
  type ContextKeyPage,
} from "./shared";

const ROLE_LABELS: Record<KeyPageRole, string> = {
  hub: "Hub page",
  spoke: "Supporting page",
  money: "Money page",
  other: "Other",
};

export function KeyPagesSection({
  projectId,
  keyPages,
}: {
  projectId: string;
  keyPages: ContextKeyPage[];
}) {
  const update = useContextUpdate(projectId);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const save = (previousUrl: string | null, draft: KeyPageDraft) => {
    const ops: ProjectContextUpdate[] = [];
    // Key pages upsert by URL, so a retyped URL has to drop the old row before
    // the new one lands.
    if (previousUrl && previousUrl !== draft.url.trim()) {
      ops.push({ removeKeyPages: [previousUrl] });
    }
    // Send the fields even when blank: an omitted field means "keep what's
    // stored" (so agent writes merge), so clearing one from the form has to
    // send the empty string.
    ops.push({
      addKeyPages: [
        {
          url: draft.url.trim(),
          role: draft.role,
          topic: draft.topic.trim(),
          notes: draft.notes.trim(),
          // Carry Growth metadata through both ordinary edits and the
          // remove+add sequence used for URL renames.
          commercialWeight: draft.commercialWeight,
          protected: draft.protected,
          activelyOptimized: draft.activelyOptimized,
        },
      ],
    });
    update.mutate(ops, {
      onSuccess: () => {
        setAdding(false);
        setEditingId(null);
      },
    });
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Key pages"
        hint="A shortlist of the pages that carry the site — not an inventory."
        action={
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-3.5" />
            Add page
          </button>
        }
      />

      {adding ? (
        <div className={listClass}>
          <KeyPageForm
            pending={update.isPending}
            onCancel={() => setAdding(false)}
            onSave={(draft) => save(null, draft)}
          />
        </div>
      ) : null}

      {keyPages.length === 0 ? (
        adding ? null : (
          <EmptyState>
            No key pages yet. Add the handful that has to rank, or let an agent
            propose them from your last site audit.
          </EmptyState>
        )
      ) : (
        <ul className={listClass}>
          {keyPages.map((page) =>
            editingId === page.id ? (
              <li key={page.id}>
                <KeyPageForm
                  initial={page}
                  pending={update.isPending}
                  onCancel={() => setEditingId(null)}
                  onSave={(draft) => save(page.url, draft)}
                />
              </li>
            ) : (
              <li
                key={page.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate text-sm font-medium">
                      {page.url}
                    </span>
                    <span className="badge badge-ghost badge-sm shrink-0">
                      {ROLE_LABELS[page.role]}
                    </span>
                  </div>
                  {page.topic ? (
                    <p className="text-sm text-base-content/70">
                      Target: {page.topic}
                    </p>
                  ) : null}
                  {page.notes ? (
                    <p className="text-sm text-base-content/70">{page.notes}</p>
                  ) : null}
                  <KeyPageGrowthBadges
                    commercialWeight={page.commercialWeight}
                    protectedPage={page.protected}
                    activelyOptimized={page.activelyOptimized}
                  />
                  <Provenance by={page.updatedBy} at={page.updatedAt} />
                </div>
                <RowActions>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label={`Edit ${page.url}`}
                    onClick={() => setEditingId(page.id)}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <ConfirmDeleteButton
                    label={`Remove ${page.url}`}
                    pending={update.isPending}
                    onConfirm={() =>
                      update.mutate([{ removeKeyPages: [page.url] }])
                    }
                  />
                </RowActions>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

type KeyPageDraft = {
  url: string;
  role: KeyPageRole;
  topic: string;
  notes: string;
  commercialWeight: number | null;
  protected: boolean;
  activelyOptimized: boolean;
};

function KeyPageForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: ContextKeyPage;
  pending: boolean;
  onCancel: () => void;
  onSave: (draft: KeyPageDraft) => void;
}) {
  const [draft, setDraft] = React.useState<KeyPageDraft>({
    url: initial?.url ?? "",
    role: initial?.role ?? "other",
    topic: initial?.topic ?? "",
    notes: initial?.notes ?? "",
    commercialWeight: initial?.commercialWeight ?? null,
    protected: initial?.protected ?? false,
    activelyOptimized: initial?.activelyOptimized ?? false,
  });

  return (
    <form
      className="space-y-2 bg-base-200/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.url.trim() || pending) return;
        onSave(draft);
      }}
    >
      <input
        autoFocus
        type="text"
        value={draft.url}
        onChange={(event) => setDraft({ ...draft, url: event.target.value })}
        placeholder="example.com/pricing"
        maxLength={2048}
        className="input input-bordered input-sm w-full"
        aria-label="Page URL"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={draft.role}
          onChange={(event) =>
            setDraft({
              ...draft,
              role:
                KEY_PAGE_ROLES.find((role) => role === event.target.value) ??
                draft.role,
            })
          }
          className="select select-bordered select-sm w-full"
          aria-label="Page role"
        >
          {KEY_PAGE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={draft.topic}
          onChange={(event) =>
            setDraft({ ...draft, topic: event.target.value })
          }
          placeholder="Target topic (optional)"
          maxLength={200}
          className="input input-bordered input-sm w-full"
          aria-label="Target topic"
        />
      </div>
      <input
        type="text"
        value={draft.notes}
        onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        placeholder="Notes (optional)"
        maxLength={500}
        className="input input-bordered input-sm w-full"
        aria-label="Page notes"
      />
      <KeyPageGrowthFields draft={draft} onChange={setDraft} />
      <FormActions
        pending={pending}
        disabled={!draft.url.trim()}
        onCancel={onCancel}
      />
    </form>
  );
}

export function parseCommercialWeight(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

export function KeyPageGrowthFields({
  draft,
  onChange,
}: {
  draft: KeyPageDraft;
  onChange: (draft: KeyPageDraft) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-base-300 p-3">
      <legend className="px-1 text-sm font-medium">Growth signals</legend>
      <p className="mb-3 text-pretty text-xs text-base-content/60">
        These fields help Growth order opportunities and explain possible
        confounders. They do not claim that a page will perform better.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Commercial priority</span>
          <select
            value={draft.commercialWeight ?? ""}
            onChange={(event) =>
              onChange({
                ...draft,
                commercialWeight: parseCommercialWeight(event.target.value),
              })
            }
            className="select select-bordered select-sm w-full tabular-nums"
          >
            <option value="">Not set</option>
            <option value="1">1 — Low</option>
            <option value="2">2</option>
            <option value="3">3 — Medium</option>
            <option value="4">4</option>
            <option value="5">5 — Highest</option>
          </select>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-base-300 p-2.5 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm mt-0.5"
            checked={draft.protected}
            onChange={(event) =>
              onChange({ ...draft, protected: event.target.checked })
            }
          />
          <span>
            <span className="block font-medium">Protected page</span>
            <span className="text-xs text-base-content/60">
              Changes need extra care.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-base-300 p-2.5 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm mt-0.5"
            checked={draft.activelyOptimized}
            onChange={(event) =>
              onChange({ ...draft, activelyOptimized: event.target.checked })
            }
          />
          <span>
            <span className="block font-medium">Active optimisation</span>
            <span className="text-xs text-base-content/60">
              Recent work may affect the trend.
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

export function KeyPageGrowthBadges({
  commercialWeight,
  protectedPage,
  activelyOptimized,
}: {
  commercialWeight: number | null;
  protectedPage: boolean;
  activelyOptimized: boolean;
}) {
  if (commercialWeight == null && !protectedPage && !activelyOptimized)
    return null;

  return (
    <div className="flex flex-wrap gap-1.5 py-1 text-xs">
      {commercialWeight != null ? (
        <span className="badge badge-ghost badge-sm tabular-nums">
          Commercial priority {commercialWeight}/5
        </span>
      ) : null}
      {protectedPage ? (
        <span className="badge badge-ghost badge-sm">Protected</span>
      ) : null}
      {activelyOptimized ? (
        <span className="badge badge-ghost badge-sm">Active optimisation</span>
      ) : null}
    </div>
  );
}
