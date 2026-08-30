# Final acceptance

Outcome: accepted for BG-0201 through BG-0203. The slice supplies an internal, deterministic source-to-Signal path. It does not complete the Phase 2 Recommendation/usefulness gate.

## Evidence reconciliation

1. The fixed fixture covers May 1 through July 29, 2026: 90 inclusive dates. It includes material decline, stable/growing, low-volume, observed-zero and missing-day cases, plus separate site totals. Fixture source inspection and repeated/reordered detector tests establish deterministic behavior.
2. The adapter uses existing project GSC and key-page services. Mocked tests establish 1,000-row pagination followed by offsets 1,000 and 1,001, empty termination, short-page handling and explicit cap exhaustion.
3. Explicit final/web/Pacific source dates, returned-request/property checks and the three-day lag are enforced. Provider validation and site-context tests cover request drift, property drift, invalid dates, a Pacific boundary, oversized ranges and propagated errors.
4. The narrow DTO and adapter reject malformed rows, invalid metrics/URLs, duplicates, foreign key pages and unsafe aggregates. Every fetched page/date row reaches the strict schema before curation. Source inspection establishes identity checks; regression tests cover the previously bypassed non-curated URLs and aggregation bounds.
5. The only upstream implementation edit exports the existing key-page normalizer unchanged. Existing key-page tests and new alias/query/slash/long-URL cases pass; raw provider URLs remain in evidence.
6. The detector yields one Signal or explicit suppression per curated page. Capped retrieval, missing observations, zero/low baselines and immaterial declines are covered by deterministic tests. No absent row is synthesized as zero.
7. Scalar window validation now precedes date expansion. Equal-length, adjacent, contained windows and snapshot identity are validated. The bounded regression rejects a years-long comparison before 20 date-format calls.
8. Eight adapter tests establish that optional site totals come from a separate date-grouped query, remain absent by default, and cannot mix properties or invalid rows. Detector tests cover equivalent site decline, a page materially worse than the site, and requested-incomplete suppression.
9. Inclusive material/critical boundaries, null commercial weight, weighted priority and stable page-ID tie ordering are covered. Unicode IDs and URL aliases use total code-unit ordering, with retained reorder regressions.
10. Signal drafts pass the existing schema; the fixed example is 308 to 140 clicks, delta -168, critical severity and priority 504. Provenance includes source coordinates, windows and configuration in a bounded SHA-256 reference. Confidence is documented as an uncalibrated rule convention, not a causal or statistical probability.

## Verification and review

The Director independently ran 91 focused/upstream tests, the full repository suite (1,522 passed; 11 Postgres-gated tests skipped), type-aware test lint, `ci:check`, the production build and whitespace checks. Current outcomes are in `verification.json`; failed initial evidence is retained separately.

The first fresh full review's four major findings and verification gap were accepted. Repair round 1 addressed them, and a fresh read-only repair review returned pass with no findings or gaps. Test-only cleanup split the acceptance file, typed mocks and added site-context/Unicode-ID coverage; no product scope changed.

## Limits

No dependency, schema, SQL, auth, provider client, public server function, MCP, UI, scheduling, live provider call or deployment changed. Postgres was not rerun because persistence is unchanged. GSC can still omit source rows after pagination ends; this limitation is explicit. The 24,300-observation diagnostic records local scale behavior, not a production latency guarantee. Persistent collection, AI interpretation and live usefulness remain future work.

No unresolved finding blocks this slice. Implementation repair count: 1.

Accepted at 2026-08-30T01:13:40.488Z.
