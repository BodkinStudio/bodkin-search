# Required behaviour

- ADR-026 records Measurement ownership, one-to-one identity, Action coupling, resolved windows, Metric/Observation vocabularies, Result evidence/confounders, retry policy and deletion direction.
- Starting Measurement requires one existing same-project Action at the exact `implemented` version. It atomically creates one active Plan with one or more normalized Metrics, at least one primary, appends the matching Action event and leaves no half-state on failure/race.
- A second exact start returns the original complete graph after the Action advances; changed dates, metrics, actor/note or version conflict without attaching losing Metrics. A different Action may have an independent Plan.
- The stored anchor is the Action's existing `implementedAt`; no caller timestamp or Change Event is treated as causal. Report timezone is frozen from current Growth settings.
- Date windows are inclusive, valid calendar dates and obey baseline-before-anchor, anchor-in-cooldown, measurement-after-cooldown and optional-long-after-primary ordering. Comparison mode is closed and due date is derived.
- Metric coordinates use the closed type/entity registries, current Growth target canonicalization, deterministic sort/dedupe and bounded cardinality. URL/site values belong to the current project domain. Duplicate normalized coordinates and a graph with no primary Metric fail.
- One immutable Observation may be recorded for each Plan/Metric/period. Its effective dates exactly match the corresponding Plan window, captured time is canonical, evidence uses the existing registry, completeness is finite `0..1`, and the scalar obeys its Metric type. Missing/foreign/closed coordinates insert nothing.
- Exact Observation retries remain valid after Plan completion; semantic drift conflicts. New Observations after completion fail, including when racing finalization.
- Finalizing Measurement requires the active Plan and Action at the exact `measuring` version. It atomically freezes one immutable Result plus zero-or-more same-project confounder Change Events, completes the Plan and appends the Action `measuring → evaluated` event/projection.
- Non-`not_measurable` Results require baseline and measurement Observations for every primary Metric and long-term Observations when configured. `not_measurable` may finalize incomplete evidence. New late Observations are rejected afterward.
- Exact Result retry returns the original complete graph after evaluation; changed outcome, confidence, summary, model/prompt, actor/note, Observation set or confounders conflict without attaching losing links.
- Result comparisons expose baseline/current/absolute delta and nullable percentage delta derived from the immutable Observation set. Secondary site/cluster Metrics carry contextual movement; no numeric fact is duplicated in the Result.
- Every read/write is project-scoped. Composite constraints reject cross-project/cross-Plan Action, Metric, Observation, Result and Change Event attachment.
- Action/Recommendation/run deletion cascades the complete Measurement aggregate while preserving independent Change Events. Event deletion removes only confounder links. Project deletion cascades both graphs; unrelated projects survive.

# Required checks

- Zod tests cover Plan/Result/Observation bounds, lifecycle actor metadata, dates, vocabularies, finite values, model/prompt pairing, canonical Metric dedupe and maximum cardinality.
- Action tests prove generic transition contracts/services cannot newly enter `measuring` or `evaluated`, while Measurement-managed Action events remain legal, versioned and exactly replayable.
- Service tests cover timezone/anchor freezing, Plan/Metric hashing, eligible/ineligible Actions, exact/drift retries, project isolation, Observation period/scalar validation, required coverage, derived deltas, `not_measurable`, confounders and no half-state.
- A migration-backed real-libSQL test starts after migration 0047 with populated implemented Actions/Change Events, applies the new migration, inspects composite keys/indexes, exercises raw checks/cross-project failures/deletion directions and ends with clean `PRAGMA foreign_key_check`.
- A real-libSQL repository test exercises production provider-aware atomic start/observe/finalize behavior, graph reads, rollback, winner isolation and Action event/projection coupling.
- Provider-gated Postgres evidence applies the complete migration tree to a fresh disposable database and exercises concurrent Plan/Result drift, Plan locking against late Observations, same-project confounders and cascades.
- `src/db/schema-parity.test.ts`, all focused Growth regressions, full root tests, `ci:check`, production build and `git diff --check` pass.
- Fresh adversarial review returns pass or every accepted finding is repaired and reverified within two rounds.

# Regression constraints

- Existing Growth settings, pages, Runs, Signals, Insights, Recommendations, Actions/events and Change Events remain green.
- Existing legal pre-measurement Action transitions and historical event retries retain their behavior. Only new direct entry to measurement-managed states is reserved for BG-0109.
- No external boundary trusts caller-supplied project/actor identity in this slice; future UI/MCP surfaces derive both from authorization context.
- Existing auth, MCP, provider services, rank/audit models, schedulers and upstream snapshots remain unchanged.
- No dependency, paid call, production migration, deployment or remote application state is introduced.

# Important edge cases

- The same Action cannot acquire a second Plan; a losing concurrent start cannot attach Metrics or its Action event metadata.
- Equivalent URL/site/word targets and reordered duplicate Metrics produce one exact Plan fact; conflicting primary flags fail.
- An exact Observation retry after completion succeeds, but a new period or changed value/evidence does not.
- Finalization racing an Observation serializes on the Plan: a committed Observation is frozen into the Result, or a late Observation inserts nothing after completion.
- A zero baseline produces a null percentage delta rather than Infinity/NaN. Negative search/backlink/audit counts, out-of-range ratios and non-positive positions fail.
- A Result may cite a Change Event unrelated to the Action; the link records a confounder, not causation. Deleting that Event never deletes the Result.
- `not_measurable` completes both Plan and Action even when primary Observation coverage is incomplete.

# Product / UX requirements

None. Measurement UI, provider collection, scheduling, MCP and report presentation are explicitly deferred.

# Specialist review requirements

None. Fresh full-scope engineering review is required.
