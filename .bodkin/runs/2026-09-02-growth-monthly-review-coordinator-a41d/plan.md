# BG-0401A: manual monthly review coordinator

## Objective

Compose the already verified Growth detector, due-Measurement queue and immutable monthly report builder behind one explicit authenticated server action. Record the attempt as a `monthly_review` Growth Run without adding scheduling, another database, another provider client or a second orchestration system.

This is the backend half of the manual monthly workflow. A visible card is deliberately deferred because it is a material UI extension and the current run is constrained from browser, screenshot and rendered-review work.

## Current source of truth

- `GrowthRunsService.claimManualRun` owns exact manual request claims and one-way terminal transitions.
- `GrowthPriorityPageCheckService.runCheck` owns the complete existing priority-page GSC detector, child Run, Signal and investigation decision path.
- `GrowthProjectSummaryService` currently owns the due-Measurement calculation over `GrowthProjectSummaryRepository.listActiveMeasurementCandidates`.
- `GrowthMonthlyReportsService.buildGrowthMonthlyReport` owns current-period validation, bounded source reads, immutable creation and concurrent-winner recovery.
- `requireProjectContext` injects the authorized project and actor into server functions; request project IDs are route echoes, not authority.

The detector's adjacent 28-day Pacific source windows are intentionally different from the previous complete report month in the configured report timezone.

`monthly_review` is already a member of the shared `GROWTH_RUN_TYPES` input contract and both Drizzle Run schemas already use that shared vocabulary. The database columns and migrations already admit it; implementation must verify this existing contract but must not widen or edit it.

## Identity and replay policy

- Coordinator version: `growth-monthly-review-v1`.
- Run type: `monthly_review`.
- Request: strict `projectId` route echo plus caller-stable `requestKey` matching `[A-Za-z0-9_-]`, bounded to 120 characters.
- Cadence slot: `monthly-review:<requestKey>`.
- Child check request key: `monthly_<parent-run-id>`.
- Run period: the previous complete calendar month at one captured `now` in the current Growth report timezone.

The request key, rather than the month alone, is the retry coordinate. Exact retries replay the stored envelope before settings, provider, due or report work. A new explicit attempt remains possible after a terminal failed or partial Run because Growth Runs cannot reopen. Multiple deliberate attempts in one month are therefore possible and remain visible history.

Before claiming, read the exact top-level slot. A matching `monthly_review` row must also have manual trigger, the exact coordinator version and cadence slot; otherwise return `CONFLICT`. If it exists, return only its stored Run summary with `replayed: true`. Do not reconstruct mutable phase state.

After `claimManualRun`, qualify its returned row again for run type, manual trigger, coordinator version and exact cadence slot. This closes the pre-read/claim occupancy race. A mismatch is `CONFLICT`. Only `claimed: true` executes phases; a compatible concurrent loser returns the stored Run immediately, including when it is still `running`.

No lease, resume or automatic stale-Run repair is introduced. A process crash after the winning claim can leave that exact request truthfully recorded as `running`; exact retry returns that stored state without claiming completion, and a new request key can start another explicit attempt. This is the same bounded manual-attempt behavior documented for current priority checks. The response and ADR must not call the envelope durable scheduling or claim Gate 4. Tests must prove exact running replay performs no phase work and a different key can claim independently. Durable abandonment, leases and recovery require a later orchestration-state decision rather than unsafe inference that an active process has died.

## Reusable service extractions

### Previous complete month

Extract the private monthly period calculation into a small pure helper, for example `previousCompleteGrowthMonthlyPeriod(cutoff, timezone)`. Keep the existing report service on that helper and test timezone/month/year boundaries. The coordinator loads Growth settings once for its envelope coordinate; the report builder still revalidates its own authority boundary.

### Due Measurements

Extract the existing active-Plan scan, inclusive-window rule, timezone comparison, integrity classification, stable ordering, five-row cap and 51-row overflow behavior into `GrowthDueMeasurementsService.getDueMeasurements(projectId, { now })`.

Export the existing strict due-Measurements DTO schema from `growth-project-summary.ts`. `GrowthProjectSummaryService` must delegate to the new service so the policy still has one implementation and its public output remains byte-for-byte compatible. No repository query or schema changes are needed.

Each due candidate continues to use its Measurement Plan's own frozen `reportTimezone`. The queue is a bounded current read at the captured `now`, not a snapshot on the coordinator's project report calendar. A project report-timezone change must not reinterpret existing Measurement Plans. Due means the frozen window has elapsed; it does not mean GSC data is collectable or complete and does not authorize collection or finalization.

## Orchestration

For a newly claimed envelope:

1. Run the existing priority-page check with the deterministic child request key.
2. If the returned child is unexpectedly still `running`, stop downstream work and fail the envelope safely; never freeze a report while a detector child is still active.
3. Read the due-Measurement queue at the same captured `now`; do not collect observations or finalize Results.
4. Build/recover the monthly report with the exact captured period, timezone, actor and `now`.
5. Compare every returned report DTO's `periodStart`, `periodEnd` and `reportTimezone` with the envelope expectation before treating it as useful. A mismatch, including an existing same-date report frozen under another timezone, is a safe drift warning rather than success.
6. Classify the envelope and transition it once.

Each phase is independently durable. Do not roll back or delete a child Signal, investigation decision or Report when a later phase fails.

### Safe classification

- Check `completed`: success.
- Check `completed_with_errors`: useful partial and warning.
- Check `failed`, setup validation failure or unexpected error: failure, but continue due and report phases.
- Due `complete`: success, including an empty queue.
- Due `overflow`: useful partial and warning; expose no invented partial list.
- Due exception: failure.
- Report `report` or `no_activity` with the exact expected period and timezone: success. `no_activity` remains non-persisted and is not an error.
- Report `ready` after a build request: coordinate/settings drift, treated as failure for this envelope.
- Any returned period or timezone mismatch: coordinate/settings drift, treated as failure for this envelope.
- Report exception: failure.

Terminal status:

- `completed` when all three phases succeed without partial warnings;
- `completed_with_errors` when at least one phase is useful and any phase is partial or failed;
- `failed` when no phase is useful.

Use only static persisted failure values:

- `MONTHLY_REVIEW_PARTIAL` / `Monthly review completed with one or more incomplete phases.`
- `MONTHLY_REVIEW_FAILED` / `Monthly review could not complete any phase.`

Never persist or return raw provider, database or exception messages.

## Strict response contract

Add a dedicated strict schema with a discriminated response:

- replay: `replayed: true` plus the stored bounded Run summary only;
- initial attempt: `replayed: false`, `consistency: current_not_snapshot`, terminal Run summary, bounded check phase, due-Measurement union or `null`, monthly report DTO or `null`, and ordered warning codes from a closed enum.

The response contains no evidence bodies, provider payloads, internal hashes, actors, costs or exception text. `failureCode` and `failureMessage` are safe because this coordinator persists only the static values above.

## Authorization

Add one POST TanStack server function with `requireProjectContext` and the strict request schema. Pass `context.projectId` and `context.userId`; ignore the echoed request project ID for service authority. Reject unknown or privileged fields before handler work.

## Expected files

- `src/server/features/growth/services/GrowthMonthlyReportPeriod.ts` and tests.
- `src/server/features/growth/services/GrowthDueMeasurementsService.ts` and tests.
- `src/server/features/growth/services/GrowthMonthlyReviewService.ts` and tests.
- Small reuse edits in `GrowthMonthlyReportsService.ts`, `GrowthProjectSummaryService.ts` and their tests.
- A bounded read-by-slot method in `GrowthRunsService.ts` and focused tests.
- `src/types/schemas/growth-monthly-review.ts` and tests.
- `src/serverFunctions/growthMonthlyReview.ts` and tests.
- ADR-049 in `docs/growth/05_ARCHITECTURE_DECISIONS.md` and a truthful backend-only note in `docs/growth/PREVIEW.md`.

## Non-goals

- No UI, browser run, screenshot or visual review in this backend slice.
- No cron, Workflow, schedule, alert or notification.
- No AI, prompt, model, egress or cost policy.
- No new detector or provider request beyond the existing explicit GSC check.
- No automatic opportunity review, Action creation, Measurement collection or Result finalization.
- No report publication, regeneration, sharing, print or delivery.
- No parent-child foreign key, phase checkpoint table, lease, inferred abandonment or resumable workflow.
- No opportunity-count snapshot and no claim that proposed investigations appear in the frozen report's Action-based Opportunities section.
- No schema, migration, dependency, auth-mode, MCP or database-provider change.

## Verification

### Pure and service tests

- existing shared Run inputs accept `monthly_review` without a contract or migration change;
- previous-month derivation across month, year and timezone boundaries;
- due-date inclusive-window behavior, timezone boundary, integrity states, stable ordering, cap and overflow;
- Project Summary output remains unchanged through delegation;
- exact top-level retry returns before settings or any phase work;
- wrong-version occupied slot conflicts;
- concurrent lost claim is post-qualified and performs no phase work; an incompatible race winner conflicts;
- a replayed running envelope performs no phase work, while a different request key can claim a new attempt;
- successful phase order, exact project/actor/clock/child identity and completed transition;
- child partial/failure/setup error classification;
- unexpected running child stops downstream work;
- due overflow/exception classification;
- report `no_activity`, exact existing report, `ready` drift, returned timezone/period mismatch and exception classification;
- all failures produce `failed`; mixed useful outcomes produce `completed_with_errors`;
- safe static messages only and no rollback of successful earlier calls.

### Boundary tests

- strict schemas reject unknown fields, malformed request keys, raw error-shaped data and overlong values;
- server function uses authorized project/actor instead of forged fields;
- no phase call on handler validation failure.

### Repository gates

- affected Prettier, TypeScript and type-aware Oxlint;
- focused Vitest with one worker;
- `pnpm ci:check`;
- full Vitest with one worker and a 4 GB Node heap;
- production build with a 4 GB Node heap;
- staged and unstaged whitespace checks plus an added-line credential-pattern scan.

No new PostgreSQL test is required because the slice adds no query or writer. Existing dual-provider Run transitions, due query parity, priority-check concurrency and report-winner tests remain the persistence evidence.

## Acceptance

- One explicit request composes exactly the existing detector, due queue and monthly builder.
- Exact retries and concurrent claim losers perform no provider or downstream mutation.
- Partial work remains truthful and durable without raw error leakage.
- Due Measurements are surfaced but never automatically evaluated.
- The implementation remains inside the existing Growth database, auth and service boundaries.
