# Goal

Add the first project-level Growth Opportunities inbox by composing the saved,
unresolved Recommendation read model that already exists. The new section makes
the Growth operating layer visible near the top of the page and lets a user open
the existing qualified investigation review controls when an active controller
source is available.

This is BG-0208A: aggregation and review access for saved rule-based
Recommendations. It is not new opportunity discovery, a live provider check, an
AI interpretation path or the deferred `growth_find_opportunities` MCP tool.

# Product outcome

- The Growth page shows an `Opportunities` section immediately after Monthly
  summary and before Check priority pages.
- The section lists the highest-priority unresolved saved Recommendations for
  the current project, with status, rationale, affected targets, bounded next
  steps and the existing priority inputs.
- Proposed and snoozed controller Recommendations can open the existing lazy
  investigation review disclosure. Approval, dismiss, snooze and Review now
  continue through the already-audited investigation path.
- Accepted Recommendations without an Action remain visible as needing action,
  with the existing safe legacy-state explanation when their source can be
  opened.
- Unlinked legacy or non-investigation Recommendations remain visible but
  read-only. Viewing the inbox never adopts, repairs or mutates them.
- The header includes a direct link to the Opportunities section, and loading,
  failure, empty, truncated-page and source-unavailable states are explicit.

# Existing source of truth

Reuse `GrowthPriorityRecommendationsReadService` unchanged as the canonical
current-state feed:

- include `proposed` and `snoozed` Recommendations;
- include `accepted` only until any Action exists;
- exclude dismissed, merged and superseded Recommendations;
- order by priority score, immutable creation time and provider-equivalent
  code-unit ID ordering;
- keep the existing 1-50 cap-plus-one cursor contract;
- retain its project-leading root and child reads, integrity caps and sanitized
  text/URL projection.

Do not extend the MCP-facing priority-Recommendation DTO with Run or Signal
coordinates. ADR-041's public read model remains unchanged.

# App-only projection

Add one strict application DTO which wraps each existing safe Recommendation:

```text
{
  recommendation: <existing safe priority Recommendation DTO>,
  reviewSource: { signalId } | null
}
```

Export the existing individual Recommendation DTO schema for composition, but
do not change its fields or the existing page schema.

Add a bounded, project-leading bulk read to
`GrowthOpportunityDecisionsRepository` for active controller sources belonging
to the emitted Recommendation IDs. It must:

- return only `relationship = controller` rows whose controller is unreleased;
- qualify by the authorized project and the bounded Recommendation ID set;
- return no source for a foreign project, suppressed link or released
  controller;
- avoid any write, lazy adoption or legacy graph inference.

The repository may use the composite Signal Run coordinate internally, but the
app DTO must serialize only the controller Signal ID needed by the existing
investigation boundary. Run IDs and raw graph relationships remain server-only
under ADR-045.

`GrowthOpportunitiesService` calls the existing priority read service first,
then bulk-loads sources only for the emitted page and parses the composed strict
DTO. A missing source is valid and produces a read-only item.

# Authorization and mutation boundary

- Add a TanStack POST server function using `requireProjectContext` and a strict
  validator. POST is only the established transport for parameterized Growth
  reads in this repository (`getGrowthChecksOverview`,
  `getGrowthInvestigation`, `getGrowthWork`, `getGrowthMonthlyReport` and the
  existing preview read all use it); the handler and service remain strictly
  read-only. Do not introduce a one-off GET convention for this sibling read.
- Treat the submitted `projectId` only as route echo; reconstruct the service
  input with `context.projectId` so a forged project cannot select data.
- The inbox service is read-only. It never calls a provider, reserves credits,
  changes Recommendation status or creates an Action.
- When a review source exists, pass only its controller Signal ID to the
  existing lazy `GrowthInvestigation` component.
- The existing investigation server/service path must remain the mutation
  authority. It re-authorizes the project and requalifies the terminal source
  Run, detector Signal, exact template graph and controller relationship before
  any approval or review.
- Do not expose review controls from a suppressed Signal or an inferred legacy
  relationship.

# UI shape

1. Add `View opportunities` to the Growth page section navigation.
2. Render a native section with `id="growth-opportunities"`, a clear explanation
   that these are saved rule-based suggestions, and a manual refresh control.
3. Render each Recommendation as a compact native `details` row so the summary
   remains scannable and the evidence/detail is available without a new route.
4. The collapsed summary includes title, plain-language status and priority.
5. The expanded body includes rationale, affected targets, impact/commercial
   relevance/effort/urgency/confidence, and bounded ordered steps. Existing
   sanitization/truncation flags receive honest omission copy.
6. For a `proposed` or `snoozed` item with `reviewSource`, render the existing
   lazy `GrowthInvestigation` disclosure. Its own qualified status branch is
   still authoritative. An `accepted` item is always read-only in this inbox,
   even if a controller source exists, and explains that the older approval has
   no saved Action. When a proposed/snoozed source is absent, state that review
   controls are unavailable for this older or differently generated saved
   Recommendation; do not imply an error.
7. Use the existing query-key prefix
   `["growthPriorityRecommendations", projectId]` so review mutations refresh
   membership.
8. The first slice displays the top 20 items. If a next cursor exists, say that
   additional lower-priority saved opportunities are not shown yet rather than
   claiming a total. Interactive pagination is deferred to keep this slice
   bounded; the service contract retains its cursor for the next slice.

# Cache consistency repair

Review success already invalidates the priority-Recommendation query. Add the
same invalidation, plus the existing Growth project-summary invalidation, after
successful approval. Otherwise a newly accepted Recommendation with an Action
would remain visibly stale in the inbox until manual refresh.

# Implementation sequence

1. Export the safe Recommendation item schema and add strict app-only
   opportunity request/page schemas with the existing cursor shape reused
   rather than duplicated.
2. Add and test the bounded active-controller bulk read in
   `GrowthOpportunityDecisionsRepository` on SQLite/D1 and PostgreSQL.
3. Add `GrowthOpportunitiesService` as a thin composition layer and test strict
   output, order preservation, nullable sources, bounded source input, project
   separation and absence of serialized Run IDs/raw graph fields.
4. Add the project-context server function and prove forged project input is
   replaced by authenticated context.
5. Add `GrowthOpportunities` plus pure list/detail rendering helpers, integrate
   it into `GrowthPreviewPage`, and patch approval invalidation.
6. Update the rendered Growth contract, focused interaction/accessibility tests,
   ADR and preview guide.

# Constraints and non-goals

- No dependency, migration, schema change, provider call, credential, credit,
  LLM, detector, schedule, alert, report, Measurement, MCP, Action model, auth
  system, separate service or database.
- No read-time legacy adoption, release policy, fuzzy matching, hidden total,
  client-side re-ranking or direct Recommendation mutation endpoint.
- No claim that these Recommendations are newly discovered, exhaustive, causal
  or AI-generated.
- No direct repair for accepted-without-Action legacy records in this slice.
- Dismissed/resolved controllers may keep suppressing repeats while remaining
  absent from this unresolved inbox under conservative policy v1.
- No browser, Playwright, dev server, screenshot, responsive-layout or visual
  quality claim under the standing session constraint. UI evidence is static
  semantic rendering and interaction dispatch tests only.

# Required behaviour

1. Only unresolved saved Recommendations from the authorized project appear;
   foreign-project roots, children and controller sources never leak.
2. Ordering, membership, sanitization, child caps and cursor semantics remain
   exactly those of the existing priority-Recommendation read model.
3. The app-only wrapper preserves every existing safe item field and adds at
   most one optional active controller source without changing the MCP DTO.
4. A controller source is returned only for the exact project, emitted
   Recommendation, controller relationship and unreleased row. Suppressed and
   released rows never grant review access. The client receives only its Signal
   ID, never the internal Run coordinate or relationship row.
5. Opening proposed/snoozed review is lazy and delegates to the existing qualified
   investigation read/mutation path. Rendering or refreshing the inbox never
   mutates data. Accepted-without-Action cards are explicit read-only legacy
   states and never render review or approval controls.
6. Proposed, snoozed and accepted-without-Action states are labelled; no-source
   items are useful read-only cards rather than hidden or treated as failures.
7. Approval, dismissal and snooze refresh inbox membership. Approval also
   refreshes Work and project summary.
8. Loading, retryable failure, empty and top-page-truncated states are
   accessible and do not overclaim completeness.
9. The page's section link resolves to a unique labelled Opportunities region,
   placed before the manual detector surface.

# Verification

- Focused schema, D1 repository, service, server-function, static-render and
  mutation-invalidation tests. The server-function test proves authenticated
  project replacement; service/repository mocks prove the POST query path
  invokes no provider or mutation surface.
- PostgreSQL repository test covering project isolation plus relationship and
  release filtering, using the existing provider-gated test pattern or a
  disposable PostgreSQL 16 database if required by the harness.
- Type check and lint over affected files while iterating.
- Fresh independent code/data/auth review and independent rendered-product UI
  review under the static-evidence boundary; repair verified findings only.
- `pnpm ci:check`, true one-worker full Vitest suite and production build under
  `NODE_OPTIONS=--max-old-space-size=4096`, run sequentially.
- Staged and unstaged whitespace checks plus a staged credential-pattern scan
  before commit.

# Acceptance boundary

Acceptance means a tenant-safe, useful saved-opportunity inbox is implemented,
reviewed, verified and committed. It does not mean generic opportunity
discovery, AI interpretation, scheduled execution, full Opportunity history,
interactive pagination, controller release or live visual QA is complete.
