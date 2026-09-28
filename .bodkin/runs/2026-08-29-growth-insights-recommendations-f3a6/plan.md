# Goal

Implement the next mergeable Bodkin Growth core slice: immutable project/run-scoped Insights composed from Signals, plus normalized proposed Recommendations and their human-review lifecycle, using the existing Growth run boundary and both database providers.

# Scope

- Record the Insight/Recommendation graph, lifecycle, normalization and retry decisions in ADR-023.
- Add normalized Insight, Insight↔Signal, Recommendation, Recommendation↔Insight, target and ordered-step tables to the existing D1/SQLite and Postgres Growth schemas and migration paths.
- Add Zod contracts, project-scoped repositories and trusted internal services for immutable graph creation/read and compare-and-set Recommendation review.
- Reuse the current provider-safe running-run serialization boundary; add migration-backed SQLite, service/query and live-Postgres evidence.

# Director decisions

- Insights are immutable facts in this slice and have no speculative status lifecycle.
- Insight source Signals and Recommendation source Insights must belong to the same project and origin run; cross-run evidence composition is deferred.
- A caller-stable key identifies a retry slot. Each parent stores a SHA-256 fact hash covering all immutable content and normalized child coordinates. Exact retries return the original graph; drift cannot add or replace child rows.
- Recommendations begin `proposed`. Supported review states are `accepted`, `dismissed`, `snoozed`, `merged` and `superseded`; only `snoozed` can return to `proposed` in this slice.
- Dismissal reasons use the PRD vocabulary. A new snooze requires a future ISO timestamp, while an exact persisted replay remains valid after that timestamp passes. Merge/supersede requires a non-self Recommendation destination in the same project and originating run so run deletion remains independently cascade-safe.
- Recommendation targets (`url | keyword | cluster | site`) and proposed steps are normalized relations, not JSON or newline-delimited prose. URL/site targets must remain within the existing project domain; keyword/cluster targets use collapsed lowercase whitespace.
- Component scores are persisted and validated; the caller supplies a finite non-negative priority score because the planning pack does not approve one canonical formula.

# Relevant areas/files

- Current Growth boundary: `src/db/growth.schema.ts`, `src/db/pg/growth.schema.ts`, `src/types/schemas/growth.ts`, `src/server/features/growth/`.
- Provider-safe run lock and deterministic IDs: `GrowthRunsRepository.ts`, `src/db/runBatch.ts`, `src/server/lib/audit/ids.ts`.
- Domain/target precedents: `src/shared/researchScope.ts`, `src/server/features/project-context/services/contextUpdateOps.ts`.
- Planned contracts: `docs/growth/02_PRODUCT_REQUIREMENTS.md`, `03_TECHNICAL_ARCHITECTURE.md`, `04_IMPLEMENTATION_PLAN.md`, `UPSTREAM_MAP.md`.

# Implementation approach

- Add project-leading composite unique keys and foreign keys so the database rejects cross-project and cross-run graph attachment.
- Add a unique `(project_id, run_id, id)` Signal index without rebuilding the populated Signal table; use it for Insight source integrity.
- Create each parent plus normalized children atomically through `runBatch`. Gate child insertion on the stored immutable fact hash so concurrent same-key drift cannot mutate a winning graph.
- Conditional parent inserts select a running run and use Postgres `FOR SHARE`; D1 retains its supported atomic batch/statement behavior.
- Recommendation review updates filter by project, ID, expected status and expected version; exact replay returns the existing decision, while stale or different decisions conflict.

# Constraints

- Reuse current project tenancy, authorization assumptions, database provider abstraction, typed errors and Growth feature boundary.
- Keep every read/write explicitly project-scoped and every relation normalized.
- Add no dependency, paid/provider call, production migration, scheduler, AI generation, server function, UI, MCP tool or new service/database/auth layer.
- Keep Signals and their evidence immutable and retain the current terminal-run serialization behavior.

# Explicit non-goals

- Actions and Action events (the following bounded commit), Measurement, reports, schedules/workflows, semantic dedupe, dismissal cooldowns, cross-run composition, AI interpretation and external surfaces.
- Standalone Recommendations, arbitrary graph editing, generic evidence tables, raw provider payloads or unapproved category enums.

# Risks

- Independent FKs could permit cross-run evidence attachment; control with project/run-leading composite keys and migration-backed rejection tests.
- Concurrent retry drift could partially add child links; store a complete fact hash and gate every child insert on it inside one atomic provider-aware batch.
- A run could become terminal during graph creation; acquire the same Postgres parent-row share lock used for Signals and retain D1 atomic writes.
- Recommendation transition races could overwrite review history; compare expected version/status and make exact retry semantics explicit.
- Target normalization could accept an off-project URL or ambiguous site; reuse current research-scope helpers and project domain data.

# Verification plan

- Focused schema/service/repository tests for validation, normalization, immutable retry/drift, project/run isolation and Recommendation state transitions.
- Real libSQL migration test applying the new migration after 0044 with existing Signal data, constraint rejection, cascades and `PRAGMA foreign_key_check`.
- Generate/inspect both migrations and apply the Postgres tree to the dedicated disposable test database.
- Provider-gated live Postgres repository test for running-run locking and atomic normalized graph creation.
- Run root tests, `ci:check`, production build and `git diff --check`.
- Obtain fresh full-scope adversarial review, repair accepted findings within the two-round cap, and perform final evidence reconciliation.
