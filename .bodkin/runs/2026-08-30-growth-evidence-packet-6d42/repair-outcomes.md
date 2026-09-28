# Final repair evidence

Round 1 resolved the organisation, decline/source-lag, selected-graph, deterministic event order, raw-bound/vocabulary, URL credential, text-disclosure and unused-export failures. Its full repository CI passed. Expanded tests then found two remaining temporal/ambiguity defects; those findings and the escalation are preserved in `review-round1.json` and `repair-round2.md`.

Round 2 changes only the local timestamp helper and allowlisted-section selection in `GrowthEvidencePacket.ts` (six added and six removed lines against the reviewed index). It reuses the installed Zod offset-datetime contract before Date parsing and rejects more than one row for a selected commercial key. It does not alter ignored context, hashing, URL matching, providers, storage or the request/output shape.

Director verification after round 2:

- Focused: eleven files, 186 tests pass, including all 103 packet tests.
- Full repository: 172 files, 1,625 tests pass; six Postgres-gated files and eleven tests skip.
- Repository CI and production build pass. The existing client chunk-size warning is unchanged.
- Staged-baseline and unstaged whitespace pass.

These results are independently executed, not copied from implementer reports. Fresh repair review passed with no findings (`review-final.json`), closing both accepted round-2 dispositions. The separate DEEP acceptance audit returned `PASS` (`acceptance-audit.md`); Director sign-off is in `acceptance-result.md`. The run completed within two repair rounds.
