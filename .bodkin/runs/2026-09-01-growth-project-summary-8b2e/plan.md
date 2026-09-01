# BG-0601 — saved-records Growth project summary

## Objective

Expose a compact, privacy-safe project orientation through the existing OpenSEO
MCP server and project-bound SAM agent. Reuse current Growth settings, project
context and Action foundations, adding only the bounded cross-aggregate reads
missing for unresolved Recommendations, current priority work, saved Signal
freshness and Measurement dates.

## Scope

1. Add one strict project-summary DTO with one canonical `asOf` assembly time,
   explicit `current_not_snapshot` consistency, and safe allowlisted sections.
2. Project the already-authorized project row into safe project identity:
   ID, bounded/sanitized name, safe site URL with omission/withholding flags,
   market and creation time. Never return organization identity or raw domain.
3. Reuse Growth settings and project-context services. Return operational
   settings plus the four typed context sections as bounded safe prose, missing
   section keys, and counts for custom sections, competitors, key pages and the
   retained research log. Presence is described as coverage, not quality or
   completeness of the business information.
4. Add a dedicated project-leading summary repository with narrow selects:
   - unresolved Recommendations: proposed, snoozed, or accepted without an
     Action, ordered priority descending then creation descending/code-unit ID;
   - current Actions in approved, ready, in-progress, blocked, implemented or
     measuring state, ordered priority descending, due date ascending and
     code-unit ID;
   - recent Signals only from completed or completed-with-errors Runs, with
     `capturedAt <= asOf` applied before pagination, ordered by explicit
     `critical > warning > info` severity, then capture time descending and
     code-unit ID;
   - latest Run attempt, ordered start time descending/code-unit ID;
   - per-evidence-kind latest saved Signal capture time, also restricted by
     `capturedAt <= asOf` before aggregation; and
   - at most 51 active Measurement Plan/Action candidates ordered by final
     inclusive end date then code-unit ID.
5. Use provider-aware SQLite `BINARY` / Postgres `C` ID collation for every
   deterministic tie. Every ordinary collection reads six rows, displays five
   and truthfully exposes `hasMore`; no count query is added.
6. Evaluate Measurement dates only after reading candidates, using each Plan's
   frozen report timezone and the existing calendar helpers. If more than 50
   active candidates exist, return an explicit overflow state and withhold a
   potentially misleading partial due list. Otherwise return up to five active
   Plans whose final inclusive window has ended, including one closed Action
   lifecycle integrity state rather than claiming evidence is complete or a
   Result is ready to finalize. The precedence is `action_missing`, then
   `action_state_mismatch` when status is not `measuring`, then
   `action_version_mismatch` when Action state version differs from Plan action
   version, otherwise `consistent`.
7. Define freshness narrowly as newest saved Growth Signal `capturedAt`, overall
   and by evidence kind, always after repository-level `capturedAt <= asOf`
   filtering. Never reinterpret latest Run, provider connection,
   Search Console lag, GA4, ranks, audit or backlinks as uniform live freshness.
8. Apply existing Growth prose/URL sanitizers and smaller post-sanitization caps
   to every mutable project, context, Recommendation and Action display field.
   Omit raw refs, evidence refs, failure messages, hashes, actors, owners,
   provider/model metadata and internal relationship IDs.
9. Add shared read-only MCP tool `growth_get_project_summary`. Canonical project
   authorization runs before its one summary-service call. Return strict
   `{ summary, meta }`, zero-credit/provider-free language and a Growth deep
   link. Register the same definition on the existing MCP server and adapt it
   into SAM with server-bound project injection.
10. Record the summary's saved-records, current-view, privacy, boundedness and
    no-live-provider boundaries in ADR-038.

## Files

- New: `src/types/schemas/growth-project-summary.ts` and tests
- New: `src/server/features/growth/repositories/GrowthProjectSummaryRepository.ts`
  plus SQLite/D1 and required live Postgres 16 query tests
- New: `src/server/features/growth/services/GrowthProjectSummaryService.ts`
  and tests
- New: `src/server/mcp/tools/growth-project-summary-tool.ts` and tests
- Update: existing MCP registration and in-process protocol integration test
- Update: existing SAM registration and Growth tool tests
- Update: `docs/growth/05_ARCHITECTURE_DECISIONS.md`

## Verification

- Schema tests cover strictness, all bounds, null/overflow states and safe URL
  discriminators.
- Repository tests on SQLite/D1 and a required disposable Postgres 16 fixture
  cover project isolation, unresolved Recommendation semantics, usable-Run
  Signal filtering, explicit critical/warning/info ordering, capture-time/tie
  ordering, cap-plus-one behavior, active Plan ordering and latest/freshness
  projections. More than six future-dated Signals ahead of eligible history
  prove the `asOf` predicate precedes limiting and per-kind aggregation.
- Service tests inject time and cover safe prose/URL projection, context
  coverage wording, one shared `asOf`, mixed Plan timezones, inclusive end-date
  boundaries, invalid timezone failure, every lifecycle-integrity enum, overflow
  withholding, future Signal exclusion and internal-field absence.
- Tool tests cover authorization before the service, exact delegation, strict
  output/text/metadata and saved-records/no-provider claims.
- A real no-network MCP Client/InMemoryTransport test proves discovery and call
  through `createOpenSeoMcpServer`; SAM coverage proves model-visible project ID
  removal and bound-project injection.
- Run focused tests, required live Postgres tests, `pnpm ci:check`, the full test
  suite, production build and `git diff --check`, then fresh adversarial review.
- External HTTP/headless probes remain unrun under the user's standing browser,
  HTTP, CDP, Playwright and screenshot prohibition and are not claimed.

## Non-goals

- No provider refresh, connection-health aggregation, universal source
  freshness, historical as-of reconstruction or transactional cross-query
  snapshot.
- No full Recommendation evidence graph, Action history/detail, Measurement
  observations/results, monthly report body or project custom-context prose.
- No mutation, scheduling, notification, billing, dependency, schema, migration,
  transport, route, server function, UI or separate MCP server.
- No new scale indexes in this slice. Existing project-leading predicates are
  correct at current bounded Growth volume; index additions require measured
  need and a dual-provider migration.

## Risks and controls

- **False freshness:** name the scope `saved_growth_signals`, return per-kind
  capture time, and state excluded live-source guarantees in tool text.
- **Mixed current view:** capture one `asOf`, call the result a current assembly
  rather than an atomic snapshot, and do not use mutable timestamps as fake
  historical cutoffs.
- **Timezone error:** use each stored Plan timezone and existing date helpers;
  invalid stored zones fail closed.
- **Partial Measurement list:** scan at most 51 active candidates; overflow
  withholds items and never claims that no due Plan exists.
- **Privacy/size:** narrow selects, strict DTOs, existing sanitizers, post-
  sanitizer caps and five-item displays.
- **Cross-project access:** established MCP auth runs first and every repository
  query and join is project-leading on both sides.
