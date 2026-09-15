# Accepted bounded milestone

Explicit project Search Console check → persisted run and detected signals → reopened numeric evidence. Existing OpenSEO tenancy, authentication, database providers, GSC adapter, detector and evidence builder are reused. No dependencies, schema, new integration, jobs, AI calls or action workflow were added.

## Evidence

- `verification.json`: 181 tests passed across 22 files; one optional Postgres concurrency test skipped because `TEST_POSTGRES_DATABASE_URL` was not configured. Complete `pnpm ci:check`, production build and diff check passed.
- New SQLite integration coverage executes the real orchestration, adapter, detector and repositories with mocked GSC responses. Overlapping same-key requests collect once; replay after removing connection/key pages returns saved state. No live Google round trip is claimed.
- Client tests cover persistence before dispatch, uncertain retry after remount, running/terminal transitions, explicit new attempt, project-scoped nonce storage and fail-closed storage errors.
- `engineering-review-final.json`: independent repair review passed; provider-free reads, project scope, immutable replay and safe URL projection preserved.
- `ui-review-final.json`: independent rendered review passed after correcting selected-run identity, comparison-window labels, warning contrast and missing-state evidence. UI artifact preflight passed.
- `browser-verification.md` and the current screenshot manifest record desktop/narrow reads and synthetic state simulations. Temporary server-response overrides were removed and byte-compared against repository source.

## Limits and handoff

The port-3218 preview is disposable and contains clearly labelled synthetic saved results. It has no GSC connection or user credentials; Run check is correctly disabled there after restoring ordinary behavior. A normal connected project with configured key pages is required for a real Google check. Do not connect accounts in this disposable preview.

Raw GSC snapshots and suppressed-page histories are not saved; current project context and the current configured URL remain explicitly current. Interrupted runs have unknown completion and no automatic resumption. No recommendations, actions, reports or schedules were added in this slice.

The working-tree changes remain local and uncommitted. The older port-3217 preview was not stopped or changed. No external deployment, credentials, organization settings or review-control-plane changes were made.

Two repair batches were used. The initial CI failures are retained in the earlier verification artifacts; no failing gate is treated as passing. The final checkpoint reran affected regressions and full checks after substantive repairs.
