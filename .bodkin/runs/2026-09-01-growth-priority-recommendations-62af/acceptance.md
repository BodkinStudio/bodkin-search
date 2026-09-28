# Acceptance criteria

1. `growth_get_priority_recommendations` is registered on the existing OpenSEO
   MCP server and adapted from the same definition into SAM. SAM strips the
   model-visible project ID and injects its bound project.
2. Input is strict `projectId` plus optional unresolved status subset, exact
   category, inclusive minimum priority, 1-50 limit and strict continuation
   cursor. Defaults and status deduplication are deterministic.
3. Canonical MCP project authorization completes before the read service.
   Every repository query is project-leading and foreign/missing projects
   cannot trigger a Recommendation read.
4. Only proposed, snoozed and accepted-without-any-Action Recommendations are
   eligible. Optional statuses only narrow this base scope. Accepted rows with
   an Action of any status and dismissed/merged/superseded rows are excluded
   before ordering and limiting.
5. Root order and cursor semantics are priority descending, createdAt
   descending, then SQLite BINARY/PostgreSQL C ID descending. Cap-plus-one
   yields truthful `hasMore`/`nextCursor`; no total count is claimed.
6. Each card exposes safe title/rationale/category, impact, commercial
   relevance, effort, urgency, confidence, priority, status, review version,
   nullable snooze/review times, creation time and `needsAction`.
7. Each emitted root receives at most five safe code-unit-ordered targets and
   five safe numeric-position-ordered steps, plus exact counts and omission/
   withholding markers. Roots are selected before two bounded project-leading
   bulk child reads; no join-multiplied paging or N+1 occurs.
8. Stored rows exceeding existing 100-target or 100-step integrity bounds are
   rejected before public truncation. URL and prose projection occurs before
   smaller public caps.
9. Strict output excludes run/evidence graph, hashes, evidence refs, dismissal
   and resolution metadata, model/prompt fields, actors, provider/account data,
   secrets and unknown fields.
10. Human text identifies these as saved unresolved Recommendations, summarizes
    current status/components, directs agents to structured targets/steps and
    only mentions continuation when `hasMore` is true. It states current-state,
    not snapshot/total/new-discovery semantics.
11. Tool annotations/description state read-only, non-destructive,
    saved-data-only, zero credits, no provider calls and no writes. No detector,
    Run, provider, LLM or mutation service is invoked.
12. D1/live PostgreSQL repository tests, service/schema tests, MCP auth/output,
    in-process protocol and SAM binding tests pass; existing Growth read tools
    remain unchanged.

# Required checks

- Focused tests, `pnpm ci:check`, full tests, production build and staged
  whitespace checks pass.
- A fresh independent review has no outstanding critical/major finding or
  material verification gap, followed by final acceptance.
- Browser, HTTP, CDP, Playwright and screenshot verification is not run or
  claimed.

# Specialist review focus

Review current-state membership versus stable cursor order, accepted-with-Action
exclusion, filter-before-limit, provider-equivalent ID ordering, child
integrity/bulk bounds, auth-before-read, privacy projection and absence of any
opportunity-discovery or write claim.
