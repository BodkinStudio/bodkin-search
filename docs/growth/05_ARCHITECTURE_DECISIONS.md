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
