# Goal

Implement BG-0204 for the first priority-page decline path: produce one bounded, versioned internal evidence packet from one persisted Signal, current project/key-page context and explicitly selected known Change Events. Keep measured facts separate from narrative context. This is preparation for later Insight generation, not an AI call or the full Phase 2 gate.

# Scope

- A pure packet builder, narrow Zod contracts, local text/privacy projection and a read-only composition service.
- Same-project/organisation source resolution through existing repositories/services.
- Deterministic tests for canonical facts, provenance, privacy, bounds, partial context and temporal/URL confounder matching.
- One minimal export of the existing decline detector version to prevent version-rule drift.

# Relevant areas/files

- `GrowthRunsRepository.getSignal/getRun`: immutable project-scoped Signal and Run reads.
- `ProjectRepository.getProjectForOrganization`: existing active-project organisation boundary. The internal caller must already be authorised; this slice adds no endpoint or authentication.
- `getProjectContext` in `ProjectContextService.ts`: canonical typed sections and curated key pages, with update timestamps. Project context is current, not historical as of detection.
- `GrowthChangeEventsService.getChangeEvent`: existing project-scoped graph read. Do not query all events.
- `src/types/schemas/growth.ts`, `projectContext.ts`, `growth-change-events.ts`: existing Signal and vocabulary schemas.
- `previousPeriod` in `gsc/searchPerformanceReport.ts`, `calendarDateInTimezone` in `GrowthMeasurementFacts.ts`, `normalizeKeyPageUrl` and `canonicalizeGrowthExactUrls`: existing temporal and identity rules.
- `ai-search/safeUrl.ts`: credential-free HTTP(S) validation; it is not a privacy redactor.
- `GrowthReportSnapshot.ts` and `audit/ids.ts`: explicit immutable projection and SHA-256 precedents.

# Implementation approach

1. Accept a strict internal request with organisation ID, project ID, Signal ID, explicit assembly timestamp, and optional known Change Event IDs (at most 10; canonicalise duplicates/order). Resolve the active project first using the organisation-scoped repository. Then resolve the Signal and its Run using the same project; check returned identities. Read current project context and selected events only. No source write occurs.
2. Support only `priority_page_click_decline` / `key_page` / `gsc_clicks` / `gsc_period` from the existing v1 detector Run with a `gsc:<64hex>` reference. Validate canonical counts/deltas and reject contradictions rather than repairing them. Read the Signal's curated key page by stable ID; missing/ambiguous subjects fail.
3. Preserve canonical numeric Signal values and IDs. The recorded current period and capture time remain authoritative. The v1 detector guarantees an immediately preceding equal-length baseline, so derive that window with the existing helper after scalar bounds (current length 1–45 days, valid four-digit calendar dates). Mark the baseline window as derived from the detector version, not independently stored metadata. Reject unsupported versions, impossible dates, source freshness violations or assembly before capture.
4. Project only relevant current context: project name; `business_overview`, `current_goal`, `positioning`; subject role, commercial weight, protection/optimisation flags, topic and notes. Preserve source update timestamps and explicit missing-section states. Do not include writing preferences, custom sections, competitors, research logs, authors, actor IDs, external refs, OAuth/account/provider fields or raw payloads.
5. Keep all prose in an explicitly untrusted context area, separate from immutable scalar facts. Cap raw text at existing repository limits before processing; use deterministic output truncation with flags. Target output caps: name 200, each selected section 800, topic 200, notes 400, each selected event description 400 characters. Reject a final serialised packet over 32,768 UTF-8 bytes; never truncate canonical numbers or IDs.
6. No suitable existing general secret redactor exists. Add a local, conservative projection: redact an entire text field when it contains credential markers, credential-bearing URLs, PEM private-key material, common provider-token prefixes, Basic/Bearer credentials or JWT-shaped credentials. Cover case/JSON-style sensitive assignments (`api_key`, access/refresh/id tokens, client secret, password, authorization). Scan before truncation; incomplete private-key markers must also redact. Omit embedded URL query/fragment data and email addresses from narrative output. Redaction metadata contains no matched secret. This is bounded defence in depth, not a claim to detect arbitrary encoded secrets.
7. Subject URL output is display-only: validate using the existing HTTP(S) helper, omit its query and fragment and disclose omission. Use the stable key-page ID as canonical identity; never offer the display URL as a canonical action target. Withhold a display URL with recognisable credential material. Unfiltered URLs are used only inside the builder for matching and never included in packet hashes; the final safe display projection may be hashed.
8. Selected Change Events must exist in the same project. Include only events whose Pacific calendar date lies within baseline/current windows and whose existing Growth-normalised URL matches the subject's Growth-normalised URL. That normaliser deliberately loses query/trailing-slash distinctions; label matches `normalised_url_candidate`, never exact matches or causes. Include event ID, type/source, happened-at time and redacted description; omit other URLs, actors, external refs and linked Action data. Record `not_assessed` when IDs are absent; otherwise `caller_selected`, counts and omitted-irrelevant count. Never claim complete confounder coverage, even for an explicit empty list.
9. Include explicit limits: GSC can omit page rows; original raw rows/property/site totals/impressions are not replayed from the digest; current commercial context may postdate detection; open Actions and unselected changes are not assessed; no causal conclusion. The packet is marked internal-review-only, with no model egress in this slice.
10. Compute a versioned SHA-256 packet reference over the final allowlisted, redacted canonical projection, not raw inputs. Equivalent reordered source/ID lists are stable; changed included facts/context change the reference. No wall clock or random ID inside the pure builder.

# Constraints

DEEP by privacy/trust-boundary override. The implementation is otherwise local and reversible; no schema or query implementation change is needed. One balanced implementer owns new `GrowthEvidencePacket*` modules/tests, one new schema module and the minimal detector-version export. Director owns this plan, acceptance, ADR, independent verification, review and sign-off. Normal concurrency at most two; no recursive delegation.

# Explicit non-goals

AI prompts/calls, Insight or Recommendation generation, automatic confounder discovery, historical/as-of context reconstruction, source-snapshot persistence, full provenance replay, Action dedupe, UI, MCP/server functions, scheduling, migrations, new dependencies, provider calls, push and deployment. Any need to change existing source/auth/normalisation behavior requires Director review first.

# Risks

- A digest is not a replayable source dataset. Do not invent missing source context or assert it was checked.
- Free text is user-authored data, not instructions. Mark trust boundaries and keep egress disabled; future AI integration must separately approve its privacy/prompt boundary.
- Current context and caller-selected changes are partial and may differ from detection-time context. Disclose both instead of implying a complete historical explanation.
- Growth change URLs use coarser identity than curated key pages. Candidate matching is useful context, not proof of exact impact or cause.

# Verification plan

Director runs focused builder/service/privacy tests and the existing detector/Growth/GSC/project-context regressions, then `pnpm test:ci`, `pnpm ci:check`, production build and whitespace checks. No live Postgres rerun is needed unless SQL/schema/repository implementation changes, which are out of scope. Fresh full read-only review must challenge privacy/provenance and plan sufficiency; at most two implementation repair rounds. A fresh bounded final acceptance audit will reconcile the DEEP privacy contract.
