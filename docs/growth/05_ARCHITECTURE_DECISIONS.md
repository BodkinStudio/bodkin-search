# Bodkin Growth - Architecture Decisions

These are lightweight ADRs. Codex should treat accepted decisions as constraints until a new ADR explicitly replaces them.

---

## ADR-001 - Build on OpenSEO

**Status:** Accepted

### Decision

Bodkin Growth begins as a fork/extension of OpenSEO.

### Why

OpenSEO already provides the core SEO data and agent substrate.

### Consequence

Growth engineering should reuse existing services and conventions.

---

## ADR-002 - No separate Growth backend in P0

**Status:** Accepted

### Decision

Do not create a standalone Growth API/database/MCP for the MVP.

### Why

It duplicates OpenSEO tenancy, auth, data and MCP.

### Revisit when

A concrete extraction condition in `00_REVIEW_AND_DECISIONS.md` is met.

---

## ADR-003 - Extend the existing MCP

**Status:** Accepted

### Decision

Add project-scoped `growth_*` tools to OpenSEO's MCP.

### Why

Authentication and project scoping already exist.

### Consequence

Growth MCP tools must follow upstream registration/auth patterns.

---

## ADR-004 - Action is the main operating object

**Status:** Accepted

### Decision

Recommendations can become Actions. Actions remain active through implementation and measurement.

### Why

The product is about delivering and evaluating work, not producing reports.

---

## ADR-005 - Separate fact from interpretation

**Status:** Accepted

### Decision

Persist Signals, Insights and Recommendations separately.

### Why

AI hypotheses must not become indistinguishable from measurements.

---

## ADR-006 - Deterministic detection before AI

**Status:** Accepted

### Decision

Rules/statistics create Signals. AI interprets bounded evidence packets.

### Why

Improves auditability, cost and reliability.

---

## ADR-007 - No strong causal SEO attribution

**Status:** Accepted

### Decision

Measurement reports temporal/relative evidence and confidence, not unsupported causality.

### Why

SEO is affected by many uncontrolled variables.

---

## ADR-008 - Canonical Actions remain inside Growth

**Status:** Accepted

### Decision

Notion/Jira/etc may mirror Actions later but do not become canonical.

### Why

Growth must retain evidence and measurement links.

---

## ADR-009 - Web report before PDF

**Status:** Accepted

### Decision

Structured HTML report is canonical.

PDF is print/export convenience later.

---

## ADR-010 - Multi-cadence monitoring

**Status:** Accepted

### Decision

Daily, weekly, monthly and measurement schedules have different jobs.

### Why

Monthly-only is too slow for critical issues; daily deep analysis is noisy and expensive.

---

## ADR-011 - Human approval before implementation

**Status:** Accepted

### Decision

MVP can automatically detect/analyse/recommend but does not autonomously publish.

---

## ADR-012 - Reuse existing OpenSEO data history

**Status:** Accepted

### Decision

Do not duplicate rank/backlink/etc history unless reproducibility requires a specific evidence snapshot.

---

## ADR-013 - Preserve SQLite/Postgres compatibility

**Status:** Accepted

### Decision

Growth schema and queries follow OpenSEO's dual-provider requirements.

---

## ADR-014 - GSC is enough for the first closed loop

**Status:** Accepted

### Decision

GA4 is not an MVP blocker.

### Why

Search performance + rankings + audit data are enough to prove the operating system.

---

## ADR-015 - Sherpa context is optional and narrow initially

**Status:** Accepted

### Decision

P0 uses Growth project settings for commercial context. Add a small Sherpa adapter later.

### Why

Avoid coupling two evolving systems before the Growth loop works.

---

## ADR-016 - No synthetic all-purpose SEO health score in P0

**Status:** Accepted

### Decision

Show discrete risks/opportunities and freshness instead.

### Why

A single score tends to obscure rather than improve decisions.

---

## ADR-017 - OpenSEO upstream remains active dependency

**Status:** Accepted

### Decision

Regularly inspect/merge upstream and delete redundant fork code.

### Why

OpenSEO is moving quickly and may implement planned features first.

---

## ADR-018 - Prefer upstream contributions for generic improvements

**Status:** Accepted

### Decision

Generic OpenSEO enhancements should be considered for upstream PRs.

Bodkin-specific commercial workflow remains in the fork.

---

## ADR-019 - Write MCP tools require a separate security gate

**Status:** Accepted

### Decision

Read tools ship before write tools. Write tools require operation-level permission, audit and isolation tests.

---

## ADR-020 - AI output is versioned

**Status:** Accepted

### Decision

Persist model and prompt/template version with AI-generated Insights/Recommendations/report narrative.

### Why

Historic decisions must remain explainable when models/prompts change.

---

## ADR-021 - Reuse project memory and add one operational Growth settings row

**Status:** Accepted

### Decision

Bodkin Growth extends the existing OpenSEO project and Project Context models.

- `growth_project_settings` is a one-to-one, project-keyed operational settings row. It stores only Growth enabled state, report scheduling preferences and scalar measurement-window defaults.
- Existing business prose remains in `project_context_sections`; competitors remain in `project_competitors`.
- Growth page metadata extends `project_key_pages`. There is no parallel `growth_priority_pages` table or second URL list.
- Commercial weight is optional on a 1–5 scale. Protection and active-optimization state are explicit booleans.
- Key-page additions must belong to the authorized project's normalized hostname or one of its subdomains. Legacy rows remain removable after a domain change.
- Settings use typed scalar columns rather than a JSON configuration blob.

The prototype deployment is Cloudflare Access with D1 and Managed OAuth. The schema and repositories remain compatible with Postgres; this decision does not introduce a second deployment, database, auth system or MCP server.

Report cadence is either weekly or monthly. Weekly `report_day` uses ISO weekday 1–7; monthly `report_day` uses day-of-month 1–28. Default measurement windows follow the product baseline: 28 baseline days, 7 cooldown days, 28 primary-window days and an optional 55-day long window.

### Why

OpenSEO already owns project identity, tenancy, context, competitors, key pages and authorization. Reusing those records keeps Growth state project-scoped, makes its metadata immediately available to existing Project Context readers, and avoids two sources of truth.

### Deferred

This foundation does not add Growth UI, runs, signals, recommendations, actions, measurement observations, reports, schedules, detectors, provider adapters, AI generation or new MCP tools.

---

## ADR-022 - Growth runs and Signals are project-scoped immutable facts

**Status:** Accepted

### Decision

- A Growth run is project-scoped, has one of the bounded run types, and records an inclusive `YYYY-MM-DD` period (`start <= end`). Manual creation stamps `trigger=manual` and `status=running`.
- Every run has a caller-stable cadence slot, unique by project, run type and slot. An exact retry returns the original row; changed immutable creation metadata is a conflict.
- A run can transition once from running to `completed`, `completed_with_errors`, or `failed`. Terminal rows are immutable. Partial/failed outcomes require bounded failure code and message; completion forbids them. Provider cost is nullable and only persisted when an authoritative caller has it.
- A Signal is immutable and stores scalar baseline/current/delta facts plus exactly one required evidence kind/reference. Evidence kinds are a closed registry: GSC/GA4 periods, rank snapshots, audit results, backlink snapshots and manual observations. No raw provider payload or generic evidence table is introduced.
- Signal identity is SHA-256 derived from stable semantic coordinates. Exact retries return the original; any stored fact or provenance drift for that identity conflicts.
- Signals use a composite `(project_id, run_id)` foreign key to the owning run and are written only while that run is running. Project deletion cascades through both tables.

### Why

This keeps Growth facts reproducible, tenant-safe and auditable without prematurely adding workflow, provider, AI, or evidence-aggregation abstractions.

### Deferred

Scheduling, retries, provider cost metering, detector implementations, multiple evidence references, Insights, Recommendations, Actions, and public/UI boundaries remain out of scope.

---

## ADR-023 - Insights and Recommendations use immutable, normalized run graphs

**Status:** Accepted

### Decision

- Insights are immutable interpretations created from one or more Signals in one project and one originating Growth run. They do not receive a speculative status lifecycle.
- Recommendations are immutable proposed work derived from one or more Insights in that same project and run. Insight links, targets and ordered steps are normalized relations, rather than JSON or prose lists.
- A caller-stable creation key is unique within a project/run. A SHA-256 fact hash covers every immutable parent field and canonical child coordinate. Exact retries return the original graph; drift is a conflict and cannot add children.
- URL and site targets are canonicalized within the project's domain; keyword and cluster targets use trimmed, collapsed lowercase whitespace. Duplicated sources/targets are reduced deterministically; repeated step text is allowed only at different positions.
- Recommendations begin `proposed`. Human review uses project-scoped versioned compare-and-set transitions: proposed may become accepted, dismissed, snoozed, merged or superseded; snoozed may return to proposed. Dismissal requires the PRD reason vocabulary. A new snooze requires a future timestamp, but an exact persisted snooze replay remains valid after that timestamp passes. Merge/supersede requires another non-self Recommendation in the same project and originating run, keeping each run independently cascade-deletable.
- Composite project/run foreign keys enforce that graph links cannot cross tenant or origin-run boundaries. Project and run deletion cascade through this graph.

### Why

This preserves the distinction between measured Signals, interpreted Insights and proposed work while making retries, auditability and tenant boundaries explicit before any AI, UI or Action surface is introduced.

### Deferred

Actions, generic graph editing, semantic deduplication, dismissal cooldowns, cross-run evidence, scheduling, AI/provider execution and public surfaces remain deferred.

## ADR-024 - Actions use an atomic state projection and immutable event ledger

**Status:** Accepted

### Decision

- An Action is created only from an accepted Recommendation in the same project. It snapshots the Recommendation category and priority, carries an immutable title, description and due date, and selects one or more canonical targets from that Recommendation. A project-scoped caller key plus complete fact hash makes exact creation retryable while allowing one Recommendation to split into multiple Actions.
- Actions begin `approved`. The state graph is `approved → ready → in_progress → implemented → measuring → evaluated`, with `in_progress → blocked`, `blocked → in_progress | implemented`, and cancellation from approved, ready, in-progress or blocked. Evaluated and cancelled are terminal. Recommendation dismissal remains pre-Action; approved work is cancelled instead of receiving a second dismissed state.
- The Action row is the current projection with an integer version and first-entry milestone timestamps. Every creation or transition appends one immutable, project-scoped event at the matching version in the same provider-aware batch/transaction. Event hashes cover semantic transition data but exclude generated timestamps so exact delayed retries remain stable.
- Targets and events are normalized relations. Composite project-leading foreign keys prevent cross-tenant attachment. Recommendation and run deletion cascade through their Actions and event history, retaining ADR-023's independent run-deletion behavior; no ordinary Action delete API is introduced.
- Owner/team assignment is nullable and deferred until existing organisation membership can be applied at an authorized boundary. Change Events, implementation notes and Measurement records remain separate later aggregates; `implemented` is not equivalent to `evaluated`.

### Why

This makes Action work trackable without losing how it changed, keeps retries and concurrent updates safe on both database providers, and preserves the complete Recommendation-to-Action evidence chain without inventing a second workflow system.

### Deferred

Owner assignment, metadata editing, website Change Events, Measurement Plans/Results, measurement-enforced transitions, UI, MCP, scheduling, semantic deduplication and external project-management sync remain deferred.

## ADR-025 - Change Events are immutable website facts with independent Action links

**Status:** Accepted

### Decision

- A Change Event is a project-owned website fact with a caller-stable key and immutable source, change type, recording actor, description, occurrence time, optional external reference and non-empty normalized exact-URL set. A complete semantic fact hash makes exact retries idempotent and rejects drift without copying payload blobs.
- BG-0108 records `manual` events through a trusted internal service. Persisted source vocabulary is `manual | sherpa | cms_webhook | deployment`; later authenticated adapters stamp the non-manual sources. Change types use the PRD vocabulary with separate `unknown` and `mixed` values.
- Event URLs reuse Growth exact-URL canonicalization and must belong to the current unarchived project domain or its subdomains. They are exact historical coordinates; the root URL is not a hidden site wildcard, removed pages are valid facts, and site-wide confounder scope is deferred.
- Events and URL children are immutable and have no ordinary update/delete API. Action links are separate append-only many-to-many associations, excluded from the Event fact hash, so a standalone Event can be linked later and remains internally consistent when Action/run deletion cascades remove a join row.
- Every relation uses project-leading composite keys. Project deletion cascades the Change graph; Action, Recommendation or run deletion removes only affected join rows and preserves the independent Event. Linking requires no URL overlap or Action status, and does not transition the Action, alter milestones or start measurement.
- Measurement anchor/primary-change semantics, event correction/voiding, unlinking and link audit metadata require later explicit decisions rather than overloading this primitive.

### Why

Website changes are durable evidence and future measurement confounders even when they were unrelated to planned work or their linked Action later disappears. Separating the immutable fact from its evolving work associations preserves that history without weakening tenant constraints or retry safety.

### Deferred

Site-wide targets, event correction/void/supersession, unlinking, link audit metadata, implementation notes, deployment/CMS adapters, Action orchestration, Measurement Plans/Results, confounder scoring, UI, MCP and reports remain deferred.

## ADR-026 - Measurement is one atomic Action lifecycle with frozen scalar evidence

**Status:** Accepted

### Decision

- An Action has at most one Measurement Plan and a Plan has at most one terminal Result in the Phase 1 model. The Plan is an immutable schedule/Metric graph with mutable `active | completed` status; the Result and its confounder set are immutable. Revised Plans, early-plus-long-term Result versions and correction/supersession semantics require a later explicit design.
- Starting measurement is the only ordinary path from Action `implemented` to `measuring`. One atomic provider-aware write appends the Action event and creates the active Plan/Metric graph. Finalizing measurement atomically creates the Result/confounder graph, marks the Plan completed and appends the Action `measuring` to `evaluated` event. Exact historical retries remain valid after both projections advance.
- The Plan is anchored to the Action's persisted, server-stamped `implementedAt` milestone and records that timestamp plus the project's report timezone. No Change Event is silently treated as the cause or primary implementation. Result-level Change Event links are frozen, explicit confounders; deleting an independent Event removes only its join row, while deleting the Action removes the complete Measurement aggregate.
- Plan windows are resolved inclusive calendar dates. Baseline must end before the implementation date, cooldown contains the implementation date, measurement begins after cooldown, and an optional long window ends after the primary window. Comparison mode records how the baseline was selected: `preceding_period | year_over_year | custom`. Operational due date is derived from the final configured window.
- Metrics reuse normalized Growth entity coordinates (`site | url | keyword | cluster`), have a closed Phase 1 scalar registry and a primary/secondary flag, and form part of the Plan fact hash. At least one Metric is primary. Site/cluster context is a secondary Metric rather than a duplicated Result field or ambiguous `comparison` observation period.
- Observations are append-only scalar facts with one natural coordinate per Plan/Metric and `baseline | measurement | long_term` period. They freeze resolved effective dates, finite value, completeness, evidence kind/reference and capture time. Values remain provider-neutral; raw responses and provider-specific dimension blobs are not copied.
- A non-`not_measurable` Result requires baseline and measurement observations for every primary Metric, plus long-term observations when the Plan configured that window. The Result freezes a digest of the complete Observation set, its sorted confounder IDs, outcome, confidence and non-causal summary. Absolute/percentage changes are derived from immutable Observation values; percentage change is null when the baseline is zero.
- Every Measurement table carries `project_id` and uses project-leading composite relationships. Natural uniqueness is Plan per Action, Metric semantic coordinate per Plan, Observation period per Metric and Result per Plan. Complete semantic hashes make exact retries idempotent and reject drift; losing concurrent writes cannot attach Metrics or confounders to the winner.

### Why

This is the smallest model that completes the existing Action lifecycle without allowing `measuring` Actions with no Plan, `evaluated` Actions with no Result or later observations that silently rewrite a reported outcome. It preserves scalar arithmetic truth and provenance while leaving data collection to the OpenSEO services that already own GSC, GA4, rank, backlink and audit semantics.

### Deferred

Plan proposals/default calculation, editing/cancellation/revisions, implementation backdating, Change Event causal anchors, multiple or early/long-term Results, late Observation correction, unavailable/censored value semantics, provider collection adapters, automatic completeness/confounder/outcome scoring, scheduling, AI interpretation, UI, MCP and reporting remain deferred.

## ADR-027 - Monthly Reports are immutable, versioned presentation snapshots

**Status:** Accepted

### Decision

- BG-0110 supports `monthly` Reports only. Weekly review remains a different workflow and does not reuse or partially populate the monthly section contract.
- Report identity is the natural project-scoped family/version coordinate `(project_id, report_type, period_start, period_end, version)`. Period dates are inclusive valid calendar dates and the caller-stable version is a positive integer. There is no second creation-key namespace.
- Creating a version freezes the current Growth report timezone, canonical data cutoff, server generation time, builder version, content-schema version and creator actor. The immutable fact hash covers every semantic header field, creator identity and canonical section value, including the sorted direct source coordinates embedded in those sections. Random row IDs, server generation time, derived navigation links and later publication metadata are excluded from that hash; an exact delayed retry retains the winner's original generation time.
- A Report begins `draft` and has exactly these eight sections once at positions 0–7: `executive_summary`, `performance`, `meaningful_changes`, `work_completed`, `results_from_earlier_work`, `risks`, `opportunities`, `next_month`. Caller section order is canonicalized to that order; section vocabulary, cardinality and position remain closed.
- Each section stores bounded canonical JSON text as a frozen presentation snapshot. Content schema v1 is strict: one non-empty summary and zero or more explicitly positioned stable-key items; each item has bounded title/summary text, explicitly positioned scalar display facts, typed Growth evidence references and at most one nullable internal source. Fact values are finite numbers, bounded strings, booleans or null. Unknown or nested arbitrary payload fields are invalid.
- Item and fact positions are unique, contiguous from zero and canonicalized by position. Item/fact keys and semantic facts are unique. Evidence references reuse the ADR-022 registry and are deduplicated and sorted by kind/reference. Changed item or fact positions are semantic presentation drift, not an interchangeable ordering.
- Source compatibility is closed: executive summary and meaningful changes may cite an Action or Measurement Result; performance and results from earlier work may cite a Measurement Result; work completed, risks, opportunities and next month may cite an Action. Unsourced items and empty item lists are valid when the section summary says nothing was material, but every Report must contain at least one sourced item.
- Each section is at most 64 KiB and all eight section payloads together are at most 256 KiB. A section has at most 100 items, an item at most 50 facts and 50 evidence references, and a Report at most 100 unique Action sources and 50 unique Measurement Result sources. Invalid dates/timestamps, non-finite values, duplicate coordinates, incompatible sources and oversized content fail before persistence.
- Source identity is also stored relationally as deduplicated, sorted Report-wide Action and terminal Measurement Result links. A linked Result must be same-project, terminal and valid; linking it also links its owning Action. Frozen content keeps the source IDs and presentation facts, while normalized joins provide live navigation and tenancy enforcement.
- Creation atomically writes the header, all eight sections and the normalized navigation links derived from their direct sources, including each Result's then-current owning Action. Every child and source relationship is project-leading and composite. Invalid, deleted or cross-project sources leave no Report graph, and a losing concurrent fact cannot attach children to the winning family/version. Derived owner-Action links are not separately hash-authoritative and may later be pruned with their live source.
- Exact retry of the same family/version and complete semantic fact returns the original graph. Any cutoff, timezone, builder/content version, creator, section byte, presentation order, evidence or source-coordinate drift conflicts without extending the winner.
- Draft content and links are immutable after creation. Publication first validates the stored snapshot, then atomically performs the one-way `draft → published` projection with server time and publisher actor. Repeated or concurrent publication returns the first published projection without changing its actor/time. There is no content/link update, unpublish, correction, supersession or ordinary Report delete API in this slice.
- Reports render only from frozen section content, never from mutable source rows. Deleting an Action or Measurement Result cascades only its navigation join and never deletes or rewrites a Report. Drafts and published Reports remain readable and exactly retryable after pruning; a draft with missing sources cannot publish. Deleting only a Result may leave its surviving owner Action navigable. Deleting a project cascades its complete Report graph.

### Why

Monthly reporting must remain explainable after live metrics, Actions and Measurements move on. A small closed presentation schema provides stable rendering and deterministic retries without turning arbitrary JSON into a second application model, while normalized source joins preserve project isolation and useful navigation without blocking accepted source-deletion behavior.

### Deferred

Automatic source selection, historical as-of queries, KPI/provider collection, scheduled generation, AI narrative/model provenance, weekly/custom reports, correction/supersession, UI, HTML/share/PDF/print surfaces, redaction, public authorization and external client boundaries remain deferred.

## ADR-028 - The first detector compares observed GSC page clicks

**Status:** Accepted for the internal BG-0201 through BG-0203 slice

### Decision

- Growth collects search facts through `GscService.getPerformance` and reads the existing project's curated key pages. It does not add Google OAuth, a provider client, source tables or another scheduler.
- A collection covers explicit inclusive dates, at most 90 days, in Google's `America/Los_Angeles` source calendar. It requests `web` and `final` data, with an end at least three calendar days before the supplied capture date. The adapter checks the actual request returned by OpenSEO so its 16-month clamp cannot silently shorten a comparison.
- Version 2 collects bounded exact `page equals` alias queries grouped by date instead of using the unfiltered page/date feed to prove a page had traffic every calendar day. The four HTTP/HTTPS and www/non-www aliases retained by the existing normalizer are queried serially, with the existing 25-call cap; an alias set that cannot be fully covered is explicitly capped/incomplete. Omitted dates within a successfully completed exact query mean no reported traffic for that alias/window, while a capped or malformed request remains unknown. Google's [query reference](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) and [performance guide](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data) document this sparse-row behavior.
- The DTO holds bounded observed daily click/impression facts and source URLs, plus property, capture and retrieval metadata. It excludes connection email, tokens and raw provider payloads. Provider/request/property drift, duplicate raw URL/day coordinates and invalid source facts fail collection.
- URL matching reuses the existing key-page normalizer unchanged. HTTP/HTTPS, leading `www` and root-slash aliases can map to one key-page ID; meaningful queries, path case, non-root trailing slashes and subdomains remain distinct. Numeric aggregation preserves source coordinates and rejects unsafe sums.
- The detector accepts explicit equal-length adjacent current/comparison windows contained in the snapshot. V2 exact-alias evidence can safely total sparse period rows; legacy observed rows retain the v1 every-day requirement. Capped retrieval, missing observations and zero baseline suppress output. The legacy 100 baseline / 20 lost / 30% branch remains. Below that baseline, v2 requires a 30% decline, complete site facts and a one-sided equal-window exact count test at `0.05 / configured-page-count`; low-volume signals are warnings. Site totals use the same materiality rule with one page before the existing ten-point page-vs-site suppression margin.
- Optional site context is an explicit extra date-grouped property query for the same source window. It is never derived by summing page rows. Requested but incomplete context suppresses detection; omitted context stays explicit. A material site decline suppresses a page decline at most 10 percentage points worse than the site's decline.
- Version 1 defaults require at least 100 baseline clicks, 20 lost clicks and a 30% decline. Critical severity requires at least 100 lost clicks and a 50% decline. These are provisional, configurable rule thresholds, not evidence of live-site usefulness. Priority is lost clicks multiplied by the curated page's commercial weight (null means 1); measured values remain unweighted.
- Signal drafts use `priority_page_click_decline`, `key_page` and `gsc_clicks`. Stable page IDs avoid overflowing the existing 500-character entity reference limit. A bounded SHA-256 evidence reference covers source/page/window facts, canonical capture time and detector configuration. The existing Signal schema validates output, and equivalent input order produces the same result.
- The fixed confidence value 0.8 describes an uncalibrated detector rule convention. It is not the probability of a cause, the completeness of GSC or a statistical significance estimate. Insights and Recommendations remain separate later steps.

### Why

This provides a testable source-to-Signal path without adding another data platform. Explicit retrieval limits and suppression rules prevent common false declines caused by truncated pages, mismatched periods or absent data.

### Deferred

Persistent source snapshots, Run/Signal orchestration, evidence packets, AI interpretation, Recommendation generation, seasonality and causal diagnosis, automatic site-context collection, live usefulness validation, UI, scheduling and full Phase 2 acceptance remain separate work.

## ADR-029 - Evidence packets preserve facts and disclose context limits

**Status:** Accepted for the internal BG-0204 slice

### Decision

- Build a read-only packet for one persisted priority-page decline Signal. Reuse existing organisation/project, Run/Signal, project-context and Change Event reads. Do not add a source store, auth path or model call.
- Canonical Signal numbers, identifiers and capture/current-period metadata remain separate from narrative context. Validate contradictions instead of changing facts. Strict offset timestamps, a real decline and the existing three-Pacific-day source lag are required. The supported detector version defines an equal preceding baseline; label those derived dates explicitly.
- Include only selected commercial context and one curated page's metadata. Context is current, with source update times; it is not a historical reconstruction. Source rows, property, site totals and impressions cannot be recovered from a digest and must remain marked unavailable.
- Explicitly selected known Change Events are partial coverage, limited to ten unique IDs. Require one same-project graph for each selected ID before relevance filtering; missing or duplicate graphs are not irrelevant events. Match their Pacific dates and existing Growth-normalised URLs, label them as possible normalised-URL candidates and disclose the query/trailing-slash identity limitation. An empty selection does not mean no confounders exist.
- Preserve existing raw prose limits: project name 120, commercial section 4,000, key-page topic 200, notes 500 and Change Event description 5,000 characters. Output caps are respectively 200, 800, 200, 400 and 400, including text that expands during sanitisation. Canonical identifiers and numbers are never truncated.
- Use an allowlisted projection, conservative field-level credential redaction before truncation, explicit redaction/truncation flags and a 32 KiB UTF-8 packet bound. Email and URL query/fragment omission is disclosed too. All narrative text is untrusted. Subject URLs are display-only, without query or fragment; withhold recognisable credential material anywhere in the URL, and keep the key-page ID as canonical identity.
- Hash the final redacted projection, not the unfiltered inputs. Keep packet generation internal-review-only. Recognisable-secret filtering is defence in depth, not proof that arbitrary encoded text is safe for AI egress.

### Why

The existing URL safety helper validates HTTP(S) and rejects embedded credentials but preserves queries and fragments. Analytics sanitisation, error formatting and MCP display truncation have different purposes; none is a reusable prose privacy boundary. A narrow Growth-local projection avoids passing unrelated project memory or provider/account fields into future interpretation.

### Deferred

AI egress and prompt policy, arbitrary-secret/DLP guarantees, automatic confounder discovery, historical context snapshots, exact change-to-key-page matching, source replay, Action dedupe, Insight/Recommendation generation, UI and full Gate 2 acceptance remain separate work.

## ADR-030 - Done records completed investigation work, not an evaluated SEO outcome

**Status:** Accepted

### Decision

- `approved → implemented` and `ready → implemented` are legal Action edges alongside the existing in-progress and blocked completion edges. A direct completion records one ordinary transition event and one state-version increment; it does not invent Ready or in-progress events.
- `startedAt` remains nullable for `implemented`, `measuring` and `evaluated` because an investigation may be completed without a recorded start. `implementedAt` remains required for those states, and `in_progress` and `blocked` still require a real recorded start.
- Work presents `implemented` as Done. Done means the approved investigation work is finished; it is neither a website execution claim nor a measured SEO outcome. Measurement and evaluation remain the existing separate `implemented → measuring → evaluated` lifecycle.
- The forward D1 migration preserves the entire Action descendant graph in transaction-local backup tables before rebuilding the two changed tables, then restores exact rows and removes the backups. It does not disable foreign keys or edit SQLite's catalog: D1 does not support `writable_schema`, and deferred foreign-key checks do not prevent cascade deletes. Postgres replaces only the two CHECK constraints. See [Cloudflare's migration constraints](https://github.com/cloudflare/workerd/issues/2471).

### Why

Users need to record finished investigation work directly when intermediate progress was not captured. Preserving the unknown start is more truthful than fabricating a timestamp, while the separate measurement lifecycle retains the distinction between completed work and observed impact.

### Supersedes

This supersedes only the prior Action-graph restriction that required Ready or in-progress before implementation. Earlier ADR history remains otherwise unchanged.

## ADR-031 - Measurement starts from an explicitly selected linked website change

**Status:** Accepted

### Decision

- `growth_actions.implemented_at` remains the server-stamped time when the user marked investigation work Done. It is an operational milestone, not website evidence, and measurement does not backdate or rewrite it.
- Starting a new Measurement Plan requires the user to select one manual Change Event already linked to the same Action. The selection is an audit coordinate, not a claim that the event caused later performance.
- The Plan freezes the selected Event's immutable `happened_at` as `anchor_at`, its recorded UTC calendar date as `anchor_date`, and the current report timezone. A project-scoped one-to-one Plan-anchor relation preserves the exact Change Event identity. The Event ID, timestamp, schedule and Metrics are part of the new Plan's immutable fact.
- Starting measurement remains the only ordinary `implemented → measuring` transition. One atomic provider-aware write verifies the Action version, exact Action/Event link, manual source and Event timestamp before creating the Plan, anchor relation and Metrics and appending the transition event.
- The website change may precede or follow Done, but it cannot be future-dated when measurement starts. Other Action-linked Change Events remain visible context and possible later confounders; the system does not automatically classify them or impose URL overlap.
- Existing Plans without an anchor relation keep their original fact shape and remain readable and finalizable. The system does not invent a Change Event for historical data. A new-format Plan without its required anchor relation is invalid.
- Project settings resolve the default inclusive windows from the recorded change date. A 28-day baseline ends the day before the change; a 7-day cooldown ends on day 7; the 28-day primary window covers days 8–35; the optional 55-day long window ends on day 90.

### Why

ADR-030 separated investigation completion from website execution. Using the
Done timestamp for a before/after comparison could place post-change data in
the baseline or measure work that never changed the site. An explicit immutable
Change Event keeps the timeline inspectable without asserting causation.

### Supersedes

This supersedes ADR-026 only where it derives a new Plan anchor from
`growth_actions.implemented_at` and defers explicit Change Event anchors. It
resolves ADR-025's deferred primary-change decision for measurement Plans while
preserving independent append-only Action links. Plan editing, cancellation,
automatic collection, confounder classification, interpretation and result UI
remain deferred.

## ADR-032 - Measurement collection freezes complete GSC period facts before interpretation

**Status:** Accepted for the internal BG-0305/0306 slice

### Decision

- Collection is an explicit user action on an active Measurement Plan. Reading,
  refreshing or rendering Work never calls Google. The existing project-scoped
  Search Console grant, selected property, `GscService` and Growth adapter remain
  the only provider path.
- Each baseline, primary and configured long-term window is collected separately
  from the Plan's inclusive dates. A window becomes eligible when the Search
  Console Pacific calendar reaches three days after its end. This source-ready
  date is distinct from the Plan's report-timezone review due date.
- Page/date requests retain the existing `web`/`final`, 1,000-row and 25-call
  bounds. Measurement supplies the Plan's frozen URL Metrics directly instead of
  rereading mutable key-page context. Version 1 matches the frozen URL exactly;
  query, trailing-slash or other variants cannot silently satisfy that identity.
- A period is complete only when pagination is exhausted and every frozen
  URL/calendar-day coordinate has an observed row. Explicit zero rows are facts;
  absent rows and capped retrieval are incomplete and produce no Observation.
  Supported collection Metrics are URL search clicks and impressions.
- All mature, wholly missing periods in one attempt are fetched and validated
  before one provider-neutral atomic Observation batch. Exact facts are retryable;
  coordinate drift, partial saved periods, an inactive Plan or a concurrent close
  conflicts. A non-`not_measurable` Result requires completeness `1` on every
  required primary Observation.
- Each generated evidence reference is
  `gsc:measurement:v1:<property-hash>:<fact-digest>`. The property hash allows a
  later attempt to reject a changed Search Console property without persisting or
  exposing the property/account identity. Raw provider snapshots, account email,
  tokens and provider error bodies are not copied into Measurement storage.
- Work shows period readiness, stored scalar values and derived absolute and
  percentage deltas. A zero baseline has no percentage delta. Observations remain
  non-causal evidence; collection does not choose an outcome, confidence or
  confounder set and does not move the Action from `measuring` to `evaluated`.

### Why

OpenSEO already owns Search Console authentication and retrieval, while the
Growth Measurement aggregate already owns immutable scalar evidence. Joining
those boundaries closes the data-collection gap without creating a second data
platform and without turning Google's omitted rows into invented zero traffic.
Keeping interpretation separate avoids embedding unreviewed success thresholds
or causal claims in a provider adapter.

### Supersedes

This resolves ADR-026's deferred provider-collection boundary and hardens its
primary-coverage rule to require complete observations. It resolves ADR-031's
deferred collection/UI portion only for user-triggered GSC scalar collection.
Automatic scheduling, GA4 and other providers, raw snapshot replay, site/cluster
context, confounder discovery, outcome/confidence policy, AI interpretation and
terminal result orchestration remain deferred.

## ADR-033 - Measurement confounder discovery is bounded exact-match context

**Status:** Accepted for the internal BG-0307A slice

### Decision

- Active Work Measurement reads inspect recorded Change Events as possible
  confounding context. Discovery is read-only: it does not call a provider,
  select or persist a confounder, assign confidence, create a Result or advance
  the Action lifecycle.
- Version 1 inspects the Plan's full frozen comparison interval, from baseline
  start at UTC midnight through the last configured measurement date inclusive.
  The selected implementation Change Event is excluded by ID; another Event at
  the same timestamp remains eligible. A legacy Plan without that selected
  anchor reports discovery as unavailable rather than guessing.
- Candidate scope comes only from the verified Plan graph. Every Change Event
  source is considered, but an Event is a candidate only when at least one of its
  exact stored URLs equals a frozen URL Metric target. Query, trailing-slash and
  other variants do not substitute for the saved identity. Root URLs, event
  descriptions, change types and template or migration labels do not imply a
  hidden site-wide match.
- Discovery requests at most 51 deterministically ordered candidate Events in
  one database statement, returning only their exact matching URLs. Zero
  matches reports `none`; one through 50 reports the complete candidate set; 51
  reports `overflow` and withholds the partial list. Project-leading predicates
  and relationships remain the tenancy boundary.
- Candidate details use a narrow allowlisted Event projection and safe URL
  display. Query/fragment omission or credential withholding is presentation
  behaviour only and is disclosed; matching happens first against exact stored
  identities. Event descriptions pass through the existing credential-safe
  narrative projection before entering the client DTO.
- The candidate set is current recorded context, not a historical snapshot and
  not proof that an Event affected performance. No candidates means only that no
  exact recorded match was found within this bounded rule. Site-wide effects,
  missing Events and semantic URL relationships remain unassessed.

### Why

The Change Event and Measurement aggregates already contain the normalized
relationships needed to show review context. A narrow, bounded read closes the
discovery half of BG-0307 without inventing a confidence penalty or causal
classification. Explicit overflow and identity limitations are more truthful
than a recent-50 list or fuzzy matching that appears complete.

### Deferred

Human selection and Result finalization, confidence semantics, outcome policy,
AI interpretation, site-wide/template scope, normalized or semantic URL
matching, persisted discovery snapshots, automatic scheduling and terminal Gate
3 UI remain separate reviewed work.

## ADR-034 - Human Measurement review freezes explicit interpretation against reviewed evidence

**Status:** Accepted for the internal BG-0308/BG-0309 human-review slice

### Decision

- Finalization remains an explicit authenticated user action. The Work mutation
  accepts only the Action/version, a server-issued review revision, outcome,
  confidence, narrative and selected confounder IDs. Project, Plan, actor,
  lifecycle note, evaluation time and model provenance are derived or fixed on
  the server before delegating to the existing Measurement finalizer.
- Review availability is server-derived from the first calendar day after the
  final inclusive Plan window in its frozen report timezone. Ordinary outcomes
  require complete baseline, primary and configured long-term evidence for
  every primary Metric. Missing secondary evidence does not block.
  `not_measurable` remains an explicit human choice for incomplete primary
  evidence after the window closes; it does not bypass date, version, tenancy or
  confounder validation.
- A deterministic SHA-256 review revision coordinates the displayed state with
  mutation preflight. The server independently recomputes a canonical digest of
  project, Plan, Action version, exact Observation hash, discovery state and the
  deterministically ordered complete candidate IDs. The revision is untrusted
  input, not a secret, signed capability or authorization token, and is never
  parsed for browser claims.
- Human finalization supplies the exact reviewed Observation hash to the core.
  The existing writer remains the serialization boundary; an Observation change
  before or during its write conflicts instead of invoking the generic
  finalizer's single evidence-race retry. Callers without the human expected
  evidence option keep their existing retry behaviour.
- Candidate discovery remains advisory and preflight-only. A changed complete
  candidate set invalidates the review revision before the mutation is accepted,
  but unselected Events are not locked or claimed to be snapshotted through
  commit. The core validates explicitly selected Events as same-project and
  excludes the implementation anchor; discovery is not converted into an
  allowlist or automatic confidence rule.
- Outcome and confidence are selected by the human with no default or automatic
  threshold. Confidence describes how strongly the reviewed evidence and
  context support that interpretation. It is not probability of causation,
  statistical significance or an evidence-completeness score.
- The inline Work UI freezes the exact request through ambiguous failure and
  permits only exact retry or an authoritative saved-result reread. Successful
  finalization atomically creates the immutable Result, completes the Plan and
  moves Work from Measuring to Evaluated through the existing writer.
- Completed Work shows the safe Result narrative and currently surviving
  selected confounder Event links. Independent Event deletion can remove a link
  while preserving the Result; version 1 does not promise Event tombstones or a
  permanent candidate snapshot.

### Why

The existing aggregate and writer already implement the secure lifecycle and
cross-dialect transaction. A narrow human boundary closes Gate 3 without a new
service, database or causal scoring system. Binding the Observation set prevents
an irreversible interpretation from silently absorbing evidence that appeared
after review, while the narrower preflight claim for candidate discovery stays
truthful about its live advisory nature.

### Deferred

AI interpretation, automatic outcome/confidence rules, statistical thresholds,
site-wide or semantic candidate inference, persisted review snapshots, Event
tombstones, Result correction/supersession, scheduled finalization, reports and
MCP remain separate reviewed work.

## ADR-035 - Monthly summary builds one bounded, immutable Growth Report

**Status:** Accepted

### Decision

- An explicit authenticated request captures one server cutoff and one Growth-settings projection before deriving the previous completed calendar month in the pinned IANA report timezone. Existing version-1 coordinates are read before any source query.
- Current-state source reads are project-scoped and cutoff-bounded: changed rows use `createdAt`, Results use both `createdAt` and `evaluatedAt`, and Actions use `updatedAt`. Timestamp membership is resolved in the pinned timezone. This is not a historical as-of reconstruction; an Action edited after cutoff is omitted. Change-to-Action links are also a bounded current-state read because the join has no creation timestamp.
- The pure builder freezes all eight canonical sections in their existing Report order. Performance contains terminal Results evaluated in-period; Results from earlier work is the independent subset whose owner Action was implemented before the period. Work completed contains Actions implemented in-period. Meaningful changes contains period Change Events and cites an Action only when exactly one valid Action is currently linked.
- Risks are blocked Actions plus approved, ready or in-progress Actions due strictly before the cutoff calendar date. Next month is the remaining approved, ready or in-progress work due in the calendar month after the report period. Opportunities is the remaining approved or ready Action queue; it does not claim to cover unsaved proposed Recommendations. Those three Action sets are disjoint and exclude implemented, measuring, evaluated and cancelled work.
- Performance and earlier Results are independently capped at 20; meaningful changes, completed work, risks, opportunities and next month are independently capped at 12. Stable documented sort keys end in code-unit ID order. Cap-plus-one reads freeze overflow disclosure. Each item exposes at most five sorted safe URLs plus an additional-URL count. At least one selected Action or terminal Result direct source is required; empty canonical sections remain truthful and present.
- Mutable Action, Change, Result and URL display values cross the existing Evidence Packet sanitizers before Report persistence. The client receives only a strict allowlisted projection of metadata, section prose and scalar facts, never sources, evidence, IDs, hashes, actors or internal versions.
- The Report writer guards the persisted settings coordinate at its insert boundary. A settings projection mismatch causes no parent insert. The coordinator recovers any create error by reading the coordinate once; if another writer won, it returns that immutable winner without comparing or mutating a losing candidate. Direct Report callers retain exact-retry behaviour.
- Build and recovery requests echo the server-issued period/timezone only as an expectation. An adjacent month may be read for an existing project-scoped winner, but no source query or write occurs unless echoed period and timezone still equal the freshly server-derived current values. A stale request with no winner returns current read state and requires a new explicit build action.
- Publication is a separate authenticated, project-scoped action on one exact stored monthly version-1 coordinate. It delegates to the Report writer's one-way draft-to-published boundary as final internal approval of an already frozen report; it never builds, regenerates, shares, sends or otherwise exposes the report externally. Publication recovery reads only that exact coordinate and never uses build recovery's current-period fallback.

### Why

This produces a readable monthly snapshot from existing Growth facts without adding collection, scheduling, narrative generation or a second reporting model. Pinned cutoff/timezone and first-writer-wins make its limited current-state claim explicit.

### Deferred

Historical source reconstruction, regenerating or correcting v1, scheduling, sharing, provider collection, AI narrative and custom/weekly reports remain separate decisions.

## ADR-036 - Monthly-summary MCP is a current read adapter

**Status:** Accepted

### Decision

- `growth_get_monthly_summary` is a project-scoped, read-only adapter over the existing monthly-summary service and strict client DTO. Its only semantic input is the project ID, and it always reads the currently eligible previous completed calendar month in the project's pinned report timezone.
- The tool uses the established MCP project authorization gate, returns the existing `ready`, `no_activity`, draft or published state without changing it, and includes a project Growth deep link. It neither builds nor publishes a report, makes provider calls, reads arbitrary history, or consumes credits.
- Structured content is the canonical bounded DTO inside a `summary` wrapper. Human-readable text is derived from that same DTO and includes each persisted section, item and fact, so agents can act on the result without a second report reader.
- The external MCP server and the project-bound SAM agent share the same definition. SAM strips the model-visible project ID and injects its server-bound session project ID before the shared authorization gate runs.

### Why

The monthly-report service, DTO, authorization boundary and Growth page already exist. Reusing them gives agents the current approved reporting surface without introducing a report builder, provider boundary, scheduler, share mechanism or second MCP server.

### Deferred

Historical or custom-period reads, build and publication actions, scheduled delivery, external sharing, provider collection, narrative generation and cross-project agent access remain separate reviewed work.

## ADR-037 - Growth Action MCP is a sanitized current keyset list

**Status:** Accepted

### Decision

- `growth_get_actions` is a project-scoped, read-only adapter over the general
  Growth Action read service and its strict safe page DTO. It reads all current
  project Actions rather than reusing the narrower qualified-Work UI query.
- Callers may apply only the shared bounded status, exact category and minimum
  priority filters, page limit and immutable creation cursor. Pagination remains
  `(createdAt DESC, code-unit id DESC)` keyset pagination implemented by the
  repository; the adapter neither invents another sort nor claims a total count.
- The established MCP project authorization gate runs before the read service.
  Structured content returns only the sanitized Action summaries, bounded target
  projections and truthful continuation cursor approved by the shared DTO.
  Human-readable text is derived from that same page.
- The tool reads saved OpenSEO data, uses zero credits and makes no provider or
  mutation call. The external MCP server and project-bound SAM agent share the
  exact definition; SAM strips the model-visible project ID, injects its bound
  session project, and preserves the remaining filters and cursor unchanged.

### Why

A general bounded Action list is the smallest agent read foundation for later
project summaries and focused Action investigation. Reusing the project auth,
read service, privacy projection and existing MCP/SAM surfaces avoids exposing
internal workflow rows or creating a second Growth API.

### Deferred

Action detail and event history, Recommendation/Insight/Signal evidence chains,
linked Changes and Measurements, historical snapshots, arbitrary sorting or
search, total counts, Action writes, provider refreshes and cross-project agent
access remain separate reviewed work.

## ADR-038 - Growth project summary is a bounded saved-record orientation

**Status:** Accepted

### Decision

- `growth_get_project_summary` is a project-scoped, read-only orientation over
  current saved Growth rows. It uses the established MCP project authorization
  gate and the same shared definition in the external MCP server and
  project-bound SAM agent. It makes no provider call, consumes no credits and
  creates no second service, database, auth system or MCP server.
- One server `asOf` instant coordinates date and future-Signal checks, but the
  result is explicitly a current multi-query assembly rather than an atomic or
  reconstructable historical snapshot. Mutable current rows are not filtered
  by update time to imitate unavailable history.
- Project identity and the four typed context sections use the existing Growth
  credential, email and URL display projection followed by smaller truthful
  field caps. Other context is represented only by counts. Organization IDs,
  raw domains, notes, research prose and internal workflow fields are excluded.
- Saved evidence freshness means only the latest eligible Growth Signal
  `capturedAt`, overall and by evidence kind. Repository predicates exclude
  future capture times before limiting or aggregation, and only Signals from
  completed or completed-with-errors Runs qualify. This is not provider
  connection health, source lag or a uniform freshness claim for Search
  Console, Analytics, ranks, audits or backlinks.
- Unresolved Recommendations, current Actions and recent Signals are narrow
  five-item summaries read with cap-plus-one and deterministic provider-aware
  ID ties. The general Action list remains the fuller paginated read; qualified
  Work remains separate. Raw entity/evidence references and failure, model,
  hash, actor and owner metadata never enter the summary DTO.
- Measurement dates are evaluated in each active Plan's frozen report timezone
  after its final inclusive window. This indicates a due window, not complete
  evidence or finalization readiness. The summary discloses whether the linked
  Action is missing, in the wrong state, at the wrong version, or consistent.
  At most 51 active candidates are read: 50 or fewer are evaluated completely;
  overflow withholds the partial due list rather than implying completeness.

### Why

Agents need one inexpensive place to orient themselves before choosing a more
specific Growth read. The existing services already own settings, context,
Actions and authorization; a narrow repository/service projection supplies the
few cross-aggregate facts they do not expose safely. Explicitly limiting the
freshness, time and snapshot claims avoids turning a convenient dashboard into
an unreliable monitoring API.

### Deferred

Live provider refresh and connection health, historical snapshots, exhaustive
large-project Measurement scheduling, full Recommendation or Action evidence
chains, page context, monthly report bodies, writes, notifications and
cross-project summaries remain separate reviewed work.

## ADR-039: Page context uses explicit plural URL identities and suppresses incoherent live GSC

**Status:** Accepted

`growth_get_page_context` is a read-only, project-authorized orientation for a
single page. Exact key-page curation retains its normalized query-aware URL;
Growth workflow relations use the existing host-and-path normalization; GSC
receives the credential-free requested URL; rank matching considers only its
private HTTP/HTTPS, www and slash variants. Only a URL-safe display projection
is public. Saved rows are current reads coordinated by one `asOf`, not a
historical snapshot. Two final GSC reads supply an ungrouped aggregate and top
queries; any failed, malformed, or property-drift pair suppresses the whole
live section rather than mixing partial or private provider context.

## ADR-040 - Bounded saved Action detail chains

**Status:** Accepted

### Decision

`growth_get_action` exposes one project-authorized, current (not snapshot)
Action chain from saved normalized data only. It returns bounded topology and
explicit overflow rather than raw evidence or history export. Display values
are privacy-projected before public caps; Changes and Measurement are temporal
context, never causal proof.

### Consequence

The tool performs no provider read, mutation or credit use. Measurement must
pass the existing immutable-fact validator before projection, while validator
storage reads retain independent limit-plus-one integrity bounds.

---

## ADR-041 - Saved unresolved Recommendation list

**Status:** Accepted

### Decision

`growth_get_priority_recommendations` is a project-authorized, read-only list
of existing unresolved Recommendations. It includes proposed and snoozed rows,
plus accepted rows only until any Action exists. It is ordered by immutable
creation coordinates after priority and exposes bounded, privacy-projected
targets and ordered steps.

### Consequence

The list is current state, not a historical snapshot or opportunity detector.
It makes no provider call, spends no credits and performs no write. The same
MCP definition is used by the external server and the project-bound SAM agent.
The initial read reuses existing indexes; if project histories make the
priority ordering or Action-existence check slow, add matching SQLite/Postgres
indexes as a separately reviewed migration rather than silently changing the
schema for this read-only boundary.

---

## ADR-042 - Saved manual Change Event list

**Status:** Accepted

### Decision

`growth_get_recent_changes` is a project-authorized, read-only view of saved
manual Change Event records only. It deliberately excludes Sherpa, CMS
webhook, deployment and every future ingestion source. The keyset is immutable
supplied `happenedAt` descending and provider-equivalent code-unit ID descending.
Supplied timestamps are not independently verified occurrences. Roots are read before bounded URL children; public cards project descriptions
and URLs through the existing privacy boundary.

### Consequence

The tool makes no provider calls, uses zero credits, and writes nothing. It is
not a total, snapshot, discovery, collection, or Change Event creation/linking
surface. One shared MCP definition is adapted into project-bound SAM, where the
session project is injected server-side.

---

## ADR-043 - Saved Measurement Plan list

**Status:** Accepted

### Decision

`growth_get_measurements` reads existing Measurement Plans, their bounded
Metric counts and privacy-safe recorded Result summaries through the existing
MCP server and project-bound SAM adapter. It pages Plans first by normalized
immutable creation time, then loads child rows only for emitted roots.

### Consequence

The read does not collect evidence, recalculate outcomes, load full
Measurement graphs or establish causality. Action lifecycle drift is exposed
as `inconsistent`; malformed Plan/Result or Metric lifecycle data is rejected
before public projection. It makes no provider calls, spends no credits and
writes nothing.

---

## ADR-044 - Scoped manual Change Event write

**Status:** Accepted

### Decision

- `growth_record_change` is an external MCP-only write, available solely to a
  hosted OAuth grant explicitly carrying both `mcp` and
  `growth:change:create`. The capability is supported but never part of the
  default OAuth or API-key scope set. Self-hosted MCP and project-bound SAM do
  not receive it.
- Capability is checked before project authorization and again at invocation.
  OAuth refresh can preserve or narrow a consented grant but cannot add the
  capability to a read-only grant; the token callback independently enforces
  the original stored and verified scope ceilings.
- The tool accepts only a caller UUID, closed change type, bounded narrative,
  non-future supplied timestamp and project URLs. Source and actor provenance
  derive from verified auth. The existing Change Event service retains domain
  validation, immutable fact hashing, atomic creation and exact-retry conflict
  semantics. That immutable event is the audit record.
- Public output reuses the recent-change privacy projector and excludes actors,
  auth identities, creation keys, hashes and graph internals. The operation
  writes no provider, consumes no credits, links no Action and starts no
  Measurement.

### Consequence

Current OAuth clients, API keys, self-hosted deployments and SAM remain
Growth-write-disabled by default. A capable client can append or replay only an
authorized manual Change Event; it cannot mutate workflow state or publish a
site change.

### Deferred

Growth Action writes, self-hosted capability configuration, a role matrix,
deployment/CMS ingestion, external Action linking and provider publication
remain separate permission reviews.

---

## ADR-045 - Investigation review reuses Recommendation state and concurrency

**Status:** Accepted

### Decision

- The application review card can dismiss or snooze only the deterministic
  priority-page investigation already qualified through its authorized
  project, terminal supported run, signal and fixed template graph. A snoozed
  investigation can be returned explicitly to proposed review; dismissed
  investigations remain terminal in this slice.
- The public request is a strict decision union, not a Recommendation state
  editor. The server derives `proposed -> dismissed`, `proposed -> snoozed` or
  `snoozed -> proposed`, injects the authorized project and delegates the
  expected review version to the existing Recommendation compare-and-set
  service. Dismissal reuses the closed PRD vocabulary. A calendar snooze date
  is stored deterministically at UTC start of day and must be in the future for
  a new transition.
- Exact retries retain the original version and review fact. A stale version,
  changed decision or illegal starting state conflicts. Client uncertainty
  freezes the exact submitted review and offers only an exact retry or a safe
  refresh; render, reload and refetch never dispatch a review.
- Approval remains the separate audited user-bearing path that atomically
  accepts the Recommendation and creates its complete Action graph. Review
  records only the Recommendation review projection already defined by
  ADR-023 and does not invent an actor field. Approval and proposed review
  serialize on the same status/version guard, so only one can win.
- The card receives a strict safe projection containing only its displayed
  investigation, review version and closed review metadata. Run IDs, raw graph
  relations, resolution metadata, actors and hashes remain internal.

### Consequence

Users can decline or defer a saved investigation without creating work, and
can deliberately bring a snoozed item back for review. No provider call,
credit, schedule, Measurement, MCP surface, Action side effect or new data
model is introduced.

### Deferred

Automatic wake-up, dismissed-item restoration, assignment, bulk review,
generic Recommendation review UI, review actors/history and MCP review remain
separate decisions.

---

## ADR-046 - Priority-page repeat suppression uses immutable Signal decisions

**Status:** Accepted

### Decision

- Every detected priority-page click decline remains a new immutable Signal.
  A stable project-scoped key identifies the issue by detector family, explicit
  key-page record and metric; URL similarity is not used.
- A normalized `growth_recommendation_signal_links` relation records whether
  each Signal created the controlling Recommendation or was suppressed by it.
  One partial unique constraint permits only one unreleased controller for an
  issue. Graph creation, controller claim and suppression are composed in one
  provider-aware atomic write so concurrent checks cannot leave duplicate or
  orphan investigation graphs.
- The suppression reason is a closed, immutable decision-time fact derived
  from the controlling Recommendation and its exact template Action. It does
  not change when that Recommendation later changes status.
- Policy v1 is deliberately conservative: proposed, snoozed, dismissed,
  accepted, merged and superseded controllers all remain controlling. The
  relation can represent a later release, but this policy never writes one.
- A repeated Signal receives a strict read-only projection containing the
  controller title and status, saved reason, policy version and optional Work
  link. It cannot expose the earlier rationale, steps or target evidence, and
  its Signal identity cannot approve, dismiss, snooze or reopen the controller.
- Exact deterministic pre-ledger investigations may be adopted lazily when the
  same issue is observed again. Adoption requires the supported terminal Run,
  source Signal, template keys, complete direct graph and exact template Action;
  unrelated same-page graphs and extra Actions do not qualify.
- Deleting a suppressed Signal removes only its own decision. A controller is
  retained while other Signals depend on it; whole-project deletion continues
  to remove the complete project graph.

### Consequence

Repeating a manual priority-page check preserves fresh evidence without filling
review and Work surfaces with another suggestion for the same issue. Dismissal,
snooze and accepted work now influence later generation without introducing a
new service, database, provider call, credential, model or scheduler.

### Deferred

Cooldowns, automatic snooze wake-up, dismissed-item restoration,
cross-detector deduplication and semantic URL matching require a separately
reviewed, versioned policy.

---

## ADR-047 - Opportunities compose the saved Recommendation read model

**Status:** Accepted

### Decision

- The first Opportunities inbox is a project-local application view over the
  existing unresolved priority-Recommendation read model. It preserves that
  model's ordering, sanitization, child caps and cursor contract.
- A separate app-only wrapper may expose an optional active controller Signal
  ID for the already-qualified investigation review path. It does not alter the
  MCP DTO or expose Run IDs, graph rows, source relationships or raw evidence.
- The controller lookup is bounded to the emitted project page and returns only
  unreleased controller links. It does not adopt legacy graphs, infer sources or
  mutate on read.
- Proposed and snoozed items can lazy-load the existing review disclosure.
  Accepted recommendations without an Action and entries without a qualified
  source remain visible but read-only.

### Consequence

Users can find saved rule-based suggestions near the top of Growth without
duplicating review authority or adding a new opportunity detector. The first
page intentionally stops at 20 entries and says when lower-priority saved
entries are not yet shown.

### Deferred

Interactive pagination, a generic Recommendation mutation endpoint, full
opportunity history and live discovery remain separate work.

---

## ADR-048 - Evaluated priority-page work may release one controller cycle

**Status:** Accepted

### Decision

- Policy v2 lazily releases an active priority-page controller only when its
  exact generated Action is `evaluated` and a new saved Signal was captured
  strictly later than that Action's evaluated instant.
- The release and the next controller claim occur in the existing atomic,
  provider-aware decision batch. Historical controller and suppressed links
  remain immutable; only the old controller's release timestamp is populated.
- The next graph uses the previous controller Recommendation ID as its
  deterministic cycle key. Concurrent later Signals therefore share parent
  identities and one loser is suppressed rather than leaving orphan rows.
- Invalid historical timestamps fail closed. Read-time adoption of legacy
  graphs remains unchanged and an unadopted graph cannot be released.

### Deferred

Material-change thresholds, cooldowns, cancellation release, recovery or
restoration policies, and releases for any detector other than priority-page
click decline remain out of scope.

---

## ADR-049 - Manual monthly review composes existing phase authorities

**Status:** Accepted

### Decision

- One explicit authenticated request may claim a `monthly_review` Run using a
  caller-stable manual request key and `growth-monthly-review-v1`. The shared
  Run contract already includes this type. The row returned by the atomic claim
  is qualified again before work, so an incompatible slot winner conflicts.
- Exact stored retries are read-only. Only the winning claim invokes the
  existing priority-page check under a deterministic child request identity,
  reads the current due-Measurement queue, and calls the existing immutable
  monthly report builder. The child detector keeps its own `manual_analysis`
  Run and remains the Signal and Recommendation provenance owner.
- Due Measurements retain each Plan's frozen timezone and remain a bounded
  current queue, not a coordinator snapshot. They are surfaced for human
  review only; the coordinator never collects observations or selects an
  outcome, confidence, narrative or confounders.
- The envelope freezes the previous complete report month at one clock and
  current report-timezone read. A built, recovered or no-activity report counts
  only when its returned period and timezone exactly match that expectation.
  Settings or coordinate drift is a safe partial failure.
- Complete, partial and failed phase outcomes map to the existing terminal Run
  states. Only static monthly-review failure codes and messages are persisted;
  raw provider, database and exception text never crosses the boundary. Valid
  child facts and Reports are not rolled back when another phase fails.
- A hard process interruption may leave the exact manual request honestly
  `running`, matching the current manual-check contract. Exact replay does not
  infer abandonment or repeat phases; a distinct request key can record a new
  explicit attempt.

### Consequence

The Growth backend gains one bounded monthly preparation action by composing
existing services rather than adding a scheduler, workflow engine, database or
provider client. It does not claim Gate 4, automated Measurement evaluation or
durable crash recovery.

The Growth page exposes that action as one explicit Monthly review card. The
client persists only the project-scoped retry key in browser session storage,
clears it after a known terminal response and refreshes the existing phase
views. Fresh responses may show the bounded phase results; exact replays remain
truthful to the stored coordinator summary and do not reconstruct mutable phase
state.

### Deferred

Historical review inspection, resumable phase checkpoints, leases or
abandonment, scheduled execution, additional detectors, AI, automatic
Measurement work, alerts, publication, sharing and delivery remain separate
decisions.

---

## ADR-050 - Striking-distance opportunities use exhaustive paired GSC evidence

**Status:** Accepted

### Decision

- One explicit authenticated request claims a `manual_analysis` Run with a
  caller-stable request key and `striking-distance-query-v1`. It remains
  separate from priority-page decline history and is not yet part of the
  monthly coordinator.
- The detector reuses the existing Search Console service to collect `query`
  and `page` rows for two adjacent 28-day windows. Requests use final web data,
  1,000-row pages and at most ten requests per window. Only an empty page proves
  exhaustion; a tenth non-empty page makes the inventory incomplete and no
  opportunity is created from it.
- A candidate must match a configured key page, have a real matching baseline
  query/page coordinate, rank from position 5 through 20 inclusive and have at
  least 50 current impressions. Provider aliases are reduced deterministically
  and at most three candidates are selected by saved numeric facts and stable
  tie-breakers.
- Each candidate saves position, impressions and clicks as three immutable
  Signals with one recomputable evidence reference bound to the project, site,
  query, page, two windows, captured-at time and measured values. The connected
  Search Console property must remain stable across collection, but is not
  persisted as a separate graph identity; authorization continues to resolve it
  from the project's connection. Impressions is the sole controller Signal; one
  rule-based Insight links all three facts. The
  Recommendation stores normalized keyword, URL and site targets and explicitly
  says that the cause and warranted change remain unknown.
- Newly generated `gsc_striking_distance_v2` evidence references bind the
  captured-at time. Read validation also recognizes immutable preview-era v1
  references, whose hash covers the same persisted facts except captured-at;
  they are never rewritten or emitted for new Runs.
- The repeat key is project, normalized query and the exact canonical key-page
  URL. URL normalisation reuses the query-aware key-page policy: protocol and
  leading-`www` aliases collapse, while meaningful queries and non-root trailing
  slashes remain distinct. A later exact match still saves fresh Signals but
  records only a suppressed controller decision against the existing
  Recommendation. Striking-distance controllers are not released in version 1.
- Review and approval reuse the existing Recommendation, Action and Work
  authorities. The review projection verifies the exact three-Signal graph and
  recomputes its evidence reference before showing the saved comparison.

### Consequence

Growth gains its first additional high-value detector without a new database,
provider client, auth system, scheduler, MCP server or AI interpretation path.
The live UI can find and review a bounded ranking opportunity while remaining
honest about incomplete inventories, repeat coverage and unknown causation.

This implements the first detector in BG-0402. It does not satisfy Gate 4,
because scheduled monthly execution and two consecutive unattended cycles are
still unproven.

### Deferred

High-impression/low-CTR detection, tracked-rank drops, audit and measurement-due
detectors, controller release rules, scheduled orchestration, provider-cost
inspection, alerts and AI-assisted diagnosis remain separate decisions.

---

## ADR-051 - High-impression low-CTR opportunities use exact prior query evidence

**Status:** Accepted

### Decision

- One explicit authenticated `high-impression-low-ctr-v1` manual Run uses its own
  `low-ctr-check:` request slot and reuses the exhaustive paired Search Console
  inventory from striking-distance collection.
- A configured key-page query/page coordinate must exist in both adjacent final
  28-day windows, have at least 100 impressions in each, retain a current
  average position from 1 through 4 inclusive without worsening, and lose at
  least 0.01 absolute CTR and 25% relative CTR from its exact prior period.
- At most three candidates are ordered by estimated missed clicks, current
  impressions and stable query/page tie-breaks. Each stores CTR, clicks,
  impressions and position with a common evidence reference; `ctr_below_expected`
  / `gsc_ctr` is the sole controller.
- Dedupe is scoped to project, normalized query and exact normalized key-page
  URL in a separate low-CTR family. Controllers are not released in v1. Review
  and Work qualification verify the exact four-fact, common-evidence graph.

### Consequence

This adds a conservative, reviewable second BG-0402 detector without a schema,
provider, auth, scheduling or controller-release change. It reports only an
observed CTR decline, never a cause or promised uplift.

### Deferred

Expected-CTR curves, persistent low CTR, segmentation, controller merging and
scheduled execution remain separate decisions.

---

## ADR-052 - Persistent tracked-rank drops require three degraded checks

**Status:** Accepted

### Decision

- One explicit authenticated `persistent-tracked-rank-drop-v1` manual Run uses
  its own `persistent-rank-drop-check:` request slot. It reads saved rank data
  and never starts a provider check.
- The detector reads the latest four completed non-subset runs for each active
  rank configuration. The same active keyword and device must have a snapshot
  in all four runs. The first snapshot must contain a ranked URL that matches
  one configured priority page. Each of the next three snapshots must be at
  least three positions worse than that baseline.
- A not-found rank is stored and displayed as outside the configuration's
  tracked depth. The Growth Signal uses depth plus one only as a numeric lower
  bound for comparison. It does not claim that value as the exact rank.
- The detector selects at most three candidates across the project. It orders
  them by latest loss, priority-page commercial weight and stable keyword,
  device and configuration tie-breaks.
- Each candidate creates one `tracked_rank_drop` Signal. Its `rank_snapshot`
  evidence reference contains the tracked depth and four canonical snapshot
  IDs. Investigation reads fetch those rows again and verify their project,
  configuration, full-run
  status, keyword, device, order, page and numeric facts before displaying the
  four-check sequence.
- Dedupe is scoped to project, configuration, tracked keyword, device and exact
  normalized priority page. Version 1 controllers do not release. Review,
  approval and Work use the existing Recommendation and Action paths.

### Consequence

Growth can identify a repeated rank loss without reacting to a single volatile
check or adding another evidence table. The result remains an investigation
prompt. It does not diagnose the cause or promise a ranking recovery.

This implements the third detector in BG-0402. Monthly orchestration still does
not invoke it.

### Deferred

Scheduled execution, alerts, elapsed-time persistence rules, cross-device
grouping, controller release and statistical trend models remain separate work.

---

## ADR-053 - New critical audit issues compare compatible saved crawls

**Status:** Accepted

### Decision

- One explicit authenticated `new-critical-audit-issue-v1` manual Run uses its
  own `critical-audit-issue-check:` request slot. It reads saved audits and does
  not start a crawl or consume audit capacity.
- The latest completed audit is the current observation. Its baseline is the
  latest earlier completed audit with the same canonical crawl start and
  `maxPages` limit. Lighthouse strategy does not affect crawl-issue
  comparability. Missing or malformed comparison history produces a limited or
  failed Run without saving candidates.
- The detector considers rows whose stored and registered severity is critical.
  Issue identity combines type and normalized affected page. Broken internal
  links also include the normalized target URL, because two broken destinations
  on one page require separate work. Volatile status codes do not change the
  identity.
- An identity present in the current audit and absent from the baseline is new.
  The detector orders identities by type, page and broken target, then keeps at
  most three.
- Each candidate creates one `new_critical_audit_issue` Signal. Its
  `audit_result` reference contains the baseline audit, current audit and current
  issue IDs. Investigation reads fetch both audits and their critical issues,
  verify scope and chronology, and prove baseline absence before displaying the
  comparison.
- Dedupe is scoped to project and stable issue identity. Version 1 controllers
  do not release. Review, approval and Work reuse the existing Recommendation
  and Action paths.

### Consequence

Growth can flag a newly observed critical crawl problem without rerunning a paid
audit or treating every repeated issue as new. The saved recommendation remains
an investigation prompt; it does not diagnose the cause or claim the issue is
still present after the saved current audit.

This implements the fourth detector in BG-0402. Monthly orchestration still
does not invoke it.

### Deferred

Scheduled audits, alert delivery, cadence policy, controller release, issue
resolution tracking and comparisons across changed crawl limits remain separate
work.

---

## ADR-054 - Measurement-due Signals wait for source availability

**Status:** Accepted

### Decision

- One explicit authenticated `measurement-due-v1` manual Run uses the existing
  `measurement_review` type and its own `measurement-due-check:` request slot.
  It reads active Measurement Plans and linked Actions. It does not call Search
  Console, collect observations or consume credits.
- The final required period ends at `longMeasurementEnd` when the Plan has a
  long window, and at `measurementEnd` otherwise. A Plan becomes due when that
  date is at least three calendar days behind the current
  `America/Los_Angeles` source date, matching the existing Search Console
  collection rule.
- The linked Action must still be `measuring` at the Plan's saved Action
  version. The Signal insert rechecks and locks the running Run, active Plan and
  exact Action state in one provider-aware statement. Missing, moved,
  concurrently changed or version-mismatched Actions do not produce a Signal.
  Their presence makes the Run partial so a user can inspect Work.
- The scan reads at most 51 active Plans. A 51-row result withholds all output
  and marks the Run partial; a complete scan records at most 50 Signals in
  source-availability and Plan-ID order.
- Each eligible Plan creates one `action_measurement_due` workflow Signal for
  its existing Action. The scalar value is a Boolean transition from zero to
  one at the final period date. Its `manual_observation` reference binds the
  Plan ID, Action version and source-availability date. This reuses the closed
  ADR-022 registry for a saved operational fact instead of treating an internal
  Plan as provider evidence.
- The Signal does not create an Insight, Recommendation or Action. The existing
  measuring Action owns the work, and the current due queue remains the place
  to collect evidence and finish human review.

### Consequence

Growth can persist that a Measurement reached its review threshold without
claiming that evidence was collected or that the outcome is known. This
implements the fifth BG-0402 detector. The detectors remain manual until
scheduled orchestration is implemented.

### Deferred

Scheduled measurement checks, notifications, stale-due escalation, provider
health, automatic evidence collection and cross-source freshness rules remain
separate work.

---

## ADR-055 - Monthly reviews use a persisted local-calendar schedule

**Status:** Accepted

### Decision

- A Growth-enabled project with monthly cadence stores one internal
  `nextMonthlyReviewAt` cursor. The configured report day is interpreted in the
  configured IANA report timezone. Existing enabled rows with a null cursor are
  initialised lazily; if this month's report day has passed, the first run is
  immediately due rather than silently skipping the previous complete month.
- An hourly Worker cron reads at most 51 due settings rows and admits at most 50. Each project is isolated from the others and the tick has a two-minute
  admission deadline. Overflow and all claim, dispatch and error counts are
  emitted in one structured summary; rows not admitted remain due.
- Before dispatch, the scheduler advances the cursor to the next future local
  report day with a project, monotonic settings-revision and observed-cursor
  compare-and-swap that also requires the project to remain unarchived. Every
  user settings write increments the integer revision, including writes in the
  same millisecond. A concurrent settings edit or archive wins cleanly. If
  Workflow creation fails, the scheduler restores the observed cursor only
  when that same revision still owns the advanced value.
- Each admitted project-period gets a deterministic Cloudflare Workflow
  identity and a frozen previous-complete-month coordinate. The Workflow input
  is strictly validated and its database step opens the established
  provider-safe Postgres scope. The step has bounded retries and a 15-minute
  timeout.
- The existing monthly coordinator owns execution. Scheduled Runs use the
  natural project, `monthly_review` and period-slot uniqueness with
  `trigger=scheduled`. A compatible running Run may resume its idempotent child
  phases after a Workflow retry; manual requests keep their exact-replay-only
  contract. The exact settings revision must still be enabled and monthly, and
  the project unarchived, when the first scheduled Run is claimed.
- A draft created by scheduled execution records `system` provenance with the
  stable `growth-monthly-scheduler` actor ID. Existing reports, Signals,
  Recommendations and Actions retain their current immutable/dedupe rules.

### Consequence

Growth can prepare its current monthly review without a signed-in user or a
second queue framework. The same deployment path provisions the new Workflow
binding for Wrangler and Alchemy stages. Manual review remains available and
uses a distinct cadence namespace.

This implements BG-0403, but it does not by itself satisfy Gate 4. Two
consecutive real unattended cycles still need to demonstrate that scheduling,
provider availability and dedupe behavior hold in production.

### Deferred

Weekly review, daily critical monitoring, automatic report publication or
delivery, notification, generic job administration, Docker cron delivery,
Workflow-instance inspection/restart and Gate 4 operational evidence remain
separate work.
