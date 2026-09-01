# Goal

Implement the PRD read tool `growth_get_measurements` on the existing OpenSEO
MCP server and in project-bound SAM.

The first contract is a current, saved-data list of Measurement Plans and their
recorded evaluation summaries. It does not collect evidence, recalculate
outcomes, load full Measurement graphs, or claim that a recorded outcome proves
causality.

# Scope

- Add a strict project-scoped, keyset-paginated Measurement Plan read model.
- Allow an optional exact subset of `active | completed` statuses.
- Order by immutable `createdAt` descending, then SQLite BINARY/PostgreSQL C
  Measurement Plan ID descending.
- Normalize Plan `createdAt` inside SQL with one provider-aware chronological
  expression and use that exact expression in both root ordering and every
  cursor predicate. Preserve the stored value only for output canonicalization.
- Default to 20 and cap at 50 with cap-plus-one `hasMore` and a strict
  continuation cursor.
- Return safe cards containing the Plan schedule, derived due date, exact Metric
  and primary-Metric counts, current Action status/alignment, and a nullable
  privacy-safe recorded Result summary.
- Select Plan roots with their one-to-one Action first, then retrieve Metrics
  and Results in two project-leading bulk reads. Bound Metrics independently at
  51 rows per Plan and reject stored Plans outside the existing 1-50 Metric
  integrity bound or without a primary Metric.
- Enforce the saved Plan/Result lifecycle shape before projection: active has no
  Result/completion; completed has one Result whose evaluation time matches Plan
  completion. Represent Action lifecycle drift explicitly rather than treating
  it as a successful measurement.
- Register one shared tool definition in external MCP and project-bound SAM.
- Record the public boundary in Growth architecture decisions.

# Relevant areas/files

- `growth-measurements.schema.ts` defines Plan, Metric and Result invariants.
- `GrowthMeasurementsRepository` and `GrowthMeasurementsService` own full graph
  reads/writes; this list must not loop over their multi-query graph validator.
- `GrowthActionDetailService.measurementDto` proves safe Plan/Result projection
  and non-causal interpretation language for one Action.
- `GrowthMeasurementGraph` defines the 50-Metric integrity bound.
- `GrowthEvidencePacket` supplies established Action-title and Result-summary
  privacy projection.
- Existing Growth list tools provide strict schema, keyset, MCP protocol and SAM
  binding precedents.

# Implementation approach

1. Add strict request/card/page schemas and boundary tests.
2. Add a dedicated Measurement list repository with a one-to-one Plan/Action
   root page plus per-parent bounded Metric and bulk Result reads. Reuse the
   established provider-aware chronological expression for SQLite's
   `current_timestamp` text versus PostgreSQL timestamps; cover D1 and live
   PostgreSQL parity.
3. Add a privacy-safe read service that canonicalizes timestamps, validates
   list-level lifecycle/integrity, projects title/summary, and constructs the
   cursor.
4. Add the shared MCP tool, server/protocol registration and SAM adaptation.
5. Add an ADR, run focused/full/build checks, then obtain fresh review.

# Constraints

- Reuse the existing database, tenancy, project authorization, MCP server and
  SAM adapter.
- Keep every query compatible with SQLite/D1 and PostgreSQL and project-leading.
- Do not add dependencies, migrations, provider calls, credits or writes.
- Authorization must complete before the read service is invoked.
- Sanitize stored Action title and Result summary before public truncation.
- Keep full Metric coordinates, Observations and evidence out of the list.

# Explicit non-goals

- Evidence collection/refresh, comparison recomputation, full graph/fact-hash
  validation, observation values, Metric entity keys or confounder detail.
- Starting/finalizing Measurements or changing Action/Plan status.
- Arbitrary Action/date/entity filters, totals or historical snapshot semantics.
- `growth_find_opportunities`, `growth_record_change`, UI, scheduling,
  notifications or reporting changes.
- Schema, migration, index, auth, transport or dependency changes.

# Risks

- Calling `getMeasurement` per card would create an N+1 graph load. Use a
  purpose-built root page and exactly two bounded bulk child reads.
- Status is mutable while the cursor coordinates are immutable. State that
  pages are current, not an atomic snapshot or total.
- SQLite stores default `createdAt` values as `YYYY-MM-DD HH:mm:ss`, while the
  public cursor is canonical ISO UTC. Ordering or comparing the raw column would
  repeat or skip rows; normalize it in SQL before both operations.
- A joined Metric can multiply roots. Page Plans before child reads and enforce
  the 51-row per-parent sentinel.
- A Result summary or Action title can contain sensitive narrative. Reuse the
  established Growth projectors before smaller public caps.
- A Plan and current Action can drift in corrupted data. Return an explicit
  aligned/inconsistent state; never imply success from status alone.
- The current Plan index is due-oriented rather than creation-oriented. Defer a
  new index unless real project history demonstrates a need.

# Verification plan

- Schema/service tests for strict defaults/status canonicalization, cursor
  normalization, empty/final/continued pages, lifecycle shape, Action alignment,
  Metric integrity and privacy projection.
- SQLite/D1 and live PostgreSQL repository tests for status-before-limit,
  default stored timestamps, offset-equivalent cursors, createdAt/ID ties,
  no-repeat/no-skip cursor paging, project-leading joins, tenant isolation,
  per-parent Metric bounds and Result reads.
- MCP tests for authorization-before-read, exact output/text and no provider or
  write path; in-process MCP and SAM tests for shared registration and bound
  project injection.
- Run focused tests, `pnpm ci:check`, full tests, production build and staged
  whitespace checks before final acceptance.
