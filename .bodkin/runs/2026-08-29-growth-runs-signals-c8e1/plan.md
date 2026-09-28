# Goal

Implement the next mergeable Bodkin Growth core slice: project-scoped Growth runs plus immutable deterministic Signals and evidence provenance, manually exercisable through internal services and compatible with both D1/SQLite and Postgres.

# Scope

- Record the run lifecycle, cadence-slot, evidence-reference and immutability decisions in ADR-022.
- Add `growth_runs` and `growth_signals` to the existing dual-dialect Growth schema and migration paths.
- Add Zod contracts, project-scoped repositories and internal services for idempotent manual run creation, signal recording, terminal completion/partial completion/failure and reads.
- Add migration-backed SQLite behavior tests, unit tests and provider schema-parity coverage.

# Relevant areas/files

- Existing Growth foundation: `src/db/growth.schema.ts`, `src/db/pg/growth.schema.ts`, `src/server/features/growth/`, `src/types/schemas/growth.ts`.
- Run/lifecycle precedents: `src/db/app.schema.ts`, `src/server/features/rank-tracking/repositories/RankTrackingRepository.ts`, `src/server/features/audit/repositories/AuditRepository.ts`.
- Atomic/provider patterns: `src/db/runBatch.ts`, `src/server/features/project-context/repositories/ProjectContextRepository.ts`.
- Planned contracts: `docs/growth/02_PRODUCT_REQUIREMENTS.md`, `docs/growth/03_TECHNICAL_ARCHITECTURE.md`, `docs/growth/UPSTREAM_MAP.md`.

# Implementation approach

- A manual service call creates a `running` run immediately. A required caller-stable cadence slot makes `(project, run type, slot)` idempotent without preventing another project from using the same slot.
- Periods use valid inclusive `YYYY-MM-DD` bounds. Run types, trigger, lifecycle status and the existing OpenSEO severity vocabulary are closed sets enforced at Zod and database boundaries.
- Run terminal transitions are compare-and-set, project-scoped and immutable. Completed-with-errors retains bounded failure metadata; provider cost stays nullable because this slice has no reliable provider-cost observer.
- Signals keep scalar facts on the Signal row and one required typed stable evidence reference, matching the approved architecture. Deterministic identity plus a run-scoped dedupe constraint makes retry insertion idempotent and prevents changed evidence from silently overwriting the first fact.
- Composite `(project_id, run_id)` integrity prevents a Signal from attaching another project's run. Existing provider-aware database plumbing remains unchanged except for normal schema exports/migrations.

# Constraints

- Reuse the current project tenancy, auth assumptions and Growth feature boundary.
- Keep all reads, writes and lifecycle transitions explicitly project-scoped.
- Maintain equivalent SQLite/D1 and Postgres schema/query behavior; use scalar columns rather than JSON evidence payloads.
- Generate migrations through existing scripts, add no dependencies and execute no production migration or paid/provider call.
- Use existing `info | warning | critical` severity semantics and existing typed application errors.

# Explicit non-goals

- No scheduler, Workflow, detector, provider adapter, AI interpretation, Insight/Recommendation/Action model, UI, server function, MCP tool or public API.
- No multiple-evidence relation, copied raw provider payload, Growth-specific project/auth/database/service, or new queue abstraction.
- No reliable provider-cost metering integration; the nullable field is only persisted when a future caller has authoritative data.

# Risks

- Independent project and run foreign keys would permit cross-project attachment; control with a composite FK backed by a matching unique parent key and a real SQLite rejection test.
- Cadence retries could duplicate runs or conflate changed inputs; return the existing row only when immutable creation inputs match, otherwise surface `CONFLICT`.
- Retry-safe Signal insertion could hide changed facts; deterministic identity must return the original only for an exact semantic/evidence match and reject drift.
- Status races could overwrite terminal history; every terminal write compares the expected `running` state and returns the updated row.
- Schema parity does not compare check expressions/default values; migration-backed SQLite tests and explicit Postgres SQL inspection are required.
- Drizzle may generate unsafe table-copy SQL; inspect and execute the generated D1 migration against the previous migration state before acceptance.

# Verification plan

- Focused schema/service/repository tests for validation, idempotency, lifecycle, failure bounds, signal immutability and project isolation.
- Real libSQL migration test for constraints, natural uniqueness, composite FKs, cascades and foreign-key integrity.
- Generate and inspect both migration trees; run schema parity.
- Run `pnpm run test:ci`, `pnpm run ci:check`, `pnpm vite build` and `git diff --check`.
- Obtain a fresh full-scope adversarial review, repair accepted findings within the two-round cap, and complete a final scope audit.
