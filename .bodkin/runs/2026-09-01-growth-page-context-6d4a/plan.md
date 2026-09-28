# Goal

Implement roadmap item BG-0602, `growth_get_page_context`, on the existing
OpenSEO MCP server and in SAM so an agent can inspect one authorised project
page before changing it. The result must combine page protection/priority,
final Search Console performance, saved rank context, open Growth work, recent
changes and active Measurements without overstating freshness or completeness.

# Scope

- Add one strict, read-only `{ projectId, url }` agent tool.
- Compose the current configured key-page row, live first-party GSC facts and
  narrowly selected saved OpenSEO/Growth records.
- Return bounded Recommendations, Actions, Changes, active Measurements, saved
  rank context and top GSC queries with explicit coverage/overflow states.
- Register the shared definition in the existing MCP server and adapt that same
  definition into SAM with a server-bound project.
- Record the page-identity, provider and privacy boundary in the Growth ADRs.

# Relevant areas/files

- `src/server/mcp/project-auth.ts`, `src/server/mcp/server.ts` and
  `src/server/features/sam/samChatTools.ts`: canonical auth and shared adapters.
- `src/server/features/project-context/repositories/ProjectContextRepository.ts`
  and `services/contextUpdateOps.ts`: bounded key-page state and exact curation
  identity.
- `src/server/features/gsc/services/GscService.ts` and
  `searchAnalytics.ts`: existing no-credit Search Console read boundary.
- `src/server/features/growth/services/GrowthTargetNormalizer.ts`: canonical
  workflow URL identity already used by Recommendation, Action, Change and
  Measurement records.
- `src/server/features/growth/services/GrowthEvidencePacket.ts`: established
  credential/email/URL-safe display projectors.
- Growth Recommendation/Action/Change/Measurement schemas and current read
  repositories, plus rank configs, runs, keywords and snapshots.
- Existing BG-0601/BG-0603/BG-0605 tools and integration tests as conventions.

# Implementation approach

1. Define a strict DTO with one `asOf`, an explicit current/non-atomic
   consistency statement, the normative identity scopes below and bounded
   collection shapes.
2. Add page-leading saved-data reads for unresolved Recommendations, current
   Actions, recent URL Changes, active Action Measurements and latest completed
   active-tracker keyword/device snapshots. Keep predicates project-leading,
   use the normative time/state matrix below and apply provider collation.
3. Add an already-authorised service composition. Validate the URL against the
   authorised project's current domain before any repository or provider read,
   derive each documented URL identity, reuse privacy projectors, call the
   existing GSC service with one fixed final-data window, and degrade GSC
   connection/provider failures into a typed unavailable state without losing
   saved context. Extend the existing GSC request builder so an explicit empty
   `dimensions` array means an ungrouped aggregate while omitted dimensions
   retain the existing default query grouping.
4. Add the MCP handler, text response, metadata/deep link and SAM adapter.
5. Add D1 and live PostgreSQL query tests, service/provider/privacy boundary
   tests, auth/tool tests, real in-memory MCP protocol coverage and SAM binding
   coverage, then update the ADR.

# Constraints

- Extend the existing MCP server, auth, database abstraction and GSC service;
  add no service, transport, auth system, dependency, table, migration or queue.
- Page identity is normative and intentionally plural:

  | Scope                            | Construction                                                                                                                                                                                               | Meaning / public disclosure                                                                                                                            |
  | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `key_page_exact`                 | `normalizeKeyPageUrl(input)`: force HTTPS, strip leading `www` and fragment, preserve path/query and URL-standard serialization                                                                            | Only this identity selects curation. Query variants remain distinct. The value is never emitted raw.                                                   |
  | `growth_workflow_host_path`      | existing `normalizeGrowthExactUrls(projectDomain, [input])`: HTTPS + normalized host/path, with query, fragment and trailing slash removed                                                                 | Selects Recommendation, Action, Change and Measurement relations already persisted under this convention. Only its safe display projection is emitted. |
  | `gsc_parsed_requested_url`       | parse the bounded caller HTTP(S) URL, reject credentials, remove only fragment, otherwise retain URL-standard serialized scheme/host/path/query                                                            | Used only as GSC's exact page filter. The transport value and its query never enter output; output carries the scope label and safe display URL only.  |
  | `rank_common_host_path_variants` | from the workflow host/path, deduplicated Cartesian variants of HTTP/HTTPS × bare/leading-`www` host × slash/no-slash for non-root paths (root has one slash form), with no query, fragment or credentials | Filters only the already-selected latest rank winners. The candidates are not emitted.                                                                 |

- URL input is capped at 2,048 characters. A null/invalid authorised project
  domain, invalid URL, credential material or off-domain/subdomain URL fails
  before any page-context repository or GSC call.
- The input must be on the authorised project domain or a subdomain. Validation
  must complete before saved reads or GSC access.
- GSC uses a pure injectable window helper: take the `America/Los_Angeles`
  calendar date containing `asOf`, set `endDate` three days earlier and
  `startDate` 27 days before that. Pass those explicit dates with `web` and
  `final`; never use the convenience-range calculation for this tool.
- Live GSC makes two bounded reads against the same exact parsed URL and window:
  one ungrouped aggregate request (`dimensions: []`, one row maximum) and one
  query request (`dimensions: ["query"]`, `rowLimit: 11`). The request builder
  must omit dimensions for explicit `[]` while keeping the existing default for
  omitted dimensions. Totals come only from the aggregate row, never by summing
  query rows.
- The strict public live-GSC union is either `available` or one of
  `not_connected`, `reconnect_required`, `unavailable`. `available` contains an
  aggregate discriminated as `reported` (including observed zeros) or
  `not_reported`, plus at most ten safe queries and `hasMore`. A missing
  aggregate with query rows, more than one aggregate row, malformed scalar/key
  shape, failure of either subrequest, or different private `siteUrl` values
  from the two independently resolved connections suppresses the entire live
  section. The property values are compared only for integrity and never enter
  public projection or text.
  Only `GscNotConnectedError` maps to `not_connected`; existing expected grant
  failures map to `reconnect_required`; everything else maps to generic
  `unavailable`. It uses no OpenSEO/DataForSEO credits. Raw property, account,
  request, token and provider-error data must never enter the DTO.
- All mutable prose and URLs cross existing credential/email/URL display safety
  before smaller public caps. GSC query strings receive the same treatment.
- Ordinary collections display at most five rows from limit-plus-one reads;
  GSC and rank queries display at most ten. No bounded result claims a total.
- Latest rank eligibility requires the authorised project, an active config, a
  currently present tracking-keyword row, a completed Run with non-null
  `completedAt <= asOf`, and `snapshot.checkedAt <= asOf`. Select exactly one
  winner per config/keyword/device by `completedAt DESC`, `checkedAt DESC`, then
  numeric snapshot ID DESC; only then filter by rank URL variants. Public order
  is concrete position first/null last, then BINARY/C keyword, BINARY/C device,
  BINARY/C tracking-keyword ID and numeric snapshot ID.
- `asOf` is the composition start/cutoff coordinate for immutable or append-only
  facts and the provider window; it is not historical lifecycle reconstruction.
  Mutable rows and relationship tables are current reads and the DTO's
  `current_not_snapshot` statement applies to them. The exact matrix is:

  | Section           | Eligibility at `asOf`                                                                                              | Deliberately current, not reconstructed                                                                                                                                                    |
  | ----------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | key-page curation | current exact-match row; no historical row exists                                                                  | role/protection/topic/notes and relationship presence                                                                                                                                      |
  | Recommendations   | `recommendation.createdAt <= asOf`; current workflow target link                                                   | current status/review fields. Accepted suppression considers any same-project Action with `action.createdAt <= asOf`, regardless of later Action updates                                   |
  | Actions           | `action.createdAt <= asOf`; current workflow target link                                                           | current status, due date, prose and `updatedAt`; an Action updated after `asOf` remains a current-row fact and must not be presented as its earlier state                                  |
  | Changes           | `event.createdAt <= asOf` and `event.happenedAt <= asOf`; current URL link                                         | the link has no creation timestamp, so membership is current                                                                                                                               |
  | Measurements      | `plan.createdAt <= asOf`, current `status = active`, linked Action `createdAt <= asOf`, current Action target link | Plan status and linked Action lifecycle/version are current. A now-completed Plan is excluded even if it was active at `asOf`; Action updates after `asOf` remain current integrity inputs |
  | rank              | strict historical eligibility and winner order defined above                                                       | active-config/current-keyword membership is current by design                                                                                                                              |
  | GSC               | explicit final-data window derived from `asOf`                                                                     | live provider response, not saved or historically reproducible                                                                                                                             |

  Future-created Recommendations, Actions, Changes and Plans cannot qualify or
  displace eligible rows before limits. Tests must also prove that an Action
  with `createdAt <= asOf` but `updatedAt > asOf` remains visible as current
  state and is never described as its historical state.

- SQLite uses BINARY and PostgreSQL uses C for deterministic text/ID ties.
- The user's standing prohibition on browser, HTTP, CDP, Playwright and
  screenshots applies to verification. In-process MCP protocol tests are
  allowed; external transport/consumer probes must be recorded as waived.

# Explicit non-goals

- UI, server functions, public routes, printing, sharing or report changes.
- Provider refreshes other than the explicit GSC read; no DataForSEO call,
  paid research, rank run, audit run or persistence of provider responses.
- Generic Recommendation or Action detail/evidence chains (BG-0604).
- Writes, change recording, scheduling, alerts, notifications or Sherpa/CMS
  integration.
- Historical snapshots, arbitrary page variants, URL semantic equivalence,
  exhaustive totals or causal claims.

# Risks

- URL identities differ upstream. Control: expose and test the three distinct
  match scopes instead of silently treating query variants as equivalent.
- A latest rank result can have moved away from the page. Control: choose the
  latest eligible completed snapshot per active keyword/device before applying
  the page-URL filter.
- GSC can be disconnected, expired, unavailable, partially fail, change its
  selected property between calls or return malformed/contradictory rows.
  Control: validate both independent reads and private property equality before
  any public projection and suppress the whole live section to a safe typed
  state; never echo raw provider errors or property values.
- Limit-before-filter or cross-project joins can produce false completeness or
  leakage. Control: page/project/cutoff predicates precede caps, with foreign,
  future-created, current-state, tie and cap-plus-one fixtures on D1 and
  PostgreSQL.
- Concurrent current-row reads are not atomic. Control: one `asOf` plus explicit
  `current_not_snapshot` consistency wording.
- Query text and user-authored prose can contain credentials or personal data.
  Control: reuse existing safety projection, cap after projection and test
  redaction/omission/withholding.

# Verification plan

- Focused schema, GSC request-builder/window, D1 repository, service, MCP,
  in-memory protocol and SAM tests. Window fixtures cover a normal date, a DST
  transition and a UTC/Pacific date split and prove exactly 28 inclusive days.
- A required live PostgreSQL 16 repository suite for every new ordered query.
  Rank fixtures cover same-time IDs, future completion/capture, removed
  keywords, inactive configs, foreign projects, moved URLs and cap-plus-one on
  both providers.
- Existing Growth project-summary, Action and monthly-summary MCP/SAM
  regressions.
- `pnpm ci:check`, full `pnpm test`, `pnpm build` and staged whitespace checks.
- Fresh read-only adversarial review against this plan, acceptance criteria,
  precise diff and independently recorded `verification.json`.
- Record the standing external HTTP/headless waiver without claiming those
  layers passed.
