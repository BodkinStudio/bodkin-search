# Required behaviour

1. `growth_get_page_context` is registered on the existing OpenSEO MCP server
   and mirrored from the same definition into SAM; no second server or adapter
   definition is created.
2. Canonical MCP project authorization completes before the service. The
   service receives only the already-authorised project's allowlisted ID/domain
   fields, and an off-domain, credential-bearing or invalid URL is rejected
   before repository or GSC access.
3. Output is a strict, bounded, privacy-safe DTO with one canonical `asOf`, an
   explicit `current_not_snapshot` consistency statement and a safe display URL
   that never echoes query, fragment, embedded credentials or email material.
4. Identity is truthful and tested: `key_page_exact` preserves query
   distinctions after key-page normalization; `growth_workflow_host_path` uses
   existing canonical host+path semantics; `gsc_parsed_requested_url` uses the
   URL-standard serialized credential-free caller URL with only its fragment
   removed; `rank_common_host_path_variants` is exactly HTTP/HTTPS × bare/`www`
   × applicable slash/no-slash, deduplicated with no query or fragment. GSC
   transport and rank candidate values never enter structured or text output.
5. Curation reports `curated` or `not_curated` and, when curated, exposes only
   safe role, commercial weight, protected, actively-optimised, topic, notes and
   update-time fields with truthful post-projection redaction/truncation flags.
6. Search performance is explicitly `live_gsc_final` for 28 inclusive Pacific
   calendar days ending three days before `asOf`, `gsc_parsed_requested_url`,
   `web` and `final`, using explicit dates from a pure injected Pacific helper.
   One ungrouped aggregate request supplies totals; a separate query request
   fetches eleven rows for a ten-row display and `hasMore`. `available`
   distinguishes `reported` aggregate facts (including zeros) from
   `not_reported`; totals are never derived from top queries. A missing
   aggregate with query rows, malformed/extra rows, or failure of either request
   suppresses the whole live section to `not_connected`, `reconnect_required`
   or generic `unavailable`. The two private selected-property values must also
   match; property drift maps to generic `unavailable`. Provider
   property/account/request/error details never leak and GSC failure does not
   hide saved page context.
7. Tracked-query context uses saved rows only. Eligibility requires the same
   project, active config, currently present keyword, a completed Run with
   non-null `completedAt <= asOf`, and `checkedAt <= asOf`. It chooses one winner
   per config/keyword/device by completed time, checked time and numeric snapshot
   ID descending before URL filtering, exposes no raw SERP JSON/provider
   metadata, and returns at most ten rows plus truthful `hasMore` with concrete
   positions before null then BINARY/C keyword, device, tracking-keyword ID and
   numeric snapshot ID ties.
8. Page Recommendations use the same unresolved rule as the project summary:
   proposed, snoozed and accepted-without-same-project-Action only. They are
   URL/project filtered with `createdAt <= asOf` before a stable
   priority/recency cap of five plus `hasMore` and expose only safe summary
   fields. Status/review and target-link membership are explicitly current, not
   reconstructed. Accepted suppression considers same-project Actions created
   at or before `asOf`, regardless of later Action updates.
9. Page Actions use the six nonterminal operational states, remain separate
   from detector-qualified Work, are URL/project filtered with
   `createdAt <= asOf` before a stable priority/due cap of five plus `hasMore`,
   and expose only safe summary fields. Status, due/prose, target-link membership
   and `updatedAt` are current rows; `updatedAt > asOf` does not reconstruct or
   silently substitute an earlier state.
10. Recent Changes come from exact same-project workflow URL links, apply
    both `createdAt <= asOf` and `happenedAt <= asOf` before the recency cap,
    return at most five plus `hasMore`, and expose only safe
    source/type/time/description fields without actors, external references,
    hashes or raw URLs. URL-link membership is disclosed as current.
11. Active Measurements belong to Actions targeting the workflow URL, are
    same-project with Plan and Action `createdAt <= asOf`, use current active
    Plan status and current Action target/lifecycle/version, and are filtered
    before limiting. They return at most five plus `hasMore` in final-window/ID
    order and expose safe frozen dates plus explicit current Action integrity
    without claiming historical Plan state, evidence completeness, readiness or
    causality. A now-completed Plan is not reconstructed as active at `asOf`.
12. Every saved-data query has project-leading predicates, narrow selections,
    the section-specific time/state semantics above before limits, and
    deterministic SQLite BINARY/PostgreSQL C ties. D1 and live PostgreSQL
    fixtures prove caps, ties, future-created exclusion, current lifecycle
    treatment and foreign-project isolation.
13. The tool is read-only, non-destructive and bounded. It uses no OpenSEO or
    DataForSEO credits, starts no rank/audit/workflow run, persists nothing, and
    returns standard project metadata plus a Growth deep link.
14. SAM removes model-visible `projectId`, injects its bound project server-side
    and preserves URL input and the shared tool definition.
15. No dependency, schema, migration, billing, auth, scope, transport, public
    route, server function, UI, print, share or scheduling change is added.

# Required checks

- Strict input/DTO and privacy/boundary service tests pass, including the
  explicit-empty-dimensions GSC aggregate builder, exact 28-day Pacific windows
  across normal/DST/UTC-split instants, all URL identities,
  off-domain-before-read, GSC reported-zero/not-reported/partial-failure/grant/
  malformed/property-drift branches with property/account/request non-leakage,
  query/prose safety, rank freshness and every cap-plus-one projection.
- SQLite/D1 and required live PostgreSQL 16 tests pass for Recommendation,
  Action, Change, Measurement and latest-rank page reads.
- MCP auth/output/text, real no-network MCP client/server protocol and SAM
  bound-project tests pass.
- Existing project-summary, Action and monthly-summary MCP/SAM regressions pass.
- Focused tests, `pnpm ci:check`, full tests, production build and staged
  whitespace checks pass.
- `verification.json` records independently executed commands/results before
  implementation review; a fresh adversarial review has no outstanding
  findings.
- External HTTP/headless probes are explicitly waived and not claimed.

# Regression constraints

- Existing project context, GSC, rank tracking, Growth summary, Action list,
  Work and monthly-summary behaviour does not change.
- GSC failure cannot suppress or mutate saved context, and no other provider is
  reachable from the tool.
- Current-row composition is never presented as an atomic or historical
  snapshot, and bounded lists never claim totals.
- Page matching cannot broaden an authorised project's domain or cause another
  project's rows to qualify.

# Important edge cases

- Root pages, subdomains, `www`, HTTP/HTTPS, trailing slashes, query strings and
  fragments follow their documented identity scopes rather than one implicit
  equivalence rule.
- A stored key page with a different query is not silently treated as the exact
  curated page, while its host+path Growth work can still be disclosed under
  the broader workflow identity.
- An accepted Recommendation with a same-project Action is excluded; a foreign
  Action with a colliding ID or Recommendation relation does not suppress it.
- A tracked keyword whose latest completed snapshot moved to another URL is not
  returned because an older snapshot matched this page.
- Same-time rank snapshots are resolved by the newer eligible completed Run,
  then checked time, then numeric snapshot ID; a future-completed Run or future
  snapshot cannot displace the latest eligible fact.
- Null rank positions sort after concrete positions; zero GSC totals remain
  facts and differ from no reported row.
- Future-created Recommendation, Action, Change and Plan rows do not displace
  eligible rows before caps. A pre-existing Action updated after `asOf` remains
  visible only as current state, never as a reconstructed earlier lifecycle.

# Product / UX requirements

No application UI changes. Human-readable MCP text must lead with whether the
page is protected/curated, state whether GSC context is available, summarize
the bounded work/change/measurement counts, and direct the agent to structured
content for full safe details.

# Specialist review requirements

Fresh adversarial review must explicitly inspect auth-before-read, URL scope,
privacy projection, provider-error handling, cutoff/cap ordering, latest-rank
selection and SQLite/PostgreSQL parity. Browser/UI review is not required.
