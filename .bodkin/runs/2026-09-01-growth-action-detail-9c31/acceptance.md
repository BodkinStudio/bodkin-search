# Acceptance criteria

1. `growth_get_action` is registered on the existing OpenSEO MCP server and
   adapted from the same definition into SAM. The only public input is a strict
   `{ projectId, actionId }` request; SAM removes model-visible `projectId` and
   injects its bound project.
2. Canonical MCP project authorization completes before the detail service.
   Missing and foreign Action IDs are indistinguishable to the caller, the
   service receives only the authorized project/action IDs, and every detail
   query is project-leading.
3. The response is one strict, bounded DTO with canonical `asOf`,
   `current_not_snapshot`, explicit collection coverage/overflow and a
   non-causality marker for Change/Measurement context. Unknown internal fields
   are rejected.
4. Current Action detail includes safe title, description and category;
   priority, status, version, due/milestone/creation/update times; and at most
   20 safe targets plus `hasMore`. Credential/email/URL material is projected
   before public truncation. Owner ID, creation key and fact hash are absent.
5. Lifecycle history returns at most 20 events at or before `asOf`, newest
   numeric version first, plus `hasMore`. It exposes event/version/status/note/
   time only; notes are safely projected and actor IDs/hashes never appear.
6. Source provenance contains only Run type/status/period/start/completion and
   the Recommendation ID/status, safely projected title/rationale/category,
   six scoring facts and creation/review times. It excludes trigger, cadence,
   detector/analysis/model/prompt, cost/failure, review-version, snooze/
   dismissal/resolution and raw fact fields. It returns at most ten safe
   Recommendation targets and ten safe ordered steps, each with overflow.
7. Source evidence returns at most five safely projected Insights in BINARY/C
   ID order and at most five safely projected Signals per emitted Insight with
   per-Insight overflow. Signal numeric facts and evidence kind are preserved,
   raw evidence refs are absent, and no N+1/unbounded graph walk is introduced.
8. Linked Changes include every persisted source, not only manual Events. They
   require both creation and happened time at or before `asOf`, return at most
   ten newest Events plus overflow, and at most five safe URLs per emitted
   Event plus overflow. Descriptions and URLs are safely projected; actor,
   external reference and private graph fields are absent. One project-leading
   bulk SQL window retrieves no more than six code-unit-ordered URLs per emitted
   Change and derives URL overflow from the sixth row.
9. No linked Plan yields `measurement: none`. A linked Plan passes the existing
   validator and exposes only its ID/status/Action version, linked-vs-legacy
   anchor state, timezone/comparison/schedule/due/completion fields, at most ten
   Metrics plus overflow, and an optional Result. Metric entity keys use the
   correct URL/text projection; observations contain period/effective dates,
   numeric value/completeness/capture time; comparisons contain only derived
   nullable numbers. Result contains outcome/confidence, safely projected
   1,000-character summary, evaluated time and exact surviving confounder-link
   count. Raw evidence refs, Change IDs/details, hashes, actor/model/prompt and
   provider fields are absent.
10. Measurement graph reads are storage-bounded at 51 Metrics, 151
    Observations and 51 Result-confounder links, reject data above the existing
    50/150/50 write bounds, and select only Action lifecycle versions
    `plan.actionVersion` and `plan.actionVersion + 1`. Valid active/completed
    behavior and legacy stored Plan fact hashes remain unchanged: validator
    Metric order keeps its exact existing semantics. Only the post-validation,
    at-most-50 public Metric projection is code-unit sorted before its ten-row
    display cap. The normalized implementation Change is the anchor; legacy
    absence is explicit; confounder links are current/non-causal.
11. SQLite handles mixed default/ISO timestamps semantically for event/Change
    cutoffs. Every new detail-query and public-projection text/ID tie uses SQLite
    BINARY/PostgreSQL C or equivalent code-unit order; the legacy immutable-fact
    ordering exception is explicit. D1 and live PostgreSQL fixtures prove
    filter-before-limit, per-Change URL windows, caps, ties, all-source Change
    inclusion and foreign-project exclusion.
12. Human MCP text leads with Action/status, summarizes bounded history,
    evidence, Change and Measurement availability, directs the agent to the
    structured chain, and makes no total/completeness/causality claim.
13. The tool is read-only, non-destructive, saved-data-only and zero-credit. It
    performs no GSC/DataForSEO/other provider call, workflow/run start or write,
    and returns standard project metadata plus a Growth deep link.
14. Existing `growth_get_actions`, project/page/monthly summary MCP behavior and
    SAM bindings remain unchanged. No dependency, final schema, new migration,
    billing, auth, transport, scope, route, server function, UI, print, share or
    scheduling change is added. The existing `0029_fine_jackal.sql` statements
    may be reordered solely so its referenced unique constraint precedes its
    composite foreign key; the journal, snapshot and resulting schema remain
    unchanged, and a fresh PostgreSQL 16 migration must pass.

# Required checks

- Strict schema, service/privacy, D1 repository, MCP handler, in-memory protocol
  and SAM tests pass.
- Required live PostgreSQL 16 detail-repository tests pass.
- Adjacent Growth agent regression tests pass.
- `pnpm ci:check`, full tests, production build and staged whitespace checks
  pass.
- External browser/HTTP/headless verification is explicitly waived and not
  claimed.
- A fresh adversarial review has no outstanding material or evidence findings.

# Specialist review focus

Fresh review must explicitly inspect auth-before-read, project isolation,
privacy projection, graph bounds/N+1 behavior, all-source Change inclusion,
Measurement validator reuse, timestamp/provider parity, truthful current-view
wording and absence of provider/mutation/credit paths.
