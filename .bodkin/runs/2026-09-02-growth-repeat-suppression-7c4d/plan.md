# Goal

Land the concurrency-safe foundation of BG-0207 for the existing deterministic
priority-page click-decline path. Every new detector Signal remains an immutable
fact, but one project/page/metric issue has only one active controlling
Recommendation across Runs. A later equivalent Signal is linked to that
controller and shown as covered instead of creating another Insight,
Recommendation or Action opportunity.

This is intentionally the smallest suppression slice. It does not yet release a
controller after material evidence change or completed/evaluated work. That
requires a separately reviewed, versioned product policy rather than an
unreviewed threshold hidden in persistence code.

# Product outcome

- Repeating the same priority-page decline check still records the new Signal
  and its current-period evidence.
- If an equivalent saved investigation already controls the issue, the new
  Signal does not create another Insight or Recommendation.
- Its investigation disclosure explains that the decline is covered by the
  existing suggestion, prior decision or work. No approval, dismiss or snooze
  mutation is offered from the suppressed Signal.
- Existing pre-ledger deterministic investigations are adopted lazily and
  deterministically before a new controller can be created.
- Exact request replay continues to return the already-recorded decision.

# Storage decision

Add one normalized dual-dialect relation,
`growth_recommendation_signal_links`, inside the existing Growth database.

Each row contains:

- project, Signal Run and Signal identity;
- a 64-character stable dedupe key derived from the closed semantic coordinate
  `priority_page_click_decline / key_page / key-page-id / gsc_clicks`;
- the controlling Recommendation identity;
- relationship `controller` or `suppressed`;
- a closed nullable suppression reason;
- the versioned policy identifier;
- nullable controller release time and immutable creation time.

Constraints:

- one decision per project/Signal coordinate;
- one controller row per project/Recommendation;
- one unreleased controller per project/dedupe key through a mirrored partial
  unique index on both SQLite/D1 and PostgreSQL;
- a same-project composite Signal foreign key that cascades only its own link
  row, plus a same-project Recommendation foreign key that restricts deletion
  while any retained Signal decision still points at that controller;
- checks require no suppression reason for a controller, a closed reason for a
  suppressed row, and allow release metadata only on a controller.

`controllerReleasedAt` is included because release is a concrete BG-0207
requirement, but this slice never writes it. All decisions in policy v1 are
conservative and unreleased.

# Stable identity and replay

- The dedupe key hashes only the semantic issue coordinate and project-scoped
  key-page ID. Detector, template and policy versions are stored separately and
  do not change identity.
- Candidate Insight and Recommendation IDs are deterministic from project,
  dedupe key and the initial-controller generation. Concurrent Runs therefore
  contend on the same parent identities even though their Signal facts differ.
- The per-Signal unique coordinate is the exact retry identity. Once a decision
  exists it is returned unchanged and never reevaluated or remapped.
- Deleting a later suppressed Signal/Run removes only its link. Deleting a
  controller Recommendation/Run is rejected while retained Signals depend on
  it. Whole-project deletion must still cascade successfully. Exact replay is
  therefore guaranteed for as long as the decided Signal itself is retained.
- Existing per-run creation keys and immutable fact hashes remain the graph
  winner checks; a losing candidate cannot attach its children to a winner with
  different facts.

# Implementation approach

1. Add the relation to both Growth Insight schemas, export it through the
   existing D1/Postgres barrels, generate both migration artifacts and extend
   schema/migration tests. There is no destructive backfill.
2. Factor the existing Insight/Recommendation fact preparation and graph
   statement construction only as far as needed so the current creation service
   and the new atomic decision writer share normalization, hashing and child
   integrity rules. Existing public create behavior must stay unchanged.
3. Add a narrow `GrowthOpportunityDecisionsRepository` read surface:
   - read an exact Signal decision;
   - read the active controller and safe Recommendation/Action state;
   - locate one deterministic legacy priority-page controller for a key-page;
   - read a decision after commit.
4. Add a sibling atomic graph writer using `runBatch`:
   - conditionally adopt a supplied, repository-qualified legacy controller;
   - create a deterministic candidate Insight/Recommendation graph only while
     no active controller exists and the source Run is running;
   - insert the controller link only from the complete stored candidate graph;
   - otherwise insert the current Signal as suppressed by selecting the active
     controller;
   - qualify every adoption, controller and suppression statement against the
     current Signal and its still-running current Run;
   - use provider-portable broad conflict-ignore and reread the Signal decision.
     PostgreSQL serializes on deterministic parent IDs and the partial unique
     claim; D1 uses the ordered atomic batch. No Recommendation is created before
     the claim in another transaction.
5. Add `GrowthOpportunityDecisionsService.recordPriorityPageInvestigation`.
   It validates the closed detector/template source, computes the stable key,
   prepares the candidate graph, delegates the atomic decision and returns a
   strict internal result. A legacy candidate qualifies only through one exact
   completed/completed-with-errors manual detector Run, its priority-decline
   Signal, the template-derived Insight and Recommendation creation keys, one
   complete direct graph, the investigation category and matching project/
   key-page coordinate. Unrelated same-page graphs are ineligible. Candidates
   are chosen deterministically, preferring an accepted Recommendation with the
   one exact template-derived Action creation key, then snoozed, proposed,
   accepted-without-that-Action, dismissed and finally resolved records. Extra
   Actions never influence selection or projection. Ties normalize timestamps
   per provider and use explicit PostgreSQL `C` versus SQLite `BINARY`
   code-unit ID ordering.
6. Replace the two-step Insight then Recommendation creation in
   `GrowthPriorityPageCheckService` with the decision service. Signal creation,
   provider behavior and analysis-version semantics stay unchanged. A
   suppressed Signal is a successful analyzed outcome, not a Run error. Track
   committed decisions during the loop: if a later Signal decision fails after
   at least one controller/suppression decision committed, preserve the partial
   analysis as `completed_with_errors` with the existing safe generation failure
   code instead of marking its source Run failed and making the controller
   unreadable. Failure before any decision remains failed. Every committed
   controller therefore finishes on a source Run accepted by investigation
   reads.
7. Make the investigation read projection a strict discriminated union:
   - `controller` keeps the existing full investigation card;
   - `suppressed` contains only safe controlling status/title, decision reason,
     policy version and optional Action link. It excludes the old rationale,
     steps and target evidence so prior-period facts are not presented as the
     current Signal's evidence.
     Review and approval service methods must reject a suppressed Signal even
     though its read can show the controller.
8. Patch the existing disclosure with a read-only covered state. Use the current
   native/card vocabulary and Work anchor when an Action exists. Do not add a
   new page or project-level opportunity inbox.
9. Add ADR-046 and update the preview guide with the conservative v1 boundary
   and explicit deferred material-change/release policy.

# Closed suppression reasons

Decision-time reasons are derived from the stored controller state inside the
atomic writer so a stale preflight read cannot mislabel the saved fact:

- `existing_proposal`;
- `existing_snooze`;
- `prior_dismissal`;
- `existing_action`;
- `accepted_without_action`;
- `resolved_recommendation`.

The controller Recommendation may change later; the saved reason remains the
reason the new Signal was suppressed at decision time.

# Constraints and non-goals

- No new dependency, provider call, credential, credit use, LLM, detector,
  schedule, alert, report, Measurement, MCP, SAM, auth system, database service
  or Action mutation.
- No fuzzy/semantic URL matching. Identity follows the explicit key-page record
  referenced by the Signal.
- No controller release, automatic snooze wake-up, dismissed restoration,
  cooldown, magnitude threshold or material-change claim in this slice.
- No new delete UI or delete service. A suppressed Signal/Run may retain the
  existing cascade of its own link. Controller Recommendation/Run deletion is
  intentionally restricted while another retained Signal depends on that
  decision; whole-project deletion still cascades all project data. No silent
  decision remap is allowed.
- No legacy data rewrite during migration. Legacy adoption occurs only through
  a project-qualified transactional path when that issue is next observed.
- Suppressed Signals cannot approve or review the old Recommendation through
  their own mutation endpoint.
- No visual/responsive-quality claim. This is a local non-material UI patch;
  the standing browser/screenshot prohibition limits UI evidence to static
  semantic rendering and dispatch tests.

# Required behaviour

1. Two sequential Runs for the same project/key-page issue save two Signals,
   one controller link and one suppressed link, but only one complete Insight
   and Recommendation graph.
2. Different key pages and different projects receive independent controllers.
3. Exact retry for a decided Signal returns the same controller, relationship,
   reason and policy version without another graph write.
4. A deterministic legacy investigation is adopted before candidate creation;
   unrelated Recommendation categories/templates, malformed multi-source
   graphs and non-template Actions cannot become controllers or determine Work
   projection. Selection order is identical on D1 and PostgreSQL.
5. Concurrent PostgreSQL generation for the same issue produces exactly one
   complete controller graph. The loser receives a suppressed link to the
   winner; no orphan Insight/Recommendation/child row remains.
6. Controller status at decision time maps to the closed suppression reason.
   All v1 controllers remain active, including dismissed, snoozed and accepted
   records.
7. The current Signal's read either returns its own controller card or a strict
   read-only covered projection. Old evidence fields never appear in the
   suppressed projection.
8. Review and approval retain source qualification and operate only on a
   controller relationship or the exact legacy direct graph. Forged project
   selection and suppressed-Signal mutation remain impossible.
9. A generation failure after an earlier committed decision yields a terminal
   `completed_with_errors` source whose controller remains readable. Failure
   before any decision leaves no active controller and retains failed status.
10. Deleting a suppressed Signal removes only that decision. Deleting a
    controller Recommendation/Run with retained dependent Signals is rejected
    atomically; deleting the whole project succeeds without dangling rows.

# Verification

- Schema parity tests cover columns, checks, composite foreign keys and partial
  unique-index parity. Generated D1 and PostgreSQL migrations are reviewed and
  both migration test suites pass.
- Pure key/reason tests cover stable coordinates, version exclusion and every
  Recommendation status/Action-presence mapping.
- D1 integration tests cover sequential duplicate suppression, independent
  pages/projects, exact retry, legacy adoption, full graph integrity and no
  orphan candidate rows. Provider-parity fixtures distinguish code-unit IDs,
  candidate status and exact versus extra Actions.
- Fresh migrated PostgreSQL tests race two different Runs/Signals for one key
  and assert one graph/controller plus one suppression decision.
- D1 and PostgreSQL integration tests force a later decision failure after one
  commit and prove the source becomes `completed_with_errors`, stays readable
  and cannot suppress from a failed Run. They also cover suppressed-Run
  deletion, rejected controller Recommendation/Run deletion, successful project
  deletion, exact retained replay and absence of dangling/remapped decisions.
- Service and check tests prove every Signal remains saved, clean Run completion
  is unchanged and suppressed outcomes do not become errors.
- Strict DTO tests reject old evidence/internal fields from suppressed output;
  static render/submission tests prove the covered state is read-only and
  existing controller review/approval behavior is unchanged.
- Run targeted typecheck/lint/format and diff checks, then `pnpm ci:check`, the
  full one-worker suite, production build and staged/unstaged whitespace checks
  sequentially with the Node heap capped at 4 GB.
- Fresh independent adversarial review must pass before commit.

# Review focus

Challenge cross-run FK safety, active-controller uniqueness, D1/PostgreSQL race
equivalence, deterministic-ID fact drift, legacy adoption selection, orphan
graphs, exact retry, tenant qualification, suppressed mutation, old-evidence
leakage, cascade behavior and any accidental claim that v1 recognizes material
change or completed work.
