# Goal

Implement BG-0107 as the next mergeable Bodkin Growth core slice: create project-scoped Actions from accepted Recommendations, preserve normalized targets, and record every state change in an immutable atomic event ledger.

# Scope

- Record the Action aggregate, lifecycle, provenance, retry, deletion and event-history decisions in ADR-024.
- Add Action, Action-target and Action-event tables to the existing D1/SQLite and Postgres Growth schemas and migration paths.
- Add Zod contracts, project-scoped repositories and trusted internal services for Action creation/read and versioned state transitions.
- Reuse the current Recommendation target normalization, immutable-fact pattern, provider-aware batch boundary and dual-provider test infrastructure.

# Director decisions

- An Action is created only from an `accepted` Recommendation in the same project. One Recommendation may create multiple Actions, distinguished by caller-stable project-scoped creation keys.
- Title, description, due date, source Recommendation, inherited category/priority and canonical target subset are immutable creation facts. Category and priority snapshot the accepted Recommendation. Owner assignment is nullable in the schema and intentionally deferred until the existing membership model can authorize it.
- Action targets are a non-empty normalized subset of the source Recommendation targets. URL/site and keyword/cluster normalization reuse ADR-023; target lists are never JSON.
- Actions begin `approved`. The legal state graph is `approved → ready → in_progress → implemented → measuring → evaluated`, with `in_progress → blocked`, `blocked → in_progress | implemented`, and `approved | ready | in_progress | blocked → cancelled`. `evaluated` and `cancelled` are terminal. Recommendation dismissal remains pre-Action; accepted work is cancelled rather than given a second `dismissed` state.
- Each Action stores the current projection and monotonically increasing integer `state_version`. Milestone timestamps record first entry into started, implemented, evaluated or cancelled and are never overwritten by retries or blocked/resume cycles.
- Every creation/transition records one immutable event in the same D1 batch/Postgres transaction. Event version is unique per Action and orders history; its fact hash covers semantic transition coordinates but excludes the generated occurrence timestamp so delayed exact retries remain stable.
- Exact creation and transition retries return the original aggregate/event. Caller-key drift, different event metadata, stale versions and lost races conflict without mutating the projection or ledger.
- Action foreign keys are project-leading. Recommendation/run deletion cascades through Actions and their events, preserving ADR-023's independent run-deletion invariant; there is no ordinary Action delete API.

# Relevant areas/files

- Source graph and lifecycle: `src/db/growth-insights.schema.ts`, `src/server/features/growth/repositories/GrowthInsightsGraphWriter.ts`, `GrowthInsightsRepository.ts`, `GrowthInsightsService.ts`.
- Provider-safe atomic writes: `src/db/runBatch.ts`, `src/db/provider.ts`, `src/server/lib/audit/ids.ts`.
- Target normalization: `src/shared/researchScope.ts` and ADR-023.
- Planned contracts: `docs/growth/02_PRODUCT_REQUIREMENTS.md` section 9, `03_TECHNICAL_ARCHITECTURE.md` sections 6.10-6.11, `04_IMPLEMENTATION_PLAN.md` BG-0107, `AGENTS_BODKIN_APPENDIX.md` change history and measurement guidance.

# Implementation approach

- Add mirrored `growth-actions.schema.ts` modules with project-leading composite keys, explicit D1 vocabulary/integer checks, Postgres equivalents and normalized child relations.
- Create Action, targets and version-zero `created` event atomically through fact-hash-gated `INSERT … SELECT` statements selecting an accepted Recommendation.
- Transition via a project/status/version compare-and-set update plus a versioned `status_changed` event insert-select in the same provider-aware batch/transaction; reread the event hash to distinguish exact replay from drift.
- Extract or reuse one pure canonical Growth target normalizer so Recommendations and Actions cannot drift.

# Constraints

- Reuse current tenancy, auth assumptions, database provider abstraction, typed errors and Growth feature boundary.
- Keep reads/writes explicitly project-scoped, relations normalized and histories append-only.
- Add no dependency, paid/provider call, production migration, scheduler, AI generation, server function, UI, MCP tool or new service/database/auth layer.

# Explicit non-goals

- Owner/team assignment and edits, arbitrary Action metadata edits, implementation notes, website Change Events, Action↔Change links, Measurement Plans/Results, measurement-enforced transitions, public surfaces, reports, scheduling, provider calls, semantic dedupe and external PM sync.
- Standalone Actions without Recommendations, Action deletion, Action `dismissed`, JSON event payloads or caller-defined lifecycle states.

# Risks

- Projection and history can diverge if written separately; require one provider-aware batch/transaction and insert the event from the winning projected version.
- A concurrent retry can contaminate the winner's targets/event; gate every child on the stored Action fact hash and compare the stored event fact hash after the write.
- Recurring states such as blocked/resumed make current status insufficient for replay detection; key events by monotonically increasing Action version.
- D1 may store fractional numbers in integer-affinity columns; enforce `typeof(...) = 'integer'` for state/event versions.
- Recommendation deletion policy can contradict run cascades; use a project-scoped cascading Recommendation FK and execute both provider paths.

# Verification plan

- Focused contract, schema, migration, repository and lifecycle tests for accepted-source validation, target subset normalization, immutable retry/drift, legal transitions, terminal states, milestones, atomic event history and project isolation.
- Real-libSQL migration test starting from migration 0045 with populated accepted Recommendations, raw constraint rejection, cascades and `PRAGMA foreign_key_check`.
- Generate/inspect both migrations, apply the full Postgres tree to a dedicated disposable database, and run provider-gated repository concurrency/atomicity tests.
- Run root tests, `ci:check`, production build and `git diff --check`.
- Obtain fresh full-scope adversarial review, repair accepted findings within the two-round cap, and perform final evidence reconciliation before commit.
