# Repair round 1 verification

The original 15 acceptance failures are repaired. Independent execution of the four packet files plus seven upstream/regression files passed 159 tests. The additional projection checks pass for all 24 explicitly enumerated credential formats, every text location's disclosure flags, email-expansion truncation, final-safe-projection hashing, canonical IDs, source bounds and the absence of wall-clock reads.

Three expanded cases still fail, grouped into two issues:

1. The hand-written timestamp expression differs from the existing Zod timestamp contract. It accepts `2026-07-03T24:00:00.000Z` and silently rolls it into July 4, but rejects the valid `2026-07-03T12:00:00.1Z`. A read-only probe against the installed `z.string().datetime({ offset: true })` confirms the intended source behavior: reject hour 24, accept fractional precision. The original temporal-validation finding is therefore only partly resolved.
2. Duplicate selected commercial-section keys are not rejected. Two `business_overview` rows with different content cause `.find()` to choose whichever comes first, contradicting the safe projection's deterministic-input-order contract. The normal repository has a unique section key; this is a defensive malformed-source boundary, not evidence of a normal database duplicate.

The latest full suite reproduces only those three failures: 171 files / 1,622 tests pass; one file / three tests fail; six Postgres-gated files / eleven tests skip. No old regression fails. Build remains deferred until the candidate clears its acceptance tests.

The Director only formatted the implementation after repair and added independent tests/documentation; no production logic was edited outside the implementer handoff.
