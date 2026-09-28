# Goal

Continue Bodkin Growth with one useful, bounded vertical slice after the cost audit: explicitly check a project's real Search Console priority pages, save the run and detected declines, and reopen their evidence after reload.

# Scope

One on-demand project check using two adjacent 28-day windows ending at least three Pacific calendar days before collection. Compose existing GSC collection, detector, run/signal persistence and evidence assembly. Add the thin authenticated API and a small project-check section in the existing Growth surface. Keep the fixed sample preview separately labelled and accessible.

# Relevant areas/files

- `src/server/features/growth/services/{GrowthSearchPerformanceAdapter,PriorityPageClickDeclineDetector,GrowthRunsService,GrowthEvidencePacketService}.ts`
- `src/server/features/growth/repositories/GrowthRunsRepository.ts`
- `src/serverFunctions/{growth,growthPreview,middleware}.ts`
- `src/client/features/growth/` and `src/routes/_project/p/$projectId/growth.tsx`
- `src/server/features/gsc/services/GscService.ts` and existing project context/key-page services.

# Implementation approach

1. Add a bounded orchestration service and strict request schemas. Use existing repository primitives for a single claim on each manual request key; only the successful claimant collects. Replays return stored state, never recollect into the same immutable run. Fixed windows and capture times come from the server. Validate connection and configured pages before collection.
2. Fetch through the existing adapter only, with an explicit page-request cap, then record detector-produced signals and finalize through existing lifecycle services. Persist safe failure/incomplete codes/messages, never raw provider error payloads. A failed or interrupted run can be followed by a new explicit check; no automatic resumption/background completion is promised.
3. Add project-scoped overview, run-detail and signal-evidence reads. Bound recent-run reads (20), preserving existing callers if a repository helper is added. Read-only page loads never call provider APIs. Evidence uses saved facts and visibly current context.
4. Extend the existing Growth interface with setup state, Run check, saved history, numeric decline facts and evidence disclosure. Reuse the shell, tokens, forms, accessible controls and project-keyed query state. No new visual identity or whole-product design exercise.

# Constraints

SQLite/Postgres-compatible queries; no schema/dependency/auth changes. Project and organisation scope derive from authenticated context. Do not weaken immutable signals, current-context disclosure, URL checks or data-quality suppression. A completed check with no saved signal does not prove every page is healthy. Raw observations and per-page suppression outcomes are not persisted by this slice.

# Explicit non-goals

AI recommendations, action creation, measurement/report automation, MCP changes, scheduled jobs, raw snapshot storage, editable detection thresholds, Growth preferences UI, branding changes, paid DataForSEO calls, connecting user Google accounts or copying credentials into preview.

# Risks

- Duplicate/concurrent requests: atomically claim the existing unique run slot, return stored state for replay, and retain request identity for uncertain client retries.
- Incomplete collection: detector suppressions remain intact; capped/missing-data outcomes must not become an all-clear, including after reload.
- Interrupted synchronous collection: show running/unknown state honestly, allow a fresh explicit run, never promise a worker is still running.
- Missing real GSC credentials in the disposable preview: prove composition/persistence with deterministic tests and clearly disclose that a real Google round trip remains unverified.

# Verification plan

One balanced implementation agent with bounded context. Director-run targeted service, API, client and persistence tests; one repository `ci:check` and one production build at the coherent checkpoint. One batched desktop/narrow browser inspection, followed by focused independent engineering and rendered-UI review; share evidence without rerunning suites. At most two automatic repair rounds, targeted to valid findings. No new goal loop or recursive agent tree.
