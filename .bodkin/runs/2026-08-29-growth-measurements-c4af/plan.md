# Goal

Implement BG-0109 as the next mergeable Bodkin Growth primitive: start one project-scoped Measurement Plan for an implemented Action, append immutable scalar Observations, and finalize one evidence-backed Result while preserving the Action lifecycle atomically.

# Scope

- Record lifecycle, identity, date, Metric, Observation, Result and confounder decisions in ADR-026.
- Add Plan, Metric, Observation, Result and Result–Change tables to the existing D1/SQLite and Postgres Growth schema/migration paths.
- Add Zod contracts, project-scoped repositories and trusted internal services for starting, observing, reading and finalizing Measurement.
- Reuse current Action events/state versions, project Growth timezone, target normalization, evidence registry, immutable hashing, provider-aware transactions and Change Events.

# Director decisions

- Each Action has zero or one Plan; each Plan has zero or one terminal Result. Natural one-to-one coordinates are the idempotency keys, so BG-0109 adds no speculative Plan/Result creation key or revision model.
- Starting a new Plan requires the same-project Action at the caller's exact `implemented` version with a non-null server-stamped `implementedAt`. Plan creation, Metric children and the `implemented → measuring` Action event/projection are one atomic write. Generic Action transitions no longer initiate or complete measurement.
- The Plan stores the Action transition version, implementation anchor timestamp and current Growth report timezone. A delayed exact retry validates the stored Plan graph and Action event without requiring the Action to remain `implemented` or the settings timezone to remain unchanged.
- Finalizing a new Result requires the active Plan and Action at the exact `measuring` version. Result/confounder creation, Plan `active → completed` and Action `measuring → evaluated` are one atomic write with one timestamp. `not_measurable` still completes/evaluates the lifecycle.
- Change Events are not causal anchors. A Result accepts zero or more same-project Change Events as frozen confounders. They are part of the Result hash; there is no later append/unlink API.
- Plan windows are explicit inclusive `YYYY-MM-DD` dates. Baseline ends before the implementation date; cooldown ends on/after it; measurement starts after cooldown and ends on/after it; optional long-term end follows measurement. Comparison mode is `preceding_period | year_over_year | custom`. Due date is derived from long-term end when present, otherwise measurement end.
- Metric types are `search_clicks | search_impressions | search_ctr | search_average_position | organic_sessions | organic_active_users | organic_engagement_rate | organic_key_events | backlink_count | referring_domain_count | audit_issue_page_count`. Metric entities reuse `site | url | keyword | cluster`, are normalized with existing Growth rules, and at least one Metric is primary.
- Observations have one natural coordinate per Plan/Metric/period, with period `baseline | measurement | long_term`. They freeze exact effective dates, finite scalar value, completeness `0..1`, existing Growth evidence kind/reference and canonical captured time. Counts are non-negative, ratios are `0..1`, and average position is positive.
- New Observations require an active Plan. Exact Observation retries remain valid after completion. Finalization freezes a digest of all Observation IDs/hashes, then rejects any new Observation. A non-`not_measurable` Result requires baseline+measurement for every primary Metric and long-term when configured.
- Results use the PRD outcome vocabulary, finite confidence `0..1`, bounded summary and paired optional model/prompt version. Numeric comparisons/deltas are derived from frozen Observations instead of copied into Result columns.
- Every relation is project-leading and downward-cascading. Action/run/recommendation deletion removes the Measurement graph but preserves independent Change Events. Event deletion prunes only Result confounder joins. No ordinary Measurement delete/update API exists.

# Relevant areas/files

- Action lifecycle/event writer: `src/types/schemas/growth-actions.ts`, `src/db/growth-actions.schema.ts`, `src/server/features/growth/repositories/GrowthActionsWriter.ts`, `GrowthActionsService.ts`.
- Change Event confounders: `src/db/growth-change-events.schema.ts`, `GrowthChangeEventsRepository.ts`.
- Settings/timezone and target normalization: `GrowthSettingsService.ts`, `GrowthTargetNormalizer.ts`.
- Evidence/scalar precedents: `src/types/schemas/growth.ts`, `src/db/growth.schema.ts`, `src/db/pg/growth.schema.ts`.
- Provider transaction/parity paths: `src/db/runBatch.ts`, `src/db/provider.ts`, `src/db/schema-parity.test.ts`.
- Planned truth: PRD sections 12–13, architecture sections 6.15–6.18, implementation item BG-0109 and `UPSTREAM_MAP.md` Phase 1 step 5.

# Implementation approach

- Add mirrored `growth-measurements.schema.ts` modules with project-leading composite uniqueness/FKs, explicit lifecycle/vocabulary/date/text/scalar checks, a due-selection index and observation/confounder lookup indexes.
- Extract a reusable Action-event fact helper and Action transition statement builder so direct Action transitions and Measurement orchestration cannot drift while still sharing one `runBatch` transaction.
- Create the Plan and sorted/deduplicated Metric graph through winner-hash-gated insert-selects. Use Action/version/event predicates to prevent a losing start request from creating or contaminating a Plan.
- Append one Observation coordinate at a time through an active-Plan insert-select. On Postgres, share-lock the Plan so Result finalization's update lock serializes the last Observation correctly; D1 batches serialize atomically.
- Finalize under a Plan update lock, insert the Result and confounder graph through winner-hash-gated selects, update the Plan and Action, and append the evaluation event in the same transaction.
- Reread and compare complete Plan/Metric/Observation/Result/confounder graphs after every write. Derive comparison values only from the verified graph.

# Constraints

- Reuse existing project tenancy, database/provider abstraction, typed errors, hashes, settings, Action lifecycle and Growth feature boundary.
- Keep every read/write explicitly project-scoped and every relationship normalized.
- Add no dependency, paid/provider call, production migration, network request, server function, UI, MCP tool, scheduler or separate service/database/auth layer.

# Explicit non-goals

- Automatic defaults/window calculation; proposal/edit/cancel/revision; multiple Results; early primary plus later long-term Result; backdating/correction; missing/censored observations; rank/AI/provider dimension models; provider collection; automatic scoring; Action/Change causal claims; reports/public surfaces.

# Risks

- Separately transitioning an Action and writing Measurement state creates half-states; start/finalize must share one atomic batch.
- Concurrent Plan drift can graft losing Metrics; every child insert must select only the stored Plan with the complete fact hash and matching Action event.
- A late Observation can race Result finalization; both writers must lock/condition on the same active Plan row and exact retries must be checked before the active gate.
- Confounder drift can contaminate a winning Result; joins must select only the stored Result with its complete fact hash.
- Unbounded evidence lists can exceed D1 parameters; Metric/confounder cardinalities remain capped and writes use one bounded statement per coordinate.
- Direct Action transitions can bypass Measurement invariants; the trusted Action service/contract must reserve measurement-managed transitions.

# Verification plan

- Contract/service tests for vocabularies, target/date normalization, metric-specific scalar rules, lifecycle eligibility, exact/drift retry, observation closure, required primary coverage, comparisons, confounders and project isolation.
- A real-libSQL migration test beginning after migration 0047 with populated implemented Actions/Change Events; inspect composite keys/indexes, exercise raw checks/cross-project failures/cascades and finish with clean `PRAGMA foreign_key_check`.
- A real-libSQL repository test through production Drizzle/runBatch for atomic start/finalize, complete graphs, retries/drift, rollback, late Observations and Action events.
- Generate/inspect both migrations, apply the full Postgres tree to a fresh disposable database and run provider-gated concurrency/locking/cascade tests.
- Run schema parity, all focused Growth regressions, root tests, `ci:check`, production build and `git diff --check`.
- Obtain a fresh full-scope adversarial acceptance review, repair accepted findings within the two-round cap and reconcile final evidence before commit.
