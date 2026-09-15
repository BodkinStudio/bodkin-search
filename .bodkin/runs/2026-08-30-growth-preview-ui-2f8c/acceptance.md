# Required behaviour

1. The Growth preview is reachable from project navigation and inherits the existing project/auth shell. Its server function uses `requireProjectContext`; no unauthenticated real-data endpoint is introduced.
2. The response is strictly bounded, schema validated and explicitly synthetic. It contains fixed sample identities, no current project content and no raw observations. The composer calls the existing fixture, detector and packet builder, with no repositories, providers, models or mutations.
3. The fixed example contains six pages and flags pricing at 308 baseline clicks, 140 current clicks, -168 clicks and about -54.5%, with commercial weight 3 and priority 504. The evidence packet agrees with those facts and comparison dates.
4. Other outcomes remain distinguishable: stable/growing below the decline rule, low baseline, zero baseline and missing observation. Missing evidence is not rendered as zero or as a healthy-page claim.
5. A user can filter the page list, select a page and inspect its explanation. A zero-match filter offers a working reset. Filtering cannot leave unrelated selected-page evidence presented as a matching result.
6. Flagged-page detail separates observation from current sample commercial context and partial selected change history. It shows source/comparison dates and provenance, and does not imply the selected change caused the decline.
7. The interface states that no AI recommendation has been generated and nothing has been saved. There are no fake accept, dismiss, snooze, save or run-live controls.
8. Loading, error/retry and unavailable-data states are explicit and accessible. Project changes do not carry stale selection/query data across scopes. Long text/identifiers wrap without breaking the layout.
9. The local launcher binds only to loopback on an unused strict port, copies source without local secrets/state, uses existing dependencies, allowlists environment variables and creates/migrates/seeds only a task-owned disposable database. It does not read or mutate the ordinary `.wrangler` database or visit a provider-fetching dashboard.

# Required checks

- Focused tests prove deterministic response, agreement with detector/packet facts, safe suppression projection, fixture-only composition and request validation.
- UI tests or browser evidence prove selection, filtering/reset, pending/error behavior, keyboard access and mobile detail access.
- Launcher checks prove environment/source isolation and command scoping; a real launch proves migrations, seed and direct route startup.
- Full root tests, `pnpm ci:check`, production build and `git diff --check` pass. Postgres-only tests may skip because no persistence implementation changes; report that limit.
- Fresh engineering review passes or valid findings are repaired and reverified within the cap.

# Regression constraints

No changes to provider clients, auth policy, schema/migrations, existing detector thresholds, URL normalization, evidence-packet semantics, existing application state or dependency manifests. Existing app routes/navigation and Growth backend tests stay green. No live-site or Gate 2 completion claim.

# Important edge cases

Empty filter, selected page removed by a filter, unknown/missing metric values, zero baseline, stable or growing page, long evidence hashes, keyboard-only operation, mobile viewport, unauthorized project, unavailable request and same fixture across different authorized projects.

# Product / UX requirements

Match the established OpenSEO shell, themes, control language and spacing. Lead with what needs attention, not a dashboard of unrelated totals. Label sample data at first view and alongside context/history. Keep evidence usable without AI interpretation. Show all six pages on request without treating suppressed pages as recommendations.

# Specialist review requirements

Bodkin UI review is required against `.bodkin-ui/current/shape.md`, the cited incumbent OpenSEO patterns, independent preflight and rendered desktop/mobile/empty-state evidence. The reviewer must receive a fresh, narrow context and must not edit product source.
