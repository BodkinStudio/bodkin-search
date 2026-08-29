# Review and Decisions

## Purpose

This document re-evaluates the original Bodkin Growth concept after a closer review of the current OpenSEO product, codebase and MCP architecture.

The conclusion is positive: **the core idea is still strong and worth building**.

However, several technical assumptions from the first version should change. Most importantly, the earlier plan duplicated capabilities OpenSEO now already provides.

---

# 1. What I still agree with

## 1.1 The product should be an operating loop, not an SEO dashboard

This remains the most important product decision.

The useful thing is not another place to inspect charts. The useful thing is a closed loop:

```text
evidence
  ↓
meaning
  ↓
priority
  ↓
work
  ↓
implementation
  ↓
measurement
```

Dashboards and reports should be views over this system, not the system itself.

## 1.2 The central object should be an Action

A monthly report is transient. An Action has a lifecycle.

An Action can retain:

- the original evidence;
- the recommendation;
- priority and confidence;
- ownership;
- implementation details;
- related website changes;
- a baseline;
- a measurement window;
- an outcome.

That makes SEO delivery visible and auditable over time.

## 1.3 OpenSEO is a strong foundation

This view is stronger after inspecting the current repository.

OpenSEO already contains:

- organisation-scoped projects;
- project market/language context;
- saved keyword data and keyword metrics;
- scheduled rank tracking;
- historical rank snapshots;
- backlink snapshots;
- site audits;
- GSC integration;
- AI visibility features;
- DataForSEO integration;
- Cloudflare workflows;
- Better Auth organisation mode;
- API keys;
- an MCP server;
- project-scoped MCP authorisation;
- Codex and Claude agent skills;
- SQLite/D1 and Postgres support.

Rebuilding those foundations separately would add cost without creating Bodkin-specific value.

## 1.4 MCP should remain first class

Sherpa should be able to use Growth as structured evidence while:

- planning information architecture;
- deciding whether a page should exist;
- redesigning high-value pages;
- writing copy;
- identifying internal links;
- reviewing content;
- understanding why a Growth action exists;
- marking implementation events where permitted.

This should not be a dashboard-only product.

## 1.5 Monthly reporting is useful, but it should not drive the data model

The monthly report should be generated from persistent events, actions and measurements.

Do not build "monthly reports" as isolated generated documents with no underlying history.

## 1.6 Human approval should remain part of the initial workflow

The system can automate observation and analysis much more aggressively than implementation.

Initial policy:

- read automatically;
- analyse automatically;
- recommend automatically;
- require human approval before work is accepted;
- require human approval before any CMS write;
- do not autonomously publish content in the MVP.

## 1.7 Client access should come later

The internal system must first improve Bodkin's actual delivery.

A client portal should be built only once Bodkin knows what clients genuinely benefit from seeing.

---

# 2. What changes after the deeper review

## 2.1 Do not build a separate Growth backend on day one

### Earlier idea

```text
Bodkin Growth app
    ↓
Bodkin Growth DB
    ↓
Bodkin Growth MCP
    ↓
OpenSEO
```

This made sense before inspecting OpenSEO's current internals.

### Revised recommendation

```text
Bodkin's OpenSEO fork
├── existing OpenSEO capabilities
└── Growth modules
      ├── signals
      ├── insights
      ├── recommendations
      ├── actions
      ├── changes
      ├── measurements
      └── reports

Existing OpenSEO MCP
└── new Growth tools
```

This avoids duplicating auth, tenancy, provider calls, GSC state, schedules and historical SEO data.

### Extraction rule

Only extract Growth into a separate service when one of these becomes true:

1. Growth must aggregate several non-OpenSEO systems and OpenSEO becomes an awkward dependency.
2. Upstream merges become consistently difficult because Growth changes core OpenSEO behaviour.
3. Scale/availability requirements differ substantially.
4. Another Bodkin product needs Growth without OpenSEO.
5. We need an independent public API boundary for commercial reasons.

Do not extract merely because a service-oriented diagram looks cleaner.

---

# 3. Use a thin fork, not a rewrite

The fork should preserve OpenSEO conventions.

Prefer additive directories such as:

```text
src/server/features/growth/
src/client/features/growth/
src/server/mcp/tools/growth-*.ts
```

Do not:

- rewrite existing keyword research;
- replace rank tracking;
- duplicate GSC;
- rebuild provider clients;
- replace existing project tenancy;
- rename every OpenSEO component immediately;
- perform a broad visual rebrand before the workflow is proven.

The first objective is product proof, not cosmetic ownership.

---

# 4. Add Growth tools to the existing MCP before building a wrapper MCP

The original plan proposed a separate "Bodkin Growth MCP" in front of OpenSEO.

That can still be a later architecture, but it is premature initially.

OpenSEO's MCP already:

- authenticates users/API keys;
- resolves organisation membership;
- requires project context;
- exposes SEO services;
- has a clear one-tool-per-file pattern;
- is already supported by Codex and Claude.

The first Growth MCP surface should therefore be implemented inside the existing MCP server.

Example tools:

```text
growth_get_project_summary
growth_get_priority_actions
growth_get_action
growth_find_opportunities
growth_analyse_page
growth_record_change
growth_get_measurement
growth_get_monthly_summary
```

Only introduce a gateway when it has a concrete aggregation or governance job that the current MCP cannot perform cleanly.

---

# 5. Do not duplicate raw historical data unnecessarily

OpenSEO already stores some history, including rank snapshots and backlink snapshots.

Growth should primarily persist **derived operating state**:

- signals;
- insights;
- recommendations;
- evidence references;
- actions;
- change events;
- measurement windows;
- measurement observations;
- reports;
- run metadata.

Where OpenSEO has a trustworthy canonical record, reference or query it.

Where a Growth decision needs reproducibility, store the minimum snapshot/evidence payload required to explain the decision later.

Avoid copying whole provider responses into new Growth tables by default.

---

# 6. Keep Signal, Insight, Recommendation and Action separate

This remains correct, but should be made stricter.

## Signal

A deterministic observation.

Example:

> Clicks fell 22% while impressions remained within 3%.

## Insight

A hypothesis or interpretation.

Example:

> The page may be losing rank rather than facing lower search demand.

## Recommendation

A proposed response.

Example:

> Review the page against the three SERP competitors that overtook it and refresh weak sections.

## Action

Approved delivery work.

Example:

> Refresh `/sms-for-schools` and add internal links from the Education hub and two relevant case studies.

This separation prevents AI interpretation from being stored as if it were raw fact.

---

# 7. Be more careful with causal claims

The earlier concept occasionally used language such as:

> "Completed actions generated +1,842 incremental clicks."

That is too strong for most SEO work.

A before/after improvement does not prove the change caused the improvement.

Growth should instead report:

- change after implementation;
- comparison with baseline;
- comparison with site/cluster trend where possible;
- confidence;
- confounding events;
- outcome classification.

Example:

> Organic clicks increased 28% in the 28-day measurement window after the page refresh. The wider Education cluster increased 8% in the same period, so the page outperformed its local baseline. This is a positive signal, not proof of isolated causation.

This should be a hard reporting principle.

---

# 8. Deterministic detection first, LLM interpretation second

Do not ask a model to "scan SEO and tell us what changed" from a giant unstructured dataset.

First calculate:

- deltas;
- rolling baselines;
- thresholds;
- ranking movement;
- CTR gaps;
- query/page concentration;
- audit severity changes;
- stale actions;
- completed actions due for measurement.

Then ask the model to interpret a bounded evidence packet.

The LLM should explain and propose. It should not be the source of arithmetic truth.

---

# 9. Cadence should be multi-speed

"Monthly scan" is useful for the retainer, but some signals should not wait a month.

Recommended cadence:

## Daily

Only critical/high-confidence monitoring:

- major rank losses for priority terms;
- indexing failures;
- severe crawl errors;
- catastrophic traffic anomalies where first-party data is available.

## Weekly

Operational review:

- meaningful gains/losses;
- new striking-distance opportunities;
- stale high-priority actions;
- actions now ready for measurement.

## Monthly

Strategic cycle:

- trend review;
- opportunity discovery;
- competitor review;
- accepted/dismissed recommendations;
- results from previous changes;
- planned work.

## Quarterly

Broader strategy:

- topic/cluster direction;
- competitive changes;
- aggregate effectiveness of action types;
- target/positioning updates.

---

# 10. The product should not optimise blindly for traffic

Opportunity scoring must include commercial context.

A 50-search/month bottom-of-funnel term may matter more than a 2,000-search/month informational term.

At minimum, scoring should consider:

```text
impact
commercial relevance
confidence
urgency
effort
```

Later:

```text
historical effectiveness
conversion evidence
strategic importance
```

Sherpa/company context can become an important source of commercial relevance.

---

# 11. GA4 should be an adapter, not an MVP blocker

OpenSEO's GSC support is already mature enough to prove the SEO operating loop.

GA4 is valuable for:

- organic landing-page engagement;
- lead/conversion outcomes;
- ecommerce outcomes where relevant.

However:

- its exact OpenSEO integration is evolving;
- its MCP surface is still changing upstream;
- analytics setups vary significantly by client.

Therefore:

1. ship the first closed loop with GSC + existing OpenSEO data;
2. define a `GrowthAnalyticsProvider` interface;
3. add GA4 once the product needs conversion evidence;
4. inspect upstream before writing custom GA4 integration.

---

# 12. AI visibility is useful but should not dominate the MVP

AI visibility is strategically relevant and OpenSEO already has UI-level support.

But the MVP should not over-weight AEO/LLM visibility simply because it is new.

Use it as another evidence stream once:

- classic search performance works;
- actions work;
- measurement works;
- reporting works.

Expose existing AI visibility services to Growth/MCP when useful, preferably by reusing upstream service code.

---

# 13. The action tracker should be canonical, with optional project-management sync later

If Growth actions live only in Notion/Jira/Linear, the measurement link can be lost.

Therefore the canonical SEO Action should live in Growth.

Later it may sync outward to project-management software.

The canonical record should retain:

- why the work exists;
- evidence;
- priority;
- implementation;
- measurement.

An external PM task can be a delivery mirror, not the source of truth.

---

# 14. Client reports should start as web views

Do not make PDF generation a foundational requirement.

Recommended sequence:

1. internal monthly report view;
2. stable snapshot/frozen report state;
3. shareable read-only client route;
4. print CSS / browser PDF;
5. branded PDF automation only if clients genuinely need files.

This fits the product better and avoids unnecessary document-generation infrastructure.

---

# 15. Deployment recommendation

## Proof of concept

Use OpenSEO's supported development/self-hosting path with the smallest amount of custom infrastructure.

## Internal production

Prefer the auth mode that supports the required agent/MCP workflow cleanly.

Because Sherpa/Codex connectivity is a core requirement, do not choose a security configuration solely because it is convenient for browser-only internal access.

Before production deployment, explicitly test:

- browser authentication;
- API-key MCP authentication;
- project isolation;
- key revocation;
- GSC token storage;
- scheduled jobs.

## Database

Follow upstream's provider abstraction.

- D1/SQLite is acceptable for the proof of concept.
- Postgres is already supported and should be considered before broader client rollout if data volume, querying or backup needs justify it.
- Do not create a separate Supabase schema merely out of habit.

---

# 16. Upstream strategy

Maintain:

```text
origin   -> Bodkin fork
upstream -> every-app/open-seo
```

Keep custom work modular and periodically rebase/merge upstream.

Where a feature is generally useful to OpenSEO and not Bodkin-specific, consider upstreaming it.

Good upstream candidates may include:

- generic report snapshots;
- generic action/change primitives if maintainers want them;
- missing read-only MCP tools;
- AI visibility MCP exposure;
- generic GA4 MCP support.

Keep Bodkin-specific workflow/opportunity scoring, client-service concepts and Sherpa semantics in the fork unless there is clear alignment.

---

# 17. What the MVP should actually prove

Not:

> Can we build a nice SEO application?

The real question is:

> Can this system repeatedly find work that Bodkin agrees is worth doing, preserve why it was done, and later tell us whether performance improved?

If yes, continue.

If recommendations are noisy or generic, stop adding features and improve the evidence/intelligence layer.

---

# 18. Final recommendation

Proceed.

But proceed with a smaller architectural bet than the original plan:

```text
Fork OpenSEO
    ↓
Add Growth operating primitives
    ↓
Run on bodkin.studio
    ↓
Connect Sherpa/Codex through existing MCP
    ↓
Prove recommendation → action → measurement
    ↓
Add client sites
    ↓
Only then expand integrations / portal / autonomy
```

That path preserves the strongest part of the idea while avoiding a large amount of unnecessary platform engineering.

---

# Research basis checked on 29 August 2026

- OpenSEO repository: https://github.com/every-app/open-seo
- OpenSEO MCP documentation: https://openseo.so/docs/mcp
- OpenSEO Codex plugin documentation: https://openseo.so/docs/codex-plugin
- OpenSEO features: https://openseo.so/features
- OpenSEO current repository schema and development docs
- OpenSEO open issues concerning GA4 MCP, AI visibility MCP and client reports
- Semantic.io public material describing automated SEO orchestration, cadence and auditability

Codex must inspect the current upstream repository before implementing any assumption in this planning pack. OpenSEO is moving quickly.
