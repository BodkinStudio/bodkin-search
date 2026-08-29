# Bodkin Growth - Technical Architecture

## 1. Architecture stance

Build Bodkin Growth as a **modular extension of an OpenSEO fork**.

Do not create a second application until a specific need justifies it.

Target:

```text
┌──────────────────────────────────────────────┐
│              Bodkin OpenSEO Fork             │
│                                              │
│  Existing OpenSEO                            │
│  ├─ projects / organisations                 │
│  ├─ DataForSEO                               │
│  ├─ keyword research                         │
│  ├─ rank tracking + snapshots                │
│  ├─ backlinks + snapshots                    │
│  ├─ GSC                                      │
│  ├─ site audits                              │
│  ├─ AI visibility                            │
│  ├─ auth                                     │
│  ├─ workflows                                │
│  └─ MCP                                      │
│                                              │
│  Bodkin Growth                               │
│  ├─ project growth context                   │
│  ├─ runs                                     │
│  ├─ signals                                  │
│  ├─ insights                                 │
│  ├─ recommendations                          │
│  ├─ actions                                  │
│  ├─ change events                            │
│  ├─ measurements                             │
│  ├─ reports                                  │
│  └─ growth MCP tools                         │
└──────────────────────────────────────────────┘
```

---

# 2. Upstream assumptions

At the time this plan was written, OpenSEO uses:

- TypeScript;
- React;
- TanStack Start / Router / Query;
- Zod;
- Drizzle;
- Cloudflare Worker infrastructure;
- D1/SQLite by default;
- optional Postgres backend;
- DataForSEO;
- Better Auth;
- MCP SDK/server packages;
- Cloudflare workflow primitives.

OpenSEO's own `AGENTS.md` requires:

- simple, readable code;
- reuse of existing implementations;
- server-function -> service -> repository for application-backed backend features;
- explicit relational modelling;
- compatibility with SQLite and Postgres;
- Zod at trust boundaries.

Bodkin changes must preserve these principles.

**Codex must inspect current upstream before implementation.**

---

# 3. Fork strategy

Set remotes:

```bash
git remote rename origin upstream
git remote add origin <bodkin-fork>
git fetch --all
```

Or equivalent depending on fork creation.

Maintain:

```text
upstream/main = OpenSEO
origin/main   = Bodkin maintained branch
```

## Branching

Prefer small feature branches:

```text
growth/project-settings
growth/signals
growth/recommendations
growth/actions
growth/measurement
growth/reports
growth/mcp-page-context
```

Avoid one long-lived mega-branch.

## Merge policy

Before a major Growth phase:

1. fetch upstream;
2. review new upstream capabilities;
3. merge/rebase intentionally;
4. remove custom code that upstream now provides;
5. rerun CI and Growth regression tests.

---

# 4. Module boundaries

Recommended structure:

```text
src/server/features/growth/
├── repositories/
├── services/
│   ├── runs/
│   ├── signals/
│   ├── insights/
│   ├── recommendations/
│   ├── actions/
│   ├── changes/
│   ├── measurements/
│   └── reports/
├── detectors/
├── scoring/
├── prompts/
├── schemas/
└── types/

src/client/features/growth/
├── overview/
├── opportunities/
├── actions/
├── page-context/
├── reports/
└── shared/

src/server/mcp/tools/
├── growth-get-project-summary.ts
├── growth-get-page-context.ts
├── growth-get-actions.ts
├── growth-get-action.ts
├── growth-get-monthly-summary.ts
└── ...
```

Exact paths should match current OpenSEO conventions discovered in the fork.

---

# 5. Data-model strategy

Extend existing projects.

Do not create:

```text
growth_projects
```

unless a strong reason appears.

Every Growth table should carry a `projectId` where direct project scoping materially improves security/querying, even if the relation could be inferred indirectly.

---

# 6. Proposed Growth tables

Names are proposals. Codex should align with current schema conventions.

## 6.1 growth_project_settings

```text
project_id PK/FK
objectives
commercial_context
report_timezone
report_day
default_measurement_config
sherpa_project_ref
growth_enabled
created_at
updated_at
```

Relational data that needs querying should not be buried in JSON.

Separate tables may be better for:

- priority pages;
- commercial themes;
- conversion goals.

## 6.2 growth_priority_pages

```text
id
project_id
url
role
commercial_weight
protected
notes
created_at
updated_at
```

Unique on project + normalised URL.

## 6.3 growth_runs

```text
id
project_id
run_type
status
period_start
period_end
started_at
completed_at
detector_version
analysis_version
model
provider_cost_minor
error_message
```

## 6.4 growth_signals

```text
id
project_id
run_id
signal_type
entity_type
entity_key
metric
severity
confidence
period_start
period_end
baseline_value
current_value
delta_value
delta_percent
evidence_kind
evidence_ref
created_at
resolved_at
```

If a metric shape cannot fit simple scalar fields, use a related evidence table rather than turning the Signal into an unbounded JSON blob.

## 6.5 growth_insights

```text
id
project_id
run_id
title
explanation
hypothesis
confidence
status
model
prompt_version
created_at
```

## 6.6 growth_insight_signals

Many-to-many:

```text
insight_id
signal_id
```

## 6.7 growth_recommendations

```text
id
project_id
run_id
title
rationale
category
impact
commercial_relevance
effort
urgency
confidence
priority_score
status
snoozed_until
dismissal_reason
created_at
reviewed_at
```

## 6.8 growth_recommendation_insights

```text
recommendation_id
insight_id
```

## 6.9 growth_recommendation_targets

Normalise targets:

```text
id
recommendation_id
target_type   // url | keyword | cluster | site
target_value
```

## 6.10 growth_actions

```text
id
project_id
recommendation_id nullable
title
description
category
priority
status
owner_user_id nullable
due_at
approved_at
started_at
implemented_at
evaluated_at
cancelled_at
created_at
updated_at
```

## 6.11 growth_action_events

Immutable event history:

```text
id
action_id
event_type
actor_type
actor_id
from_status
to_status
note
created_at
```

This supports audit/history without losing prior state.

## 6.12 growth_change_events

```text
id
project_id
source
change_type
actor_type
actor_id
description
happened_at
external_ref
created_at
```

## 6.13 growth_change_event_urls

```text
change_event_id
url
```

## 6.14 growth_action_changes

```text
action_id
change_event_id
```

## 6.15 growth_measurement_plans

```text
id
project_id
action_id
status
baseline_start
baseline_end
cooldown_end
measurement_start
measurement_end
long_measurement_end nullable
comparison_mode
created_at
```

## 6.16 growth_measurement_metrics

```text
id
measurement_plan_id
metric_type
entity_type
entity_key
is_primary
```

## 6.17 growth_measurement_results

```text
id
measurement_plan_id
outcome
confidence
summary
evaluated_at
model nullable
prompt_version nullable
```

## 6.18 growth_measurement_observations

```text
id
measurement_plan_id
metric_id
period_type
value
captured_at
```

Period type could include:

- baseline;
- measurement;
- comparison;
- long_term.

## 6.19 growth_reports

```text
id
project_id
report_type
period_start
period_end
status
data_cutoff
version
generated_at
published_at
created_by
```

## 6.20 growth_report_sections

```text
id
report_id
section_type
sort_order
structured_content
created_at
```

Report content may reasonably contain bounded structured JSON because it is a frozen presentation snapshot rather than relational operating data.

---

# 7. Reuse existing OpenSEO data

Codex should first locate canonical services for:

- GSC performance;
- URL inspection;
- rank tracker current/history;
- domain keywords;
- backlinks;
- site audit;
- keyword metrics;
- AI visibility.

Growth services should call these services/repositories.

Do not call DataForSEO directly from Growth if an OpenSEO service already wraps the same operation.

Benefits:

- shared caching;
- shared error handling;
- consistent project market context;
- provider-cost behaviour;
- easier upstream merges.

---

# 8. Growth detector pipeline

Architecture:

```text
Data adapters
   ↓
Normalised facts
   ↓
Detectors
   ↓
Signals
   ↓
Evidence packet builder
   ↓
Insight generator
   ↓
Recommendation generator
   ↓
Deduplicator
   ↓
Human review
```

## Detector interface

Conceptually:

```ts
interface GrowthDetector {
  id: string;
  version: string;
  run(context: DetectorContext): Promise<DetectedSignal[]>;
}
```

## Detector requirements

Each detector must define:

- input data;
- materiality threshold;
- severity logic;
- suppression logic;
- evidence;
- tests.

No "magic AI detector" in P0.

---

# 9. Initial detectors

Start with a small, high-value set.

## 9.1 Priority page click decline

Inputs:

- GSC page clicks;
- comparison period;
- rolling baseline if available;
- priority-page weight.

Suppress if:

- low absolute volume;
- data incomplete;
- obvious site-wide equivalent decline.

## 9.2 High-impression low-CTR opportunity

Inputs:

- impressions;
- CTR;
- average position;
- query/page;
- minimum sample threshold.

Do not flag low CTR where ranking position makes low CTR expected.

## 9.3 Striking-distance opportunity

Inputs:

- queries with meaningful impressions;
- position band e.g. 4-15;
- page/query relevance;
- commercial weight.

## 9.4 Tracked rank loss

Inputs:

- rank snapshots;
- commercial tracked keywords;
- multi-check persistence.

Avoid one-day volatility alerts.

## 9.5 New critical audit issue

Inputs:

- site audit results;
- prior audit state.

## 9.6 Measurement due

Workflow signal, not SEO signal.

Inputs:

- implemented Action;
- measurement dates;
- data freshness.

---

# 10. Evidence packet

The AI should never receive "all project SEO data."

Create a bounded packet.

Example:

```json
{
  "project": {
    "name": "Example",
    "commercialContext": ["..."]
  },
  "subject": {
    "type": "page",
    "url": "/education"
  },
  "period": {
    "current": "...",
    "comparison": "..."
  },
  "signals": [
    {
      "type": "page_clicks_down",
      "current": 421,
      "baseline": 538,
      "deltaPercent": -21.7
    }
  ],
  "supportingFacts": {
    "impressionsDeltaPercent": -1.9,
    "rankChanges": [],
    "relatedOpenActions": []
  }
}
```

The packet builder must:

- minimise irrelevant data;
- redact secrets;
- include provenance IDs;
- include project commercial context;
- include known confounders/change events.

---

# 11. AI boundary

## AI may

- synthesise multiple signals;
- form a clearly labelled hypothesis;
- propose a recommendation;
- estimate qualitative impact/effort;
- produce report narrative;
- generate a page brief when requested.

## AI must not

- calculate canonical metrics;
- invent search volumes;
- invent competitor evidence;
- claim causation from correlation;
- access credentials;
- choose another project's data;
- publish website changes automatically in MVP.

## Structured output

All AI outputs should be validated with Zod.

Example:

```ts
const InsightOutput = z.object({
  title: z.string(),
  hypothesis: z.string(),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()).min(1),
});
```

---

# 12. Recommendation deduplication

Before inserting a proposed Recommendation, search for semantically/effectively equivalent open work.

Initial deterministic dedupe keys can use:

- project;
- category;
- primary URL;
- primary keyword/cluster;
- source signal type.

Later semantic similarity can assist, but deterministic keys should remain.

Rules:

- if equivalent Action is open -> link new Signal to existing work;
- if recommendation is snoozed -> only revive when evidence materially changes;
- if dismissed -> respect dismissal cooldown;
- if Action is measuring -> avoid proposing the same change again unless severe regression occurs.

---

# 13. Scheduler / workflows

Use OpenSEO's existing scheduling/workflow infrastructure.

Do not introduce a second queue framework without evidence the current one is insufficient.

Suggested scheduled entry points:

```text
growth_daily_monitor
growth_weekly_review
growth_monthly_review
growth_measurement_due
```

Each schedule:

1. finds Growth-enabled projects due;
2. creates a Growth Run;
3. executes deterministic phases;
4. records partial failures;
5. avoids duplicate in-flight runs;
6. completes with cost/telemetry metadata.

## Idempotency

A run should have a natural uniqueness key:

```text
project + run_type + period/cadence slot
```

Retry must not create duplicate Recommendations/Actions.

---

# 14. Monthly workflow implementation

Suggested service orchestration:

```text
MonthlyGrowthService.run(projectId, period)
  ├─ ProjectContextService
  ├─ SearchPerformanceAdapter
  ├─ RankAdapter
  ├─ AuditAdapter
  ├─ BacklinkAdapter
  ├─ ActionRepository
  ├─ ChangeRepository
  ├─ DetectorRunner
  ├─ EvidencePacketBuilder
  ├─ InsightService
  ├─ RecommendationService
  ├─ MeasurementService
  └─ ReportDraftService
```

Keep orchestration explicit.

Avoid a deep agent framework for this deterministic workflow.

---

# 15. Analytics provider abstraction

Do not block P0 on GA4.

Define a small interface only when needed.

Example:

```ts
interface GrowthAnalyticsProvider {
  getOrganicLandingPageMetrics(input: ...): Promise<...>;
  getConversionMetrics(input: ...): Promise<...>;
}
```

Implement:

```text
GSC-derived search metrics first
GA4 adapter later
```

Inspect OpenSEO upstream before writing any GA4 OAuth/storage layer because active upstream work may make custom implementation unnecessary.

---

# 16. Sherpa context adapter

Growth should not import an entire Sherpa datastore in P0.

Define a small optional context shape:

```ts
type GrowthBusinessContext = {
  projectRef?: string;
  proposition?: string;
  priorityOffers?: Array<{
    name: string;
    weight: number;
  }>;
  audiences?: string[];
  strategicThemes?: string[];
};
```

Initial source can be:

- manual Growth project settings.

Later:

- Sherpa MCP/API/connector.

This preserves a clean boundary.

---

# 17. MCP architecture

Extend OpenSEO's existing MCP server.

## Tool pattern

Follow current OpenSEO conventions:

- one file per tool;
- Zod input;
- Zod output where supported;
- project-scoped auth using existing helpers;
- service call rather than direct DB/provider logic;
- cost note when a tool can trigger paid provider work.

## First read tools

### growth_get_project_summary

Returns:

- project context;
- data freshness;
- open high-priority recommendations;
- current actions;
- due measurements;
- top recent signals.

### growth_get_page_context

Input:

- projectId;
- URL.

Returns:

- priority/protection state;
- search performance summary;
- tracked-query context;
- open Recommendations/Actions;
- recent Change Events;
- active Measurement Plans.

### growth_get_actions

Filterable, paginated.

### growth_get_action

Full evidence -> recommendation -> change -> measurement chain.

### growth_get_monthly_summary

Returns structured report data, not only prose.

## First write tool

### growth_record_change

Only after auth/audit tests exist.

Requirements:

- project scoped;
- actor logged;
- URL allowlist/domain validation;
- no provider write;
- idempotency/external reference support.

---

# 18. MCP permissions

OpenSEO API keys are user-level credentials.

For Bodkin production, add explicit Growth operation checks.

Do not assume possession of a valid MCP key is sufficient for every write operation.

At minimum:

- verify project belongs to caller's organisation;
- enforce operation allowlist;
- record audit event;
- support revocation;
- reject cross-domain URL write references.

If per-tool scopes do not fit upstream auth cleanly, keep all Growth MCP write tools disabled initially.

---

# 19. Change-event integrations

## P0

Manual form + MCP `growth_record_change`.

## P1

Deployment webhook.

Payload should identify:

- project;
- environment;
- deployment;
- timestamp;
- commit SHA if available.

Do not automatically assume every deployment changed every page.

Prefer a manual or CMS-derived URL association unless diffing is reliable.

## Later CMS adapters

- Sanity;
- WordPress.

CMS integration should first be read-only.

---

# 20. Reporting architecture

A report is created from structured query results.

Pipeline:

```text
ReportDataBuilder
    ↓
structured report model
    ↓
NarrativeGenerator
    ↓
validated sections
    ↓
snapshot persisted
    ↓
UI renderer
```

Do not create a PDF directly from AI output.

The HTML/web report is canonical.

---

# 21. Report model

Example:

```ts
type GrowthReport = {
  period: DateRange;
  executiveSummary: string;
  performance: MetricSummary[];
  notableChanges: ReportInsight[];
  completedActions: ActionSummary[];
  measuredResults: MeasurementSummary[];
  risks: RecommendationSummary[];
  opportunities: RecommendationSummary[];
  nextPeriod: ActionSummary[];
};
```

AI narrative should never alter the underlying numeric data.

---

# 22. Measurement architecture

## MeasurementService

Responsibilities:

- propose defaults;
- validate data availability;
- schedule due review;
- collect baseline and measurement metrics;
- calculate deltas;
- include comparison/site-level context;
- identify overlapping Change Events;
- prepare evidence packet for optional AI interpretation;
- store result.

## Confounder logic

If another Change Event affected the same URL during a measurement window:

- flag it;
- lower confidence;
- include it in report language.

If a major site migration occurs:

- potentially invalidate page-level measurements.

---

# 23. Performance/cost considerations

## Avoid expensive provider calls in page rendering

UI routes should usually read:

- stored state;
- cached service data;
- explicit refresh results.

Paid calls should be:

- scheduled;
- user-triggered;
- clearly labelled.

## Cost log

Extend existing provider billing/usage infrastructure if available before inventing a new one.

Growth Run should be able to report:

```text
DataForSEO cost
LLM cost
number of provider calls
```

at least approximately.

---

# 24. Database backend

Preserve dual-dialect compatibility.

## P0

Use the simplest upstream-supported local/dev backend.

## Internal production decision gate

Before client rollout, evaluate:

- D1 storage growth;
- snapshot volume;
- report/action query complexity;
- backup requirements;
- migration operational maturity.

Use OpenSEO's supported Postgres path if needed.

Do not create an entirely separate database for Growth.

---

# 25. Security

Requirements:

- reuse OpenSEO organisation/project authorisation;
- no raw OAuth tokens in model context;
- no secrets in Growth evidence;
- validate URLs belong to project domain where required;
- audit MCP writes;
- log AI model/prompt version;
- redact PII from analytics context;
- least-privilege Google scopes;
- encryption of stored credentials using existing OpenSEO patterns;
- test cross-project access.

## Security tests

At minimum:

- user from org A cannot query Growth project B;
- MCP key cannot access archived/foreign project;
- write tool cannot attach foreign project Action;
- malformed external refs cannot inject arbitrary URLs;
- report share tokens later are high entropy and revocable.

---

# 26. Observability

Every run should answer:

- did it start?
- did it finish?
- what data was unavailable?
- what detectors ran?
- how many signals were created?
- which AI calls failed?
- what did it cost?
- did it create duplicate work?

Use existing OpenSEO logging/telemetry patterns where possible.

Add a developer/admin run inspector before adding complicated auto-retry behaviour.

---

# 27. Testing

## Unit

- detector thresholds;
- score calculation;
- state transitions;
- measurement date logic;
- dedupe;
- report data builder.

## Repository/service

- org/project filtering;
- action event history;
- change linking;
- measurement persistence.

## MCP

- auth;
- Zod validation;
- project isolation;
- pagination;
- read/write policies.

## Integration

- GSC adapter fixtures;
- rank history;
- audit changes;
- full monthly run fixture.

## E2E

Key flow:

```text
project → run → recommendation → accept → action
→ implement/change → measure → report → MCP read
```

## Dual DB

Schema parity and key query tests for SQLite/D1 and Postgres.

---

# 28. Data fixtures

Build a deterministic synthetic fixture early.

Fixture should contain:

- 90 days of GSC-like page/query data;
- rank snapshots;
- a priority page losing rank;
- a striking-distance query;
- a new audit issue;
- an Action implemented halfway through;
- post-change improvement;
- one confounding site change.

This makes detector/measurement/report development possible without waiting months.

---

# 29. Feature flags

Use a Growth feature flag at project/installation level.

Suggested:

```text
GROWTH_ENABLED
```

or project row state.

Individual experimental detectors can be separately gated.

This helps upstream merges and controlled rollout.

---

# 30. Future extraction architecture

If Growth is eventually separated:

```text
Sherpa / agents
      ↓
Bodkin Growth API/MCP
      ↓
┌───────────────┬──────────────┬───────────────┐
│ OpenSEO       │ Analytics    │ Delivery      │
│ provider      │ provider     │ integrations  │
└───────────────┴──────────────┴───────────────┘
```

The internal service interfaces proposed now should make extraction easier without forcing it prematurely.

---

# 31. Technical definition of done for P0

- no duplicated OpenSEO provider integration;
- Growth schema works in both DB dialects;
- monthly run deterministic core is testable without AI;
- AI outputs validated;
- recommendations preserve evidence;
- Action state transitions are explicit;
- Change Event can attach to Action;
- Measurement can run from fixtures and live data;
- report is generated from structured state;
- MCP read surface works;
- CI remains green against upstream conventions.
