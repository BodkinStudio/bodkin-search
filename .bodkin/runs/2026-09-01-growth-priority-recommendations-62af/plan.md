# Goal

Implement the separately planned read tool `growth_get_priority_recommendations`
on the existing OpenSEO MCP server and in project-bound SAM.

This is a saved-data read over Recommendations that already exist. It does not
claim to discover new opportunities, run a detector, unblock BG-0606, or mutate
review/work state.

# Scope

- Add a strict, project-scoped, keyset-paginated Recommendation read model.
- Base scope is unresolved saved work:
  - `proposed`;
  - `snoozed` (including a passed snooze time until an explicit transition);
  - `accepted` only when no Action of any status exists for it.
- Allow optional exact status subset, exact category and inclusive minimum
  priority filters.
- Order by priority score descending, immutable creation timestamp descending,
  then SQLite BINARY/PostgreSQL C Recommendation ID descending.
- Default to 20 and cap at 50 with cap-plus-one `hasMore` and an opaque-shaped
  continuation coordinate containing priority, creation time and ID.
- Return safe Recommendation cards: title, rationale, category, six scoring
  facts, current status/review version, snooze/review/creation timestamps,
  `needsAction`, at most five safe targets and five safe ordered steps, plus
  exact bounded counts/omission markers.
- Retrieve roots first, then targets and steps for emitted roots in two bounded
  project-leading bulk reads. Reject a stored Recommendation over the existing
  100-target/100-step write integrity bounds before display truncation.
- Register one shared definition in the existing MCP server and adapt that same
  definition into SAM, with SAM binding its project ID server-side.
- Record the boundary in Growth ADRs.

# Existing code to reuse

- `GrowthProjectSummaryRepository.listUnresolvedRecommendations` for the
  canonical unresolved-state predicate.
- `GrowthActionsReadService`/`growth_get_actions` for keyset pagination, safe
  projection, MCP text, registration, D1/PostgreSQL and SAM patterns.
- normalized `growth_recommendation_targets` and
  `growth_recommendation_steps` relations.
- `GrowthEvidencePacket` safe text/URL projectors.
- canonical `withMcpProjectAuth`, MCP metadata/deep links and instrumentation.

# Contract details

- Request fields are exactly `projectId`, optional `statuses`, `category`,
  `minPriorityScore`, `limit`, and `cursor`.
- `statuses` accepts only `proposed`, `snoozed`, `accepted`, deduplicates and
  canonicalizes vocabulary order. It narrows but never broadens unresolved
  scope.
- Cursor fields are strict `{ priorityScore, createdAt, id }` and must be copied
  unchanged from `nextCursor`. Cursor predicates are applied after all current
  state/category/min-priority filters.
- This is a current mutable-state page over immutable creation order, not an
  atomic or historical snapshot. A status transition between pages can move an
  item into or out of scope; text and DTO state this without inventing snapshot
  semantics or totals.
- Accepted Recommendations with any Action are excluded before filtering,
  ordering and limiting. `needsAction` is true only for emitted accepted rows.
- Targets sort by type/value in code-unit order. Steps sort by numeric position;
  positions are not exposed. Counts are exact only after the at-most-100 stored
  child integrity check.

# Privacy and safety

- Canonical project authorization finishes before the read service.
- Every root/child query leads with project ID; foreign Recommendations and
  child rows cannot appear.
- Sanitize before smaller public caps. URL targets use the established safe URL
  projection; keyword/cluster/site targets and all prose use the established
  action-text projection.
- Exclude organization/project raw identity beyond project metadata,
  creation/fact hashes, run IDs, Insight/Signal graph, evidence refs,
  dismissal/resolution metadata, model/prompt fields, actors, provider data and
  secrets.
- Read-only, non-destructive, saved-data-only, zero-credit, no provider/LLM/run
  or mutation path.

# Implementation sequence

1. Add strict request/card/page schemas and boundary tests.
2. Add root and bulk-child repository reads with D1 and live PostgreSQL parity
   tests for filters, unresolved predicate, ordering, cursor and isolation.
3. Add the privacy-safe read service and projection/integrity tests.
4. Add MCP handler, server registration, protocol coverage and SAM binding.
5. Add ADR and run focused/full/build/staged checks before fresh review.

# Explicit non-goals

- `growth_find_opportunities`, detector/provider orchestration, scan/persistence
  or any claim that these are newly discovered opportunities.
- Recommendation detail evidence graphs, Action creation, review writes,
  dismiss/snooze/accept/merge controls or historical status reconstruction.
- UI, server function, route, scheduler, notification, share/report change,
  schema/migration/dependency/auth/transport changes.

# Verification plan

- Strict schema and service tests cover filters/defaults/cursor, empty/final/
  continued pages, child integrity, safe projection and current-state wording.
- D1 and live PostgreSQL fixtures cover accepted-with/without-Action,
  proposed/snoozed/terminal states, filter-before-limit, priority/time/ID ties,
  child bulk reads and tenant isolation.
- MCP tests prove auth-before-read, exact input/output, truthful text and no
  mutation/provider calls. In-process MCP and SAM tests prove shared
  registration and bound project injection.
- Run `pnpm ci:check`, full tests, production build and staged whitespace
  checks. Browser, HTTP, CDP, Playwright and screenshots remain prohibited and
  unclaimed.

# Risks

- Priority is mutable only through immutable Recommendation creation (scores
  do not change), but status is mutable. Cursor order is stable; membership is
  explicitly current and can change between pages.
- Child joins can multiply roots. Root-first pagination plus two bulk child
  reads prevents that and avoids N+1.
- Stored prose can contain sensitive text. Reuse the established Growth
  projectors before truncation and enforce strict public schemas.
