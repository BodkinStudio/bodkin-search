# Goal

Implement the smallest trustworthy Phase 3 measurement-data slice for Bodkin Growth: let a user collect mature Google Search Console periods for an active Work measurement, persist complete observations against the immutable plan, and understand progress and numeric comparisons in the Work UI.

# Scope

- Refactor the existing Growth GSC adapter so its hardened page/date collection can read an explicit set of frozen measurement URLs without depending on today's mutable key-page context.
- Project supported `url × search_clicks/search_impressions` plan metrics into complete scalar observations for each mature, missing period.
- Add an atomic, provider-neutral multi-observation write path with exact-retry verification.
- Add a project-authorized, explicit collection server function.
- Extend the Work measurement read model and UI with Search Console connection readiness, source-lag dates, per-period progress, collected values, and stored before/after deltas.
- Keep the Action Measuring; outcome/confidence/confounder policy is a later reviewed slice.

# Relevant areas/files

- `src/server/features/growth/services/GrowthSearchPerformanceAdapter.ts`: existing bounded GSC `web`/`final` collection and three-Pacific-day lag.
- `src/server/features/gsc/services/GscService.ts`: canonical project GSC property/grant boundary.
- `src/server/features/growth/services/GrowthMeasurementsService.ts`: immutable plan/observation/result domain service.
- `src/server/features/growth/repositories/GrowthMeasurementsWriter.ts`: provider-neutral atomic writes through `runBatch`.
- `src/server/features/growth/services/GrowthWorkMeasurementService.ts`: Work measurement orchestration and DTO projection.
- `src/types/schemas/growth-work.ts`, `src/serverFunctions/growthWork.ts`: authorized request/read contracts.
- `src/client/features/growth/GrowthWorkMeasurement*.tsx`: lazy Work measurement panel and explicit mutations.
- `docs/growth/04_IMPLEMENTATION_PLAN.md`, `docs/growth/05_ARCHITECTURE_DECISIONS.md`: BG-0305/0306 and immutable measurement decisions.

# Implementation approach

1. Extract an explicit-target form of the current GSC adapter while preserving the existing curated-key-page wrapper and provider validation. Measurement matching is exact against frozen URL identity; query/trailing-slash variants are not silently broadened.
2. Add a pure projector for one frozen period. Require pagination exhaustion and an observed row for every target/day coordinate, safely sum clicks/impressions, and create deterministic bounded GSC provenance containing a hashed property identity.
3. Add an exact multi-observation domain operation and writer. Validate all coordinates/facts before one `runBatch`, insert missing observations atomically on D1/Postgres, accept exact existing facts, and reject drift or an inactive/incomplete graph.
4. Add Work collection orchestration. Derive plan, periods, targets and metrics server-side; fetch only mature, wholly missing periods; share one 25-call allowance across every 90-day chunk and every mature period in the user-triggered attempt; use one capture timestamp per attempt; reject property drift against observations from earlier attempts; save nothing unless every selected period completes inside that shared budget or when any snapshot is capped/incomplete/provider-invalid.
5. Extend the authoritative Work DTO with connection/setup state, per-period source availability and observation status, collected scalar facts and derived comparisons. Do not call Google on read/render.
6. Add one explicit `Collect available data` action with clear waiting, missing-connection, incomplete-source, pending, retry and saved states. Reuse the existing project integrations route.

# Constraints

- DEEP: the change crosses live provider reads, immutable state, D1/Postgres writes, date eligibility and the user-visible lifecycle.
- Reuse OpenSEO's GSC auth/client/property and the existing Growth measurement aggregate. No new service deployment, auth path, MCP server, dependency or scheduler.
- Use frozen plan dates and metric URLs only. GSC dates are inclusive and use the source's `America/Los_Angeles` calendar with a three-day final-data lag.
- Never infer an absent GSC page/day row as zero. Never write after capped retrieval or provider/request/property drift.
- Keep all project identity server-derived through existing middleware and repository predicates.
- Preserve legacy plans/readability. Unsupported metric shapes remain visible but uncollectable.

# Explicit non-goals

Automatic outcome/confidence labels, statistical significance, causality, automatic confounder discovery, AI interpretation, GA4/backlink/audit collection, background scheduling, alerts, MCP tools, raw provider snapshot storage, schema migrations, live production data calls, push or deployment.

# Risks

- GSC can omit zero-data rows. Control: require every frozen target/day row before writing and report incomplete source without an all-clear.
- Separate period captures could use a changed GSC property. Control: include a stable property hash in generated evidence references and reject later source-identity drift.
- Partial observation commits would mix capture attempts. Control: validate first and write the attempt's complete missing fact set in one provider-neutral atomic batch.
- Current finalization treats observation presence as coverage regardless of `completeness`. Control: generated observations are completeness `1`; harden non-`not_measurable` finalization to require completeness `1`.
- A plan's primary or long-term window may be months away. Control: display the exact source-available date separately from the saved measurement due date.

# Verification plan

Run focused adapter, projector, domain/repository, service-function and UI tests; TypeScript checking; D1 repository tests; conditional live Postgres tests when configured; repository `test:ci`, `ci:check`, build, and whitespace checks. Perform independent verification and a fresh adversarial backend/data/UI review. Browser evidence is explicitly unavailable because the user prohibited browser/HTTP/CDP/Playwright access for this preview; use render/submission tests and report that evidence limitation.
