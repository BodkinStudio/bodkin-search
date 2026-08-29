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
