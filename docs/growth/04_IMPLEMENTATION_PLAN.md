# Bodkin Growth - Implementation Plan

## Delivery philosophy

Do not ask Codex to "build Bodkin Growth."

Build the product as a sequence of narrow vertical slices with explicit gates.

Every phase should leave the repository in a mergeable state.

---

# Phase 0 - Fork and discovery

## Goal

Establish the OpenSEO fork and replace assumptions in this planning pack with verified repository facts.

## Tasks

### BG-0001 Fork OpenSEO

- create Bodkin fork;
- configure `origin` and `upstream`;
- record upstream commit SHA;
- run standard install/build/test locally.

### BG-0002 Repository map

Codex must produce `docs/growth/UPSTREAM_MAP.md` containing:

- auth modes;
- organisation/project model;
- database providers;
- GSC services;
- rank services/history;
- site-audit services;
- backlink services/history;
- AI-visibility services;
- scheduling entry points;
- MCP auth helper;
- MCP registration pattern;
- current GA4 state;
- current report/share state;
- current upstream roadmap/issues relevant to Growth.

No product code in this task.

### BG-0003 Gap check

Compare this plan with current upstream.

Output:

```text
Already exists upstream
Can be composed from existing services
Must be added
Should wait
```

### BG-0004 Decide deployment mode for prototype

Document choice and rationale.

Must explicitly test the path required for:

- browser app;
- GSC;
- MCP authentication.

## Gate 0

Do not begin Growth schema work until:

- OpenSEO builds/tests;
- upstream map exists;
- duplicate planned features are removed;
- current MCP auth path is understood.

---

# Phase 1 - Growth domain primitives

## Goal

Add the minimum data model required for the closed loop.

### BG-0101 Growth schema ADR

Confirm final table names/relationships.

Do not implement yet.

### BG-0102 Project Growth settings

Add:

- Growth enabled state;
- commercial/project context;
- report timezone/cadence basics.

UI can be utilitarian.

### BG-0103 Priority pages

Add CRUD for:

- URL;
- role;
- commercial weight;
- protected flag.

Validate URLs against project domain.

### BG-0104 Growth runs

Add run repository/service.

Support:

- manual run creation;
- status;
- period;
- version;
- failure.

### BG-0105 Signals

Add schema/repository/service.

No AI.

### BG-0106 Insights and recommendation schema

Add persistence and relation to Signals.

No generator yet.

### BG-0107 Actions and Action events

Implement state machine and event history.

### BG-0108 Change events

Manual change recording + Action linking.

### BG-0109 Measurement schema

Plans, metrics, observations, results.

### BG-0110 Reports schema

Frozen report header/sections.

## Tests

- cross-project constraints;
- action transitions;
- URL validation;
- dual DB schema parity.

## Gate 1

A developer must be able to manually create:

```text
Signal
→ Insight
→ Recommendation
→ Action
→ Change
→ Measurement result
→ Report
```

through service-level tests or minimal dev UI.

---

# Phase 2 - First vertical detector

## Goal

Prove that live/fixture OpenSEO data can become a useful Recommendation.

Use only one detector first.

Recommended:

**Priority page search-performance decline.**

### BG-0201 Growth test fixture

Create a deterministic fixture representing 90 days of data.

### BG-0202 Search performance adapter

Reuse OpenSEO GSC service.

Return a narrow Growth DTO.

Do not duplicate OAuth/provider code.

### BG-0203 Page decline detector

Requirements:

- minimum traffic threshold;
- current vs comparison;
- optional site-level context;
- priority page weighting;
- deterministic tests.

### BG-0204 Evidence packet builder

Build bounded packet from Signal + project context.

### BG-0205 AI Insight generator

Structured Zod output.

Must:

- label hypothesis;
- cite evidence IDs;
- return confidence.

### BG-0206 Recommendation generator

Structured output:

- title;
- rationale;
- proposed steps;
- impact;
- effort;
- confidence.

### BG-0207 Recommendation dedupe

Prevent repeated equivalent recommendations.

### BG-0208 Opportunity UI

Minimal list + detail:

- evidence;
- interpretation;
- recommendation;
- accept/dismiss/snooze.

### BG-0209 Accept -> Action

One click creates Action with traceability.

## Gate 2

Run against the fixture and `bodkin.studio`.

Bodkin should be able to answer:

> Is this recommendation actually useful?

If not, stop and improve this slice before adding detectors.

---

# Phase 3 - Delivery and measurement

## Goal

Close the loop.

### BG-0301 Action board

Internal columns:

- Approved;
- Ready;
- In Progress;
- Blocked;
- Implemented;
- Measuring;
- Evaluated.

### BG-0302 Action detail

Show:

- evidence chain;
- recommendation;
- owner/status;
- target pages;
- change events;
- measurement.

### BG-0303 Record implementation

User can:

- mark implemented;
- create/link Change Event;
- record implementation note;
- set implementation timestamp.

### BG-0304 Measurement defaults

For page optimisation:

- baseline;
- cooldown;
- primary window;
- optional long window.

### BG-0305 Measurement data collector

Use same canonical data adapters as detection.

### BG-0306 Measurement calculation

Compute:

- baseline;
- post-change;
- site/cluster comparison where available;
- deltas;
- data completeness.

### BG-0307 Confounder detection

Find overlapping Change Events.

Lower confidence where appropriate.

### BG-0308 Measurement interpretation

AI optional.

Produces:

- positive/neutral/negative/inconclusive;
- explanation;
- confidence;
- explicit non-causal language.

### BG-0309 Measurement UI

Show before/after and context.

## Gate 3

At least one real or fixture Action must traverse:

```text
approved → implemented → measuring → evaluated
```

and preserve the full evidence chain.

---

# Phase 4 - Monthly operating cycle

## Goal

Make the workflow repeatable rather than manual.

### BG-0401 Monthly run orchestration

Sequence:

1. load project;
2. validate integrations;
3. run detectors;
4. create Signals;
5. generate Insights;
6. generate/dedupe Recommendations;
7. evaluate due Measurements;
8. build report draft.

### BG-0402 Additional high-value detectors

Add one at a time.

Recommended order:

1. striking-distance query;
2. high-impression/low-CTR;
3. persistent tracked-rank drop;
4. new critical audit issue;
5. measurement due.

### BG-0403 Scheduled monthly execution

Use existing OpenSEO scheduling/workflows.

### BG-0404 Weekly review

Compact internal run.

### BG-0405 Daily critical monitor

Only after false-positive rate is acceptable.

### BG-0406 Run inspector

Admin/dev view:

- status;
- duration;
- detectors;
- errors;
- created entities;
- provider cost.

## Gate 4

Run two consecutive monthly cycles without:

- duplicate recommendation spam;
- unexplained failures;
- substantial manual data preparation.

---

# Phase 5 - Reporting

## Goal

Replace manual retainer reconstruction.

### BG-0501 Report data builder

No AI prose yet.

Structured:

- performance;
- changes;
- completed Actions;
- measured results;
- risks;
- opportunities;
- next work.

### BG-0502 Narrative generator

Generate concise executive summary from structured report.

### BG-0503 Internal report view

Readable HTML.

### BG-0504 Freeze/publish

Published report becomes immutable versioned snapshot.

### BG-0505 Print stylesheet

Allow browser PDF export.

### BG-0506 Shareable report - later in phase

Only after security review:

- opaque token;
- revocable;
- read-only;
- project isolated.

## Gate 5

A monthly client review can be prepared without manually rebuilding what happened from separate tools.

---

# Phase 6 - MCP / Sherpa

## Goal

Make Growth useful inside design/content/build workflows.

### BG-0601 `growth_get_project_summary`

Read-only.

### BG-0602 `growth_get_page_context`

Most strategically important first tool.

### BG-0603 `growth_get_actions`

Read-only/paginated.

### BG-0604 `growth_get_action`

Returns full chain.

### BG-0605 `growth_get_monthly_summary`

Structured.

### BG-0606 `growth_find_opportunities`

Orchestrates existing services and Growth evidence.

Only after deterministic opportunity feed works.

### BG-0607 `growth_record_change`

First write tool.

Requires:

- explicit permission review;
- audit event;
- idempotency;
- project URL validation;
- tests.

### BG-0608 Sherpa integration test

Example acceptance:

> Sherpa is asked to redesign a protected landing page and retrieves Growth page context before proposing the new structure.

## Gate 6

Growth evidence appears naturally in a real Sherpa workflow.

If users have to remember obscure tool names and manually reconstruct context, improve the MCP skill/instructions rather than adding more tools.

---

# Phase 7 - Agency rollout

## Goal

Use Growth on retained clients.

### BG-0701 Project onboarding workflow

Checklist:

- project;
- GSC;
- rank tracker;
- priority pages;
- commercial goals;
- competitors;
- reporting cadence;
- Growth enabled.

### BG-0702 Portfolio dashboard

Agency attention view.

### BG-0703 Per-project cost visibility

### BG-0704 Team ownership

### BG-0705 Operational alerting

### BG-0706 Data retention/backups review

### BG-0707 Postgres decision

Move if justified by real data/operational requirements.

## Gate 7

At least 2-3 client projects can run without data leakage or unreasonable operating cost.

---

# Phase 8 - Analytics and conversion evidence

## Goal

Connect search work to business outcomes.

Before implementing, inspect current OpenSEO GA4 state.

### BG-0801 Analytics ADR

Decide whether to:

- reuse upstream GA4;
- contribute upstream;
- build a Growth adapter.

### BG-0802 Organic landing-page metrics

### BG-0803 Conversion metrics

Project-specific mapping.

### BG-0804 Measurement enrichment

Add conversion outcomes where data quality permits.

Do not make every project require GA4.

---

# Phase 9 - Delivery integrations

## Deployment

- GitHub/Vercel webhook;
- deployment event creation.

## CMS read

- Sanity;
- WordPress.

## CMS proposal

Allow agent/system to prepare:

- metadata;
- internal links;
- drafts.

## Write/publish

Separate future security milestone.

No auto-publishing by default.

---

# Phase 10 - Client portal

Only build after internal reporting has settled.

Client should see:

- summary;
- performance;
- work completed;
- results;
- next priorities.

Do not expose:

- internal confidence debates;
- raw prompts;
- internal comments;
- irrelevant provider complexity;
- other clients.

---

# Codex work-package rules

Each ticket should:

1. inspect current upstream before code;
2. state reuse vs new code;
3. define schema/API contracts;
4. implement tests first or alongside;
5. keep changes focused;
6. run repository CI checks;
7. update Growth docs when architecture changes.

Do not bundle:

- schema + full UI + MCP + scheduling + reports

into one task.

---

# Initial Codex sequence

After Phase 0 discovery, the suggested first ten implementation sessions are:

```text
1. Growth settings + priority pages
2. Growth run + signal persistence
3. Recommendation/action domain model
4. Change + measurement domain model
5. Synthetic fixture
6. GSC page-performance adapter
7. First deterministic detector
8. Evidence packet + AI insight/recommendation
9. Opportunity review -> Action
10. Action implementation -> Measurement
```

Only after this should Codex build portfolio/reporting polish.

---

# Project success checkpoint

After the first 4-6 weeks of dogfooding, review:

- recommendations generated;
- accepted;
- dismissed;
- reasons for dismissal;
- actions completed;
- actions measured;
- useful results;
- false positives;
- monthly manual time saved;
- DataForSEO/AI cost.

Decision:

```text
continue
refine
reduce scope
or stop
```

Do not let sunk development cost turn a weak workflow into a permanent internal product.
