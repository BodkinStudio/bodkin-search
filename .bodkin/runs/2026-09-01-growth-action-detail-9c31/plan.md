# Goal

Implement roadmap item BG-0604, `growth_get_action`, on the existing OpenSEO
MCP server and in SAM. The tool gives an agent one safe, project-authorized,
saved-data view of an Action and the topology that explains it: lifecycle,
source Recommendation evidence, linked Changes and optional Measurement.

“Full chain” means a bounded complete-topology orientation with explicit
overflow, not exhaustive raw history or evidence export.

# Scope

- Add one strict, read-only `{ projectId, actionId }` tool.
- Return the current Action, safe targets, bounded lifecycle history, source
  Run/Recommendation/Insight/Signal topology, all-source linked Change Events,
  and an optional validated Measurement Plan/Result projection.
- Register one shared definition in the existing MCP server and adapt it into
  SAM with its project bound server-side.
- Record the saved-chain, privacy and boundedness boundary in the Growth ADRs.

# Relevant existing code

- `src/server/mcp/project-auth.ts`, `server.ts` and
  `src/server/features/sam/samChatTools.ts`: canonical authorization and shared
  tool adaptation.
- `GrowthActionsRepository.ts` and `GrowthActionsReadService.ts`: current Action
  reads plus proven narrative/target display safety.
- Growth Run, Signal, Insight and Recommendation normalized schemas: immutable
  evidence topology and same-project/run foreign keys.
- `GrowthChangeEventsRepository.ts`: Change graphs, but its existing
  Action-linked bulk read is intentionally manual-only and cannot serve this
  generic detail.
- `GrowthMeasurementsService.getMeasurement`: required stored Measurement
  integrity validation and derived comparisons.
- `GrowthEvidencePacket.ts`: canonical credential/email/narrative/URL display
  projectors.
- BG-0601/0602/0603/0605 MCP tools and in-process protocol/SAM tests: current
  conventions.

# Implementation approach

1. Define a strict request and nested DTO. It carries one `asOf`,
   `consistency: current_not_snapshot`, per-collection coverage, and an explicit
   `changesAreTemporalContextNotCausalProof` truthfulness marker.
2. Add a focused Action-detail repository with project-leading, narrow reads:
   - Action + source Recommendation + source Run;
   - Action and Recommendation targets;
   - recent Action events at or before `asOf`;
   - Recommendation steps and Insights;
   - bounded Insight→Signal rows for only the emitted Insights;
   - all-source Action-linked Change Events at or before `asOf`, then bounded
     URLs for only the emitted Events. One project-leading bulk window query
     partitions by Change ID and retrieves only the first six BINARY/C-ordered
     URLs per emitted Change.
3. Add an already-authorized detail service. It composes those saved reads,
   reuses the existing display projectors, calls
   `GrowthMeasurementsService.getMeasurement` only when a same-project Plan is
   linked, maps a bounded safe Measurement summary, and parses the final DTO.
4. Make the shared Measurement validator's storage reads explicitly bounded:
   `getMeasurementGraph` reads at most 51 Metrics, 151 Observations and 51
   Result-confounder links and only the lifecycle events at `actionVersion` and
   `actionVersion + 1`. `assertStoredMeasurementGraph` rejects collections over
   the existing 50-Metric, 150-Observation and 50-confounder write bounds before
   deriving facts. This preserves validation while removing the current
   lifetime Action-history read for every existing Measurement caller.
5. Add the MCP handler and human summary, standard metadata/deep link, existing
   server registration and shared SAM adapter.
6. Add D1 and live PostgreSQL query fixtures, service/privacy/integrity tests,
   handler/auth tests, real no-network MCP protocol coverage, SAM binding
   coverage and the ADR.

# Normative bounds and ordering

- Action targets: 20 displayed from a limit-21 read, code-unit target type/value
  order, with `hasMore`.
- Action history: latest 20 from a limit-21 read, numeric version descending,
  with `hasMore`. No actor ID or fact hash is public.
- Recommendation targets and ordered steps: 10 each from limit-11 reads, with
  `hasMore`; steps order by numeric position.
- Insights: first five by SQLite BINARY/PostgreSQL C ID from a limit-six read.
  Each emitted Insight contains at most five Signals, code-unit ordered, with
  per-Insight `hasMore`. The repository retrieves no more than six Signal links
  per emitted Insight.
- Linked Changes: latest ten from a limit-11 read by `happenedAt DESC`, then
  BINARY/C ID. Each emitted Change contains at most five URLs in code-unit order
  with `hasMore` derived from the sixth row. The bulk URL read is bounded to six
  rows per emitted Change in SQL; all persisted sources qualify.
- Measurement metrics: after the complete bounded graph passes immutable fact
  validation, the service code-unit-sorts its at-most-50 Metrics by type,
  entity type, entity key and internal ID for public display, then emits ten
  with `hasMore`. Each emitted Metric may carry only its three defined period
  observations and derived comparison. Result confounding Change
  details and IDs are not duplicated; the Result carries only the exact count
  after the validator has enforced its 50-link storage bound.
- Internal Measurement validation is bounded independently of public display:
  51/151/51 limit-plus-one reads prove stored Metric, Observation and surviving
  confounder-link integrity, and the Action-event read selects only the one or
  two exact lifecycle versions the validator consumes.
- The shared `listMeasurementMetrics` order used by `storedPlanFact` hashing is
  deliberately unchanged, including its legacy provider-default text order.
  Its only repository change is the limit-51 integrity sentinel. Provider
  code-unit parity applies to the separate public projection after validation,
  so existing stored Plan hashes remain valid.

# Time and state semantics

- `asOf` is captured before detail reads. Action and Recommendation rows,
  current targets/relations, current Recommendation status, and current
  Measurement lifecycle are not historical reconstructions.
- Append-only Action events require `createdAt <= asOf`; linked Changes require
  both `createdAt <= asOf` and `happenedAt <= asOf`. SQLite comparisons accept
  both default space timestamps and canonical ISO timestamps; PostgreSQL keeps
  its canonical text semantics.
- Source Run/Insight/Signal/Recommendation topology is immutable for the saved
  Action's source graph, but links can disappear through cascades. The overall
  composition remains `current_not_snapshot` and is never described as atomic.
- Active Measurement integrity is whatever the existing validator accepts:
  Plan status active with the measuring transition at `actionVersion` and no
  Result. Completed integrity requires the evaluated transition at
  `actionVersion + 1` and matching frozen observations. The implementation
  anchor is the explicit normalized manual Change link; a valid legacy Plan may
  have no link.

# Privacy and public contract

- Canonical MCP authorization runs before the detail service. Missing or
  foreign Action IDs return the same not-found result; every descendant query
  is project-leading.
- Sanitize before smaller public caps. Action/Recommendation/Insight/event/
  Change/Result prose and non-URL references use the established safe text
  projection. URL targets, Change URLs and Measurement URL entity keys use the
  established safe URL projection with omission/withholding flags.
- Public source Signal facts may include ID, signal/entity/metric types,
  safely-projected entity reference, severity, confidence, periods, numeric
  baseline/current/deltas, evidence kind and capture time. Raw evidence refs
  never cross the boundary.
- Exclude owner and actor IDs, creation keys, hashes, internal run cadence,
  model/prompt fields, provider costs/failures, external refs, raw observation
  evidence refs and organization/account/provider metadata.
- Changes and selected Measurement confounders are temporal context, never a
  causal claim. Result-confounder relationships reflect only current surviving
  links.

The strict public allowlist is:

- source Run: `runType`, `status`, `periodStart`, `periodEnd`, `startedAt` and
  nullable `completedAt` only;
- Recommendation: ID, current status, safe title (300), safe rationale (1,000),
  safe category (100), six numeric scoring facts, `createdAt` and nullable
  `reviewedAt`; no review version, snooze/dismissal/resolution coordinate or
  model provenance;
- Action: ID, safe title (300), safe description (1,000), safe category (100),
  priority, current status/version, due/approved/started/implemented/evaluated/
  cancelled/created/updated times and safe targets;
- Action event: numeric version, event type, from/to status, nullable safe note
  (500) and created time only;
- Insight: ID, safe title (300), safe explanation (1,000), safe hypothesis
  (1,000), confidence and creation time;
- Signal: ID; safe signal type (100), entity type (100), entity reference (500)
  and metric (200); severity, confidence, period dates, numeric baseline/
  current/delta/percent facts, evidence kind and capture time;
- Change: ID, source, type, safe description (500), happened time and safe URLs;
- Measurement Plan: ID, status, Action version, explicit linked-vs-legacy anchor
  state, anchor time/date, report timezone, comparison mode, schedule dates, due
  date and nullable completion time;
- Measurement Metric: type, entity type, primary flag, URL-safe or text-safe
  entity key, period/effective dates, numeric value/completeness/capture time and
  derived nullable comparison numbers;
- Measurement Result: outcome, confidence, safe summary (1,000), evaluated time
  and exact currently-surviving confounder-link count only.

Every safe narrative is `{ value, redacted, truncated }`. Non-URL narrative and
references use `growthEvidenceDisplayActionText`, Change descriptions use
`growthEvidenceDisplayChangeDescription`, Result summary uses
`growthEvidenceDisplayMeasurementSummary`, and URL values use
`growthEvidenceDisplayUrl` with omission/withholding flags. Stored columns not
named in this allowlist are excluded.

# Constraints

- Reuse the existing database abstraction, auth, MCP server, SAM adapter,
  normalized Growth tables, Measurement validator and privacy projectors.
- No dependency, schema, migration, service transport, provider fetch, credit
  use, mutation, route, server function, UI, print, share, scheduler or separate
  Growth API is added.
- Do not compose `growth_get_page_context`; it intentionally performs live GSC
  reads and is outside this saved-data-only tool.
- The user's standing prohibition on browser, HTTP, CDP, Playwright and
  screenshots applies. In-process MCP protocol tests are allowed.

# Discovered deployment prerequisite

Fresh PostgreSQL verification exposed an existing ordering defect in the latest
`0029_fine_jackal.sql` migration: it attempted to add the Measurement anchor's
composite foreign key before adding the exact referenced composite unique
constraint. The smallest prerequisite repair is to reorder those two existing
statements. This changes no final schema, journal, snapshot or application
model, and is verified by migrating a new empty PostgreSQL 16 database. No new
migration or schema object is introduced.

# Verification plan

- Strict DTO and service tests cover every empty/overflow/privacy/integrity
  state, missing/foreign Actions, no-Measurement and validated active/completed
  Measurement branches.
- D1 and required live PostgreSQL 16 fixtures cover project isolation,
  all-source Changes, filter-before-limit, mixed SQLite timestamps, caps and
  deterministic provider ties for every new detail query. Change-URL fixtures
  prove the six-row-per-Event SQL window and overflow.
- Shared Measurement repository/service regressions prove exact-version event
  selection, 51/151/51 overflow rejection and unchanged valid active/completed
  graph validation on D1 and PostgreSQL. Ordering-sensitive legacy metric facts
  remain valid while the separate public display has code-unit parity.
- MCP auth/output/text, real no-network client/server protocol and SAM
  bound-project tests pass, along with existing Growth Action/page/summary
  regressions.
- Run `pnpm ci:check`, the full test suite, production build and staged
  whitespace checks. Record commands in `verification.json` before a fresh
  adversarial review.

# Explicit non-goals

- Exhaustive or paginated raw evidence/history export.
- Owner display, Action writes, transition controls, provider refresh, causal
  attribution, historical snapshots or arbitrary evidence graph traversal.
- Replacing the focused Work/Measurement UI read model.

# Risks

- A naïve normalized-graph walk can become N+1 or enormous. Control with
  project-leading bulk/window reads and the fixed bounds above.
- Raw graph rows contain sensitive operational fields. Control with narrow
  selections, safe projection and strict schemas/tests.
- Current mutable state can change across reads. Control with one coordinate
  plus explicit non-snapshot wording rather than false atomicity.
- Existing manual-only Change reads would silently omit valid sources. Control
  with a new all-source detail read and cross-source fixtures.
