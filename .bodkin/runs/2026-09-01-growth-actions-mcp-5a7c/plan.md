# BG-0603 — general read-only Growth Action list

## Objective

Expose every current Growth Action through the existing OpenSEO MCP server and
project-bound SAM agent. Add the general, bounded Action read foundation needed
by later project-summary, page-context and Action-detail work without reusing
the deliberately narrower priority-page Work UI query.

## Scope

1. Add strict request/output schemas for a general Action page.
2. Add one project-leading repository page read over `growth_actions` with:
   - optional deduplicated status filters, capped at all eight statuses;
   - optional exact trimmed category filter;
   - optional finite non-negative minimum priority score;
   - limit default 20 and maximum 50;
   - optional strict `{ createdAt, id }` cursor;
   - immutable `(createdAt DESC, id DESC)` keyset ordering using provider-aware
     BINARY/C ID collation; and
   - `limit + 1` selection for truthful `hasMore` without a count query.
3. Select only fields permitted in the read DTO. Bulk-load targets for the
   emitted page through the existing project-scoped target read; fail closed if
   a stored Action exceeds the 100-target write invariant.
4. Add `GrowthActionsReadService.listActions` to produce a strict safe DTO:
   Action ID, credential-safe title, 400-character safe description excerpt and
   truncation/redaction flags, credential-safe category, priority, status,
   version, due/created/updated timestamps, target count, and at most five safe
   display targets with omission/withholding flags. Exclude recommendation/run
   IDs, owners, creation keys, hashes, actors, notes and raw internal rows.
5. Add shared MCP tool `growth_get_actions`. It calls only the new read service
   after `withMcpProjectAuth`, returns the strict page plus standard project
   metadata, and links to `/p/:projectId/growth#growth-work`.
6. Describe and annotate the tool as read-only, closed-world,
   non-destructive, saved-data-only, zero-credit and provider-free.
7. Register the exact definition through the existing MCP helper and mirror it
   into SAM, where `projectId` is removed from model input and injected from the
   bound session project.
8. Record the current-read, keyset, privacy and no-detail-chain boundary in a
   new ADR.

## Files

- New: `src/types/schemas/growth-action-reads.ts`
- New: `src/types/schemas/growth-action-reads.test.ts`
- Update: `src/server/features/growth/repositories/GrowthActionsRepository.ts`
- New/update: D1 and required disposable Postgres 16 repository read coverage
- New: `src/server/features/growth/services/GrowthActionsReadService.ts`
- New: `src/server/features/growth/services/GrowthActionsReadService.test.ts`
- New: `src/server/mcp/tools/growth-action-tools.ts`
- New: `src/server/mcp/tools/growth-action-tools.test.ts`
- Update: `src/server/mcp/server.ts`
- Update: `src/server/mcp/server.growth.integration.test.ts`
- Update: `src/server/features/sam/samChatTools.ts`
- Update: `src/server/features/sam/samChatGrowthTools.test.ts`
- Update: `docs/growth/05_ARCHITECTURE_DECISIONS.md`

## Verification

- Schema tests cover defaults, canonical status filters, category/priority/limit
  bounds and strict cursor validation.
- Repository tests cover project isolation, all-Action coverage, filters,
  provider-aware tie ordering, limit-plus-one behavior and exact cursor
  boundaries in SQLite/D1 and a required disposable Postgres 16 fixture.
- Service tests cover safe prose/URL projection, query/fragment omission,
  credential/email withholding, target caps, internal-field exclusion and
  next-cursor truth.
- Tool tests cover auth-before-read, exact service delegation, empty/populated
  text, strict output validation, metadata and absence of mutation/provider
  paths.
- The no-network real MCP client/server test proves `tools/list` discovery and
  `tools/call` invocation through `createOpenSeoMcpServer`.
- SAM coverage proves the model cannot supply a project ID and the session-bound
  project is injected before the shared handler runs.
- Run focused tests, type checking, `pnpm ci:check`, the full test suite,
  production build and `git diff --check`, followed by fresh adversarial review.
- Persist the exact independently executed commands and outcomes, including the
  required Postgres fixture, in `verification.json` before implementation
  review and evidence-based acceptance.
- Raw HTTP transport and an external headless MCP consumer remain unrun under
  the user's standing no-HTTP/headless constraint; do not claim those layers.

## Non-goals

- No Action mutation, arbitrary sorting, text search, total-count query or
  offset pagination.
- No Action detail, event history, Recommendation/Insight/Signal chain, linked
  Changes or Measurement graph; those belong to BG-0604.
- No project summary or page-context tool; this read is their dependency.
- No provider call, refresh, credit use, schema, migration, dependency, auth,
  scope, transport, route, UI or separate MCP server.

## Risks and controls

- **Silent Action omission:** read `growth_actions` directly through a new
  service/repository path; never reuse qualified investigation Work.
- **Cross-project access:** canonical MCP project auth precedes the service, and
  every repository predicate and target batch remains project-leading.
- **Pagination drift:** keyset on immutable creation time plus code-unit ID,
  never mutable status/priority/due time; echo only the last emitted row.
- **Privacy:** allowlist the repository selection, apply existing Growth prose
  and URL projections, bound targets, and validate the strict DTO.
- **Size:** maximum 50 Actions, five displayed targets per Action and a
  400-character description excerpt.
- **False completeness:** `hasMore` is derived from cap-plus-one; target
  truncation and URL omission/withholding are explicit.
