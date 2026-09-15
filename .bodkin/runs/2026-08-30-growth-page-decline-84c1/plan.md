# Goal

Implement BG-0201 through BG-0203: turn a fixed 90-day GSC fixture into deterministic priority-page click-decline Signal drafts. Reuse OpenSEO's GSC connection/service and curated key pages. This is the first data-to-Signal slice, not the whole Phase 2 Recommendation gate.

# Scope

- A bounded, validated Growth search-performance DTO and deterministic 90-day fixture.
- An internal adapter over `GscService.getPerformance` and `ProjectContextRepository.listKeyPages`.
- A pure, versioned decline detector returning schema-valid Signal drafts, a separate priority score and explicit suppression reasons.
- Unit/integration-style mocked service tests. No live Google account or provider call is needed.

# Relevant areas/files

- `src/server/features/gsc/services/GscService.ts`: project connection/grant reuse and performance response.
- `src/server/features/gsc/searchAnalytics.ts`: explicit date request builder, 1,000-row local cap, 16-month start clamp, default fresh data.
- `src/server/features/gsc/searchPerformanceReport.ts`: existing equal-length previous-period helper.
- `src/server/features/project-context/repositories/ProjectContextRepository.ts`: project-scoped curated key-page reads.
- `src/server/features/project-context/services/contextUpdateOps.ts`: canonical key-page URL semantics, including meaningful queries and non-root trailing slashes.
- `src/server/features/growth/services/GrowthMeasurementFacts.ts`: existing calendar-date/timezone helper.
- `src/server/lib/audit/ids.ts`: existing SHA-256 helper.
- `src/types/schemas/growth.ts`: Signal validation and `GrowthRunsService.ts`: later persistence seam.

# Implementation approach

1. Add the narrow contracts and a fixture covering 2026-05-01 through 2026-07-29, captured at a fixed timestamp after the source cutoff. Include declining, stable, growing, low-volume, zero-baseline and missing-data pages. Use the final 28 days against the immediately preceding 28 days in the fixture; the detector accepts explicit equal-length preceding windows.
2. Collect explicit inclusive `web`/`final` page/date rows with 1,000-row calls, advancing by rows received until an empty page or a maximum of 25 calls. Return `exhausted` or `capped`; neither state asserts full Google coverage. Check returned request parameters and property identity on every response. Reject an upstream-clamped window, malformed rows, duplicate raw URL/day coordinates and connection drift. Propagate provider/auth errors.
3. Read only same-project key-page metadata. Export and reuse the existing URL normalizer without changing its behavior. Preserve raw provider URLs in the DTO, map them to stable key-page IDs and leave queries/non-root trailing slashes distinct. Validate all fetched rows before narrowing them to curated pages.
4. Optional site context is one explicit opt-in `final`/`web` query grouped only by date for the same window/property. It must not sum page rows to pretend to be site totals. Missing site observations suppress detection when the caller requested this context; absent optional context is recorded and does not fabricate a comparison.
5. The pure detector validates snapshot/project/windows, requires an observed row for every day in both windows, sums raw URL variants belonging to a key page and emits only material declines. It returns one outcome per key page. No observation is synthesized as zero.
6. Defaults for this internal version: baseline at least 100 clicks, at least 20 lost clicks, at least 30% decline. Critical requires at least 100 lost clicks and 50% decline. Priority is lost clicks times `commercialWeight ?? 1`; it never changes the numeric evidence. Optional valid site context suppresses a decline no more than 10 percentage points worse than a material site decline. All thresholds are explicit, validated and part of provenance.
7. Emit `priority_page_click_decline` / `key_page` / `gsc_clicks` drafts with the existing Signal schema. Use the key-page ID as entity reference, exact scalar deltas, a fixed canonical capture time and a bounded SHA-256 evidence reference covering source/property/page/window facts and detector configuration. Sort output deterministically. Confidence 0.8 is an uncalibrated rule-confidence convention, not a causal or statistical probability.

# Constraints

- STANDARD score 6: related modules, new feature behavior, feature-level impact, easy rollback, provider-data boundary and familiar services with date/coverage ambiguity. No shared auth or persistence change.
- One balanced implementer owns the new modules/tests and the unchanged-normalizer export. Director owns this plan, acceptance, ADR, independent verification and acceptance. No recursive delegation or overlapping edits.
- Use GSC's `America/Los_Angeles` calendar for source dates. Query end must be at least three calendar days before the supplied capture date there. The finalized-data request and observed-day checks remain necessary; this lag is not proof of completeness.
- At most 90 source days, 100 key pages and 25 page requests. Validate finite, nonnegative counts, safe aggregation, strict dates, unique identities and source coordinates.
- No dependencies or schema/query/migration changes. The repository read path already supports both providers.

# Explicit non-goals

AI, evidence packet assembly, Insight/Recommendation generation, Signal persistence orchestration, UI, MCP/server functions, scheduling, live provider calls, data backfills, source snapshots in storage, full-collapse inference from absent rows, seasonality/causal diagnosis, GA4, push and deployment.

# Risks

- GSC can omit rows even after pagination ends. Preserve that source limitation; suppress observable gaps and never equate missing with zero. Google documents inclusive Pacific dates, dimension order, finalized data and omitted rows in its [query reference](https://developers.google.com/webmaster-tools/v1/searchanalytics/query). Its [performance guide](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data) explains page-dimension data loss and pagination.
- Distinct provider URL variants may map to one curated page. Retain their source coordinates and test aggregation; reject duplicate raw coordinates instead of double-counting them.
- Thresholds are provisional internal defaults. Fixture correctness does not establish usefulness on Bodkin's live site or complete Gate 2.
- Connection or returned-request drift must fail collection instead of mixing different source populations.

# Verification plan

Director reruns focused DTO/adapter/detector and existing GSC/project-context tests, then `pnpm test:ci`, `pnpm ci:check`, `pnpm build` and whitespace checks. No live Postgres rerun is required because this slice changes no schema, SQL or repository behavior. A fresh read-only reviewer challenges implementation and plan sufficiency. At most two automatic implementation repair rounds.
