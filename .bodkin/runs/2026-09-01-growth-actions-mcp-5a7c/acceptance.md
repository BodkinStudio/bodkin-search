# Required behaviour

1. `growth_get_actions` is registered on the existing OpenSEO MCP server and
   mirrored from the exact same definition into SAM; no second server or
   transport is created.
2. Input is limited to project scope, bounded status/category/minimum-priority
   filters, a maximum-50 limit and optional strict creation cursor.
3. Canonical MCP project authorization completes before the read service runs;
   foreign or archived projects cannot reach Action storage.
4. The read covers all project Actions rather than only priority-page
   investigation Work.
5. Pagination uses immutable `(createdAt DESC, code-unit id DESC)` keyset order,
   project-leading/filter predicates and `limit + 1`; `nextCursor` is the last
   emitted row only when more data exists.
6. The read service bulk-loads only emitted Action targets, enforces the stored
   100-target invariant, and displays at most five targets per Action.
7. The strict DTO exposes only approved Action summary fields and safe target
   projections. It excludes Recommendation/run IDs, owner IDs, creation keys,
   hashes, actors, event notes and raw rows.
8. Mutable title, description, category and non-URL target prose use the
   existing Growth credential/email/URL projection. URL targets disclose
   query/fragment omission or complete withholding.
9. Description output is capped at 400 characters with truthful redaction and
   truncation state. Overall output is bounded to 50 Actions.
10. The tool is read-only, closed-world, non-destructive, saved-data-only,
    zero-credit and provider-free. It invokes only
    `GrowthActionsReadService.listActions` after authorization.
11. Human text truthfully covers empty/populated pages and directs callers to
    the structured `nextCursor` only when another page exists.
12. Standard metadata contains the authorized project ID and Growth Work deep
    link.
13. SAM removes model-visible `projectId`, injects the bound project server-side
    and preserves all remaining filters/cursor values.
14. ADR documentation records that this is a current sanitized list, not an
    Action history, detail chain, historical snapshot or write capability.
15. No dependency, schema, migration, provider, billing, auth, scope, transport,
    public route, server function, UI or print change is added.

# Required checks

- Strict schema/default/filter/cursor tests pass.
- SQLite/D1 query coverage and provider-specific ordering/query coverage against
  a disposable Postgres 16 fixture both pass. Postgres execution is required,
  not conditional, for this dialect-bearing change.
- Service privacy, bounds and pagination tests pass.
- MCP auth/output/text and SAM bound-project tests pass.
- A real no-network MCP client/server `tools/list` and `tools/call` test passes.
- Existing Growth Action, Work and monthly-summary MCP regressions pass.
- Focused tests, `pnpm ci:check`, full tests, production build and whitespace
  checks pass.
- `verification.json` records the exact independent commands, results and
  Postgres fixture outcome before implementation review.
- Fresh adversarial review has no outstanding findings.
- External HTTP/headless-consumer probes are explicitly not run under the user
  constraint and are not claimed as passed.

# Regression constraints

- Existing Action write/lifecycle/history/detail behavior does not change.
- Existing qualified Work UI reads do not change.
- Existing monthly-summary MCP/SAM behavior does not change.
- Pagination never relies on mutable fields or provider-default ID collation.
- No hidden fallback broadens Action scope, filters or authorization.
