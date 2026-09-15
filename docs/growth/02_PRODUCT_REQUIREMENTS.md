# Bodkin Growth - Product Requirements

## Status

Product requirements for the first usable internal version and the path to agency/client use.

---

# 1. Scope hierarchy

## P0 - Closed-loop MVP

Must prove:

```text
signal → recommendation → action → change → measurement → report
```

on `bodkin.studio`.

## P1 - Agency internal

Must support multiple retained projects safely.

## P2 - Agent integration

Must make Growth state genuinely useful to Sherpa/Codex.

## P3 - Client experience

Must expose a simplified read-only report/status experience.

## P4 - Deeper execution

May connect CMS, deployment and project-management systems.

---

# 2. Project configuration

Every Growth-enabled OpenSEO project requires additional Growth settings.

## Required

- project objective;
- target country/market;
- primary domain;
- commercial priority areas;
- key pages;
- known competitors;
- report cadence;
- timezone.

## Optional

- conversion goal definitions;
- priority service/product weights;
- target audiences;
- topic clusters;
- protected/high-risk pages;
- content owners;
- delivery capacity estimate;
- Sherpa project identifier.

## Requirement

Growth settings extend the existing OpenSEO project. Do not create a parallel project model.

---

# 3. Priority pages

A project should allow specific URLs to be marked as:

- commercially important;
- strategically important;
- protected;
- actively optimised;
- informational/supporting.

Purpose:

- weight alerts;
- weight recommendations;
- avoid treating all pages equally;
- help agents understand redesign risk.

Example:

```text
/services/web-design
commercial_weight: 5
protected: true
```

---

# 4. Growth run

A Growth run is a traceable analysis execution.

Types:

- daily monitor;
- weekly review;
- monthly review;
- measurement review;
- manual analysis.

Each run stores:

- project;
- type;
- scheduled/manual;
- started/completed timestamps;
- status;
- input period;
- rules version;
- prompt/model version where AI was used;
- generated signal IDs;
- generated insight IDs;
- generated recommendation IDs;
- provider-cost summary;
- failure details.

Runs make the system reproducible and debuggable.

---

# 5. Signal

A Signal is a deterministic or externally sourced observation.

## Required fields

- project;
- run;
- type;
- entity type;
- entity reference;
- metric;
- baseline;
- current value;
- delta;
- period;
- severity;
- confidence;
- captured timestamp;
- evidence reference.

## Example signal types

### Search performance

- page_clicks_down;
- page_clicks_up;
- query_impressions_up;
- ctr_below_expected;
- query_position_drop;
- query_position_gain;
- striking_distance_keyword;
- page_query_concentration_change.

### Technical

- new_critical_audit_issue;
- indexability_change;
- canonical_mismatch;
- broken_internal_link;
- crawl_failure.

### Authority

- meaningful_backlink_loss;
- referring_domain_gain;
- referring_domain_loss.

### Workflow

- action_stale;
- action_measurement_due;
- high_priority_action_blocked.

## Product rule

Signals should not be created for every trivial metric change.

Every signal type requires explicit materiality rules.

---

# 6. Insight

An Insight interprets one or more signals.

An Insight is not a fact.

## Required fields

- project;
- run;
- title;
- explanation;
- hypothesis;
- confidence;
- evidence IDs;
- affected URLs;
- affected keywords;
- optional commercial context;
- model metadata if AI generated.

## Example

**Title:** Education landing page losing visibility

**Hypothesis:** Search demand is stable but ranking position has fallen across multiple related queries, indicating a likely visibility problem rather than a demand decline.

**Confidence:** 0.79

---

# 7. Recommendation

A Recommendation proposes work.

## Required fields

- project;
- source insight(s);
- title;
- rationale;
- category;
- expected impact;
- commercial relevance;
- confidence;
- effort;
- urgency;
- priority score;
- target URLs;
- target keywords;
- proposed steps;
- evidence;
- status.

## Recommendation statuses

- proposed;
- accepted;
- dismissed;
- snoozed;
- superseded;
- merged.

## Required user controls

- Accept;
- Dismiss;
- Snooze;
- Merge with another recommendation;
- Ask for deeper analysis.

## Dismissal reason

Optional but useful:

- irrelevant;
- already planned;
- not commercially important;
- insufficient evidence;
- wrong diagnosis;
- too much effort;
- duplicate;
- defer.

Dismissal data may later improve recommendation quality.

---

# 8. Priority model

Do not expose a fake precise formula as objective truth.

Internally, start with a transparent score built from discrete bands.

Example inputs:

```text
impact: 1..5
commercial_relevance: 1..5
confidence: 0..1
urgency: 1..3
effort: 1..5
```

Initial candidate:

```text
base = impact * commercial_relevance * confidence
priority = (base + urgency_weight) / effort_modifier
```

The exact formula should be calibrated after real use.

The UI should still show the component ratings, not only one number.

---

# 9. Action

Accepted recommendations can create one or more Actions.

## Required fields

- project;
- recommendation;
- title;
- description;
- category;
- priority;
- owner;
- status;
- target URLs;
- target keywords;
- created;
- approved;
- due date;
- implementation notes;
- change event links;
- measurement state.

## Action statuses

Recommended state machine:

```text
approved
  ↓
ready
  ↓
in_progress
  ↓
blocked
  ↘
implemented
  ↓
measuring
  ↓
evaluated
```

Terminal/alternate:

- cancelled;
- dismissed.

## Important distinction

`implemented` is not the same as `evaluated`.

An SEO action should remain visible until its outcome has been reviewed, unless measurement is explicitly not applicable.

---

# 10. Action board

Internal view.

Columns:

- Approved;
- Ready;
- In progress;
- Blocked;
- Implemented;
- Measuring;
- Evaluated.

Filters:

- project;
- owner;
- category;
- priority;
- month;
- URL;
- status.

Cards should show:

- title;
- why;
- priority;
- owner;
- age;
- current measurement state.

---

# 11. Change event

A Change Event records something meaningful that changed on the website or strategy.

## Sources

- manual;
- Sherpa;
- CMS webhook;
- Git/Vercel deployment;
- later integrations.

## Types

- content_updated;
- title_meta_updated;
- page_created;
- page_removed;
- redirect_changed;
- internal_links_changed;
- template_changed;
- structured_data_changed;
- technical_fix;
- design_restructure;
- migration;
- unknown/mixed.

## Required fields

- project;
- timestamp;
- source;
- actor;
- URL(s);
- description;
- linked action(s);
- optional deployment/commit reference.

## Product requirement

A Change Event can exist without an Action because unrelated changes may affect measurement.

---

# 12. Measurement plan

When investigation work is Done and has a linked website Change Event, the
system should propose a Measurement Plan. A user must explicitly select the
recorded change whose date anchors the plan before measurement starts.

## Measurement plan fields

- action;
- selected anchor Change Event;
- anchor timestamp and calendar date;
- target entities;
- primary metrics;
- secondary metrics;
- baseline window;
- exclusion/cooldown period;
- measurement window;
- comparison type;
- confounders;
- due date;
- status.

## Example defaults

For a content/page optimisation:

```text
baseline: previous 28 complete days before the selected change
cooldown: 7 days
primary window: days 8-35 after the selected change
long window: days 36-90
```

Defaults must be configurable and should not be treated as scientifically universal.

---

# 13. Measurement result

## Required

- action;
- measurement plan;
- observed values;
- baseline values;
- comparison values;
- percentage/absolute deltas;
- contextual/site-wide movement;
- confounding change events;
- narrative;
- confidence;
- outcome.

## Outcome enum

- strong_positive;
- positive;
- inconclusive;
- neutral;
- negative;
- strong_negative;
- not_measurable.

## Language rule

Do not claim causation unless the design genuinely supports it.

Preferred:

> "Clicks increased 18% in the measurement window after implementation."

Avoid:

> "This action caused an 18% increase."

---

# 14. Monthly review workflow

## Step 1 - Prepare

- verify required integrations;
- resolve prior failed jobs;
- identify actions due for measurement.

## Step 2 - Compute

- GSC period comparisons;
- rank changes;
- technical changes;
- backlink changes;
- existing action status;
- relevant AI visibility evidence if enabled.

## Step 3 - Create signals

Run deterministic detectors.

## Step 4 - Interpret

Create bounded evidence packets.

## Step 5 - Generate insights/recommendations

Use the AI layer only after facts are prepared.

## Step 6 - Deduplicate

Do not generate a new recommendation if:

- an equivalent recommendation is open;
- the same action is already in progress;
- the issue was dismissed and the evidence has not materially changed;
- an existing measurement is pending and should finish first.

## Step 7 - Human review

Bodkin accepts/dismisses/snoozes.

## Step 8 - Update report draft

The report is built from:

- performance;
- work completed;
- measured results;
- current risks/opportunities;
- next actions.

---

# 15. Daily monitoring

P0 daily monitoring should be intentionally narrow.

Potential triggers:

- priority page loses >X% clicks beyond expected volatility;
- multiple tracked commercial keywords drop materially;
- priority page becomes non-indexable;
- severe audit issue appears;
- GSC URL inspection changes unexpectedly.

Requirements:

- suppression/debounce;
- no repeated alert every day for the same unresolved state;
- link alert to existing/open Action if applicable;
- severity threshold;
- project-specific sensitivity later.

---

# 16. Weekly review

Output should be compact.

Sections:

- material gains;
- material losses;
- new striking-distance opportunities;
- actions at risk;
- actions ready for measurement;
- one recommended focus.

This is an internal workflow, not necessarily a client report.

---

# 17. Monthly report

## Report is a frozen snapshot

Once published, its underlying report narrative should not silently change when live metrics change.

Store:

- reporting period;
- generated timestamp;
- data cutoff;
- report version;
- structured sections;
- linked actions;
- linked measurements.

## Sections

### Executive summary

Short description of what materially happened.

### Performance

Agreed project KPIs.

### Meaningful changes

The few changes worth attention.

### Work completed

Actions implemented in period.

### Results from earlier work

Measurements that matured in period.

### Risks

High-priority unresolved problems.

### Opportunities

High-value recommendations.

### Next month

Approved/planned work.

## Output order

Prefer web view first.

Later:

- share link;
- print styles;
- PDF export.

---

# 18. Portfolio view

Agency-level internal screen.

Goal:

> Where should attention go?

Columns/cards should include:

- project;
- data freshness;
- search trend;
- high-priority risks;
- open actions;
- overdue actions;
- measuring actions;
- top opportunity;
- report status.

Avoid a synthetic "SEO health score" unless it is clearly decomposable and useful.

---

# 19. Project overview

Should answer:

1. Is anything wrong?
2. What improved?
3. What should we do next?
4. What are we currently working on?
5. What are we waiting to measure?

Suggested modules:

- current period summary;
- critical signals;
- top recommendations;
- active actions;
- measuring actions;
- key page movement;
- recent change events.

---

# 20. Opportunity feed

Each item should show:

- concise title;
- affected area;
- why now;
- evidence;
- impact;
- commercial relevance;
- confidence;
- effort;
- recommendation steps.

Expanded view can show:

- underlying signals;
- relevant query/page tables;
- SERP/competitor evidence;
- action history;
- prior dismissals.

---

# 21. Page intelligence view

Given a URL, show:

- role/priority;
- GSC performance;
- important queries;
- tracked ranks;
- recent audit issues;
- linked actions;
- change history;
- active measurements;
- related opportunities.

This is especially important for Sherpa and designers.

---

# 22. MCP requirements

## Read tools - first priority

```text
growth_get_project_summary
growth_get_priority_recommendations
growth_get_actions
growth_get_action
growth_get_page_context
growth_get_recent_changes
growth_get_measurements
growth_get_monthly_summary
```

## Analysis tools

```text
growth_find_opportunities
growth_analyse_page
growth_research_topic
```

These may orchestrate existing OpenSEO services.

## Write tools - controlled

```text
growth_create_action
growth_update_action_status
growth_record_change
```

Write tools require clear auth and should be independently permissioned.

## Never expose

- provider credentials;
- OAuth tokens;
- raw secrets;
- cross-project access;
- unrestricted CMS writes.

---

# 23. Sherpa use cases

## Page redesign

Sherpa asks `growth_get_page_context`.

Receives:

- organic importance;
- target queries;
- open recommendations;
- recent changes;
- "protected" status.

## New industry page

Sherpa asks `growth_research_topic`.

Receives:

- demand;
- relevant existing pages;
- competitor/intent evidence;
- content gaps;
- proposed internal links.

## Work handoff

Sherpa retrieves an Action and can include its rationale in a design/build brief.

## Implementation record

Where permitted, Sherpa can create a Change Event after work is published.

---

# 24. Permissions

Reuse OpenSEO organisation/project authorisation.

Growth adds operation-level permission checks.

Suggested capabilities:

```text
growth:read
growth:analyse
growth:recommend
growth:action:create
growth:action:update
growth:change:create
growth:report:publish
growth:admin
```

MVP may map these to existing OpenSEO roles rather than implementing a full custom RBAC matrix.

---

# 25. Integrations

## P0

- DataForSEO via OpenSEO;
- Google Search Console via OpenSEO;
- OpenSEO rank tracking;
- OpenSEO site audit;
- OpenSEO MCP.

## P1/P2

- GA4;
- Sherpa project context;
- deployment webhook.

## Later

- Sanity;
- WordPress;
- GitHub;
- Vercel;
- Notion or another PM system;
- Bing Webmaster Tools if valuable.

Integrations should be justified by workflow value, not by checklist completeness.

---

# 26. Cost controls

Each Growth run should record external-cost usage where possible.

Requirements:

- no repeated paid calls when a sufficiently fresh cached result exists;
- project-level monthly DataForSEO usage visibility;
- expensive analysis explicitly triggered or scheduled;
- AI visibility/LLM search calls separated because costs can differ;
- manual "deep research" may cost more than routine monitoring.

---

# 27. AI quality requirements

AI-generated Insights/Recommendations must:

- cite internal evidence IDs;
- distinguish fact from hypothesis;
- avoid unsupported claims;
- include confidence;
- produce concrete actions;
- avoid generic SEO boilerplate;
- respect project commercial context;
- not recommend duplicate work;
- not recommend changing protected pages without warning.

Store:

- model;
- prompt/template version;
- structured output;
- generation timestamp.

---

# 28. UX quality requirements

The product should feel like a calm decision tool.

Avoid:

- dense Semrush-like navigation;
- hundreds of metrics on one screen;
- traffic-light scores with no explanation;
- AI chat as the only interface;
- arbitrary gamification.

Prefer:

- strong hierarchy;
- few high-value cards;
- evidence on demand;
- clear status;
- visible provenance;
- explicit next action.

---

# 29. MVP acceptance criteria

MVP is accepted only when all are true:

1. `bodkin.studio` is a Growth-enabled OpenSEO project.
2. At least 28 days of useful data can be queried or a development fixture can simulate it.
3. A monthly Growth run can execute without manual data assembly.
4. Deterministic detectors create signals.
5. At least one bounded AI analysis creates an Insight and Recommendation.
6. Recommendation evidence is inspectable.
7. Recommendation can be accepted into an Action.
8. Action status is tracked.
9. A Change Event can be attached to the Action.
10. Implementation starts a Measurement Plan.
11. A Measurement Result can be computed.
12. Report can include that result.
13. MCP can retrieve project summary, Action and page context.
14. No Growth tool can access another organisation's project.
15. CI passes on both SQLite/D1 and Postgres schema compatibility where changed.

---

# 30. MVP kill criteria

Pause feature expansion if after several real cycles:

- most recommendations are generic;
- Bodkin regularly dismisses recommendations as irrelevant;
- the system cannot explain why a recommendation exists;
- results cannot be sensibly measured;
- the team keeps using spreadsheets/Notion instead of Actions;
- reports still require substantial manual reconstruction.

Fix the operating loop before adding breadth.
