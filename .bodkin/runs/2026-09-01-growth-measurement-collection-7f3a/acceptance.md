# Required behaviour

1. Reading or rendering a Work measurement never calls Search Console. Provider collection occurs only after the user's explicit action and remains project-authorized.
2. An active supported plan reports each baseline, primary and configured long-term period as collected, ready, waiting or inconsistent, with the exact GSC source-available date. The current example's primary period ending 2026-10-06 is not offered before 2026-10-09 Pacific time.
3. Collection derives the immutable plan, period windows, metric IDs and frozen URL targets server-side. Client input cannot select arbitrary dates, metrics, URLs, plans or projects.
4. Collection reuses `GscService.getPerformance` through the canonical Growth adapter with explicit inclusive dates, `page,date`, `web`, `final`, 1,000-row pagination, a 25-call cap and request/property validation.
5. Measurement collection uses frozen target URLs, not the current project key-page list. Existing priority-page checks retain their current curated-key-page behavior.
6. Capped retrieval, missing target/day coordinates, malformed provider data, request drift, property drift or unsupported metric shapes produce no new observation facts. Missing rows are never saved as zero.
7. A complete attempt safely sums integer clicks/impressions, records completeness `1`, uses canonical capture time and bounded deterministic GSC evidence references, and does not expose the connector account or provider error body.
8. All new observations from one collection attempt are validated before an atomic D1/Postgres write. Exact existing facts are accepted, conflicting coordinate facts are rejected, and a concurrent plan close or write cannot leave a falsely successful partial attempt.
9. Later collection attempts cannot mix a different GSC property with earlier generated GSC observations for the same plan.
10. Non-`not_measurable` measurement finalization requires completeness `1` for every required primary observation. `not_measurable` retains the existing reviewed escape hatch.
11. The Work read model exposes stored baseline/current/long-term values, observation completeness/capture state, absolute and percentage deltas, including a null percentage for zero baseline. It does not fabricate uncollected values.
12. The UI clearly distinguishes missing Search Console setup, waiting for final data, data ready to collect, collection in progress, incomplete/unavailable source, saved evidence and terminal results. It states that values are observed comparisons and do not prove causality.
13. A successful collection refreshes only the scoped measurement/Work caches and preserves retry protection against duplicate client dispatch.
14. Automatic outcome/confidence evaluation is not introduced in this slice; a plan with observations remains Measuring until the later reviewed interpretation/confounder policy is implemented.

# Required checks

- Focused tests cover explicit frozen targets, exact versus variant URLs, page/date completeness, observed zero versus missing, pagination cap, lag boundaries, unsafe sums, property/request drift and provider errors.
- Domain/repository tests cover atomic multi-observation success, exact retry, fact drift, inactive plan, invalid period/metric, completeness enforcement and D1/Postgres parity.
- Work service/server-function/UI tests cover tenancy-safe input, readiness dates, no provider call on read/render, explicit collection, safe failure messaging, cache updates and numeric comparison rendering.
- `pnpm test:ci`, `pnpm ci:check`, `pnpm build`, `git diff --check`, and staged whitespace checks pass.
- Director independently executes verification. Fresh full review passes or every finding receives a disposition and any valid issue is repaired, reverified and re-reviewed within two rounds.

# Regression constraints

Existing GSC grant/property selection, priority-page collection, URL-normalization behavior, Work measurement start/read/retry flows, legacy measurement graphs, D1/Postgres schema, dependencies, MCP, scheduling and unrelated application behavior remain unchanged.

# Important edge cases

- Capture around Pacific midnight and exact end-plus-three-day eligibility.
- Baseline available while primary/long-term waits; a missing period retry after other periods were already stored.
- One or many frozen URLs, multiple metrics per URL, reordered provider rows, explicit zero rows, absent rows and unsafe aggregate overflow.
- Existing exact observation, existing conflicting observation, partial legacy coordinates, completed plan and action/plan state disagreement.
- Changed GSC property between attempts, connection removed/revoked, 401/403, rate limiting and provider-shape errors.
- Zero baseline, null percentage delta, long-term absent by configuration, unsupported legacy metrics and withheld target display.

# Product / UX requirements

- Use plain language: `Collect available data`, `Waiting for Google data`, `Collected`, and `Needs attention` rather than internal job states.
- Provider calls must be visibly user-triggered; Refresh remains read-only.
- Show saved dates and the later Google availability date without implying the date window itself is unfinished.
- Preserve the existing compact Work disclosure and visual language; the new controls must be keyboard accessible and announce pending/error/success state.
- Every comparison carries a non-causal disclosure. No success color or verdict language implies that the implementation caused the movement.

# Specialist review requirements

- Product UI implementation must use the repository's UI skill routing and supply render/submission tests as mechanical evidence.
- Browser/rendered screenshot evidence is waived only because of the user's explicit browser-tool restriction; the limitation must be recorded in verification and final acceptance.
- Fresh backend/data-integrity review must challenge source completeness, source identity, atomicity, tenancy and D1/Postgres parity.
